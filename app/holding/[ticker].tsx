import { Stack, useLocalSearchParams } from "expo-router";
import React from "react";
import { Text, View, type TextStyle } from "react-native";

import {
  Card,
  CardTitle,
  Divider,
  KeyValue,
  Notice,
  Paragraph,
  Screen,
  SectionHeader,
  TierBadge,
  numeric,
  space,
  type,
  useTheme,
} from "../../src/components/primitives";
import {
  DQ_COLORS,
  formatAttribution,
  formatEmissions,
  formatExact,
  formatIntensity,
  formatPct,
  formatUsd,
  formatUsdExact,
} from "../../src/lib/format";
import { PCAF_SCORE_SCALE } from "../../src/lib/pcaf";
import { usePortfolio } from "../../src/lib/portfolioStore";

export default function HoldingDetailScreen() {
  const c = useTheme();
  const { ticker } = useLocalSearchParams<{ ticker: string }>();
  const { result } = usePortfolio();

  const h = result.holdings.find((x) => x.company.ticker === ticker);

  if (!h) {
    return (
      <Screen>
        <Notice tone="danger" title="Holding not found">
          {ticker} is not in the current portfolio.
        </Notice>
      </Screen>
    );
  }

  const co = h.company;
  const scale = PCAF_SCORE_SCALE.find((s) => s.score === h.dataQualityScore);

  return (
    <>
      <Stack.Screen options={{ title: co.ticker }} />
      <Screen>
        <Card>
          <CardTitle hint={`${co.sector}${co.industry ? ` · ${co.industry}` : ""}`}>
            {co.name}
          </CardTitle>
          <TierBadge tier={co.emissions_tier} score={h.dataQualityScore} />
        </Card>

        <SectionHeader>Attribution</SectionHeader>

        <Card>
          <Paragraph>
            PCAF attributes a share of an issuer&apos;s emissions equal to the share of its EVIC that
            you finance.
          </Paragraph>
          <Divider />
          <KeyValue label="Position value" value={formatUsdExact(h.marketValueUsd)} />
          <KeyValue label="÷ EVIC" value={formatUsd(co.evic)} />
          <Divider />
          <KeyValue
            label="= Attribution factor"
            value={formatAttribution(h.attributionFactor)}
            valueColor={c.accent}
          />
          <Text style={[type.caption2 as TextStyle, numeric, { color: c.textTertiary }]}>
            {h.attributionFactor.toExponential(3)} of the issuer
          </Text>
        </Card>

        <SectionHeader>EVIC build-up</SectionHeader>

        <Card>
          <KeyValue label="Market capitalisation" value={formatUsd(co.market_cap)} />
          <KeyValue label="+ Book value of total debt" value={formatUsd(co.total_debt)} />
          <KeyValue label="+ Minority interest" value={formatUsd(co.minority_interest)} />
          <Divider />
          <KeyValue label="= EVIC" value={formatUsd(co.evic)} valueColor={c.accent} />
          <Notice title="Cash is not subtracted">
            EVIC is Enterprise Value <Text style={{ fontStyle: "italic" }}>Including</Text> Cash.
            Unlike a standard EV, PCAF deliberately leaves cash in, so that the attribution factors
            of all an issuer&apos;s investors sum to 1.
          </Notice>
          {co.minority_interest_assumed_zero ? (
            <Notice tone="warning" title="Minority interest assumed zero">
              No minority-interest figure was available for {co.ticker} from the financial data
              source, so it is treated as 0. EVIC is therefore slightly understated, which makes this
              attribution factor — and the financed emissions below — slightly overstated.
            </Notice>
          ) : null}
        </Card>

        <SectionHeader>Financed emissions</SectionHeader>

        <Card>
          <KeyValue label="Issuer Scope 1+2" value={`${formatEmissions(co.emissions_tco2e_scope12)} tCO₂e`} />
          {co.emissions_tco2e_scope1 !== null ? (
            <KeyValue label="— of which Scope 1" value={formatExact(co.emissions_tco2e_scope1)} />
          ) : null}
          {co.emissions_tco2e_scope2_market !== null ? (
            <KeyValue
              label="— of which Scope 2 (market)"
              value={formatExact(co.emissions_tco2e_scope2_market)}
            />
          ) : null}
          <KeyValue label="× Attribution factor" value={formatAttribution(h.attributionFactor)} />
          <Divider />
          <KeyValue
            label="= Financed Scope 1+2"
            value={`${formatExact(h.financedEmissionsScope12, 1)} tCO₂e`}
            valueColor={c.accent}
          />
          <KeyValue
            label="Share of portfolio total"
            value={formatPct(
              result.financedEmissionsScope12 > 0
                ? h.financedEmissionsScope12 / result.financedEmissionsScope12
                : 0,
            )}
          />
        </Card>

        <SectionHeader>Carbon intensity</SectionHeader>

        <Card>
          <KeyValue label="Issuer revenue" value={`${formatUsd(co.revenue_musd * 1e6)}`} />
          <KeyValue
            label="Intensity"
            value={`${formatIntensity(h.carbonIntensity)} tCO₂e/$M`}
          />
          <KeyValue label="Portfolio weight" value={formatPct(h.weight)} />
          <Divider />
          <KeyValue
            label="= WACI contribution"
            value={formatIntensity(h.waciContribution)}
            valueColor={c.accent}
          />
          <Paragraph>
            WACI is the sum of these contributions across every holding. This one accounts for{" "}
            {formatPct(result.waci > 0 ? h.waciContribution / result.waci : 0)} of the portfolio
            figure.
          </Paragraph>
        </Card>

        <SectionHeader>Scope 3 (estimated)</SectionHeader>

        <Card>
          <KeyValue
            label="Issuer Scope 3 proxy"
            value={`${formatEmissions(co.emissions_tco2e_scope3_estimated)} tCO₂e`}
          />
          <KeyValue label="Sector multiplier applied" value={`${co.scope3_multiplier}× Scope 1+2`} />
          <Divider />
          <KeyValue
            label="= Financed Scope 3"
            value={`${formatExact(h.financedEmissionsScope3, 1)} tCO₂e`}
          />
          <Notice tone="warning">
            Derived, not disclosed. A sector multiplier applied to Scope 1+2 — a screening figure
            only.
          </Notice>
        </Card>

        <SectionHeader>Data quality</SectionHeader>

        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                backgroundColor: DQ_COLORS[h.dataQualityScore],
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={[type.headline as TextStyle, numeric, { color: "#fff" }]}>
                {h.dataQualityScore}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type.headline as TextStyle, { color: c.text }]}>{scale?.label}</Text>
              <Text style={[type.caption as TextStyle, { color: c.textTertiary }]}>
                PCAF score {h.dataQualityScore} of 5
              </Text>
            </View>
          </View>
          <Paragraph>{scale?.description}</Paragraph>
          <Divider />
          <Text style={[type.footnote as TextStyle, { color: c.textSecondary }]}>
            <Text style={{ fontWeight: "700" }}>Source: </Text>
            {co.emissions_source}
            {co.emissions_reporting_year ? ` (reporting year ${co.emissions_reporting_year})` : ""}
          </Text>
          {co.emissions_note ? (
            co.emissions_tier === "estimated" ? (
              /*
                This note explains the SECTOR average — it is emitted verbatim
                for every estimated holding in that sector. Rendered bare under
                the source line it reads as a description of this issuer, which
                can be flatly wrong: a utility that has sold its generation
                fleet still inherits the sector's "owned thermal generation"
                rationale. So attribute it to the sector, and say plainly that
                the mean may fit this company badly.
              */
              <View style={{ gap: 4 }}>
                <Text style={[type.footnote as TextStyle, { color: c.textSecondary }]}>
                  <Text style={{ fontWeight: "700" }}>
                    Why the {co.sector} average is{" "}
                    {formatIntensity(co.carbon_intensity_tco2e_per_musd)}:{" "}
                  </Text>
                  {co.emissions_note}
                </Text>
                <Text style={[type.caption as TextStyle, { color: c.textTertiary }]}>
                  This describes the sector, not {co.ticker}. A company whose business mix differs
                  from the sector norm — an asset-light operator, or one that has divested the
                  activity the average is built on — can sit far from this figure in either
                  direction.
                </Text>
              </View>
            ) : (
              <Paragraph>{co.emissions_note}</Paragraph>
            )
          ) : null}
          {co.emissions_tier === "reported" && co.issuer_claims_third_party_assurance ? (
            <Notice title="Why this is a 2 and not a 1">
              {co.ticker} states that this disclosure was third-party assured. We score it 2, not 1,
              because we have not independently obtained and checked the assurance statement — and
              PCAF score 1 requires verification we can evidence, not verification we were told
              about.
            </Notice>
          ) : null}
        </Card>
      </Screen>
    </>
  );
}
