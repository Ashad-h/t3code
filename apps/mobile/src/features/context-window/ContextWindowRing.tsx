import Svg, { Circle } from "react-native-svg";
import { useResolveClassNames } from "uniwind";

import type { ContextWindowTone } from "./contextWindowSummary";

export const CONTEXT_WINDOW_TONE_CLASS = {
  normal: { text: "text-foreground-muted", bg: "bg-foreground-muted" },
  // The plain warning/danger tokens are pale banner backgrounds on mobile.
  warning: { text: "text-warning-foreground", bg: "bg-warning-foreground" },
  danger: { text: "text-danger-foreground", bg: "bg-danger-foreground" },
} as const satisfies Record<ContextWindowTone, { text: string; bg: string }>;

export function ContextWindowRing(props: {
  readonly size: number;
  readonly percent: number;
  readonly tone: ContextWindowTone;
}) {
  // react-native-svg takes color values, not classNames.
  const { color: trackColor } = useResolveClassNames("text-border");
  const { color: arcColor } = useResolveClassNames(CONTEXT_WINDOW_TONE_CLASS[props.tone].text);
  const strokeWidth = Math.max(2, props.size / 8);
  const radius = (props.size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = props.size / 2;
  return (
    <Svg width={props.size} height={props.size} style={{ transform: [{ rotate: "-90deg" }] }}>
      <Circle
        cx={center}
        cy={center}
        r={radius}
        stroke={trackColor}
        strokeWidth={strokeWidth}
        fill="none"
      />
      <Circle
        cx={center}
        cy={center}
        r={radius}
        stroke={arcColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={circumference * (1 - props.percent / 100)}
        fill="none"
      />
    </Svg>
  );
}
