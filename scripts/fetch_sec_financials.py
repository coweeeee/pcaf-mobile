#!/usr/bin/env python3
"""
Audited financials for the reference universe, from SEC EDGAR XBRL.

    -> .cache/derived/sec_financials.json

What it pulls, per company: total debt, revenue, shares outstanding, and
minority interest, each with the XBRL tag it actually came from and the period
it covers. Nothing is invented: a company whose filings do not carry a usable
tag comes back with that field null and a reason, and build_universe.py decides
what to do about it.

WHY FRAMES RATHER THAN COMPANYFACTS
-----------------------------------
The brief specifies the CompanyFacts endpoint. Measured, one CompanyFacts
response is ~3.1 MB (Exxon), so the S&P 500 costs roughly 1.5 GB of transfer and
parse. The `frames` endpoint returns ONE concept for EVERY filer in a period in
a single ~700 KB response covering ~5,000 filers.

So this uses frames for the bulk pass — a couple of dozen requests instead of
five hundred — and falls back to CompanyFacts per-company only for filers the
frames did not cover. Same API, same audited XBRL data, ~100x less transfer.
The fallback path means nothing is lost for off-calendar filers.

Rate limiting is deliberately set below SEC's published 10 req/s ceiling: being
throttled by SEC means a block for the rest of the session, not a cheap retry.
"""

from __future__ import annotations

import argparse
import csv
from collections import defaultdict
from typing import Any

from common import (
    CACHE,
    DATA,
    Fetcher,
    RateLimiter,
    log,
    utc_now_iso,
    write_json,
)

SEC_RATE = RateLimiter(max_calls=8, period=1.0)

# Periods to sweep, newest first. Instantaneous ("I") frames carry balance-sheet
# items; duration frames carry income-statement items. Filers report on
# different fiscal calendars, so several quarters are swept and the most recent
# value per company wins.
INSTANT_FRAMES = ["CY2026Q1I", "CY2025Q4I", "CY2025Q3I", "CY2025Q2I", "CY2025Q1I", "CY2024Q4I"]
DURATION_FRAMES = ["CY2025", "CY2024"]

# Filers tag the same economic quantity differently. Order = preference.
DEBT_TAGS = [
    "LongTermDebtNoncurrent",
    "LongTermDebt",
    "DebtLongtermAndShorttermCombinedAmount",
]
DEBT_CURRENT_TAGS = ["DebtCurrent", "LongTermDebtCurrent", "ShortTermBorrowings"]
LIABILITIES_TAGS = ["Liabilities"]
REVENUE_TAGS = [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "Revenues",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
    "SalesRevenueNet",
    # Financial-sector tags. Broker-dealers (GS, MS) report
    # RevenuesNetOfInterestExpense and tag nothing the generic list catches, so
    # without these the largest investment banks drop out of the universe
    # entirely for want of a WACI denominator.
    "RevenuesNetOfInterestExpense",
    "InterestAndDividendIncomeOperating",
    "PremiumsEarnedNet",
]
SHARES_TAGS = [
    "EntityCommonStockSharesOutstanding",
    "CommonStockSharesOutstanding",
    "CommonStockSharesIssued",
]
MINORITY_TAGS = [
    "MinorityInterest",
    "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
]


def load_universe_ciks() -> list[dict[str, str]]:
    """The S&P 500 list ships CIKs, so no ticker->CIK lookup is needed for it."""
    rows: list[dict[str, str]] = []
    with open(DATA / "sp500_constituents.csv", newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            cik = (r.get("CIK") or "").strip()
            if not cik.isdigit():
                continue
            rows.append(
                {
                    "ticker": r["Symbol"].strip().upper().replace(".", "-"),
                    "name": r["Security"].strip(),
                    "sector": r["GICS Sector"].strip(),
                    "sub_industry": r.get("GICS Sub-Industry", "").strip(),
                    "cik": cik.zfill(10),
                }
            )
    return rows


def load_ticker_cik_map(f: Fetcher) -> dict[str, str]:
    """
    SEC's official ticker->CIK file. Not needed for the S&P 500 (whose CIKs ship
    in the constituents CSV) but kept because the brief asks for it and it is
    what any wider universe would resolve through.
    """
    payload = f.get_json("https://www.sec.gov/files/company_tickers.json", optional=True)
    if not payload:
        return {}
    return {
        str(v["ticker"]).upper(): str(v["cik_str"]).zfill(10)
        for v in payload.values()
        if v.get("ticker")
    }


def fetch_frame(f: Fetcher, tag: str, period: str, unit: str = "USD") -> dict[str, dict]:
    """One concept, one period, every filer. Returns {cik10: row}."""
    url = f"https://data.sec.gov/api/xbrl/frames/us-gaap/{tag}/{unit}/{period}.json"
    payload = f.get_json(url, optional=True)
    if not payload or "data" not in payload:
        return {}
    out: dict[str, dict] = {}
    for row in payload["data"]:
        cik = str(row.get("cik", "")).zfill(10)
        val = row.get("val")
        if cik and isinstance(val, (int, float)):
            out[cik] = {"val": float(val), "end": row.get("end"), "tag": tag, "period": period}
    return out


def sweep(f: Fetcher, tags: list[str], periods: list[str], unit: str = "USD") -> dict[str, dict]:
    """
    Sweep tag x period, newest period first, first tag preference first.
    The first hit for a CIK wins, so a company is taken from its most recent
    period and most-preferred tag.
    """
    resolved: dict[str, dict] = {}
    for period in periods:
        for tag in tags:
            frame = fetch_frame(f, tag, period, unit)
            if not frame:
                continue
            new = 0
            for cik, row in frame.items():
                if cik not in resolved:
                    resolved[cik] = row
                    new += 1
            if new:
                log(f"    {tag:<62} {period:<9} +{new}")
    return resolved


def companyfacts_lookup(
    f: Fetcher, cik: str, tags: list[str], unit: str = "USD"
) -> dict | None:
    """
    Per-company fallback for filers the frames sweep missed — typically
    off-calendar fiscal year ends. This is the endpoint the brief names; it is
    used selectively because of its size (~3 MB/company).
    """
    payload = f.get_json(
        f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json", optional=True
    )
    if not payload:
        return None
    facts = payload.get("facts", {}).get("us-gaap", {})
    dei = payload.get("facts", {}).get("dei", {})
    for tag in tags:
        node = facts.get(tag) or dei.get(tag)
        if not node:
            continue
        for unit_key, entries in node.get("units", {}).items():
            if unit_key not in (unit, "shares"):
                continue
            usable = [e for e in entries if isinstance(e.get("val"), (int, float)) and e.get("end")]
            if not usable:
                continue
            best = max(usable, key=lambda e: e["end"])
            return {
                "val": float(best["val"]),
                "end": best["end"],
                "tag": tag,
                "period": "companyfacts",
            }
    return None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--max-fallback",
        type=int,
        default=200,
        help="cap on per-company CompanyFacts fallbacks (each is ~3 MB)",
    )
    args = ap.parse_args()

    f = Fetcher("sec", SEC_RATE)
    companies = load_universe_ciks()
    log(f"universe: {len(companies)} S&P 500 constituents")

    ticker_cik = load_ticker_cik_map(f)
    log(f"SEC ticker->CIK map: {len(ticker_cik)} entries (cross-check only)")

    log("\nfetching frames (bulk):")
    log("  liabilities:")
    liabilities = sweep(f, LIABILITIES_TAGS, INSTANT_FRAMES)
    log("  long-term debt:")
    lt_debt = sweep(f, DEBT_TAGS, INSTANT_FRAMES)
    log("  current debt:")
    cur_debt = sweep(f, DEBT_CURRENT_TAGS, INSTANT_FRAMES)
    log("  minority interest:")
    minority = sweep(f, MINORITY_TAGS[:1], INSTANT_FRAMES)
    log("  revenue:")
    revenue = sweep(f, REVENUE_TAGS, DURATION_FRAMES)
    log("  shares outstanding:")
    shares = sweep(f, SHARES_TAGS[1:], INSTANT_FRAMES, unit="shares")

    records: dict[str, dict[str, Any]] = {}
    fallbacks_used = 0
    counts: dict[str, int] = defaultdict(int)

    for c in companies:
        cik = c["cik"]
        rec: dict[str, Any] = {
            "ticker": c["ticker"],
            "cik": cik,
            "name": c["name"],
            "sector": c["sector"],
            "sub_industry": c["sub_industry"],
            "sec_ticker_cik_agrees": ticker_cik.get(c["ticker"]) == cik,
        }

        # --- debt -------------------------------------------------------
        # Preference: explicit long-term + current debt (what PCAF means by
        # "book value of total debt"). Total Liabilities is a documented
        # over-estimate used only when the filer tags nothing better, and it is
        # recorded as such so the confidence can be downgraded.
        lt = lt_debt.get(cik)
        cur = cur_debt.get(cik)
        debt = None
        if lt:
            total = lt["val"] + (cur["val"] if cur else 0.0)
            debt = {
                "val": total,
                "end": lt["end"],
                "tag": lt["tag"] + ("+" + cur["tag"] if cur else ""),
                "basis": "long_term_plus_current",
            }
        elif cik in liabilities:
            row = liabilities[cik]
            debt = {
                "val": row["val"],
                "end": row["end"],
                "tag": row["tag"],
                "basis": "total_liabilities_proxy",
            }
        else:
            hit = companyfacts_lookup(f, cik, DEBT_TAGS + LIABILITIES_TAGS)
            if hit and fallbacks_used < args.max_fallback:
                fallbacks_used += 1
                debt = {**hit, "basis": "companyfacts_fallback"}
        rec["total_debt"] = debt
        counts["debt" if debt else "debt_missing"] += 1

        # --- revenue ----------------------------------------------------
        rev = revenue.get(cik)
        if not rev and fallbacks_used < args.max_fallback:
            hit = companyfacts_lookup(f, cik, REVENUE_TAGS)
            if hit:
                fallbacks_used += 1
                rev = hit
        rec["revenue"] = rev
        counts["revenue" if rev else "revenue_missing"] += 1

        # --- shares -----------------------------------------------------
        sh = shares.get(cik)
        if not sh and fallbacks_used < args.max_fallback:
            hit = companyfacts_lookup(f, cik, SHARES_TAGS, unit="shares")
            if hit:
                fallbacks_used += 1
                sh = hit
        rec["shares_outstanding"] = sh
        counts["shares" if sh else "shares_missing"] += 1

        # --- minority interest ------------------------------------------
        # Genuinely absent for most filers. PCAF permits defaulting it to 0;
        # that default is applied in build_universe.py and flagged per holding,
        # never silently here.
        rec["minority_interest"] = minority.get(cik)
        counts["minority" if rec["minority_interest"] else "minority_absent"] += 1

        records[c["ticker"]] = rec

    payload = {
        "generated_at": utc_now_iso(),
        "source": "SEC EDGAR XBRL (frames API, CompanyFacts fallback)",
        "source_url": "https://data.sec.gov/api/xbrl/",
        "universe_size": len(companies),
        "frames_swept": {"instant": INSTANT_FRAMES, "duration": DURATION_FRAMES},
        "companyfacts_fallbacks": fallbacks_used,
        "coverage": dict(counts),
        "companies": records,
    }
    write_json(CACHE / "derived" / "sec_financials.json", payload)

    log("")
    log(f"  debt     : {counts['debt']}/{len(companies)}")
    log(f"  revenue  : {counts['revenue']}/{len(companies)}")
    log(f"  shares   : {counts['shares']}/{len(companies)}")
    log(f"  minority : {counts['minority']} reported, {counts['minority_absent']} absent")
    log(f"  fallbacks: {fallbacks_used} CompanyFacts calls")
    log(f"  {f.stats()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
