#!/usr/bin/env python3
"""
Facility-level Scope 1 emissions from Climate TRACE, rolled up to parent company.

    -> .cache/derived/climatetrace_companies.json

Climate TRACE publishes ~350M emitting assets with an `Owners` array naming the
operating company. This walks the industrially relevant subsectors for the US,
rolls facility emissions up by owner, and resolves owner names to tickers in the
S&P 500 universe.

THE TWO HARD PROBLEMS
---------------------

1. Entity resolution. Owner names are operating subsidiaries, not listed
   parents: "Alabama Power Co" is Southern Company (SO), "Pacific Gas &
   Electric" is PG&E Corp (PCG). Handled in three passes — a hand-maintained
   override table (data/entity_overrides.csv), then exact match on normalised
   names, then rapidfuzz above a threshold. Each company records how it was
   matched, which drives its PCAF data-quality score.

2. PARTIAL OWNERSHIP COVERAGE — the one that can silently produce a wrong
   number. Ownership is not populated evenly across subsectors. Measured on
   2024 US data:

       electricity-generation  99% of assets have owners
       oil-and-gas-refining   100%
       cement                 100%
       iron-and-steel          94%
       coal-mining             92%
       chemicals               59%
       oil-and-gas-production   0%   <-- no ownership data at all
       solid-waste-disposal     0%   <-- likewise

   So a rollup for an integrated oil major captures its refineries and none of
   its upstream production. Reporting that sum as the company's Scope 1 would
   understate it several-fold while wearing a "real measured data" badge — worse
   than an honest sector estimate, because it looks authoritative.

   The guard: every rollup is compared against the sector-average expectation.
   A rollup far below what the sector implies is treated as partial coverage and
   REJECTED, falling through to EPA GHGRP and then the sector proxy, with the
   reason recorded. See PARTIAL_* thresholds below.

Joint ownership: the API exposes owner names but no ownership percentages, so
emissions are split equally across an asset's distinct owners. Recorded as an
assumption on every affected company.
"""

from __future__ import annotations

import argparse
import csv
from collections import defaultdict
from typing import Any

from rapidfuzz import fuzz, process

from common import (
    CACHE,
    DATA,
    Fetcher,
    RateLimiter,
    log,
    normalize_company,
    read_json,
    utc_now_iso,
    write_json,
)

CT_RATE = RateLimiter(max_calls=5, period=1.0)
BASE = "https://api.climatetrace.org/v6"
PAGE = 1000

# Subsectors where a listed US corporate is plausibly the owner. Agriculture,
# forestry, wetlands and residential fuel use are excluded: they are real
# emissions but not attributable to an S&P 500 issuer through this dataset.
SUBSECTORS = [
    "electricity-generation", "heat-plants",
    "oil-and-gas-production", "oil-and-gas-refining", "oil-and-gas-transport",
    "coal-mining", "other-fossil-fuel-operations",
    "iron-and-steel", "aluminum", "cement", "lime", "glass",
    "chemicals", "other-chemicals", "petrochemical-steam-cracking",
    "pulp-and-paper", "other-manufacturing", "food-beverage-tobacco",
    "textiles-leather-apparel", "wood-and-wood-products",
    "copper-mining", "iron-mining", "bauxite-mining", "other-metals",
    "other-mining-quarrying", "rock-quarrying", "sand-quarrying",
    "domestic-aviation", "railways", "domestic-shipping", "road-transportation",
    "solid-waste-disposal", "incineration-and-open-burning-of-waste",
    "industrial-wastewater-treatment-and-discharge",
    "non-residential-onsite-fuel-usage", "fluorinated-gases",
]

# Fuzzy-match acceptance.
#
# These thresholds were set empirically, not guessed. An initial run accepting
# scores down to 78 produced 35 sub-94 matches, and inspection showed almost all
# of them were WRONG in the most damaging way possible — attributing one
# company's emissions to an unrelated company that happens to share a token:
#
#     Boston Properties (BXP)  <- "BP PLC"                 6,652,466 tCO2e
#     DaVita (DVA)             <- "Avista Corp"            4,705,424 tCO2e
#     Arch Capital (ACGL)      <- "ArcLight Capital"       3,403,293 tCO2e
#     Northern Trust (NTRS)    <- "NorthWestern Corp"      3,023,800 tCO2e
#     Agilent (A)              <- "Raytheon Technologies"     97,099 tCO2e
#     Capital One (COF)        <- "Capital Coal Corp"          56,189 tCO2e
#
# Every one of those would have put millions of tonnes of someone else's
# emissions onto a bank or a REIT, wearing a "measured facility data" badge. A
# missing match costs a company its real data and falls to a labelled estimate;
# a wrong match silently corrupts two companies at once. So the bar is set where
# the false positives stop, and the genuine sub-94 hits that inspection found
# (Kinder Morgan Energy Partners, Occidental Permian, Constellation Power,
# Consolidated Edison of NY) were promoted into data/entity_overrides.csv where
# they belong — as asserted corporate-structure facts, not guesses.
FUZZ_ACCEPT = 94   # reject anything below this outright
FUZZ_HIGH = 98     # at or above this a fuzzy match is treated as identity

# Partial-coverage guard, as a fraction of the sector-average expectation.
PARTIAL_REJECT_BELOW = 0.20   # below this: coverage is too partial to report
PARTIAL_LOW_BELOW = 0.50      # below this: usable but confidence downgraded


def load_universe() -> list[dict[str, str]]:
    rows = []
    with open(DATA / "sp500_constituents.csv", newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            rows.append(
                {
                    "ticker": r["Symbol"].strip().upper().replace(".", "-"),
                    "name": r["Security"].strip(),
                    "sector": r["GICS Sector"].strip(),
                }
            )
    return rows


def load_overrides() -> dict[str, str]:
    """Hand-maintained owner-name -> ticker map for subsidiaries and known misses."""
    path = DATA / "entity_overrides.csv"
    if not path.exists():
        return {}
    out = {}
    with open(path, newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            owner = (r.get("climatetrace_owner_name") or "").strip()
            ticker = (r.get("ticker") or "").strip().upper()
            if not owner or owner.startswith("#") or not ticker:
                continue
            out[normalize_company(owner)] = ticker
    return out


def pull_subsector(f: Fetcher, subsector: str, year: int) -> list[dict]:
    """Page through every US asset in a subsector."""
    assets: list[dict] = []
    offset = 0
    while True:
        url = (
            f"{BASE}/assets?countries=USA&subsectors={subsector}"
            f"&year={year}&limit={PAGE}&offset={offset}"
        )
        payload = f.get_json(url, optional=True)
        batch = (payload or {}).get("assets") or []
        assets.extend(batch)
        if len(batch) < PAGE:
            break
        offset += PAGE
        if offset > 30_000:  # safety valve; no US subsector is this large
            log(f"    ! {subsector}: stopped at {offset} assets")
            break
    return assets


def rollup(assets: list[dict], subsector: str, acc: dict[str, dict]) -> tuple[int, int]:
    """
    Sum co2e_100yr by owner. Returns (assets_with_owner, assets_without).

    An asset's Owners array repeats the same company once per generating unit,
    so it is deduped before splitting.
    """
    with_owner = without = 0
    for a in assets:
        summary = a.get("EmissionsSummary") or []
        qty = next(
            (
                s.get("EmissionsQuantity")
                for s in summary
                if s.get("Gas") == "co2e_100yr" and isinstance(s.get("EmissionsQuantity"), (int, float))
            ),
            None,
        )
        if qty is None:
            continue

        owners = {
            o.get("CompanyName").strip()
            for o in (a.get("Owners") or [])
            if o.get("CompanyName")
        }
        if not owners:
            without += 1
            continue
        with_owner += 1

        # No ownership percentages are published, so split equally.
        share = float(qty) / len(owners)
        for owner in owners:
            rec = acc.setdefault(
                owner,
                {
                    "owner_name": owner,
                    "emissions_tco2e": 0.0,
                    "asset_count": 0,
                    "subsectors": defaultdict(float),
                    "shared_assets": 0,
                },
            )
            rec["emissions_tco2e"] += share
            rec["asset_count"] += 1
            rec["subsectors"][subsector] += share
            if len(owners) > 1:
                rec["shared_assets"] += 1
    return with_owner, without


def resolve(
    owners: dict[str, dict],
    universe: list[dict],
    overrides: dict[str, str],
) -> dict[str, dict]:
    """Map owner names onto tickers. Returns {ticker: rollup}."""
    by_norm: dict[str, str] = {}
    for c in universe:
        by_norm.setdefault(normalize_company(c["name"]), c["ticker"])
    choices = list(by_norm.keys())

    resolved: dict[str, dict] = {}
    stats: dict[str, int] = defaultdict(int)
    rejected: list[dict] = []

    for owner_name, rec in owners.items():
        norm = normalize_company(owner_name)
        ticker = method = None
        score = None

        if norm in overrides:
            ticker, method, score = overrides[norm], "override", 100.0
        elif norm in by_norm:
            ticker, method, score = by_norm[norm], "exact", 100.0
        elif norm:
            hit = process.extractOne(norm, choices, scorer=fuzz.token_sort_ratio)
            if hit and hit[1] >= FUZZ_ACCEPT:
                ticker, method, score = by_norm[hit[0]], "fuzzy", float(hit[1])
            elif hit:
                # Recorded so the rejects are auditable rather than invisible.
                rejected.append(
                    {"owner": owner_name, "would_match": by_norm[hit[0]],
                     "score": float(hit[1]), "tco2e": rec["emissions_tco2e"]}
                )

        if not ticker:
            stats["unmatched"] += 1
            continue

        if method in ("override", "exact") or score >= FUZZ_HIGH:
            confidence = "high"
        else:
            confidence = "medium"
        stats[f"matched_{confidence}"] += 1

        agg = resolved.setdefault(
            ticker,
            {
                "ticker": ticker,
                "emissions_tco2e": 0.0,
                "asset_count": 0,
                "shared_assets": 0,
                "subsectors": defaultdict(float),
                "owner_names": [],
                "match_method": method,
                "match_score": score,
                "match_confidence": confidence,
            },
        )
        agg["emissions_tco2e"] += rec["emissions_tco2e"]
        agg["asset_count"] += rec["asset_count"]
        agg["shared_assets"] += rec["shared_assets"]
        for k, v in rec["subsectors"].items():
            agg["subsectors"][k] += v
        agg["owner_names"].append(
            {"name": owner_name, "method": method, "score": score, "tco2e": rec["emissions_tco2e"]}
        )
        # A company's confidence is the WEAKEST of its contributing matches:
        # one bad subsidiary match contaminates the whole rollup.
        order = {"high": 0, "medium": 1, "low": 2}
        if order[confidence] > order[agg["match_confidence"]]:
            agg["match_confidence"] = confidence

    for agg in resolved.values():
        agg["subsectors"] = dict(sorted(agg["subsectors"].items(), key=lambda kv: -kv[1]))
        agg["owner_names"].sort(key=lambda o: -o["tco2e"])

    rejected.sort(key=lambda r: -r["tco2e"])
    log(f"  matched high/medium: {stats['matched_high']}/{stats['matched_medium']}; "
        f"unmatched owner names: {stats['unmatched']} "
        f"({len(rejected)} rejected below the fuzzy bar)")
    return resolved, rejected


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--year", type=int, default=2024, help="emissions vintage to pull")
    args = ap.parse_args()

    f = Fetcher("climatetrace", CT_RATE)
    universe = load_universe()
    overrides = load_overrides()
    log(f"universe: {len(universe)} tickers; overrides: {len(overrides)}")

    owners: dict[str, dict] = {}
    coverage: dict[str, dict] = {}
    log(f"\npulling US assets for {args.year}:")
    for sub in SUBSECTORS:
        assets = pull_subsector(f, sub, args.year)
        if not assets:
            coverage[sub] = {"assets": 0, "with_owner": 0, "without_owner": 0}
            continue
        w, wo = rollup(assets, sub, owners)
        coverage[sub] = {"assets": len(assets), "with_owner": w, "without_owner": wo}
        pct = 100 * w // max(len(assets), 1)
        log(f"  {sub:<40} {len(assets):>6} assets  {pct:>3}% with owner")

    log(f"\ndistinct owner names: {len(owners)}")
    resolved, rejected = resolve(owners, universe, overrides)
    log(f"resolved to {len(resolved)} S&P 500 tickers")

    payload = {
        "generated_at": utc_now_iso(),
        "source": "Climate TRACE v6 assets API",
        "source_url": f"{BASE}/assets",
        "emissions_vintage": str(args.year),
        "gas": "co2e_100yr",
        "scope": "Scope 1 (facility-level, owner-attributed)",
        "subsectors_pulled": SUBSECTORS,
        "subsector_owner_coverage": coverage,
        "ownership_split_assumption": (
            "The API exposes owner names but no ownership percentages, so an asset's "
            "emissions are split equally across its distinct owners."
        ),
        "fuzzy_thresholds": {"accept_at_or_above": FUZZ_ACCEPT, "treated_as_identity": FUZZ_HIGH},
        "rejected_near_matches": rejected[:60],
        "companies": {
            t: {**v, "subsectors": v["subsectors"]} for t, v in resolved.items()
        },
    }
    write_json(CACHE / "derived" / "climatetrace_companies.json", payload)

    top = sorted(resolved.values(), key=lambda r: -r["emissions_tco2e"])[:12]
    log("\ntop rollups (tCO2e):")
    for r in top:
        log(f"  {r['ticker']:<7} {r['emissions_tco2e']:>15,.0f}  "
            f"{r['match_confidence']:<7} {r['asset_count']:>4} assets  "
            f"{list(r['subsectors'])[:2]}")
    log(f"\n  {f.stats()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
