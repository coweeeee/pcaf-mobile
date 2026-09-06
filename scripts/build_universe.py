#!/usr/bin/env python3
"""
Merge every source into the bundled reference universe.

    -> assets/data/universe.json        one record per company
    -> assets/data/reference.json       sector table, provenance, build diagnostics
    -> assets/data/demo_portfolio.json  the first-launch portfolio, pre-parsed

Inputs, in tier order:

    1. Climate TRACE  (.cache/derived/climatetrace_companies.json)  -> PCAF 3/4
    2. EPA GHGRP      (.cache/derived/epa_ghgrp.json)               -> PCAF 3/4
    3. sector proxy   (data/sector_intensity.csv)                   -> PCAF 5

Financials come from SEC EDGAR XBRL; market cap is a live yfinance price times
SEC-reported shares outstanding.

THE PARTIAL-COVERAGE GUARD
--------------------------
Climate TRACE ownership is not populated evenly. For `oil-and-gas-production`,
`solid-waste-disposal`, `road-transportation` and others it is absent entirely,
so a rollup can capture a fraction of a company's real footprint. Publishing
that fraction as "measured Scope 1" is worse than an honest estimate: it is
wrong AND it wears the badge of the highest-quality tier we have.

Each rollup is therefore compared against what the sector average implies. The
measured distribution across 54 comparable companies made the problem obvious:

    ratio  example                                    reading
    0.00   AAPL, EXC, COP, CAT, PG                    one stray facility, not a footprint
    0.05   PCG 2.6 Mt vs 52.4 Mt expected             delivery utility, generation not owned
    0.17   CVX 12.9 Mt vs 77.5 Mt expected            refining captured, production missing
    0.36   XOM 30.1 Mt vs 84.5 Mt expected            same — real Scope 1 is ~110 Mt
    0.96   VST 35.5 Mt vs 36.9 Mt expected            whole business is generation
    1.30   DUK 86.9 Mt vs 66.7 Mt expected            whole business is generation

Below the threshold the rollup is REJECTED and the company falls through to EPA
and then the sector proxy, with the reason recorded on the record and surfaced
in the app.

This deliberately errs toward rejecting good data rather than accepting partial
data: Valero at 0.48 is genuinely accurate and still gets rejected. Losing a
correct figure costs accuracy on one holding; keeping a partial one publishes a
number that is both wrong and confidently labelled. For a tool whose entire
argument is data-quality honesty, only the second is unacceptable.
"""

from __future__ import annotations

import argparse
import csv
from collections import defaultdict
from typing import Any

from common import (
    CACHE,
    DATA,
    OUT,
    log,
    read_json,
    utc_now_iso,
    write_json,
)

# Fraction of the sector-average expectation below which a Climate TRACE or EPA
# rollup is treated as partial coverage and rejected. See module docstring.
COVERAGE_REJECT_BELOW = 0.50

PCAF_SCORE_BY_CONFIDENCE = {"high": 3, "medium": 4, "low": 4}


def load_sp500() -> list[dict[str, str]]:
    with open(DATA / "sp500_constituents.csv", newline="", encoding="utf-8") as fh:
        return [
            {
                "ticker": r["Symbol"].strip().upper().replace(".", "-"),
                "name": r["Security"].strip(),
                "sector": r["GICS Sector"].strip(),
                "sub_industry": r.get("GICS Sub-Industry", "").strip(),
                "cik": (r.get("CIK") or "").strip().zfill(10),
            }
            for r in csv.DictReader(fh)
        ]


def load_sector_intensity() -> dict[str, dict]:
    out = {}
    with open(DATA / "sector_intensity.csv", newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            out[r["gics_sector"].strip()] = {
                "intensity": float(r["avg_intensity_tco2e_per_musd_revenue"]),
                "scope3_multiplier": float(r["scope3_multiplier"]),
                "basis_note": r.get("basis_note", ""),
                "source": r.get("source", ""),
            }
    return out


def fetch_market_caps(tickers: list[str], refresh: bool) -> dict[str, dict]:
    """
    Market cap = live share price x SEC-reported shares outstanding, per the
    brief. yfinance's own marketCap is kept as a fallback for tickers whose
    price does not resolve.
    """
    cache_path = CACHE / "derived" / "market_data.json"
    cached = read_json(cache_path, {}) or {}
    if cached.get("prices") and not refresh:
        log(f"market data: {len(cached['prices'])} cached prices")
        return cached["prices"]

    import yfinance as yf

    prices: dict[str, dict] = {}
    batch = 60
    for i in range(0, len(tickers), batch):
        chunk = tickers[i : i + batch]
        log(f"  yfinance {i + 1}-{min(i + batch, len(tickers))} of {len(tickers)}")
        try:
            data = yf.Tickers(" ".join(chunk))
        except Exception as e:  # noqa: BLE001 - yfinance raises broadly
            log(f"  ! batch failed: {e}")
            continue
        for t in chunk:
            # yfinance's FastInfo exposes snake_case ATTRIBUTES but camelCase
            # KEYS (fi.last_price works, fi["last_price"] does not). Reading it
            # through .get() silently returned None for all 503 tickers on the
            # first run, which excluded the entire universe.
            try:
                fi = data.tickers[t].fast_info
                price = getattr(fi, "last_price", None)
                mcap = getattr(fi, "market_cap", None)
                prices[t] = {
                    "price": float(price) if price else None,
                    "market_cap": float(mcap) if mcap else None,
                    "shares_yf": float(getattr(fi, "shares", 0) or 0) or None,
                    "currency": getattr(fi, "currency", None),
                }
            except Exception:  # noqa: BLE001
                prices[t] = {"price": None, "market_cap": None, "shares_yf": None, "currency": None}

    write_json(cache_path, {"generated_at": utc_now_iso(), "prices": prices})
    return prices


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--refresh-prices", action="store_true")
    ap.add_argument("--strict", action="store_true", help="fail if any company is dropped")
    args = ap.parse_args()

    sp500 = load_sp500()
    sectors = load_sector_intensity()
    sec = read_json(CACHE / "derived" / "sec_financials.json", {}) or {}
    ct = read_json(CACHE / "derived" / "climatetrace_companies.json", {}) or {}
    epa = read_json(CACHE / "derived" / "epa_ghgrp.json", {}) or {}

    if not sec.get("companies"):
        raise SystemExit("no SEC financials — run scripts/fetch_sec_financials.py first")

    sec_c = sec["companies"]
    ct_c = ct.get("companies", {})
    epa_c = epa.get("companies", {})
    epa_available = bool(epa.get("available"))
    log(f"sources: SEC {len(sec_c)} | Climate TRACE {len(ct_c)} | "
        f"EPA {len(epa_c)}{'' if epa_available else ' (unavailable)'}")

    prices = fetch_market_caps([c["ticker"] for c in sp500], args.refresh_prices)

    records: list[dict[str, Any]] = []
    excluded: list[dict[str, str]] = []
    diag: dict[str, int] = defaultdict(int)
    coverage_rejections: list[dict] = []

    for c in sp500:
        t = c["ticker"]
        s = sec_c.get(t)
        px = prices.get(t) or {}

        if not s:
            excluded.append({"ticker": t, "reason": "no SEC financials"})
            continue

        # --- revenue (required: it is the WACI denominator) --------------
        rev = s.get("revenue")
        if not rev or not rev.get("val") or rev["val"] <= 0:
            excluded.append({"ticker": t, "reason": "no usable revenue in SEC XBRL"})
            continue
        revenue_musd = rev["val"] / 1e6

        # --- market cap --------------------------------------------------
        shares = (s.get("shares_outstanding") or {}).get("val")
        market_cap = None
        mc_basis = None
        if px.get("price") and shares:
            market_cap = px["price"] * shares
            mc_basis = "yfinance_price_x_sec_shares"
        elif px.get("market_cap"):
            market_cap = px["market_cap"]
            mc_basis = "yfinance_market_cap"
        if not market_cap or market_cap <= 0:
            excluded.append({"ticker": t, "reason": "no market cap"})
            continue

        # --- debt / minority interest ------------------------------------
        debt_rec = s.get("total_debt")
        total_debt = debt_rec["val"] if debt_rec else 0.0
        mi_rec = s.get("minority_interest")
        minority = mi_rec["val"] if mi_rec else 0.0
        minority_assumed_zero = mi_rec is None

        evic = market_cap + total_debt + minority
        if evic <= 0:
            excluded.append({"ticker": t, "reason": "non-positive EVIC"})
            continue

        # Financials confidence: "high" only when debt came from explicit debt
        # tags. Total Liabilities is a documented over-estimate of book debt.
        if not debt_rec:
            fin_conf = "low"
        elif debt_rec.get("basis") == "long_term_plus_current":
            fin_conf = "high"
        else:
            fin_conf = "medium"
        diag[f"financials_{fin_conf}"] += 1

        sector_row = sectors.get(c["sector"])
        if not sector_row:
            excluded.append({"ticker": t, "reason": f"no sector intensity for {c['sector']}"})
            continue
        proxy_estimate = sector_row["intensity"] * revenue_musd

        # --- emissions tier selection ------------------------------------
        emissions = source = match_conf = vintage = None
        note = ""
        coverage_ratio = None
        ct_rec = ct_c.get(t)
        epa_rec = epa_c.get(t) if epa_available else None

        def coverage_ok(value: float) -> tuple[bool, float]:
            ratio = value / proxy_estimate if proxy_estimate > 0 else 0.0
            return ratio >= COVERAGE_REJECT_BELOW, ratio

        if ct_rec and ct_rec.get("emissions_tco2e", 0) > 0:
            ok, ratio = coverage_ok(ct_rec["emissions_tco2e"])
            coverage_ratio = ratio
            if ok:
                emissions = ct_rec["emissions_tco2e"]
                source = "climatetrace"
                match_conf = ct_rec.get("match_confidence", "medium")
                vintage = ct.get("emissions_vintage")
                subs = list(ct_rec.get("subsectors", {}))[:3]
                note = (
                    f"Rolled up from {ct_rec['asset_count']} owned facilities "
                    f"({', '.join(subs)})."
                )
            else:
                coverage_rejections.append(
                    {
                        "ticker": t,
                        "sector": c["sector"],
                        "climatetrace_tco2e": ct_rec["emissions_tco2e"],
                        "sector_proxy_tco2e": proxy_estimate,
                        "ratio": ratio,
                        "subsectors": list(ct_rec.get("subsectors", {}))[:3],
                    }
                )
                diag["climatetrace_rejected_partial_coverage"] += 1

        if emissions is None and epa_rec and epa_rec.get("emissions_tco2e", 0) > 0:
            ok, ratio = coverage_ok(epa_rec["emissions_tco2e"])
            if ok or coverage_ratio is None:
                # The stored ratio must describe the source actually USED. Left
                # as-is, a company whose Climate TRACE rollup was rejected and
                # whose EPA figure was accepted reported the rejected source's
                # ratio — PKG showed 0.01 next to an accepted EPA figure whose
                # real ratio is 0.77.
                coverage_ratio = ratio
            if ok:
                emissions = epa_rec["emissions_tco2e"]
                source = "epa_ghgrp"
                match_conf = "high" if epa_rec.get("match_method") in ("override", "exact") else "medium"
                vintage = epa.get("emissions_vintage")
                note = f"Reported to EPA GHGRP across {epa_rec['facility_count']} facilities."
            else:
                diag["epa_rejected_partial_coverage"] += 1

        if emissions is None:
            emissions = proxy_estimate
            source = "sector_proxy"
            match_conf = "n/a"
            vintage = None
            note = sector_row["basis_note"]

        diag[f"source_{source}"] += 1
        score = 5 if source == "sector_proxy" else PCAF_SCORE_BY_CONFIDENCE[match_conf]
        diag[f"score_{score}"] += 1

        records.append(
            {
                "ticker": t,
                "cik": c["cik"],
                "name": c["name"],
                "sector": c["sector"],
                "industry": c["sub_industry"] or None,
                "market_cap": market_cap,
                "market_cap_basis": mc_basis,
                "total_debt": total_debt,
                "total_debt_tag": (debt_rec or {}).get("tag"),
                "total_debt_basis": (debt_rec or {}).get("basis"),
                "minority_interest": minority,
                "minority_interest_assumed_zero": minority_assumed_zero,
                "evic": evic,
                "revenue_musd": revenue_musd,
                "revenue_tag": rev.get("tag"),
                "financials_confidence": fin_conf,
                "financials_vintage": (rev.get("end") or "")[:10] or None,
                "emissions_tco2e_scope12": emissions,
                "emissions_source": source,
                "emissions_match_confidence": match_conf,
                "emissions_vintage": vintage,
                "emissions_note": note,
                "emissions_coverage_ratio": coverage_ratio,
                "emissions_tco2e_scope3_estimated": emissions * sector_row["scope3_multiplier"],
                "scope3_multiplier": sector_row["scope3_multiplier"],
                "carbon_intensity_tco2e_per_musd": emissions / revenue_musd,
                "data_quality_score": score,
            }
        )

    records.sort(key=lambda r: -r["market_cap"])
    if args.strict and excluded:
        raise SystemExit(f"--strict: {len(excluded)} dropped: {excluded}")

    write_json(OUT / "universe.json", records)

    # --- demo portfolio ---------------------------------------------------
    demo_csv = (DATA / "demo_portfolio.csv").read_text()
    demo_rows = []
    known = {r["ticker"] for r in records}
    for line in demo_csv.splitlines()[1:]:
        if not line.strip():
            continue
        tk, val = [x.strip() for x in line.split(",")[:2]]
        demo_rows.append({"ticker": tk.upper(), "marketValueUsd": float(val)})
    missing = [r["ticker"] for r in demo_rows if r["ticker"] not in known]
    if missing:
        raise SystemExit(f"demo_portfolio.csv references tickers absent from the universe: {missing}")
    (OUT / "demo_portfolio.csv").write_text(demo_csv)
    write_json(OUT / "demo_portfolio.json", demo_rows)

    reference = {
        "generated_at": utc_now_iso(),
        "company_count": len(records),
        "excluded": excluded,
        "financial_data_source": sec.get("source"),
        "financial_data_url": sec.get("source_url"),
        "market_cap_basis": "yfinance last price x SEC-reported shares outstanding",
        "emissions_sources": {
            "climatetrace": {
                "source": ct.get("source"),
                "url": ct.get("source_url"),
                "vintage": ct.get("emissions_vintage"),
                "companies": diag.get("source_climatetrace", 0),
                "subsector_owner_coverage": ct.get("subsector_owner_coverage", {}),
                "ownership_split_assumption": ct.get("ownership_split_assumption"),
            },
            "epa_ghgrp": {
                "source": epa.get("source"),
                "available": epa_available,
                "vintage": epa.get("emissions_vintage"),
                "companies": diag.get("source_epa_ghgrp", 0),
                "attribution_note": epa.get("attribution_note"),
                "fragility_note": epa.get("fragility_note"),
            },
            "sector_proxy": {
                "source": "GICS sector-average intensity x SEC revenue",
                "companies": diag.get("source_sector_proxy", 0),
            },
        },
        "coverage_guard": {
            "reject_below_ratio": COVERAGE_REJECT_BELOW,
            "explanation": (
                "A facility rollup covering less than half of what the sector average "
                "implies is treated as partial coverage and rejected, because a partial "
                "rollup presented as total Scope 1 is wrong while wearing the "
                "highest-quality badge available."
            ),
            "rejected_count": diag.get("climatetrace_rejected_partial_coverage", 0),
            "rejected": sorted(coverage_rejections, key=lambda r: r["ratio"])[:40],
        },
        "data_quality_distribution": {
            str(k): diag.get(f"score_{k}", 0) for k in (1, 2, 3, 4, 5)
        },
        "financials_confidence_distribution": {
            k: diag.get(f"financials_{k}", 0) for k in ("high", "medium", "low")
        },
        "sector_intensity": [
            {
                "sector": k,
                "avg_intensity_tco2e_per_musd_revenue": v["intensity"],
                "scope3_multiplier": v["scope3_multiplier"],
                "basis_note": v["basis_note"],
                "source": v["source"],
            }
            for k, v in sorted(sectors.items())
        ],
    }
    write_json(OUT / "reference.json", reference)

    log("")
    log(f"universe.json    : {len(records)} companies ({len(excluded)} excluded)")
    log(f"  climate trace  : {diag.get('source_climatetrace', 0)}")
    log(f"  epa ghgrp      : {diag.get('source_epa_ghgrp', 0)}")
    log(f"  sector proxy   : {diag.get('source_sector_proxy', 0)}")
    log(f"  rejected (partial coverage): {diag.get('climatetrace_rejected_partial_coverage', 0)}")
    log(f"  PCAF scores    : "
        f"3={diag.get('score_3', 0)} 4={diag.get('score_4', 0)} 5={diag.get('score_5', 0)}")
    log(f"  financials     : high={diag.get('financials_high', 0)} "
        f"medium={diag.get('financials_medium', 0)} low={diag.get('financials_low', 0)}")
    log(f"demo portfolio   : {len(demo_rows)} holdings, all resolved")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
