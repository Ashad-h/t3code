import type { ExpoConfig } from "expo/config";

// Fork-only (Ashad-h/t3code): app.config.ts just wraps its export with this, so upstream merges
// rarely conflict. FORK_IOS_BUNDLE_ID moves every upstream identifier to the fork's Apple team,
// bundle ID and EAS project; without it upstream's config and tests are untouched.

const UPSTREAM_BUNDLE_ID = "com.t3tools.t3code";
const UPSTREAM_APP_NAME = "T3 Code";

export interface ForkIdentity {
  readonly bundleId: string;
  readonly teamId: string;
  readonly appName: string;
  readonly easOwner: string;
  readonly easProjectId: string;
}

const FORK_ENV = {
  bundleId: "FORK_IOS_BUNDLE_ID",
  teamId: "FORK_IOS_TEAM_ID",
  appName: "FORK_APP_NAME",
  easOwner: "FORK_EAS_OWNER",
  easProjectId: "FORK_EAS_PROJECT_ID",
} as const satisfies Record<keyof ForkIdentity, string>;

type Env = Readonly<Record<string, string | undefined>>;

export function readForkIdentity(env: Env): ForkIdentity | null {
  if (!env[FORK_ENV.bundleId]?.trim()) {
    return null;
  }
  const read = (name: string): string => {
    const value = env[name]?.trim();
    if (!value) {
      throw new Error(`${name} must be set when ${FORK_ENV.bundleId} is set.`);
    }
    return value;
  };
  return {
    bundleId: read(FORK_ENV.bundleId),
    teamId: read(FORK_ENV.teamId),
    appName: read(FORK_ENV.appName),
    easOwner: read(FORK_ENV.easOwner),
    easProjectId: read(FORK_ENV.easProjectId),
  };
}

// Rewrites the upstream bundle ID wherever it appears: the app, its widget and share extensions,
// the app group, the keychain group and the Android package all derive from it.
function rebrand<T>(value: T, bundleId: string): T {
  if (typeof value === "string") {
    return value.replaceAll(UPSTREAM_BUNDLE_ID, bundleId) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item: unknown) => rebrand(item, bundleId)) as T;
  }
  if (
    value !== null &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, rebrand(item, bundleId)]),
    ) as T;
  }
  return value;
}

export function applyForkIdentity(config: ExpoConfig, env: Env): ExpoConfig {
  const fork = readForkIdentity(env);
  if (!fork) {
    return config;
  }
  const rebranded = rebrand(config, fork.bundleId);
  const ios = { ...rebranded.ios, appleTeamId: fork.teamId };
  // clerk.t3.codes and app.t3.codes only vouch for upstream's team, so the entitlement would fail.
  delete ios.associatedDomains;
  return {
    ...rebranded,
    name: rebranded.name.replace(UPSTREAM_APP_NAME, fork.appName),
    owner: fork.easOwner,
    ios,
    // Upstream's EAS project would otherwise push its own OTA bundles over this fork's code.
    updates: { ...rebranded.updates, url: `https://u.expo.dev/${fork.easProjectId}` },
    extra: {
      ...rebranded.extra,
      eas: { ...rebranded.extra?.eas, projectId: fork.easProjectId },
    },
  };
}
