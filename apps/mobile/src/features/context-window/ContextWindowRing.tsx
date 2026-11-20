import Svg, { Circle } from "react-native-svg";

import { useUniwindTheme } from "../../lib/useUniwindTheme";
import type { ContextWindowTone } from "./contextWindowSummary";

export const CONTEXT_WINDOW_TONE_VARIABLE = {
  normal: "--color-foreground-muted",
  warning: "--color-warning",
  danger: "--color-danger",
} as const satisfies Record<ContextWindowTone, string>;

export function ContextWindowRing(props: {
  readonly size: number;
  readonly percent: number;
  readonly tone: ContextWindowTone;
}) {
  const theme = useUniwindTheme();
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
        stroke={theme["--color-border"]}
        strokeWidth={strokeWidth}
        fill="none"
      />
      <Circle
        cx={center}
        cy={center}
        r={radius}
        stroke={theme[CONTEXT_WINDOW_TONE_VARIABLE[props.tone]]}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={circumference * (1 - props.percent / 100)}
        fill="none"
      />
    </Svg>
  );
}
