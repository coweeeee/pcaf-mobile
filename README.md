# Financed Emissions — a PCAF portfolio carbon footprint calculator

An iOS and Android app that computes the **financed emissions** of a listed-equity portfolio using
the PCAF (Partnership for Carbon Accounting Financials) attribution methodology, and shows the
portfolio's **Weighted Average Carbon Intensity (WACI)** against a cap-weighted benchmark.

The reference universe is the **full S&P 500**, built from real public data: audited financials from
SEC EDGAR XBRL, facility-level emissions from Climate TRACE and EPA GHGRP, and a documented
sector-average fallback where no facility data can be attributed. Every number traces to a named
source with a dated vintage.

Everything runs on the device. The universe is compiled at build time and shipped inside the app
binary — no server, no API key, no network call at runtime.

```
React Native · Expo SDK 57 · TypeScript · expo-router · react-native-svg · Reanimated 4
```

---

## The headline finding

The brief hoped the sector-average proxy would become "the minority case, not the default path."
**It didn't, and that is the most interesting result in this build.**

| Emissions source | Companies | PCAF score |
| --- | --- | --- |
| Climate TRACE (facility rollup) | 19 | 3 |
| EPA GHGRP (reported facility data) | 3 | 3 |
| Sector-average proxy | 479 | 5 |

Two reasons, both real and both worth stating plainly:

1. **Climate TRACE tracks smokestacks.** Most of the S&P 500 — banks, software, insurers, retailers,
   healthcare, media — has no facility-level footprint to roll up. Their Scope 1 is genuinely small
   and dispersed (offices and fleets, not plants), so there is nothing to attribute and the proxy is
   the only honest option.
2. **Ownership coverage is partial and sector-dependent**, so 34 further companies that *did* have
   facility data were rejected by the coverage guard below rather than published with a wrong number.

In practice, free facility data can fully characterise **pure-play power generators and heavy
industry, and almost nothing else.** The app says exactly this on its Methodology tab rather than
implying broader coverage than exists.

The demo portfolio makes the consequence vivid: 95% of its *value* sits on estimates, but only 66% of
its *financed emissions* do — because the two utilities carrying a 4.7% weight carry most of the
tonnes. That inversion is why the app reports data quality weighted **both** ways.

---

## Data sources

All free, none requiring an API key.

### Financials — SEC EDGAR XBRL

Total debt, revenue, shares outstanding and minority interest per company, each with the XBRL tag it
actually came from and the period it covers.

**Deviation, deliberate:** the brief specifies the CompanyFacts endpoint. Measured, one CompanyFacts
response is **3.1 MB** (Exxon), so the S&P 500 costs ~1.5 GB of transfer. The `frames` endpoint
returns one concept for *every* filer in a period in a single **679 KB** response covering ~5,000
filers. `fetch_sec_financials.py` sweeps frames for the bulk pass and falls back to CompanyFacts
per-company only for filers the frames miss (off-calendar fiscal years). Same API, same audited data,
~100× less transfer, nothing lost.

Coverage achieved: **debt 491/503, revenue 502/503, shares 488/503**, in ~160 requests. Requests carry
a descriptive `User-Agent` and are rate-limited to 8/s, under SEC's published 10/s ceiling — being
throttled by SEC blocks the session rather than returning a cheap retry.

One tag lesson: broker-dealers tag revenue as `RevenuesNetOfInterestExpense` and nothing in the
generic list. Without that tag Goldman Sachs dropped out of the universe entirely for want of a WACI
denominator.

Market cap is a live yfinance price × SEC-reported shares outstanding, per the brief.

### Emissions tier 1 — Climate TRACE

Facility-level Scope 1 (`co2e_100yr`) for US assets across 36 industrially relevant subsectors,
rolled up to the owning company via the API's `Owners` field. Vintage 2024. The API publishes owner
names but no ownership percentages, so a jointly-owned asset is split equally across its distinct
owners and the assumption is recorded.

### Emissions tier 2 — EPA GHGRP (Envirofacts)

Direct emissions from ~11,000 large US emitters, vintage 2023. Supplementary and deliberately narrow
— see below. Every request is optional: if the feed disappears the pipeline degrades to Climate TRACE
and then the proxy rather than failing. EPA has proposed eliminating most GHGRP reporting categories,
so this is not hypothetical.

### Emissions tier 3 — sector proxy

GICS sector-average intensity × SEC-reported revenue, from `data/sector_intensity.csv`.

### Not used: SEC 10-K climate disclosures

The SEC's 2024 climate disclosure rule was never enforced and is being formally rescinded, so there is
no consistent mandatory US emissions filing to scrape. California's **SB 253** — large companies doing
business in CA must report Scope 1/2 from August 2026 — is the emerging source worth revisiting, and
is noted as such in the pipeline code.

---

## The two hard problems

Both were found by measurement, not anticipated in the abstract. Both would have shipped silently
wrong.

### 1. Entity resolution — fuzzy matching is dangerous

Climate TRACE names *operating subsidiaries*, not listed parents: "Alabama Power Co" is Southern
Company, "Luminant Generation" is Vistra. Fuzzy matching is the obvious tool and it is a trap.

An initial pass accepting `rapidfuzz` scores down to 78 produced 35 sub-94 matches. Inspection showed
almost all were wrong in the most damaging way possible — attributing one company's emissions to an
unrelated company sharing a token:

| Would have received | From owner | Emissions |
| --- | --- | --- |
| Boston Properties (BXP) | "BP PLC" | 6,652,466 tCO2e |
| DaVita (DVA) | "Avista Corp" | 4,705,424 tCO2e |
| Arch Capital (ACGL) | "ArcLight Capital Partners" | 3,403,293 tCO2e |
| Northern Trust (NTRS) | "NorthWestern Corp" | 3,023,800 tCO2e |
| Agilent (A) | "Raytheon Technologies" | 97,099 tCO2e |
| Capital One (COF) | "Capital Coal Corp" | 56,189 tCO2e |

Every one would have put millions of tonnes of someone else's emissions onto a bank or a REIT wearing
a "measured facility data" badge. A *missing* match costs a company its real data and falls to a
labelled estimate; a *wrong* match silently corrupts two companies at once.

So the bar is set at **94, where the false positives stop**, and the genuine sub-94 hits found by
inspection (Kinder Morgan Energy Partners, Occidental Permian, Constellation Power, Consolidated
Edison of NY) were promoted into `data/entity_overrides.csv` as asserted corporate-structure facts.
Every rejected near-match is retained in the build output so the decision is auditable — and the
rejects vindicate the bar: Tennessee Valley Authority's 44 MtCO2e would otherwise have landed on Palo
Alto Networks.

`data/entity_overrides.csv` holds 76 hand-verified mappings. Two rows were written and then removed
after checking: Tampa Electric is Emera-owned, not NextEra; Motiva has been wholly Saudi Aramco since
2017. Shipping either would have misattributed emissions.

A large share of US industrial emissions is simply **not attributable to any S&P 500 issuer** —
TVA (federal), Salt River Project and Omaha PPD (municipal), Basin Electric and Oglethorpe
(cooperatives), Georgia-Pacific and Koch (private), Shell and BP (not US-listed). Those are recorded
as unattributed rather than forced onto the nearest ticker.

### 2. Partial ownership coverage — the guard

Climate TRACE's `Owners` field is not populated evenly. Measured on 2024 US data:

| Subsector | Assets with an owner |
| --- | --- |
| oil-and-gas-refining, cement | 100% |
| electricity-generation | 92–99% |
| iron-and-steel | 94% |
| coal-mining | 80% |
| chemicals | 59% |
| **oil-and-gas-production** | **0%** |
| **solid-waste-disposal, road-transportation** | **0%** |

So a rollup for an integrated oil major captures its refineries and none of its upstream production.
Publishing that as "measured Scope 1" is worse than an honest estimate: it is wrong *and* it wears the
strongest badge in the app.

Every rollup is therefore compared against what the sector average implies. The measured distribution
across 54 comparable companies made the problem obvious:

| Ratio | Company | Reading |
| --- | --- | --- |
| 0.00 | AAPL, EXC, COP, CAT, PG | one stray facility, not a footprint |
| 0.05 | PCG (2.6 Mt vs 52.4 Mt) | delivery utility, generation not owned |
| 0.17 | CVX (12.9 Mt vs 77.5 Mt) | refining captured, production missing |
| 0.36 | XOM (30.1 Mt vs 84.5 Mt) | same — real Scope 1 is ~110 Mt |
| 0.96 | VST (35.5 Mt vs 36.9 Mt) | whole business is generation |
| 1.30 | DUK (86.9 Mt vs 66.7 Mt) | whole business is generation |

Below **0.50×** the rollup is rejected and the holding falls through to EPA and then the proxy, with
the reason recorded on the record and shown on that holding's detail screen.

This deliberately errs toward **rejecting good data rather than accepting partial data**. Valero at
0.48 is genuinely accurate and still gets rejected. Losing a correct figure costs accuracy on one
holding; keeping a partial one publishes a number that is both wrong and confidently labelled. For a
tool whose entire argument is data-quality honesty, only the second is unacceptable.

### Why EPA contributes so little

Envirofacts exposes no parent-company table through the public service — only `facility_name`, and a
facility name is a *plant* name: "SANTA ROSA CENTRAL LANDFILL", "PSE Ferndale Generating Station".
Given what fuzzy matching did on Climate TRACE, only override/exact/≥96 matches are accepted, which
attributes 0.6% of GHGRP's reported tonnes. That is the honest ceiling without a parent-company
crosswalk; the rest is retained as an explicit unattributed total.

One bug worth recording: GHGRP splits reporters into **direct emitters** and **suppliers**, and
suppliers report the emissions that *would* result from combusting the fuel they sell. Summing both
produced a 7.36 Gt "total" — larger than all US greenhouse gas emissions — and put 51.9 MtCO2e on
Exxon from a single "facility" that was really a supplier registration. Only direct-emitter sectors
are summed now (2.70 Gt, the right order for GHGRP).

---

## The methodology

Four equations, implemented in [`src/lib/pcaf.ts`](src/lib/pcaf.ts) as pure functions with no I/O and
no React.

**1. EVIC — Enterprise Value Including Cash**

```
EVIC_c = market_cap_c + book_value_total_debt_c + minority_interest_c
```

Cash is deliberately **not** subtracted. That is what distinguishes EVIC from enterprise value, and
what makes the attribution factors of all an issuer's investors sum to 1. Minority interest defaults
to 0 where SEC filings do not report it (238 of 501 companies), and every affected holding says so on
its detail screen: EVIC is then understated, so attribution and financed emissions are overstated.

**2. Attribution factor**

```
attribution_factor_c = investor_market_value_in_c / EVIC_c
```

**3. Financed emissions**

```
financed_emissions_c = attribution_factor_c × company_emissions_c
portfolio_financed_emissions = Σ financed_emissions_c
```

**4. WACI**

```
WACI = Σ [ (portfolio_value_c / total_portfolio_value) × (company_emissions_c / company_revenue_c_in_$M) ]
```

Units tCO2e/$M revenue. Note this uses **portfolio weight, not the attribution factor** — the single
most common error in a hand-rolled implementation, and what makes WACI independent of portfolio size
and therefore comparable to a benchmark.

### PCAF data quality mapping

| Score | Level | This build |
| --- | --- | --- |
| 1 | Verified reported (third-party assured) | — |
| 2 | Unverified self-reported | — |
| 3 | Calculated from primary physical activity data | Climate TRACE / EPA at high entity-match confidence |
| 4 | Estimated from proxy physical activity data | Climate TRACE / EPA at medium or low confidence |
| 5 | Sector-average economic data | the proxy fallback |

Scores 1 and 2 require company-reported inventories, which no free source publishes at this breadth.
The full scale is implemented so a licensed vendor feed populates the top of it without any
calculation code changing.

Score 4 is currently unoccupied, which is a consequence of the guard rather than an oversight: a
facility rollup either clears the coverage threshold at high match confidence (3) or is rejected
outright to the proxy (5). Loosening the guard to populate 4 would mean publishing partial rollups,
which is the thing the guard exists to prevent.

### Coverage is reported, never assumed

Tickers outside the reference universe are surfaced as *"Not in reference universe — excluded from
calculation"* with a count and combined weight, and all weights renormalise over matched value only.

---

## Running the pipeline

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

.venv/bin/python scripts/fetch_sec_financials.py    # SEC EDGAR XBRL
.venv/bin/python scripts/fetch_climatetrace.py      # Climate TRACE + entity resolution
.venv/bin/python scripts/fetch_epa_ghgrp.py         # EPA GHGRP (optional tier)
.venv/bin/python scripts/build_universe.py          # merge -> assets/data/
```

Every HTTP response is cached under `.cache/` keyed on the request URL, so re-runs are free and the
APIs are not hammered. `build_universe.py --strict` turns any dropped ticker into a build failure.

The pipeline **never invents a figure**. A company with no usable XBRL revenue is dropped and recorded
in `reference.json.excluded` (2 companies: APA, SYF) rather than given a guessed denominator.

### Running the app

```bash
npm install
npm start        # then i / a, or scan with Expo Go
npm test         # 93 unit tests, no simulator needed
npm run typecheck
```

---

## Project structure

```
scripts/common.py                  HTTP with rate limiting + disk cache, name normalisation
scripts/fetch_sec_financials.py    SEC EDGAR XBRL (frames bulk + CompanyFacts fallback)
scripts/fetch_climatetrace.py      Climate TRACE pull, owner rollup, entity resolution
scripts/fetch_epa_ghgrp.py         EPA GHGRP (optional, degrades gracefully)
scripts/build_universe.py          merge, coverage guard, PCAF scoring -> assets/data/

data/sp500_constituents.csv        503 constituents with GICS sector and CIK
data/sector_intensity.csv          11 GICS sector-average intensities + Scope 3 multipliers
data/entity_overrides.csv          76 hand-verified owner-name -> ticker mappings
data/demo_portfolio.csv            the 30-holding first-launch portfolio

assets/data/universe.json          generated, bundled: 501 companies with full provenance
assets/data/reference.json         sector table, source metadata, coverage-guard diagnostics

src/lib/pcaf.ts                    the calculation module. Pure, no I/O, no React.
src/lib/portfolioCsv.ts            tolerant CSV parsing for the import flow
src/lib/portfolioStore.tsx         app state + AsyncStorage persistence
src/theme.ts                       design tokens: light/dark palettes, spacing, type scale

app/(tabs)/                        Overview, Holdings, Data Quality, Import, Methodology
app/holding/[ticker].tsx           per-holding drill-down with the full workings
eas.json                           development / preview / production build profiles
```

### Record schema

```json
{
  "ticker": "DUK",
  "cik": "0000001326160",
  "name": "Duke Energy",
  "sector": "Utilities",
  "market_cap": 93530000000.0,
  "market_cap_basis": "yfinance_price_x_sec_shares",
  "total_debt": 87870000000.0,
  "total_debt_tag": "LongTermDebtNoncurrent+DebtCurrent",
  "total_debt_basis": "long_term_plus_current",
  "minority_interest": 2020000000.0,
  "minority_interest_assumed_zero": false,
  "evic": 183420000000.0,
  "revenue_musd": 31740.0,
  "financials_confidence": "high",
  "financials_vintage": "2025-12-31",
  "emissions_tco2e_scope12": 86894106.0,
  "emissions_source": "climatetrace",
  "emissions_match_confidence": "high",
  "emissions_vintage": "2024",
  "emissions_coverage_ratio": 1.3,
  "data_quality_score": 3
}
```

`financials_confidence` is `high` only when debt came from explicit debt tags; `medium` means Total
Liabilities was used as a documented over-estimate (106 companies), `low` means no debt figure
resolved (12 companies).

Portfolio input, for both the demo and any imported CSV:

```
ticker,market_value_usd
AAPL,8200000
```

The importer is tolerant because people paste files out of portfolio systems: header aliases
(`symbol`, `market value`, `exposure`), `$1,234,567.89`, `(500)` for negatives, CRLF, UTF-8 BOM. Bad
rows are reported individually with a reason rather than defaulted to zero.

---

## Testing

93 tests over `src/lib`, no bundler or simulator required.

- **A hand-computed three-holding example** — every intermediate quantity (weights, attribution
  factors, the 5,080 tCO2e total, WACI of 854) asserted against a figure worked out by hand, so the
  math is verifiable independently of the code.
- **Coverage and input handling** — unknown tickers excluded with their weight reported, duplicate
  rows folded, zeroed non-NaN results for an empty portfolio, WACI proven scale-invariant.
- **Integration tests over the real generated universe** — every EVIC re-derived from its components,
  every proxy figure re-derived from the published sector intensity, the emissions-source → PCAF
  score mapping checked for all 501 companies, full provenance asserted on every record, and the
  invariant that **no kept rollup sits below the coverage guard**.
- **The import path** — a deliberately awkward CSV with unfamiliar headers, currency formatting, a
  short position, a duplicated ticker and two unresolvable ones, asserting the app *reports* what it
  could not calculate.

Headline figures were additionally checked against an independent Python reimplementation written
from the equations above. They agree exactly:

| | App | Independent check |
| --- | --- | --- |
| Financed Scope 1+2 | 3,644 tCO2e | 3,644.4 |
| Economic intensity | 40.7 /$M | 40.67 |
| Portfolio WACI | 210 | 209.87 |
| Benchmark WACI | 110 | 110.02 |
| Data quality (by value) | 4.91 | 4.906 |
| Data quality (by emissions) | 4.32 | 4.325 |

---

## Building and shipping

```bash
npm install -g eas-cli && eas login && eas init
```

**Change the bundle identifier before your first build.** `app.json` ships
`com.pcafdemo.financedemissions` for both platforms; replace it with a reverse-domain identifier you
own or the App Store upload is rejected.

| Profile | Purpose | Command |
| --- | --- | --- |
| `development` | Dev client, simulator | `eas build --profile development --platform ios` |
| `preview` | Internal distribution, install on your own device | `eas build --profile preview --platform ios` |
| `production` | Store submission, auto-incrementing build number | `eas build --profile production --platform ios` |

```bash
eas build --profile production --platform ios
eas submit --profile production --platform ios
```

`eas submit` uploads to App Store Connect; add the build to a TestFlight group from there. For a build
you just want on your own phone, use `preview` and register the device with `eas device:create`.

---

## Adding the paid vendor tier

The calculation module does not change. Only the emissions inputs do.

1. **Replace tiers 1 and 2.** Trucost, MSCI ESG, ISS ESG or the full CDP dataset gives verified Scope
   1, 2 and *disclosed* Scope 3 across thousands of issuers. Write it where `build_universe.py`
   currently reads the Climate TRACE and EPA caches, and set `data_quality_score` to 1 where you hold
   and have checked the assurance statement, 2 otherwise. That populates the top of the PCAF scale,
   which free data cannot reach.
2. **Replace tier 3.** The revenue proxy becomes the vendor's estimation model, which uses physical
   activity data and lands at PCAF 3 or 4 rather than 5.
3. **Drop the coverage guard** for vendor-sourced records. It exists because facility ownership data
   is partial; a vendor inventory is company-complete by construction.
4. **Replace Scope 3.** Where a disclosed value-chain inventory exists, write it to
   `emissions_tco2e_scope3_estimated`, drop the sector multiplier, and change the source flag so the
   UI stops labelling it an estimate.
5. **Move the universe behind an API.** Vendor emissions data is licensed and cannot be redistributed
   inside an app bundle. That is a distribution question, not a calculation one.

---

## Decisions and deviations

**Charts use `react-native-svg`, not `victory-native`.** Two of the three visualisations were going to
be hand-laid-out regardless — there is no waterfall type in any RN charting library, and the brief
specifies the heatmap as a View grid. That left one genuine chart: a two-bar comparison. victory-native
XL means adding `@shopify/react-native-skia` and its native surface for two rectangles, against the
brief's own priority of running in Expo Go immediately.

**CSV parsing is a hand-written parser, not `papaparse`.** The parser predates this build, is
dependency-free, and is more tolerant than a default papaparse config (header aliases, accounting
negatives, BOM, per-row error reporting). 14 tests cover it.

**Expo Router rather than React Navigation directly** — the brief's own structure shows an `/app/`
directory, and Expo Router is React Navigation underneath.

**The demo portfolio has 30 holdings, not 20.** Extended from the brief's list so the sector waterfall
covers all 11 GICS sectors. Note the tiers are not evenly spread within it: only 2 of 30 holdings
resolve to measured facility data, which is a property of the real world, not of the selection.

**Scope 3 is always estimated** — a sector multiplier on Scope 1+2. No free source gives reliable
Scope 3 at this breadth. Flagged everywhere it appears.

**Financial and emissions data are from different periods.** Financials are the latest SEC filing;
emissions are 2024 (Climate TRACE) or 2023 (EPA). PCAF asks for both from the same reporting period.
Vintages are shown per holding so the gap is visible rather than buried.

**Listed equity only.** PCAF covers seven asset classes with different attribution rules. Corporate
bonds would use the same EVIC denominator; loans, mortgages and project finance would not.

**Two data files from the previous build were removed**, not left as dead weight:
`emissions_reported.csv` (32 hand-curated company disclosures) and `universe_tickers.csv` (the old
82-ticker universe). The curated table would have populated PCAF score 2, which nothing else here
can reach — but this brief's ground rules require every number to trace to SEC EDGAR, Climate TRACE,
EPA GHGRP or the sector formula, and a hand-maintained table is none of those. It is in git history
if a future build wants it back as an explicit fourth tier.

**`tsc --noEmit` takes ~2 minutes** on this project — expo-router's generated route types plus 501
companies of JSON. It is slow, not hung.

---

Not investment advice. Not assured data. Not a substitute for a licensed emissions dataset in any
regulatory or published disclosure.
