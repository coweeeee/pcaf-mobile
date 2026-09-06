/**
 * Portfolio vs benchmark WACI, as a horizontal bar pair.
 *
 * Horizontal rather than vertical: there are only two categories, their labels
 * are words rather than dates, and a phone is tall. Horizontal bars give the
 * labels room to sit inline and make the length comparison — the only thing this
 * chart exists to show — read left to right.
 *
 * Drawn with react-native-svg rather than a charting library. See the README
 * ("Charting") for why.
 */

import React from "react";
import { Text as RNText, View, type TextStyle } from "react-native";
import Svg, { G, Line, Rect, Text as SvgText } from "react-native-svg";

import { axisTick, formatIntensity, niceCeil } from "../lib/format";
import { numeric, useMeasuredWidth, useTheme } from "./primitives";
import { space, type } from "../theme";

const ROW_H = 34;
const BAR_H = 20;
const AXIS_H = 18;
const LABEL_W = 78;

export interface WaciSeries {
  label: string;
  value: number;
  color: string;
}

export function WaciComparison({ series }: { series: WaciSeries[] }) {
  const c = useTheme();
  const { width, onLayout } = useMeasuredWidth();

  const max = niceCeil(Math.max(...series.map((s) => s.value), 1e-9));
  const plotW = Math.max(0, width - LABEL_W);
  const height = series.length * ROW_H + AXIS_H;

  // Four intervals keeps the axis readable at phone widths without crowding.
  const ticks = Array.from({ length: 5 }, (_, i) => (max / 4) * i);

  return (
    <View onLayout={onLayout}>
      <Svg width={width} height={height}>
          {/* Gridlines behind the bars. */}
          {ticks.map((t, i) => {
            const x = LABEL_W + (t / max) * plotW;
            return (
              <Line
                key={`g${i}`}
                x1={x}
                y1={0}
                x2={x}
                y2={series.length * ROW_H}
                stroke={c.border}
                strokeWidth={i === 0 ? 1 : 0.5}
              />
            );
          })}

          {series.map((s, i) => {
            const y = i * ROW_H + (ROW_H - BAR_H) / 2;
            const w = Math.max(1, (s.value / max) * plotW);
            const labelInside = w > 64;
            return (
              <G key={s.label}>
                <SvgText
                  x={LABEL_W - space.sm}
                  y={y + BAR_H / 2 + 4}
                  fontSize={12}
                  fill={c.textSecondary}
                  textAnchor="end"
                >
                  {s.label}
                </SvgText>
                <Rect x={LABEL_W} y={y} width={w} height={BAR_H} rx={3} fill={s.color} />
                <SvgText
                  x={labelInside ? LABEL_W + w - 6 : LABEL_W + w + 6}
                  y={y + BAR_H / 2 + 4}
                  fontSize={12}
                  fontWeight="600"
                  fill={labelInside ? "#ffffff" : c.text}
                  textAnchor={labelInside ? "end" : "start"}
                >
                  {formatIntensity(s.value)}
                </SvgText>
              </G>
            );
          })}

          {/* Axis. */}
          <Line
            x1={LABEL_W}
            y1={series.length * ROW_H}
            x2={width}
            y2={series.length * ROW_H}
            stroke={c.border}
          />
          {ticks.map((t, i) => (
            <SvgText
              key={`t${i}`}
              x={LABEL_W + (t / max) * plotW}
              y={series.length * ROW_H + 13}
              fontSize={10}
              fill={c.textTertiary}
              textAnchor={i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"}
            >
              {axisTick(t)}
            </SvgText>
          ))}
      </Svg>
      <RNText
        style={[
          type.caption2 as TextStyle,
          numeric,
          { color: c.textTertiary, marginTop: space.xs, textAlign: "right" },
        ]}
      >
        tCO₂e per $M of issuer revenue
      </RNText>
    </View>
  );
}
