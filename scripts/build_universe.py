#!/usr/bin/env python3
"""
Build the static reference universe consumed by the front end.

Pulls company financials from yfinance, merges them with the two hand-curated
emissions reference tables, and writes:

    assets/data/universe.json       - array of company records (one per ticker)
    assets/data/reference.json      - sector intensity table + build provenance
    assets/data/demo_portfolio.json - the bundled demo portfolio, pre-parsed

Everything lands in assets/ because this is an Expo app: the JSON is imported
directly by Metro and shipped inside the app binary. There is no server to
fetch from at runtime.

Design rule: this script never invents a financial input. If a field required
for the PCAF attribution factor (market cap, total debt, revenue) is missing,
the ticker is dropped and the reason is recorded in reference.json. Minority
interest is the one exception - PCAF permits assuming zero when it is not
disclosed, and every record carries a flag saying whether that assumption was
applied.

Usage:
    python scripts/build_universe.py                 # use cache where fresh
    python scripts/build_universe.py --refresh       # ignore cache
    python scripts/build_universe.py --strict        # abort on any drop
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = ROOT / "assets" / "data"
CACHE = DATA / ".cache"

CACHE_TTL_SECONDS = 60 * 60 * 24  # a day; financials do not move faster than that

# yfinance reports Yahoo's own sector taxonomy, not GICS. The universe file
# carries an explicit GICS sector per ticker; this map is the fallback used to
# flag disagreements and to classify anything not listed there.
YAHOO_TO_GICS = {
    "Basic Materials": "Materials",
    "Communication Services": "Communication Services",
    "Consumer Cyclical": "Consumer Discretionary",
    "Consumer Defensive": "Consumer Staples",
    "Energy": "Energy",
    "Financial Services": "Financials",
    "Healthcare": "Health Care",
    "Industrials": "Industrials",
    "Real Estate": "Real Estate",
    "Technology": "Information Technology",
    "Utilities": "Utilities",
}

REQUIRED_INFO_FIELDS = ("marketCap", "totalDebt", "totalRevenue")

# Yahoo occasionally carries a wrong legal name. Corrections are listed
# explicitly rather than blanket-preferring our own table, so the vendor name
# stays authoritative everywhere it is right.
NAME_OVERRIDES = {
    "XOM": "Exxon Mobil Corporation",  # Yahoo returns "ExxonMobil Holdings Corporation"
}


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def finite(value) -> float | None:
    """Coerce to a positive finite float, or None."""
    if value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(f):
        return None
    return f


def fetch_ticker(ticker: str, refresh: bool) -> dict | None:
    """Return the raw yfinance payload for one ticker, using an on-disk cache."""
    CACHE.mkdir(parents=True, exist_ok=True)
    cache_file = CACHE / f"{ticker}.json"

    if not refresh and cache_file.exists():
        age = time.time() - cache_file.stat().st_mtime
        if age < CACHE_TTL_SECONDS:
            return json.loads(cache_file.read_text())

    import yfinance as yf

    try:
        t = yf.Ticker(ticker)
        info = t.info or {}
    except Exception as exc:  # network / parsing failures
        log(f"  ! {ticker}: yfinance info failed ({exc})")
        return None

    minority_interest = None
    try:
        bs = t.balance_sheet
        if bs is not None and not bs.empty and "Minority Interest" in bs.index:
            # Most recent reporting period is the first column.
            minority_interest = finite(bs.loc["Minority Interest"].iloc[0])
    except Exception as exc:
        log(f"  ~ {ticker}: balance sheet unavailable ({exc}); minority interest -> 0")

    payload = {
        "ticker": ticker,
        "name": NAME_OVERRIDES.get(ticker)
        or info.get("longName")
        or info.get("shortName")
        or ticker,
        "yahoo_sector": info.get("sector"),
        "industry": info.get("industry"),
        "currency": info.get("currency"),
        "market_cap": finite(info.get("marketCap")),
        "total_debt": finite(info.get("totalDebt")),
        "total_revenue": finite(info.get("totalRevenue")),
        "shares_outstanding": finite(info.get("sharesOutstanding")),
        "minority_interest": minority_interest,
        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    cache_file.write_text(json.dumps(payload, indent=1))
    return payload


def load_reference_tables() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    universe = pd.read_csv(DATA / "universe_tickers.csv")
    reported = pd.read_csv(DATA / "emissions_reported.csv")
    sectors = pd.read_csv(DATA / "sector_intensity.csv")

    reported["scope12_tco2e"] = (
        reported["scope1_tco2e"].fillna(0) + reported["scope2_market_tco2e"].fillna(0)
    )
    unknown = set(universe["gics_sector"]) - set(sectors["gics_sector"])
    if unknown:
        raise SystemExit(f"universe_tickers.csv references unknown GICS sectors: {sorted(unknown)}")

    orphan = set(reported["ticker"]) - set(universe["ticker"])
    if orphan:
        log(f"  ~ reported emissions for tickers outside the universe (ignored): {sorted(orphan)}")

    return universe, reported.set_index("ticker"), sectors.set_index("gics_sector")


def build(refresh: bool, strict: bool) -> int:
    universe, reported, sectors = load_reference_tables()

    records: list[dict] = []
    excluded: list[dict] = []
    sector_mismatches: list[dict] = []

    total = len(universe)
    for n, row in enumerate(universe.itertuples(index=False), start=1):
        ticker, gics_sector = row.ticker, row.gics_sector
        log(f"[{n:>3}/{total}] {ticker}")

        raw = fetch_ticker(ticker, refresh)
        if raw is None:
            excluded.append({"ticker": ticker, "reason": "yfinance fetch failed"})
            continue

        missing = [f for f in ("market_cap", "total_debt", "total_revenue") if raw.get(f) is None]
        if missing:
            excluded.append({"ticker": ticker, "reason": f"missing required field(s): {', '.join(missing)}"})
            log(f"  ! {ticker}: dropped, missing {missing}")
            continue

        market_cap = raw["market_cap"]
        total_debt = raw["total_debt"]
        revenue_musd = raw["total_revenue"] / 1e6

        if revenue_musd <= 0:
            excluded.append({"ticker": ticker, "reason": "non-positive trailing revenue"})
            continue

        minority_interest = raw.get("minority_interest")
        minority_interest_assumed_zero = minority_interest is None
        if minority_interest_assumed_zero:
            minority_interest = 0.0

        # PCAF EVIC: market cap + book value of total debt + minority interest.
        # Unlike standard enterprise value, cash is NOT subtracted.
        evic = market_cap + total_debt + minority_interest

        yahoo_gics = YAHOO_TO_GICS.get(raw.get("yahoo_sector") or "")
        if yahoo_gics and yahoo_gics != gics_sector:
            sector_mismatches.append(
                {"ticker": ticker, "curated": gics_sector, "yahoo_mapped": yahoo_gics}
            )

        sector_row = sectors.loc[gics_sector]
        scope3_multiplier = float(sector_row["scope3_multiplier"])

        if ticker in reported.index:
            r = reported.loc[ticker]
            scope12 = float(r["scope12_tco2e"])
            tier = "reported"
            # Per PCAF: score 2 = unverified self-reported emissions. We record the
            # issuer's own assurance claim but do not upgrade to score 1, because we
            # have not independently verified the assurance ourselves.
            data_quality_score = 2
            emissions_source = str(r["source"])
            emissions_note = str(r["source_note"])
            reporting_year = int(r["reporting_year"])
            issuer_claims_assurance = bool(r["third_party_assured"])
            scope1 = finite(r["scope1_tco2e"]) or 0.0
            scope2 = finite(r["scope2_market_tco2e"]) or 0.0
        else:
            intensity = float(sector_row["avg_intensity_tco2e_per_musd_revenue"])
            scope12 = intensity * revenue_musd
            tier = "estimated"
            data_quality_score = 5
            emissions_source = (
                f"Sector-average economic proxy: {gics_sector} at "
                f"{intensity:,.0f} tCO2e per $M revenue"
            )
            emissions_note = str(sector_row["basis_note"])
            reporting_year = None
            issuer_claims_assurance = False
            scope1 = None
            scope2 = None

        records.append(
            {
                "ticker": ticker,
                "name": raw["name"],
                "sector": gics_sector,
                "industry": raw.get("industry"),
                "market_cap": round(market_cap, 2),
                "total_debt": round(total_debt, 2),
                "minority_interest": round(minority_interest, 2),
                "minority_interest_assumed_zero": minority_interest_assumed_zero,
                "evic": round(evic, 2),
                "revenue_musd": round(revenue_musd, 3),
                "emissions_tco2e_scope1": None if scope1 is None else round(scope1, 1),
                "emissions_tco2e_scope2_market": None if scope2 is None else round(scope2, 1),
                "emissions_tco2e_scope12": round(scope12, 1),
                "emissions_tco2e_scope3_estimated": round(scope12 * scope3_multiplier, 1),
                "scope3_multiplier": scope3_multiplier,
                "carbon_intensity_tco2e_per_musd": round(scope12 / revenue_musd, 4),
                "emissions_tier": tier,
                "emissions_source": emissions_source,
                "emissions_note": emissions_note,
                "emissions_reporting_year": reporting_year,
                "issuer_claims_third_party_assurance": issuer_claims_assurance,
                "data_quality_score": data_quality_score,
            }
        )

    if strict and excluded:
        raise SystemExit(f"--strict: {len(excluded)} ticker(s) dropped: {excluded}")

    records.sort(key=lambda r: -r["market_cap"])

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "universe.json").write_text(json.dumps(records, indent=1))

    reference = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "financial_data_source": "Yahoo Finance via yfinance (market cap, total debt, minority interest, trailing revenue)",
        "company_count": len(records),
        "reported_tier_count": sum(1 for r in records if r["emissions_tier"] == "reported"),
        "estimated_tier_count": sum(1 for r in records if r["emissions_tier"] == "estimated"),
        "excluded": excluded,
        "sector_gics_disagreements": sector_mismatches,
        "sector_intensity": [
            {
                "sector": idx,
                "avg_intensity_tco2e_per_musd_revenue": float(r["avg_intensity_tco2e_per_musd_revenue"]),
                "scope3_multiplier": float(r["scope3_multiplier"]),
                "basis_note": str(r["basis_note"]),
                "source": str(r["source"]),
            }
            for idx, r in sectors.iterrows()
        ],
    }
    (OUT / "reference.json").write_text(json.dumps(reference, indent=1))

    # The demo portfolio is authored as CSV in data/ (one source of truth, and the
    # exact format a user's own import must match) but Metro cannot import a .csv,
    # so it is also emitted pre-parsed as JSON for the bundle.
    demo_csv = (DATA / "demo_portfolio.csv").read_text()
    (OUT / "demo_portfolio.csv").write_text(demo_csv)

    demo_rows = []
    for line in demo_csv.splitlines()[1:]:
        if not line.strip():
            continue
        ticker, value = [c.strip() for c in line.split(",")[:2]]
        demo_rows.append({"ticker": ticker.upper(), "marketValueUsd": float(value)})

    demo_unknown = [r["ticker"] for r in demo_rows if r["ticker"] not in {x["ticker"] for x in records}]
    if demo_unknown:
        # Fail loudly: a demo portfolio that silently drops holdings would make the
        # bundled first-launch numbers wrong in a way nobody would notice.
        raise SystemExit(f"demo_portfolio.csv references tickers absent from the universe: {demo_unknown}")

    (OUT / "demo_portfolio.json").write_text(json.dumps(demo_rows, indent=1))

    log("")
    log(f"demo portfolio : {len(demo_rows)} holdings, all resolved")
    log(f"universe.json  : {len(records)} companies "
        f"({reference['reported_tier_count']} reported / {reference['estimated_tier_count']} estimated)")
    if excluded:
        log(f"excluded       : {len(excluded)} -> {[e['ticker'] for e in excluded]}")
    if sector_mismatches:
        log(f"sector notes   : {len(sector_mismatches)} curated/Yahoo disagreements (curated wins)")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--refresh", action="store_true", help="ignore the on-disk cache and refetch")
    p.add_argument("--strict", action="store_true", help="abort if any ticker has to be dropped")
    args = p.parse_args()
    return build(refresh=args.refresh, strict=args.strict)


if __name__ == "__main__":
    raise SystemExit(main())
