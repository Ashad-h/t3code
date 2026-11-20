import { afterEach, expect, it, vi } from "vite-plus/test";

vi.mock("../../scripts/lib/public-config.ts", () => ({
  loadRepoEnv: () => ({ APP_VARIANT: process.env.APP_VARIANT }),
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

const FORK_ENV = {
  FORK_IOS_BUNDLE_ID: "cc.example.t3code",
  FORK_IOS_TEAM_ID: "EXAMPLE123",
  FORK_APP_NAME: "Example Code",
  FORK_EAS_OWNER: "example",
  FORK_EAS_PROJECT_ID: "00000000-0000-0000-0000-000000000000",
};

// Upstream's Apple team, EAS project and associated domains would make signing or OTA fail.
const UPSTREAM_IOS_IDENTITY =
  /com\.t3tools|ARK85ZXQ4Z|d763fcb8-d37c-41ea-a773-b54a0ab4a454|pingdotgg|t3\.codes/;

it.each(["development", "preview", "production"])(
  "moves every upstream iOS identifier to the fork for APP_VARIANT=%s",
  async (variant) => {
    vi.resetModules();
    vi.stubEnv("APP_VARIANT", variant);
    for (const [name, value] of Object.entries(FORK_ENV)) {
      vi.stubEnv(name, value);
    }
    const { android: _android, ...config } = (await import("./app.config.ts")).default;

    expect(JSON.stringify(config)).not.toMatch(UPSTREAM_IOS_IDENTITY);
    expect(config.ios?.bundleIdentifier).toMatch(/^cc\.example\.t3code/);
    expect(config.ios?.appleTeamId).toBe(FORK_ENV.FORK_IOS_TEAM_ID);
    expect(config.updates?.url).toBe(`https://u.expo.dev/${FORK_ENV.FORK_EAS_PROJECT_ID}`);
    expect(config.name).toMatch(/^Example Code/);
  },
);

it("rejects a partial fork identity", async () => {
  vi.resetModules();
  vi.stubEnv("APP_VARIANT", "production");
  vi.stubEnv("FORK_IOS_BUNDLE_ID", FORK_ENV.FORK_IOS_BUNDLE_ID);
  await expect(import("./app.config.ts")).rejects.toThrow("FORK_IOS_TEAM_ID must be set");
});
