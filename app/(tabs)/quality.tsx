import React, { useMemo } from "react";
import { FlatList, Text, View, type TextStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  HeatmapHeader,
  HeatmapLegend,
  HeatmapRow,
  SCORES,
} from "../../src/components/DataQualityHeatmap";
import {
  Card,
  CardTitle,
  Divider,
  KeyValue,
  Notice,
  Paragraph,
  SectionHeader,
  Stat,
  numeric,
  radius,
  space,
  type,
  useTheme,
} from "../../src/components/primitives";
import { DQ_COLORS, dqColorContinuous, formatEmissions, formatPct, formatUsd } from "../../src/lib/format";
import { PCAF_SCORE_SCALE } from "../../src/lib/pcaf";
import { usePortfolio } from "../../src/lib/portfolioStore";

export default function DataQualityScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { result } = usePortfolio();

  // Sort worst-first: the point of this screen is to find where the data is weak.
  const rows = useMemo(
    () =>
      [...result.holdings].sort(
        (a, b) => b.dataQualityScore - a.dataQualityScore || b.weight - a.weight,
      ),
    [result.holdings],
  );
  const maxWeight = Math.max(...rows.map((h) => h.weight), 0);

  return (
    <FlatList
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={{
        padding: space.lg,
        paddingBottom: insets.bottom + space.xxl,
      }}
      contentInsetAdjustmentBehavior="automatic"
      data={rows}
      keyExtractor={(h) => h.company.ticker}
      ListHeaderComponent={
        <View style={{ gap: space.lg, marginBottom: space.lg }}>
          <Card>
            <View style={{ flexDirection: "row", gap: space.lg }}>
              <Stat
                label="Weighted by value"
                value={result.dataQualityScoreByValue.toFixed(2)}
                unit="of 5"
                tone={dqColorContinuous(result.dataQualityScoreByValue)}
              />
              <Stat
                label="Weighted by financed emissions"
                value={result.dataQualityScoreByEmissions.toFixed(2)}
                unit="of 5"
                tone={dqColorContinuous(result.dataQualityScoreByEmissions)}
              />
            </View>
            <Divider />
            <Paragraph>
              Two weightings, because they answer different questions. By value is the standard PCAF
              disclosure. By financed emissions tells you whether the tonnes you are actually
              reporting rest on good data — it is the one that moves when a single high-emitting
              estimate dominates the total.
            </Paragraph>
          </Card>

          <SectionHeader>Coverage by tier</SectionHeader>

          <Card>
            <KeyValue
              label={`Reported (PCAF 2) — ${result.tierBreakdown.reported.count} holdings`}
              value={formatPct(result.tierBreakdown.reported.weight)}
            />
            <KeyValue
              label={`Estimated (PCAF 5) — ${result.tierBreakdown.estimated.count} holdings`}
              value={formatPct(result.tierBreakdown.estimated.weight)}
            />
            <Divider />
            <KeyValue
              label="Emissions resting on estimates"
              value={formatPct(
                result.financedEmissionsScope12 > 0
                  ? result.tierBreakdown.estimated.financedEmissionsScope12 /
                      result.financedEmissionsScope12
                  : 0,
              )}
            />
            <KeyValue
              label="Value on estimates"
              value={formatUsd(result.tierBreakdown.estimated.valueUsd)}
            />
          </Card>

          <SectionHeader>The PCAF scale</SectionHeader>

          <Card>
            {PCAF_SCORE_SCALE.map((s) => {
              const count = result.dataQualityDistribution[s.score] ?? 0;
              const used = count > 0;
              return (
                <View
                  key={s.score}
                  style={{ flexDirection: "row", gap: space.md, opacity: used ? 1 : 0.45 }}
                >
                  <View
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: radius.sm,
                      backgroundColor: DQ_COLORS[s.score],
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={[type.footnote as TextStyle, numeric, { color: "#fff", fontWeight: "700" }]}>
                      {s.score}
                    </Text>
                  </View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={[type.footnote as TextStyle, { color: c.text, fontWeight: "700" }]}>
                        {s.label}
                      </Text>
                      <Text style={[type.caption as TextStyle, numeric, { color: c.textTertiary }]}>
                        {used ? `${count} holding${count === 1 ? "" : "s"}` : "not used"}
                      </Text>
                    </View>
                    <Text style={[type.caption as TextStyle, { color: c.textSecondary }]}>
                      {s.description}
                    </Text>
                  </View>
                </View>
              );
            })}
            <Divider />
            <Notice tone="warning" title="Our data occupies two of the five levels">
              Scores 1, 3 and 4 need inputs a free data pipeline cannot reach: an assurance
              statement we have checked ourselves, metered activity data, or physical proxies like
              floor area and production units. The full scale is implemented so a real vendor feed
              would populate it without changing any calculation code.
            </Notice>
          </Card>

          <SectionHeader>Holdings × score</SectionHeader>

          <Card>
            <CardTitle hint="Sorted worst-first. Cell opacity carries portfolio weight.">
              Score heatmap
            </CardTitle>
            <HeatmapLegend distribution={result.dataQualityDistribution} />
            <Divider />
            <HeatmapHeader />
          </Card>
        </View>
      }
      renderItem={({ item }) => (
        <View
          style={{
            backgroundColor: c.surface,
            paddingHorizontal: space.lg,
          }}
        >
          <HeatmapRow holding={item} maxWeight={maxWeight} />
        </View>
      )}
      ListFooterComponent={
        <View style={{ marginTop: space.lg, gap: space.lg }}>
          <Card>
            <KeyValue
              label="Holdings scored"
              value={`${rows.length}`}
            />
            <KeyValue
              label="Total financed emissions"
              value={`${formatEmissions(result.financedEmissionsScope12)} tCO₂e`}
            />
            <Divider />
            <Paragraph>
              A portfolio-level score of {result.dataQualityScoreByValue.toFixed(2)} means the
              average dollar invested rests on data of roughly PCAF quality{" "}
              {Math.round(result.dataQualityScoreByValue)}. Under PCAF, improving this score over
              time is itself a reporting objective — a bank is expected to show the number falling.
            </Paragraph>
          </Card>
        </View>
      }
      // Rounding the top and bottom of the grid block: the rows are plain fills
      // so the card corners have to be applied to the first and last of them.
      CellRendererComponent={({ index, children, style, ...props }) => (
        <View
          style={[
            style,
            {
              borderTopLeftRadius: index === 0 ? radius.lg : 0,
              borderTopRightRadius: index === 0 ? radius.lg : 0,
              borderBottomLeftRadius: index === rows.length - 1 ? radius.lg : 0,
              borderBottomRightRadius: index === rows.length - 1 ? radius.lg : 0,
              overflow: "hidden",
            },
          ]}
          {...props}
        >
          {children}
        </View>
      )}
    />
  );
}

export { SCORES };
