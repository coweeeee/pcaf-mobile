/**
 * Sector contribution to total financed emissions, as a waterfall.
 *
 * Each sector's bar starts where the previous one ended, so the cascade shows
 * how the portfolio total is built up sector by sector — and, more usefully,
 * how few sectors it takes to get most of the way there. The closing bar is the
 * total, drawn from zero.
 *
 * There is no built-in waterfall chart type in any React Native charting
 * library, so this is laid out directly: cumulative offsets in, SVG rects out.
 */

import React from "react";
import { Text as RNText, View, type TextStyle } from "react-native";
import Svg, { G, Line, Rect, Text as SvgText } from "react-native-svg";

import { formatEmissions, niceCeil, sectorColor, shortSector } from "../lib/format";
import type { SectorAggregate } from "../lib/pcaf";
import { numeric, useMeasuredWidth, useTheme } from "./primitives";
import { space, type } from "../theme";

const ROW_H = 26;
const BAR_H = 15;
const LABEL_W = 104;
const VALUE_W = 52;

export function SectorWaterfall({
  sectors,
  total,
  maxRows,
}: {
  sectors: SectorAggregate[];
  total: number;
  /** Show only the largest N sectors, folding the rest into "Other". */
  maxRows?: number;
}) {
  const c = useTheme();
  const { width, onLayout } = useMeasuredWidth();

  // Fold the tail into a single "Other" step so the preview stays legible while
  // still summing to the true total — a truncated waterfall that did not reach
  // the total would misrepresent the portfolio.
  let rows: { sector: string; value: number; color: string }[] = sectors.map((s) => ({
    sector: s.sector,
    value: s.financedEmissionsScope12,
    color: sectorColor(s.sector),
  }));

  if (maxRows && rows.length > maxRows) {
    const head = rows.slice(0, maxRows);
    const tail = rows.slice(maxRows);
    head.push({
      sector: `Other (${tail.length})`,
      value: tail.reduce((s, r) => s + r.value, 0),
      color: c.textTertiary,
    });
    rows = head;
  }

  const axisMax = niceCeil(total || 1);
  const plotW = Math.max(0, width - LABEL_W - VALUE_W);
  const height = (rows.length + 1) * ROW_H + 4;

  // Cumulative offset for each step.
  let running = 0;
  const steps = rows.map((r) => {
    const start = running;
    running += r.value;
    return { ...r, start };
  });

  return (
    <View onLayout={onLayout}>
      <Svg width={width} height={height}>
          {steps.map((s, i) => {
            const y = i * ROW_H + (ROW_H - BAR_H) / 2;
            const x = LABEL_W + (s.start / axisMax) * plotW;
            const w = Math.max(1.5, (s.value / axisMax) * plotW);
            return (
              <G key={s.sector}>
                <SvgText
                  x={LABEL_W - space.sm}
                  y={y + BAR_H / 2 + 3.5}
                  fontSize={10.5}
                  fill={c.textSecondary}
                  textAnchor="end"
                >
                  {shortSector(s.sector)}
                </SvgText>
                <Rect x={x} y={y} width={w} height={BAR_H} rx={2} fill={s.color} />
                {/* Connector to the next step, so the cascade reads as continuous. */}
                {i < steps.length - 1 ? (
                  <Line
                    x1={x + w}
                    y1={y + BAR_H}
                    x2={x + w}
                    y2={y + ROW_H}
                    stroke={c.border}
                    strokeWidth={1}
                  />
                ) : null}
                <SvgText
                  x={width - space.xs}
                  y={y + BAR_H / 2 + 3.5}
                  fontSize={10.5}
                  fill={c.textSecondary}
                  textAnchor="end"
                >
                  {formatEmissions(s.value)}
                </SvgText>
              </G>
            );
          })}

          {/* Closing total bar, drawn from zero. */}
          <G>
            <Line
              x1={LABEL_W}
              y1={steps.length * ROW_H}
              x2={width - VALUE_W}
              y2={steps.length * ROW_H}
              stroke={c.border}
            />
            <SvgText
              x={LABEL_W - space.sm}
              y={steps.length * ROW_H + ROW_H / 2 + 4}
              fontSize={10.5}
              fontWeight="700"
              fill={c.text}
              textAnchor="end"
            >
              Total
            </SvgText>
            <Rect
              x={LABEL_W}
              y={steps.length * ROW_H + (ROW_H - BAR_H) / 2}
              width={Math.max(1.5, (total / axisMax) * plotW)}
              height={BAR_H}
              rx={2}
              fill={c.text}
              opacity={0.82}
            />
            <SvgText
              x={width - space.xs}
              y={steps.length * ROW_H + ROW_H / 2 + 4}
              fontSize={10.5}
              fontWeight="700"
              fill={c.text}
              textAnchor="end"
            >
              {formatEmissions(total)}
            </SvgText>
        </G>
      </Svg>
      <RNText
        style={[
          type.caption2 as TextStyle,
          numeric,
          { color: c.textTertiary, marginTop: space.xs, textAlign: "right" },
        ]}
      >
        tCO₂e financed, Scope 1+2
      </RNText>
    </View>
  );
}
