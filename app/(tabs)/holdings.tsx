import { Link } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from "react-native";
import Animated, { LinearTransition, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  Notice,
  PressableScale,
  TierBadge,
  numeric,
  radius,
  space,
  type,
  useTheme,
} from "../../src/components/primitives";
import {
  formatAttribution,
  formatEmissions,
  formatIntensity,
  formatPct,
  formatUsd,
  sectorColor,
} from "../../src/lib/format";
import type { Holding } from "../../src/lib/pcaf";
import { usePortfolio } from "../../src/lib/portfolioStore";

type SortKey = "emissions" | "weight" | "intensity" | "score" | "ticker";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "emissions", label: "Emissions" },
  { key: "weight", label: "Weight" },
  { key: "intensity", label: "Intensity" },
  { key: "score", label: "Score" },
  { key: "ticker", label: "A–Z" },
];

const comparators: Record<SortKey, (a: Holding, b: Holding) => number> = {
  emissions: (a, b) => b.financedEmissionsScope12 - a.financedEmissionsScope12,
  weight: (a, b) => b.weight - a.weight,
  intensity: (a, b) => b.carbonIntensity - a.carbonIntensity,
  // Worst data quality first — the reason you sort by score is to find the gaps.
  score: (a, b) => b.dataQualityScore - a.dataQualityScore || b.weight - a.weight,
  ticker: (a, b) => a.company.ticker.localeCompare(b.company.ticker),
};

export default function HoldingsScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { result } = usePortfolio();
  const [sort, setSort] = useState<SortKey>("emissions");

  const rows = useMemo(
    () => [...result.holdings].sort(comparators[sort]),
    [result.holdings, sort],
  );

  // Re-sorting moves every row at once. Without a layout transition the list
  // teleports and you lose track of the holding you were looking at; with one,
  // you can follow it to its new position. Purpose is spatial consistency, not
  // decoration — so it is short, eased, and skipped under reduced motion.
  const reduced = useReducedMotion();

  return (
    <Animated.FlatList
      itemLayoutAnimation={reduced ? undefined : LinearTransition.duration(240)}
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}
      contentInsetAdjustmentBehavior="automatic"
      data={rows}
      keyExtractor={(h) => (h as Holding).company.ticker}
      ListHeaderComponent={
        <View style={{ padding: space.lg, gap: space.md }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {SORTS.map((s) => {
              const active = s.key === sort;
              return (
                <PressableScale
                  key={s.key}
                  onPress={() => {
                    if (s.key === sort) return;
                    setSort(s.key);
                    // A segmented control ticking to a new value — selection, not
                    // impact. Fired on the commit, in the same frame as the resort.
                    if (Platform.OS !== "web") Haptics.selectionAsync();
                  }}
                  style={{
                    paddingHorizontal: space.md,
                    paddingVertical: 6,
                    borderRadius: radius.pill,
                    backgroundColor: active ? c.accent : c.surface,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: active ? c.accent : c.border,
                  }}
                >
                  <Text
                    style={[
                      type.footnote as TextStyle,
                      { color: active ? "#fff" : c.textSecondary, fontWeight: "600" },
                    ]}
                  >
                    {s.label}
                  </Text>
                </PressableScale>
              );
            })}
          </View>

          {result.excluded.length > 0 ? (
            <Notice tone="warning" title={`${result.excluded.length} excluded from the calculation`}>
              {result.excluded.map((e) => `${e.ticker} (${formatUsd(e.marketValueUsd)})`).join(", ")}{" "}
              — not in the reference universe, so no EVIC or emissions to attribute against. Combined
              weight {formatPct(result.excludedWeightOfInput)} of the imported file.
            </Notice>
          ) : null}

          <Text style={[type.caption as TextStyle, { color: c.textTertiary }]}>
            {rows.length} holdings · tap a row for the full attribution workings
          </Text>
        </View>
      }
      renderItem={({ item }) => <HoldingRow holding={item as Holding} />}
      ItemSeparatorComponent={() => (
        <View
          style={{
            height: StyleSheet.hairlineWidth,
            backgroundColor: c.border,
            marginLeft: space.lg,
          }}
        />
      )}
    />
  );
}

function HoldingRow({ holding: h }: { holding: Holding }) {
  const c = useTheme();
  return (
    <Link href={{ pathname: "/holding/[ticker]", params: { ticker: h.company.ticker } }} asChild>
      {/*
        The row's padding and fill live on an inner View, not on the Pressable's
        own style prop: `Link asChild` clones the child and overwrites `style`,
        which silently dropped the 16pt gutter and let the right-hand column run
        off the screen edge. A list row highlights rather than scales — that is
        the iOS affordance for a cell that pushes a screen.
      */}
      <Pressable>
        {({ pressed }) => (
          <View
            style={{
              backgroundColor: pressed ? c.surfaceAlt : c.surface,
              paddingHorizontal: space.lg,
              paddingVertical: space.md,
              gap: 6,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <View
                style={{
                  width: 3,
                  height: 26,
                  borderRadius: 2,
                  backgroundColor: sectorColor(h.company.sector),
                }}
              />
              <View style={{ flex: 1 }}>
                <Text style={[type.headline as TextStyle, numeric, { color: c.text }]}>
                  {h.company.ticker}
                </Text>
                <Text
                  style={[type.caption as TextStyle, { color: c.textTertiary }]}
                  numberOfLines={1}
                >
                  {h.company.name} · {h.company.sector}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[type.headline as TextStyle, numeric, { color: c.text }]}>
                  {formatEmissions(h.financedEmissionsScope12)}
                </Text>
                <Text style={[type.caption2 as TextStyle, { color: c.textTertiary }]}>tCO₂e</Text>
              </View>
            </View>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: space.sm,
                paddingLeft: space.md,
              }}
            >
              <TierBadge tier={h.company.emissions_tier} score={h.dataQualityScore} compact />
              <View style={{ flexDirection: "row", gap: space.md }}>
                <Metric label="Weight" value={formatPct(h.weight)} />
                <Metric label="Attribution" value={formatAttribution(h.attributionFactor)} />
                <Metric label="Intensity" value={formatIntensity(h.carbonIntensity)} />
              </View>
            </View>
          </View>
        )}
      </Pressable>
    </Link>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  const c = useTheme();
  return (
    <View style={{ alignItems: "flex-end" }}>
      <Text style={[type.caption2 as TextStyle, { color: c.textTertiary }]}>{label}</Text>
      <Text style={[type.caption as TextStyle, numeric, { color: c.textSecondary, fontWeight: "600" }]}>
        {value}
      </Text>
    </View>
  );
}
