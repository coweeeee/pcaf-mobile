# Financed Emissions — a PCAF portfolio carbon footprint calculator

An iOS and Android app that computes the **financed emissions** of a listed-equity portfolio using the
PCAF (Partnership for Carbon Accounting Financials) attribution methodology, and shows the portfolio's
**Weighted Average Carbon Intensity (WACI)** against a cap-weighted benchmark.

This is the calculation behind every "portfolio carbon footprint" page in an ESG or TCFD report,
implemented end to end: EVIC, attribution factors, absolute financed emissions, WACI, and the full
five-point PCAF data quality scale.

Everything runs on the device. The reference universe is compiled at build time and shipped inside the
app binary — there is no server, no API key, and no network call at runtime.

```
React Native · Expo SDK 57 · TypeScript · expo-router · react-native-svg · Reanimated 4
```

---

## Read this first: what the data is and is not

Real PCAF reporting at a bank or asset manager runs on licensed vendor emissions data — Trucost, MSCI,
ISS ESG, the full CDP dataset. This project does not have that, and does not pretend to.

**The arithmetic is exactly what a bank would run. The emissions inputs are a mix of real public
disclosures and sector-average estimates.** Every figure in the app carries a badge saying which it is,
and the two are never blended into one number without the UI saying so.

That constraint is treated as a feature rather than something to hide, because data-quality transparency
is itself a PCAF requirement — it is what the 1–5 scoring exists to express. The app has a Methodology
tab that explains the tiering in plain language, and a per-holding drill-down that shows the source and
reporting year of every reported figure.

| | Tier 1 — Reported | Tier 2 — Estimated |
| --- | --- | --- |
| Companies | 32 | 50 |
| Source | The company's own sustainability report or CDP disclosure | Sector-average intensity × company revenue |
| Scope 1 + 2 | As disclosed, market-based Scope 2 | Derived |
| PCAF score | **2** — unverified reported | **5** — sector-average economic data |
| Shown as | `Reported` | `Estimated (sector proxy)` |

Reported-tier holdings score **2, not 1**, even where the issuer states its disclosure was third-party
assured. PCAF score 1 requires verification you can evidence; we have not obtained and checked those
assurance statements ourselves, and scoring 1 on the issuer's say-so would defeat the point of the scale.

**Scope 3 is always an estimate.** No holding in the universe carries a disclosed Scope 3 inventory.
Every Scope 3 figure in the app is Scope 1+2 multiplied by a sector-level ratio. It is a screening
indicator for spotting where value-chain emissions dominate, and it is not something you would publish.

Not investment advice. Not assured data. Not a substitute for a licensed emissions dataset in any
regulatory or published disclosure.

---

## Quick start

```bash
npm install
npm start
```

Then press `i` for the iOS simulator, `a` for Android, or scan the QR code with Expo Go. The app opens on
a bundled 30-holding demo portfolio, so every screen and chart is populated on first launch.

To run it in a browser (useful for quick checks — the CSV import works there too):

```bash
npm run web
```

Other scripts:

```bash
npm test         # 90 unit tests over src/lib (vitest, no simulator needed)
npm run typecheck
npm run data     # regenerate the bundled reference universe from yfinance
```

---

## The methodology

Four equations, implemented in [`src/lib/pcaf.ts`](src/lib/pcaf.ts) as pure functions with no I/O and no
React, so they can be unit tested without a bundler or a simulator.

**1. EVIC — Enterprise Value Including Cash**

```
EVIC_c = market_cap_c + book_value_total_debt_c + minority_interest_c
```

Cash is deliberately **not** subtracted. That is what distinguishes EVIC from a standard enterprise
value, and it is what makes the attribution factors of all an issuer's investors sum to 1.

**2. Attribution factor** — the share of the issuer that a position finances

```
attribution_factor_c = investor_market_value_in_c / EVIC_c
```

Dimensionless and tiny — typically 1e-4 to 1e-7. The app displays it in basis points or parts per million
of EVIC, because percentages round to zero and raw decimals are unreadable.

**3. Financed emissions**

```
financed_emissions_c    = attribution_factor_c × company_emissions_c        (tCO2e)
portfolio_financed_emissions = Σ financed_emissions_c
```

Computed for Scope 1+2 combined. Scope 3 is computed the same way but kept in a separate figure and
always flagged as estimated.

**4. WACI — Weighted Average Carbon Intensity**

```
WACI = Σ [ (portfolio_value_c / total_portfolio_value) × (company_emissions_c / company_revenue_c_in_$M) ]
```

Units: tCO2e per $M of issuer revenue. Note this uses **portfolio weight, not the attribution factor** —
that difference is the single most common error in a hand-rolled implementation, and it is what makes
WACI independent of portfolio size and therefore comparable to a benchmark.

### Coverage is reported, never assumed

Positions whose ticker is not in the reference universe are not silently dropped. They are surfaced in the
UI as *"Not in reference universe — excluded from calculation"* with a count and their combined weight,
and every weight in the result is renormalised over matched value only. There is no live network fallback,
because the app has no backend to fall back to.

### PCAF data quality score

The full five-point scale is implemented, even though the free data only realistically occupies two levels.

| Score | Level | Used here |
| --- | --- | --- |
| 1 | Verified reported — third-party assured | — |
| 2 | Unverified reported — self-disclosed | **32 companies** |
| 3 | Calculated from primary physical activity data | — |
| 4 | Estimated from proxy physical activity data | — |
| 5 | Estimated from sector-average economic data | **50 companies** |

Scores 1, 3 and 4 need inputs a free pipeline cannot reach: an assurance statement we have checked, metered
energy data, or physical proxies like floor area and production units. The scale is implemented in full so
that a real vendor feed populates it without any calculation code changing.

The app reports the portfolio-level weighted average score **two ways**, because they answer different
questions:

- **Weighted by value** — the standard PCAF disclosure.
- **Weighted by financed emissions** — whether the tonnes you are actually reporting rest on good data.
  This is the one that moves when a single high-emitting estimate dominates the total.

---

## Swapping in a real vendor feed

The point of the build-time pipeline is that the emissions source is the only thing that changes.
`src/lib/pcaf.ts` and every screen keep working against the same record shape.

1. **Replace the reported tier.** In [`scripts/build_universe.py`](scripts/build_universe.py), the
   hand-curated `data/emissions_reported.csv` is merged in one place. Point that at a vendor extract
   instead — Trucost, MSCI, ISS ESG or the full CDP dataset — giving verified Scope 1, 2 and *disclosed*
   Scope 3 across thousands of issuers. Set `data_quality_score` to 1 where you hold and have checked the
   assurance statement, 2 otherwise.
2. **Replace the estimated tier.** The revenue × sector-intensity proxy becomes the vendor's own estimation
   model, which typically uses physical activity data and lands at PCAF 3 or 4 rather than 5. Only the
   `emissions_tier`, `emissions_source` and `data_quality_score` fields need to reflect that.
3. **Replace Scope 3.** Where a disclosed value-chain inventory exists, write it to
   `emissions_tco2e_scope3_estimated`, drop the sector multiplier, and change the tier flag so the UI stops
   labelling it an estimate.
4. **Widen the universe.** The reference universe is currently 82 tickers from `data/universe_tickers.csv`.
   A production deployment would carry the full investable universe, which removes the "not in reference
   universe" exclusion path in practice.
5. **Nothing downstream changes.** EVIC, attribution, financed emissions, WACI, the sector waterfall and
   the data-quality scoring all read the same fields. The unit tests in `src/lib/` will tell you
   immediately if a schema change broke an assumption.

For a genuinely live deployment you would also move the universe out of the binary and behind an
authenticated API, since vendor emissions data is licensed and cannot be redistributed in an app bundle.
That is a distribution question, not a calculation one.

---

## Project structure

```
scripts/build_universe.py       pulls yfinance financials, merges the emissions tables, writes the bundle
data/emissions_reported.csv     hand-curated Tier 1 companies, with source and reporting year
data/sector_intensity.csv       11 GICS sector-average intensities + Scope 3 multipliers, with sources
data/universe_tickers.csv       the 82-ticker reference universe
data/demo_portfolio.csv         the 30-holding demo portfolio (the authored source of truth)

assets/data/universe.json       generated — one record per company, bundled into the binary
assets/data/reference.json      generated — sector table + build provenance
assets/data/demo_portfolio.json generated — the demo portfolio, pre-parsed for Metro

src/lib/pcaf.ts                 the calculation module. Pure, no I/O, no React. Unit tested.
src/lib/portfolioCsv.ts         tolerant CSV parsing for the import flow
src/lib/format.ts               number formatting, sector and data-quality palettes
src/lib/universe.ts             bundled-data loader and benchmark builder
src/lib/portfolioStore.tsx      the single piece of app state + AsyncStorage persistence
src/theme.ts                    design tokens: light/dark palettes, spacing, type scale
src/components/                 primitives, the two SVG charts, the heatmap grid

app/(tabs)/index.tsx            Overview
app/(tabs)/holdings.tsx         Holdings (sortable)
app/(tabs)/quality.tsx          Data Quality
app/(tabs)/import.tsx           Import
app/(tabs)/info.tsx             Methodology
app/holding/[ticker].tsx        per-holding drill-down with the full workings

eas.json                        development / preview / production build profiles
```

### Data schemas

One company in `assets/data/universe.json`:

```json
{
  "ticker": "DUK",
  "name": "Duke Energy Corporation",
  "sector": "Utilities",
  "market_cap": 93735796736.0,
  "total_debt": 92205998080.0,
  "minority_interest": 1177000000.0,
  "minority_interest_assumed_zero": false,
  "evic": 187118794816.0,
  "revenue_musd": 32803.0,
  "emissions_tco2e_scope12": 72000000.0,
  "emissions_tier": "reported",
  "emissions_source": "Duke Energy 2024 Climate Report (FY2023)",
  "data_quality_score": 2
}
```

Portfolio input — both the bundled demo and any imported CSV:

```
ticker,market_value_usd
AAPL,8200000
XOM,3100000
```

The importer is deliberately tolerant, because people paste files out of portfolio systems rather than
authoring them: common header spellings (`symbol`, `market value`, `exposure`, `position_value`) are
accepted, as are `$1,234,567.89`, `(500)` for negatives, CRLF line endings and a UTF-8 BOM. Rows that
cannot be read are reported individually with a reason rather than defaulting to zero or failing the whole
file, and the preview shows exactly which columns were matched before anything is applied.

---

## Regenerating the reference data

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python scripts/build_universe.py
```

The script pulls market cap, total debt, minority interest, sector/industry and trailing revenue from
Yahoo Finance via `yfinance`, merges them with the two reference tables, and writes the three JSON files
into `assets/data/`.

It **never invents a financial input**. If a field required for the attribution factor — market cap, total
debt, revenue — is missing, the ticker is dropped and recorded in `reference.json.excluded`, which the
Methodology tab surfaces. Where minority interest is unavailable it is treated as 0 and the record is
flagged `minority_interest_assumed_zero`, which the app shows as a per-holding caveat: EVIC is then
slightly understated, so that holding's attribution factor and financed emissions are slightly overstated.

The script also fails loudly if `data/demo_portfolio.csv` references a ticker outside the universe — a demo
that silently dropped holdings would make the first-launch numbers wrong in a way nobody would notice.

`--strict` turns any dropped ticker into a build failure.

---

## Testing

```bash
npm test
```

90 tests, all over `src/lib`, no bundler or simulator required.

The core is tested against a **hand-computed three-holding example** — every intermediate quantity
(weights, attribution factors, per-holding financed emissions, the 5,080 tCO2e total, WACI of 854, the
value-weighted data quality score of 3.2) is asserted against a figure worked out by hand, so the math is
verifiable independently of the code. On top of that:

- **Coverage and input handling** — unknown tickers excluded and their weight reported, duplicate rows for
  one ticker folded together, case and whitespace tolerated, zeroed non-NaN results for an empty or
  fully-unmatched portfolio, and WACI proven invariant to scaling every position by the same factor.
- **Integration tests over the real generated universe** — every EVIC re-derived from its components, every
  estimated figure re-derived from the published sector intensity, tier-to-score mapping checked for all 82
  companies, and the demo portfolio asserted to resolve fully, span both tiers and span every GICS sector
  (so the waterfall is never degenerate).
- **The import path against the real universe** — a deliberately awkward file with unfamiliar header
  spellings, `$`/comma/scientific-notation values, a blank line, a short position, a duplicated ticker and
  two unresolvable ones. It asserts the app *reports* what it could not calculate: the excluded tickers are
  named, their combined value and share of the file are right, and weights renormalise over matched value
  only. This is the path where a silent failure would be worst — a portfolio that quietly dropped a fifth of
  its value would still render a confident, completely wrong headline number.
- **Formatting** — including the React Native colour-blend port, which replaced the web build's CSS
  `color-mix()`; a blend that silently returned a non-colour string would render as a transparent cell
  rather than throwing.

The headline figures were additionally checked against an independent Python reimplementation written
straight from the equations above. They agree exactly:

| | App | Independent check |
| --- | --- | --- |
| Financed Scope 1+2 | 3,283 tCO2e | 3,283.4 |
| Economic intensity | 36.6 /$M | 36.64 |
| Portfolio WACI | 162 | 161.80 |
| Benchmark WACI | 65.7 | 65.66 |
| Data quality (by value) | 2.80 | 2.797 |

---

## Building and shipping

### Prerequisites

```bash
npm install -g eas-cli
eas login
eas init          # writes extra.eas.projectId into app.json
```

**Before your first build, change the bundle identifier.** `app.json` ships with
`com.pcafdemo.financedemissions` for both `ios.bundleIdentifier` and `android.package`. Replace it with a
reverse-domain identifier you own, or the App Store upload will be rejected.

### The three profiles

`eas.json` defines the three profiles the brief asked for:

| Profile | What it is | Command |
| --- | --- | --- |
| `development` | Dev client with the debug runtime, simulator build | `eas build --profile development --platform ios` |
| `preview` | Internal distribution — the one to install on your own device | `eas build --profile preview --platform ios` |
| `production` | Store submission build, auto-incrementing build number | `eas build --profile production --platform ios` |

### TestFlight

```bash
eas build --profile production --platform ios
eas submit --profile production --platform ios
```

`eas submit` uploads the finished build to App Store Connect. From there, add it to a TestFlight group —
internal testers get it within minutes; external testers need a Beta App Review first. `production` sets
`autoIncrement`, so repeat builds get a fresh build number without editing `app.json`.

For a build you just want on your own phone without going through TestFlight, use the `preview` profile:
EAS returns an install URL, and the device needs to be registered first with `eas device:create`.

Android follows the same shape — `preview` produces an installable APK, `production` an AAB for Play.

---

## Decisions and assumptions

Where the brief left something open, or where I deviated, the reasoning is here.

**Charts are drawn with `react-native-svg`, not `victory-native`.** The brief named victory-native. Two of
the three visualisations were going to be hand-laid-out regardless — the brief itself notes there is no
built-in waterfall type, and specifies the heatmap be built as a View grid rather than a chart component.
That left one genuine chart: a two-bar comparison. Pulling in victory-native XL means adding
`@shopify/react-native-skia` and its native surface for two rectangles, at a real cost to bundle size and
to the "runs in Expo Go immediately" priority the brief set. The SVG implementations are in
`src/components/WaciComparison.tsx` and `SectorWaterfall.tsx` and are 128 and 170 lines respectively.

**Expo Router rather than React Navigation directly.** The brief's own project structure showed an `/app/`
directory, and Expo Router is React Navigation underneath — so this is the same navigator with file-based
routing and typed routes on top.

**The demo portfolio has 30 holdings, not 20.** The brief said "~20-holding" and listed 20 tickers. It was
extended to 30 so the sector waterfall covers all 11 GICS sectors and both emissions tiers are represented —
a demo that only exercised half the tiering would not demonstrate the thing the app is about. Integration
tests assert both properties. Note the tiers are not evenly spread *within* every sector: five sectors carry
both, four are entirely reported, and Materials and Real Estate are entirely estimated. That reflects which
large caps actually publish Scope 1+2, and it is visible on the Data Quality tab rather than smoothed over.

**A known weak point in the demo data: Exelon (EXC).** EXC falls in the estimated tier, so it inherits the
Utilities sector average of 2,100 tCO2e/$M. That average is calibrated against the four utilities in the
dataset that *do* disclose (NEE, SO, DUK, AEP derive 1,513 / 2,618 / 2,195 / 2,106), and it is a poor fit
for Exelon specifically: Exelon spun its entire generation fleet out as Constellation in February 2022 and
is now a wires-and-gas-delivery holding company, so the sector rationale — owned thermal generation — no
longer describes it. On the demo portfolio EXC carries 19.9% of headline financed emissions and 17.4% of
WACI, so the overstatement is material.

It is left in the estimated tier rather than quietly corrected, for two reasons. Moving it to the reported
tier means writing a *specific* disclosed Scope 1 and Scope 2 into `emissions_reported.csv`, and inventing
those figures to make a demo look better is precisely the failure this project exists to argue against. And
a sector proxy being badly wrong for an atypical issuer is not a bug in the estimate — it is the definition
of PCAF score 5, which is why the score exists. What was fixed is the *framing*: the holding detail screen
now attributes the sector note to the sector rather than to the company, and says outright that an issuer
which has divested the activity the average is built on can sit far from the figure. The honest resolution
is to source Exelon's actual disclosure and promote it to tier 1 — the same path any real deployment takes
for every holding.

**The benchmark is 82 companies, not 500.** A true S&P 500 proxy would need emissions data for 500
issuers. The benchmark is cap-weighted across the same reference universe the portfolio resolves against,
scaled to the same notional so absolute financed emissions are comparable. WACI is scale-invariant, so the
notional only affects the absolute figure. The app says exactly this on the Overview screen rather than
implying broader coverage than exists.

**Financial and emissions data are from different periods.** Market caps are from the day the pipeline last
ran; emissions are from each company's most recent reported year. PCAF asks for both from the same
reporting period. This mismatch is normal in practice — an environmental report lands months after the
financials — but it adds noise, particularly where a market cap has moved sharply since. Reporting years
are shown per holding so the gap is visible rather than buried.

**Listed equity only.** PCAF covers seven asset classes with different attribution rules. Corporate bonds
would use the same EVIC denominator; business loans, mortgages, motor vehicle loans and project finance
would not.

**A `data/` CSV is the source of truth, and the JSON is generated.** The demo portfolio is authored as CSV
because that is the exact format a user's own import has to match. Metro cannot import a `.csv`, so the
build script emits a pre-parsed `.json` alongside it.

**Motion is deliberately sparse.** Three animations ship: a layout transition when the holdings list is
re-sorted (so you can follow a row to its new position rather than having the list teleport), a 120ms press
scale on controls, and a cross-fade when the loaded portfolio changes. There is no entrance animation on
the Overview tab — it is a screen you land on dozens of times a session, and staggering in the numbers you
opened the app to read costs more than it gives. All of it respects the system reduced-motion setting.

**Relationship to `../pcaf-financed-emissions`.** A web version of this project exists as a sibling
directory. The calculation module, the CSV parser and the two reference data tables originated there and
were ported; `src/lib/pcaf.ts` is unchanged, and `format.ts` was rewritten for React Native (hex palettes
and a JS colour blend in place of CSS custom properties and `color-mix()`). The two projects now carry
independent copies of `data/`. If both are kept, that directory should be made a single shared source
rather than allowed to drift.

---

## Licence and scope

A demonstration of a methodology, built to be read as much as run. The emissions figures are labelled,
sourced and scored precisely so that nobody mistakes them for a licensed dataset.
