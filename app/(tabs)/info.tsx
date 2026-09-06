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
  numeric,
  radius,
  space,
  type,
  useTheme,
} from "../../src/components/primitives";
import { formatIntensity, sectorColor } from "../../src/lib/format";
import { usePortfolio } from "../../src/lib/portfolioStore";
import { REFERENCE } from "../../src/lib/universe";

/** A displayed formula. Monospaced-ish and set apart from the prose. */
function Formula({ children, note }: { children: string; note?: string }) {
  const c = useTheme();
  return (
    <View
      style={{
        backgroundColor: c.surfaceAlt,
        borderRadius: radius.md,
        padding: space.md,
        gap: 4,
      }}
    >
      <Text style={[type.footnote as TextStyle, numeric, { color: c.text }]}>{children}</Text>
      {note ? (
        <Text style={[type.caption2 as TextStyle, { color: c.textTertiary }]}>{note}</Text>
      ) : null}
    </View>
  );
}

export default function InfoScreen() {
  const c = useTheme();
  const { result } = usePortfolio();

  return (
    <Screen>
      <Notice tone="warning" title="Read this before quoting any number in this app">
        This is a working demonstration of the PCAF methodology, not a production emissions dataset.
        The arithmetic is exactly what a bank would run. The emissions inputs are a mix of real
        public disclosures and sector-average estimates, because the licensed vendor data this
        normally depends on is not freely available. Every figure carries a badge saying which it
        is.
      </Notice>

      <SectionHeader>What this calculates</SectionHeader>

      <Card>
        <CardTitle hint="PCAF listed-equity attribution">The four equations</CardTitle>

        <Paragraph>
          <Text style={{ fontWeight: "700", color: c.text }}>1. EVIC</Text> — Enterprise Value
          Including Cash. The denominator every attribution is taken against.
        </Paragraph>
        <Formula note="Cash is deliberately not subtracted, unlike a standard enterprise value. That is what makes the attribution factors of all an issuer's investors sum to 1.">
          EVIC = market cap + total debt + minority interest
        </Formula>

        <Paragraph>
          <Text style={{ fontWeight: "700", color: c.text }}>2. Attribution factor</Text> — the
          share of the issuer that this position finances.
        </Paragraph>
        <Formula note="Dimensionless, and tiny — the app shows it in basis points or parts per million of EVIC.">
          attribution = position value ÷ EVIC
        </Formula>

        <Paragraph>
          <Text style={{ fontWeight: "700", color: c.text }}>3. Financed emissions</Text> — the
          tonnes attributed to the portfolio.
        </Paragraph>
        <Formula note="Summed across holdings for the portfolio total. Scope 1+2 combined; Scope 3 is shown separately and always as an estimate.">
          financed emissions = Σ attribution × issuer emissions
        </Formula>

        <Paragraph>
          <Text style={{ fontWeight: "700", color: c.text }}>4. WACI</Text> — Weighted Average
          Carbon Intensity, the TCFD headline metric.
        </Paragraph>
        <Formula note="tCO₂e per $M of issuer revenue. Note this uses portfolio weight, not the attribution factor — WACI is independent of portfolio size, which is why it compares to a benchmark.">
          WACI = Σ (weight × issuer emissions ÷ revenue in $M)
        </Formula>
      </Card>

      <SectionHeader>Where the emissions data comes from</SectionHeader>

      <Card>
        <CardTitle hint="Two tiers, never blended silently">The honest version</CardTitle>

        <View style={{ gap: space.sm }}>
          <Text style={[type.headline as TextStyle, { color: c.success }]}>
            Tier 1 — Reported ({REFERENCE.reported_tier_count} companies)
          </Text>
          <Paragraph>
            Scope 1 and market-based Scope 2 taken from the company&apos;s own published
            sustainability report or CDP disclosure. Each carries its source and reporting year,
            visible on the holding detail screen. Figures are recent but not always the current
            year — a company&apos;s environmental report lands months after its financials, so the
            most recent fully reconciled year is used and labelled.
          </Paragraph>
          <Paragraph>
            These score <Text style={{ fontWeight: "700" }}>PCAF 2</Text> (unverified reported), not
            1. Several of these issuers state that their disclosure was third-party assured, but we
            have not obtained and checked those assurance statements ourselves — and score 1 means
            verification you can evidence.
          </Paragraph>
        </View>

        <Divider />

        <View style={{ gap: space.sm }}>
          <Text style={[type.headline as TextStyle, { color: c.warning }]}>
            Tier 2 — Estimated ({REFERENCE.estimated_tier_count} companies)
          </Text>
          <Paragraph>
            Everything else. Emissions are estimated as sector-average carbon intensity × the
            company&apos;s trailing revenue, using the reference table below.
          </Paragraph>
          <Paragraph>
            These score <Text style={{ fontWeight: "700" }}>PCAF 5</Text> — the weakest tier on the
            scale, and correctly so. A revenue-based sector proxy knows nothing about the specific
            company: an efficient operator and a laggard in the same sector with the same revenue
            get identical numbers.
          </Paragraph>
        </View>

        <Divider />

        <Paragraph>
          Financial inputs — market cap, total debt, minority interest, trailing revenue — come from
          Yahoo Finance via yfinance for every company in both tiers. Where minority interest is not
          reported it is treated as zero, which slightly understates EVIC and so slightly overstates
          attribution. Holdings affected are flagged individually on their detail screen.
        </Paragraph>
      </Card>

      <SectionHeader>Sector intensity reference table</SectionHeader>

      <Card>
        <CardTitle hint="tCO₂e per $M revenue, applied to every Tier 2 company">
          The estimation basis
        </CardTitle>
        {REFERENCE.sector_intensity
          .slice()
          .sort(
            (a, b) =>
              b.avg_intensity_tco2e_per_musd_revenue - a.avg_intensity_tco2e_per_musd_revenue,
          )
          .map((s) => (
            <View key={s.sector} style={{ gap: 3 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <View
                  style={{
                    width: 3,
                    height: 16,
                    borderRadius: 2,
                    backgroundColor: sectorColor(s.sector),
                  }}
                />
                <Text style={[type.footnote as TextStyle, { color: c.text, fontWeight: "600", flex: 1 }]}>
                  {s.sector}
                </Text>
                <Text style={[type.footnote as TextStyle, numeric, { color: c.text }]}>
                  {formatIntensity(s.avg_intensity_tco2e_per_musd_revenue)}
                </Text>
                <Text style={[type.caption2 as TextStyle, numeric, { color: c.textTertiary, width: 46, textAlign: "right" }]}>
                  S3 ×{s.scope3_multiplier}
                </Text>
              </View>
              <Text style={[type.caption2 as TextStyle, { color: c.textTertiary, paddingLeft: space.md }]}>
                {s.basis_note}
              </Text>
            </View>
          ))}
        <Divider />
        <Paragraph>
          Sources: EPA Greenhouse Gas Reporting Program facility data aggregated to sector, and
          CDP/Trucost-style sector aggregates for developed-market large caps, cross-checked against
          the disclosed Scope 1+2 and revenue of the largest issuers in each sector. Full source
          notes ship in data/sector_intensity.csv.
        </Paragraph>
      </Card>

      <SectionHeader>Limitations</SectionHeader>

      <Card>
        <Limitation title="Sector proxies are not company estimates">
          A PCAF 5 figure tells you what a typical company of that size in that sector emits. It
          does not tell you what this company emits. Sector means also hide enormous within-sector
          spread — in Materials, steel and specialty chemicals differ by an order of magnitude.
        </Limitation>
        <Limitation title="Scope 3 here is a screening figure only">
          No holding carries a disclosed Scope 3 inventory. Every Scope 3 number in this app is
          Scope 1+2 multiplied by a sector ratio. It is useful for spotting where value-chain
          emissions dominate, and useless for anything you would publish.
        </Limitation>
        <Limitation title="Point-in-time financials, mixed-year emissions">
          Market caps are from the day the data pipeline last ran; emissions are from each
          company&apos;s most recent reported year. PCAF asks for financial and emissions data from
          the same reporting period. This mismatch is normal in practice but it does add noise,
          especially where a market cap has moved sharply since the reporting year.
        </Limitation>
        <Limitation title="The universe is a fixed 82 companies">
          Any ticker outside it cannot be calculated — there is no backend to look it up. Imported
          holdings that do not resolve are excluded and reported with their combined weight, never
          silently dropped.
        </Limitation>
        <Limitation title="Listed equity only">
          PCAF covers seven asset classes with different attribution rules. This implements listed
          equity. Corporate bonds would use the same EVIC denominator; business loans, mortgages,
          motor vehicle loans and project finance would not.
        </Limitation>
      </Card>

      <SectionHeader>What a real deployment changes</SectionHeader>

      <Card>
        <Paragraph>
          The calculation module would not change at all. Only the emissions inputs would.
        </Paragraph>
        <KeyValue label="Reported tier" value="Vendor feed" />
        <Paragraph>
          Trucost, MSCI, ISS ESG or the full CDP dataset replaces the hand-curated table, giving
          verified Scope 1, 2 and disclosed Scope 3 across thousands of issuers — and moving much of
          the book to PCAF 1 and 2.
        </Paragraph>
        <Divider />
        <KeyValue label="Estimated tier" value="Vendor models" />
        <Paragraph>
          The revenue proxy is replaced by the vendor&apos;s own estimation model, which typically
          uses physical activity data and lands at PCAF 3 or 4 rather than 5.
        </Paragraph>
        <Divider />
        <KeyValue label="Everything downstream" value="Unchanged" />
        <Paragraph>
          EVIC, attribution, financed emissions, WACI and the data-quality scoring all keep working
          against the same record shape. That separation is the point of the build-time pipeline.
        </Paragraph>
      </Card>

      <SectionHeader>Build provenance</SectionHeader>

      <Card>
        <KeyValue
          label="Reference data generated"
          value={new Date(REFERENCE.generated_at).toLocaleDateString()}
        />
        <KeyValue label="Companies in universe" value={`${REFERENCE.company_count}`} />
        <KeyValue label="Reported tier" value={`${REFERENCE.reported_tier_count}`} />
        <KeyValue label="Estimated tier" value={`${REFERENCE.estimated_tier_count}`} />
        <KeyValue label="Holdings in current portfolio" value={`${result.holdings.length}`} />
        <Divider />
        <Paragraph>{REFERENCE.financial_data_source}</Paragraph>
        {REFERENCE.excluded.length > 0 ? (
          <Notice tone="warning" title="Dropped at build time">
            {REFERENCE.excluded.map((e) => `${e.ticker}: ${e.reason}`).join("\n")}
          </Notice>
        ) : null}
      </Card>

      <SectionHeader>About</SectionHeader>

      <Card>
        <Paragraph>
          A portfolio carbon footprint calculator implementing the PCAF listed-equity attribution
          methodology end to end: EVIC, attribution factors, absolute financed emissions, WACI
          against a cap-weighted benchmark, and the full five-point PCAF data quality scale.
        </Paragraph>
        <Paragraph>
          Everything runs on the device. The reference universe is compiled at build time and
          shipped inside the app; there is no server, no API key and no network call at runtime.
        </Paragraph>
        <Divider />
        <Text style={[type.caption as TextStyle, { color: c.textTertiary }]}>
          Not investment advice. Not assured data. Not a substitute for a licensed emissions
          dataset in any regulatory or published disclosure.
        </Text>
      </Card>
    </Screen>
  );
}

function Limitation({ title, children }: { title: string; children: React.ReactNode }) {
  const c = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <Text style={[type.footnote as TextStyle, { color: c.text, fontWeight: "700" }]}>
        {title}
      </Text>
      <Text style={[type.footnote as TextStyle, { color: c.textSecondary }]}>{children}</Text>
    </View>
  );
}
