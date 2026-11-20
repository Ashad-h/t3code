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
  // Optional usage fields may be omitted as well as null.
  const threshold = snapshot.autoCompactThreshold ?? null;
  const lastInput = snapshot.lastInputTokens ?? null;
  const lastOutput = snapshot.lastOutputTokens ?? null;
  const input = snapshot.inputTokens ?? null;
  const cached = snapshot.cachedInputTokens ?? null;
  const output = snapshot.outputTokens ?? null;
  const cost = snapshot.cost ?? null;
  const hasLastTurn = lastInput !== null || lastOutput !== null;
  const hasThread = input !== null || output !== null;

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
      ? { input: formatTokens(lastInput ?? 0), output: formatTokens(lastOutput ?? 0) }
      : null,
    thread: hasThread
      ? {
          input: formatTokens(input ?? 0),
          cached: cached === null ? null : formatTokens(cached),
          output: formatTokens(output ?? 0),
        }
      : null,
    cost: cost === null ? null : { amount: cost.amount, currency: cost.currency },
  };
}
