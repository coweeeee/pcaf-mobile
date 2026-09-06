/**
 * Holdings × PCAF-score heatmap.
 *
 * Built by hand out of Views rather than pulled from a chart library, because
 * what this needs to be is a table that happens to be coloured: every row is a
 * real holding you can read the ticker of, and the coloured cell is positioned
 * at that holding's score on the 1–5 scale.
 *
 * Cell opacity carries portfolio weight, so a large holding stuck at score 5
 * is visually louder than a rounding-error position at the same score. The
 * scale bottoms out at 0.35 so a small holding is still clearly present — a
 * cell that faded to nothing would read as "no data" rather than "small".
 */

import React from "react";
import { StyleSheet, Text, View, type TextStyle } from "react-native";

import { DQ_COLORS, formatPct } from "../lib/format";
import type { Holding } from "../lib/pcaf";
import { numeric, useTheme } from "./primitives";
import { radius, space, type } from "../theme";

export const SCORES = [1, 2, 3, 4, 5] as const;

const TICKER_W = 62;
const WEIGHT_W = 46;
const CELL_GAP = 3;

export function HeatmapHeader() {
  const c = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-end",
        paddingBottom: space.sm,
        gap: CELL_GAP,
      }}
    >
      <View style={{ width: TICKER_W }} />
      {SCORES.map((s) => (
        <View key={s} style={{ flex: 1, alignItems: "center" }}>
          <Text style={[type.caption2 as TextStyle, numeric, { color: c.textTertiary }]}>PCAF</Text>
          <Text
            style={[
              type.footnote as TextStyle,
              numeric,
              { color: c.textSecondary, fontWeight: "700" },
            ]}
          >
            {s}
          </Text>
        </View>
      ))}
      <View style={{ width: WEIGHT_W, alignItems: "flex-end" }}>
        <Text style={[type.caption2 as TextStyle, { color: c.textTertiary }]}>Weight</Text>
      </View>
    </View>
  );
}

export function HeatmapRow({ holding, maxWeight }: { holding: Holding; maxWeight: number }) {
  const c = useTheme();
  // Normalise against the largest holding, not against 1, so the contrast uses
  // the full opacity range whatever the portfolio's concentration.
  const intensity = maxWeight > 0 ? 0.35 + 0.65 * (holding.weight / maxWeight) : 0.35;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: CELL_GAP,
        paddingVertical: 2.5,
      }}
    >
      <Text
        style={[
          type.footnote as TextStyle,
          numeric,
          { width: TICKER_W, color: c.text, fontWeight: "600" },
        ]}
        numberOfLines={1}
      >
        {holding.company.ticker}
      </Text>

      {SCORES.map((s) => {
        const on = holding.dataQualityScore === s;
        return (
          <View
            key={s}
            style={{
              flex: 1,
              height: 22,
              borderRadius: radius.sm,
              backgroundColor: on ? DQ_COLORS[s] : c.surfaceAlt,
              opacity: on ? intensity : 1,
              borderWidth: on ? 0 : StyleSheet.hairlineWidth,
              borderColor: c.border,
            }}
          />
        );
      })}

      <Text
        style={[
          type.caption as TextStyle,
          numeric,
          { width: WEIGHT_W, color: c.textSecondary, textAlign: "right" },
        ]}
      >
        {formatPct(holding.weight, 1)}
      </Text>
    </View>
  );
}

/** Legend explaining what the five columns mean, shown under the grid. */
export function HeatmapLegend({ distribution }: { distribution: Record<number, number> }) {
  const c = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: CELL_GAP }}>
      {SCORES.map((s) => (
        <View key={s} style={{ flex: 1, alignItems: "center", gap: 3 }}>
          <View
            style={{
              height: 6,
              alignSelf: "stretch",
              borderRadius: radius.pill,
              backgroundColor: DQ_COLORS[s],
            }}
          />
          <Text style={[type.caption2 as TextStyle, numeric, { color: c.textSecondary }]}>
            {distribution[s] ?? 0}
          </Text>
        </View>
      ))}
    </View>
  );
}
