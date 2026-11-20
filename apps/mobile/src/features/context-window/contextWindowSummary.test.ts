import type { ContextWindowSnapshot } from "@t3tools/client-runtime/state/context-window";
import { describe, expect, it } from "vite-plus/test";

import { summarizeContextWindow } from "./contextWindowSummary";

function snapshot(overrides: Partial<ContextWindowSnapshot>): ContextWindowSnapshot {
  return {
    usedTokens: 0,
    totalProcessedTokens: null,
    maxTokens: null,
    inputTokens: null,
    cachedInputTokens: null,
    outputTokens: null,
    reasoningOutputTokens: null,
    lastUsedTokens: null,
    lastInputTokens: null,
    lastCachedInputTokens: null,
    lastOutputTokens: null,
    lastReasoningOutputTokens: null,
    toolUses: null,
    durationMs: null,
    compactsAutomatically: null,
    autoCompactThreshold: null,
    cost: null,
    remainingTokens: null,
    usedPercentage: null,
    remainingPercentage: null,
    updatedAt: "2026-11-20T00:00:00.000Z",
    ...overrides,
  };
}

const designExample = snapshot({
  usedTokens: 124_000,
  maxTokens: 200_000,
  usedPercentage: 62,
  autoCompactThreshold: 160_000,
});

describe("summarizeContextWindow", () => {
  it("hides without data", () => {
    expect(summarizeContextWindow(null)).toBeNull();
    expect(summarizeContextWindow(snapshot({ usedTokens: 5_000, maxTokens: null }))).toBeNull();
  });

  it("summarizes the design example", () => {
    expect(summarizeContextWindow(designExample)).toMatchObject({
      percent: 62,
      tone: "normal",
      used: "124K",
      max: "200K",
      autoCompact: { at: "160K", left: "36K", percent: 80 },
    });
  });

  it.each([
    [79.4, 79, "normal"],
    [80, 80, "warning"],
    [89.6, 90, "danger"],
  ])("uses desktop tone thresholds: %s%% used", (usedPercentage, percent, tone) => {
    const summary = summarizeContextWindow({ ...designExample, usedPercentage });
    expect(summary?.percent).toBe(percent);
    expect(summary?.tone).toBe(tone);
  });

  it("clamps overflow", () => {
    const summary = summarizeContextWindow(
      snapshot({
        usedTokens: 210_000,
        maxTokens: 200_000,
        usedPercentage: 105,
        autoCompactThreshold: 160_000,
      }),
    );
    expect(summary?.percent).toBe(100);
    expect(summary?.tone).toBe("danger");
    expect(summary?.autoCompact?.left).toBe("0");
  });

  it.each([null, 200_000])(
    "omits a threshold that is missing or not below the maximum: %s",
    (autoCompactThreshold) => {
      const summary = summarizeContextWindow({ ...designExample, autoCompactThreshold });
      expect(summary?.autoCompact).toBeNull();
    },
  );

  it("maps the breakdown", () => {
    const summary = summarizeContextWindow({
      ...designExample,
      lastInputTokens: 7_800,
      lastOutputTokens: 1_300,
      inputTokens: 98_000,
      cachedInputTokens: 71_000,
      outputTokens: 26_000,
      cost: { amount: 0.42, currency: "USD" },
    });
    expect(summary?.lastTurn).toEqual({ input: "7.80K", output: "1.30K" });
    expect(summary?.thread).toEqual({ input: "98K", cached: "71K", output: "26K" });
    expect(summary?.cost).toEqual({ amount: 0.42, currency: "USD" });

    const bare = summarizeContextWindow(designExample);
    expect(bare?.lastTurn).toBeNull();
    expect(bare?.thread).toBeNull();
    expect(bare?.cost).toBeNull();
  });
});
