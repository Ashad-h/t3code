import { useGT } from "gt-react-native";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ComposerInlineControl } from "../../components/ComposerToolbar";
import { AppText as Text } from "../../components/ui/AppText";
import { Button } from "../../components/ui/Button";
import { Sheet } from "../../components/ui/Sheet";
import { cn } from "../../lib/cn";
import { CONTEXT_WINDOW_TONE_CLASS, ContextWindowRing } from "./ContextWindowRing";
import { type ContextWindowSummary, summarizeContextWindow } from "./contextWindowSummary";
import { useSelectedThreadContextWindow } from "./useSelectedThreadContextWindow";

export function ContextWindowControl(props: {
  readonly size: "regular" | "large";
  readonly iconOnly: boolean;
  readonly canCompact: boolean;
  readonly onCompact: () => void;
}) {
  const gt = useGT();
  const [isOpen, setIsOpen] = useState(false);
  const summary = summarizeContextWindow(useSelectedThreadContextWindow());
  if (summary === null) return null;
  return (
    <View className="shrink-0">
      <ComposerInlineControl
        size={props.size}
        iconOnly={props.iconOnly}
        label={`${summary.percent}%`}
        renderIcon={(size) => (
          <ContextWindowRing size={size} percent={summary.percent} tone={summary.tone} />
        )}
        showChevron={false}
        accessibilityLabel={gt("Context window {percent}% used", { percent: summary.percent })}
        onPress={() => setIsOpen(true)}
      />
      {isOpen ? (
        <ContextWindowSheet
          summary={summary}
          canCompact={props.canCompact}
          onCompact={props.onCompact}
          onClose={() => setIsOpen(false)}
        />
      ) : null}
    </View>
  );
}

function ContextWindowSheet(props: {
  readonly summary: ContextWindowSummary;
  readonly canCompact: boolean;
  readonly onCompact: () => void;
  readonly onClose: () => void;
}) {
  const gt = useGT();
  const insets = useSafeAreaInsets();
  const { summary } = props;
  return (
    <Sheet title={gt("Context window")} onClose={props.onClose}>
      <ScrollView
        nestedScrollEnabled
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 12,
          gap: 20,
          paddingBottom: Math.max(20, insets.bottom),
        }}
      >
        <View className="gap-2">
          <Text className="text-4xl font-semibold text-foreground">{`${summary.percent}%`}</Text>
          <View className="h-2 overflow-hidden rounded-full bg-border">
            <View
              className={cn("h-full", CONTEXT_WINDOW_TONE_CLASS[summary.tone].bg)}
              style={{ width: `${summary.percent}%` }}
            />
            {summary.autoCompact ? (
              <View
                className="absolute top-0 bottom-0 w-0.5 bg-foreground"
                style={{ left: `${summary.autoCompact.percent}%` }}
              />
            ) : null}
          </View>
          <Text className="text-sm text-foreground">
            {gt("{used} of {max} tokens used", { used: summary.used, max: summary.max })}
          </Text>
          {summary.autoCompact ? (
            <Text className="text-sm text-foreground-muted">
              {gt("Auto-compacts at {at} ({left} left)", {
                at: summary.autoCompact.at,
                left: summary.autoCompact.left,
              })}
            </Text>
          ) : null}
        </View>
        {summary.lastTurn || summary.thread || summary.cost ? (
          <View className="gap-2">
            {summary.lastTurn ? (
              <DetailRow
                label={gt("Last turn")}
                value={gt("input {input} · output {output}", summary.lastTurn)}
              />
            ) : null}
            {summary.thread ? (
              <DetailRow
                label={gt("Whole thread")}
                value={
                  summary.thread.cached === null
                    ? gt("input {input} · output {output}", summary.thread)
                    : gt("input {input} · cached {cached} · output {output}", summary.thread)
                }
              />
            ) : null}
            {summary.cost ? (
              <DetailRow
                label={gt("Cost")}
                value={`${summary.cost.amount.toFixed(2)} ${summary.cost.currency}`}
              />
            ) : null}
          </View>
        ) : null}
        <Button
          label={gt("Compact now")}
          disabled={!props.canCompact}
          onPress={() => {
            props.onCompact();
            props.onClose();
          }}
        />
      </ScrollView>
    </Sheet>
  );
}

function DetailRow(props: { readonly label: string; readonly value: string }) {
  return (
    <View className="flex-row items-baseline justify-between gap-4">
      <Text className="text-sm text-foreground-muted">{props.label}</Text>
      <Text className="shrink text-right text-sm text-foreground">{props.value}</Text>
    </View>
  );
}
