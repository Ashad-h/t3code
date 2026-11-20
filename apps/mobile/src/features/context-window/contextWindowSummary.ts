import type { ContextWindowSnapshot } from "@t3tools/client-runtime/state/context-window";
import { formatTokens } from "@t3tools/shared/usageFormat";

export type ContextWindowTone = "normal" | "warning" | "danger";

export interface ContextWindowSummary {
  readonly percent: number;
  readonly tone: ContextWindowTone;
  readonly used: string;
  readonly max: string;
  readonly autoCompact: {
    readonly at: string;
    readonly left: string;
    readonly percent: number;
  } | null;
  readonly lastTurn: { readonly input: string; readonly output: string } | null;
  readonly thread: {
    readonly input: string;
    readonly cached: string | null;
    readonly output: string;
  } | null;
  readonly cost: { readonly amount: number; readonly currency: string } | null;
}

// Same thresholds as desktop's ThreadDetailsContext.
function toneFor(percent: number): ContextWindowTone {
  if (percent >= 90) return "danger";
  if (percent >= 80) return "warning";
  return "normal";
}

export function summarizeContextWindow(
  snapshot: ContextWindowSnapshot | null,
): ContextWindowSummary | null {
  const maxTokens = snapshot?.maxTokens ?? null;
  if (snapshot === null || maxTokens === null || maxTokens <= 0) return null;

  const rawPercent = snapshot.usedPercentage ?? (snapshot.usedTokens / maxTokens) * 100;
  const percent = Math.round(Math.max(0, Math.min(100, rawPercent)));
  const threshold = snapshot.autoCompactThreshold;
  const hasLastTurn = snapshot.lastInputTokens !== null || snapshot.lastOutputTokens !== null;
  const hasThread = snapshot.inputTokens !== null || snapshot.outputTokens !== null;

  return {
    percent,
    tone: toneFor(percent),
    used: formatTokens(snapshot.usedTokens),
    max: formatTokens(maxTokens),
    autoCompact:
      threshold !== null && threshold > 0 && threshold < maxTokens
        ? {
            at: formatTokens(threshold),
            left: formatTokens(Math.max(0, threshold - snapshot.usedTokens)),
            percent: (threshold / maxTokens) * 100,
          }
        : null,
    lastTurn: hasLastTurn
      ? {
          input: formatTokens(snapshot.lastInputTokens ?? 0),
          output: formatTokens(snapshot.lastOutputTokens ?? 0),
        }
      : null,
    thread: hasThread
      ? {
          input: formatTokens(snapshot.inputTokens ?? 0),
          cached:
            snapshot.cachedInputTokens === null ? null : formatTokens(snapshot.cachedInputTokens),
          output: formatTokens(snapshot.outputTokens ?? 0),
        }
      : null,
    cost:
      snapshot.cost === null
        ? null
        : { amount: snapshot.cost.amount, currency: snapshot.cost.currency },
  };
}
