import { Link } from "expo-router";
import React from "react";
import { Text, View, type TextStyle } from "react-native";
import Animated, { FadeIn, useReducedMotion } from "react-native-reanimated";

import {
  Card,
  CardTitle,
  Divider,
  KeyValue,
  Notice,
  Paragraph,
  Screen,
  SectionHeader,
  Stat,
  numeric,
  space,
  type,
  useTheme,
} from "../../src/components/primitives";
import { SectorWaterfall } from "../../src/components/SectorWaterfall";
import { WaciComparison } from "../../src/components/WaciComparison";
import {
  dqColorContinuous,
  formatEmissions,
  formatIntensity,
  formatPct,
  formatUsd,
} from "../../src/lib/format";
import { usePortfolio } from "../../src/lib/portfolioStore";

export default function OverviewScreen() {
  const c = useTheme();
  const { result, benchmark, source, restoreError } = usePortfolio();

  const reduced = useReducedMotion();

  const waciDelta = benchmark.waci > 0 ? result.waci / benchmark.waci - 1 : 0;
  const better = waciDelta < 0;
  const estimatedShare = result.tierBreakdown.estimated.weight;

  return (
    <Screen>
      {/*
        Keyed on the loaded portfolio so that importing a file — or resetting to
        the demo — cross-fades the whole set of figures rather than swapping
        every number in place. Purpose is state indication: it marks the moment
        the numbers stopped describing the old portfolio. Opacity only, no
        translation, so there is nothing to delay reading the values.
      */}
      <Animated.View
        key={source.label}
        entering={reduced ? undefined : FadeIn.duration(180)}
        style={{ gap: space.lg }}
      >
        {restoreError ? (
          <Notice tone="warning" title="Saved portfolio not restored">
            {restoreError}
          </Notice>
        ) : null}

        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <CardTitle hint={`${result.holdings.length} holdings · ${formatUsd(result.totalPortfolioValueUsd)}`}>
              {source.label}
            </CardTitle>
            <Link href="/import" style={{ color: c.accent, ...(type.subhead as object) }}>
              Change
            </Link>
          </View>
        </Card>

        {result.excluded.length > 0 ? (
          <Notice tone="warning" title={`${result.excluded.length} holding(s) excluded`}>
            {result.excluded.map((e) => e.ticker).join(", ")} — not in the reference universe.
            They carry {formatUsd(result.excludedValueUsd)} (
            {formatPct(result.excludedWeightOfInput)} of the file) and are left out of every figure
            below. Coverage is {formatPct(1 - result.excludedWeightOfInput)}.
          </Notice>
        ) : null}

        <SectionHeader>Financed emissions</SectionHeader>

        <Card>
          <View style={{ flexDirection: "row", gap: space.lg }}>
            <Stat
              label="Absolute financed emissions"
              value={formatEmissions(result.financedEmissionsScope12)}
              unit="tCO₂e"
              caption="Scope 1+2, attributed"
            />
            <Stat
              label="Economic emissions intensity"
              value={formatIntensity(result.economicEmissionsIntensity)}
              unit="tCO₂e/$M"
              caption="per $M invested"
            />
          </View>
          <Divider />
          <Paragraph>
            Every holding&apos;s share of its issuer&apos;s EVIC, multiplied by that issuer&apos;s
            Scope 1+2 emissions, summed across the portfolio.
          </Paragraph>
        </Card>

        <SectionHeader>Carbon intensity vs benchmark</SectionHeader>

        <Card>
          <View style={{ flexDirection: "row", gap: space.lg }}>
            <Stat
              label="Portfolio WACI"
              value={formatIntensity(result.waci)}
              unit="tCO₂e/$M rev"
            />
            <Stat
              label={better ? "Below benchmark" : "Above benchmark"}
              value={`${better ? "−" : "+"}${formatPct(Math.abs(waciDelta), 0)}`}
              tone={better ? c.success : c.danger}
              caption={`Benchmark ${formatIntensity(benchmark.waci)}`}
            />
          </View>

          <WaciComparison
            series={[
              { label: "Portfolio", value: result.waci, color: c.series },
              { label: "Benchmark", value: benchmark.waci, color: c.seriesBenchmark },
            ]}
          />

          <Divider />
          <Paragraph>
            Benchmark is a cap-weighted composite of all {benchmark.holdings.length} companies in the
            bundled reference universe, scaled to the same notional. WACI is weight × issuer intensity,
            so it is independent of portfolio size.
          </Paragraph>
        </Card>

        <SectionHeader>Where the emissions come from</SectionHeader>

        <Card>
          <CardTitle hint="Cumulative contribution to the portfolio total">
            Sector waterfall
          </CardTitle>
          <SectorWaterfall
            sectors={result.sectorBreakdown}
            total={result.financedEmissionsScope12}
            maxRows={5}
          />
          <Divider />
          <KeyValue
            label={`Largest sector — ${result.sectorBreakdown[0]?.sector ?? "n/a"}`}
            value={formatPct(result.sectorBreakdown[0]?.shareOfEmissions ?? 0)}
          />
          <Link href="/holdings" style={{ color: c.accent, ...(type.subhead as object) }}>
            See all holdings →
          </Link>
        </Card>

        <SectionHeader>Data quality</SectionHeader>

        <Card>
          <View style={{ flexDirection: "row", gap: space.lg }}>
            <Stat
              label="PCAF score (value weighted)"
              value={result.dataQualityScoreByValue.toFixed(2)}
              unit="of 5"
              tone={dqColorContinuous(result.dataQualityScoreByValue)}
              caption="1 = best, 5 = worst"
            />
            <Stat
              label="Emissions from estimates"
              value={formatPct(
                result.financedEmissionsScope12 > 0
                  ? result.tierBreakdown.estimated.financedEmissionsScope12 /
                      result.financedEmissionsScope12
                  : 0,
                0,
              )}
              caption={`${formatPct(estimatedShare, 0)} of portfolio value`}
            />
          </View>
          <Divider />
          <Paragraph>
            {result.tierBreakdown.reported.count} holdings use company-reported Scope 1+2 (PCAF 2);{" "}
            {result.tierBreakdown.estimated.count} fall back to a sector-average revenue proxy
            (PCAF 5). The two are never blended into one number without saying so.
          </Paragraph>
          <Link href="/quality" style={{ color: c.accent, ...(type.subhead as object) }}>
            Open the score heatmap →
          </Link>
        </Card>

        <SectionHeader>Scope 3</SectionHeader>

        <Card>
          <Stat
            label="Financed Scope 3 (estimated)"
            value={formatEmissions(result.financedEmissionsScope3)}
            unit="tCO₂e"
            caption={
              // Guard the zero case, not the magnitude: Math.max(x, 1) would
              // silently rewrite the ratio for any portfolio whose total
              // financed Scope 1+2 is a real number below 1 tCO2e.
              result.financedEmissionsScope12 > 0
                ? `${(
                    result.financedEmissionsScope3 / result.financedEmissionsScope12
                  ).toFixed(1)}× the Scope 1+2 figure`
                : "No Scope 1+2 to compare against"
            }
          />
          <Notice tone="warning" title="Always an estimate">
            No holding here carries a disclosed Scope 3 figure. Every number above is Scope 1+2
            multiplied by a sector-level Scope 3 ratio, which is a screening indicator only — it is
            not comparable to a reported value chain inventory and should not be published as one.
          </Notice>
        </Card>

        <Text
          style={[
            type.caption2 as TextStyle,
            numeric,
            { color: c.textTertiary, textAlign: "center", marginTop: space.sm },
          ]}
        >
          Demonstration of the PCAF methodology. Not investment advice, not assured data.
        </Text>
      </Animated.View>
    </Screen>
  );
}
