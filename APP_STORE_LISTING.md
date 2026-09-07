# App Store listing copy — Financed Emissions v1.0

Draft for your review. Nothing here is final; edit before pasting.

> **⚠️ Written against the CURRENT UI.** This prompt assumed a UI simplification
> pass had already landed (referring to "Home", "Add Portfolio" and "Learn More"
> tabs). That pass is not in the repo — the tabs are still **Overview,
> Holdings, Data Quality, Import, Methodology**. The copy below uses the real
> tab names. If you simplify the UI, the two places to update are the feature
> list under "What you can do" and the screenshot captions.

---

## App Name

**Limit 30 characters.**

```
Financed Emissions
```

*(18 characters)*

## Subtitle

**Limit 30 characters.** Pick one:

| Option | Chars | Note |
| --- | --- | --- |
| `PCAF portfolio carbon math` | 26 | Leads with the methodology name — best for search by people who know PCAF |
| `Portfolio carbon, on device` | 27 | Leads with the privacy angle |
| `Source-traced carbon metrics` | 28 | Leads with the data-honesty angle |

**Recommended:** `PCAF portfolio carbon math`

## Promotional Text

**Limit 170 characters.** Editable any time *without* a new app review — use it
for dataset-vintage updates.

```
Every emissions figure is labelled with its source and PCAF data quality score.
Measured facility data and sector estimates are never blended into one number.
```

*(155 characters)*

## Description

**Limit 4000 characters.** Current draft is ~2,650.

```
Financed Emissions calculates the carbon footprint of an equity portfolio using the PCAF (Partnership for Carbon Accounting Financials) attribution methodology — the same calculation behind the portfolio carbon pages in ESG and TCFD reports.

Everything runs on your device. There is no account, no sign-in, and no network connection required.

WHAT IT CALCULATES

• EVIC (Enterprise Value Including Cash) for each issuer
• Attribution factor — the share of a company your position finances
• Absolute financed emissions in tCO2e, Scope 1+2
• WACI (Weighted Average Carbon Intensity) against a cap-weighted benchmark
• A PCAF data quality score, 1 to 5, for every holding and for the portfolio

Tap any holding to see the full working: how its EVIC was built up, what its attribution factor is in basis points, and exactly which data source its emissions came from.

HONEST ABOUT THE DATA

Most carbon tools show you a number. This one shows you how much to trust it.

The reference universe covers the S&P 500, built from public sources: audited financials from SEC EDGAR XBRL filings, facility-level emissions from Climate TRACE, and reported emissions from the EPA Greenhouse Gas Reporting Program. Where no facility data can be attributed to a company, a sector-average estimate is used — and labelled as one.

Every figure carries its source, its data vintage, and its PCAF score. Measured data and estimates are never blended into a single unlabelled number.

The app is candid about the limits of free data. Only 22 of 501 companies have facility emissions that can be attributed with confidence — because facility ownership records cover power generation and heavy industry well and cover banks, software and retail not at all. The Methodology screen explains this rather than hiding it.

It also documents where facility data was found and deliberately rejected. Emissions ownership records are uneven: for oil and gas production they are absent entirely, so an oil major's rollup can capture its refineries and none of its upstream. Publishing that as measured Scope 1 would be wrong while looking authoritative, so any rollup covering less than half of what its sector implies is rejected in favour of a labelled estimate. Affected holdings say so on screen.

BRING YOUR OWN PORTFOLIO

Import a CSV with two columns — ticker and market value. The app previews what it parsed before applying anything, tells you which rows it could not read and why, and names any tickers outside the reference universe along with their combined weight, so you always know what was left out of the calculation.

Your holdings are parsed and stored only on your device. They are never transmitted anywhere. The app has no backend to transmit them to.

PRIVACY

No accounts. No analytics. No advertising. No tracking. No network requests at runtime. Nothing is collected.

NOT INVESTMENT ADVICE

This app is a demonstration of a methodology. Its emissions inputs combine measured facility data with sector-average estimates, and it is not a substitute for a licensed emissions dataset in any regulatory or published disclosure. It does not provide investment advice or recommendations.
```

**Note on claims.** Every number in that description is checkable against the
repo (22 of 501, the 0.50× guard, the sector-coverage gaps). No superlatives, no
"AI-powered", nothing unsubstantiated — which is both what Apple's guidelines
want and what actually makes the app interesting. **If you change the dataset,
the "22 of 501" figure needs updating**; it is in Promotional Text range if you
would rather move it there so it can be edited without a review.

## Keywords

**Limit 100 characters, comma-separated, no spaces.** Do not repeat words
already in the app name — Apple indexes those separately.

```
PCAF,carbon,ESG,TCFD,portfolio,climate,WACI,finance,footprint,scope1,disclosure,investing,equities
```

*(98 characters)*

## What's New in This Version

For v1.0, Apple accepts a simple first-release note:

```
First release.

• PCAF financed emissions and WACI for an equity portfolio, calculated on device
• S&P 500 reference universe built from SEC EDGAR, Climate TRACE and EPA GHGRP data
• Every emissions figure labelled with its source, vintage and PCAF data quality score
• Import your own holdings from a CSV file
```

## Support URL

```
https://github.com/coweeeee/pcaf-mobile
```

Acceptable for an app with no dedicated site. The repo has a README and Issues
are enabled, which is what a reviewer checks for.

## Marketing URL

Optional. Leave blank, or reuse the repo URL.

## Copyright

```
2026 Connor Wee
```

> **⚠️ Confirm the name.** I inferred "Connor Wee" from the machine's user
> account and your GitHub handle. Apple expects the legal entity or person who
> owns the copyright, and it should match your Developer Program account name.
> Correct it if it differs.

## Version

```
1.0.0
```

Matches `app.json`.

---

## Screenshots

**Required: one set at 6.9" (1320 × 2868).** Apple auto-scales this to every
smaller iPhone, so no other sizes are needed.

Verified: the **iPhone 17 Pro Max** simulator on this machine captures at
exactly 1320 × 2868.

**Run `./scripts/screenshots.sh` from a real terminal** (not through an agent
session — `expo start --ios` needs a TTY to install Expo Go and will not bind
its port when launched detached; I hit exactly that and could not capture them
for you). The script boots the device, asserts the capture resolution before you
start, walks you tab by tab, and re-checks every file at the end.

Captions are optional. Apple permits factual descriptive text and rejects
promotional superlatives. Suggested, if you overlay them:

| # | Screen | Caption |
| --- | --- | --- |
| 1 | Overview | `Financed emissions and WACI against a benchmark` |
| 2 | Holdings | `Every holding, sorted — with its data source` |
| 3 | Holding detail | `Tap through to the full attribution working` |
| 4 | Data Quality | `A PCAF score for every holding, 1 to 5` |
| 5 | Methodology | `What the data can and cannot tell you` |

Plain screenshots with no overlay are also fine, and are the lower-risk option
for a first submission.
