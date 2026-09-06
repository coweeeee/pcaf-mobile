#!/usr/bin/env python3
"""
EPA GHGRP facility emissions, via the Envirofacts REST service.

    -> .cache/derived/epa_ghgrp.json

SUPPLEMENTARY BY DESIGN — AND DELIBERATELY CONSERVATIVE
-------------------------------------------------------
GHGRP covers ~11,000 large US emitters and reports direct (Scope 1) emissions.
It is the natural way to fill Climate TRACE's biggest blind spot: Climate TRACE
publishes zero ownership data for `oil-and-gas-production`, while GHGRP has a
whole sector for Petroleum and Natural Gas Systems.

The catch is attribution. Envirofacts exposes no parent-company table through
this service, only `facility_name` — and a facility name is a *plant* name, not
a company name: "SANTA ROSA CENTRAL LANDFILL", "PSE Ferndale Generating
Station". Fuzzy-matching those to tickers is exactly the mistake that, on the
Climate TRACE pass, tried to put BP's 6.6 MtCO2e onto Boston Properties.

So this source is restricted to matches it can actually justify:

  * the hand-maintained override table, or
  * an exact match on the normalised company name, or
  * a fuzzy match at >= 96, i.e. effectively a spelling variant.

Everything else is retained as an unattributed facility total, which is still
useful — it feeds the cross-check that tells you how much of a sector's
emissions we could NOT attribute to anyone.

GHGRP's primary role here is therefore a CROSS-CHECK on the Climate TRACE
rollup, and a gap-filler only where a company's facilities are named after the
company. build_universe.py treats it as tier 2.

FRAGILITY WARNING
-----------------
EPA has proposed eliminating most GHGRP reporting requirements, so 2024 may be
the last complete reporting year. Every request here is `optional=True`: if the
service disappears or changes shape, this script returns an empty-but-valid
payload and the pipeline falls through to Climate TRACE and then the sector
proxy. It must never take the build down.
"""

from __future__ import annotations

import argparse
import csv
from collections import defaultdict

from rapidfuzz import fuzz, process

from common import (
    CACHE,
    DATA,
    Fetcher,
    RateLimiter,
    log,
    normalize_company,
    utc_now_iso,
    write_json,
)

EPA_RATE = RateLimiter(max_calls=4, period=1.0)
BASE = "https://data.epa.gov/efservice"
PAGE = 1000

# Only a spelling variant is accepted here — see the module docstring.
FUZZ_ACCEPT = 96

# GHGRP splits reporters into DIRECT EMITTERS (sector_type "E") and SUPPLIERS
# (sector_type "S"). Suppliers report the emissions that WOULD result from
# combusting the fuel they put into the economy — that is a downstream product
# figure, not the reporting facility's Scope 1.
#
# Summing both was the first version's bug, and it was a big one: it produced a
# 7.36 Gt "total", larger than all US greenhouse gas emissions, because
# Petroleum Product Suppliers (3.45 Gt) and Natural Gas / NGL Suppliers (1.34 Gt)
# were being added to power plants and refineries. It also put 51.9 MtCO2e on
# Exxon from a single "facility" — the supplier registration, not a plant.
#
# Only direct-emitter sectors are summed. Including a supplier row in a Scope 1
# figure would double-count the same molecule against both the producer and the
# combustor.
DIRECT_EMITTER_SECTORS = {2, 3, 4, 5, 6, 7, 8, 14, 15}

SECTOR_NAMES = {
    2: "Waste", 3: "Power Plants", 4: "Refineries", 5: "Chemicals",
    6: "Metals", 7: "Pulp and Paper", 8: "Minerals", 14: "Other",
    15: "Petroleum and Natural Gas Systems",
}


def load_universe() -> list[dict[str, str]]:
    with open(DATA / "sp500_constituents.csv", newline="", encoding="utf-8") as fh:
        return [
            {
                "ticker": r["Symbol"].strip().upper().replace(".", "-"),
                "name": r["Security"].strip(),
            }
            for r in csv.DictReader(fh)
        ]


def load_overrides() -> dict[str, str]:
    path = DATA / "entity_overrides.csv"
    if not path.exists():
        return {}
    out = {}
    with open(path, newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            owner = (r.get("climatetrace_owner_name") or "").strip()
            ticker = (r.get("ticker") or "").strip().upper()
            if owner and not owner.startswith("#") and ticker:
                out[normalize_company(owner)] = ticker
    return out


def paged(f: Fetcher, table: str, filt: str, cap: int) -> list[dict]:
    """Envirofacts pages through ROWS/start:end. Optional at every step."""
    rows: list[dict] = []
    start = 0
    while start < cap:
        end = start + PAGE - 1
        url = f"{BASE}/{table}/{filt}/ROWS/{start}:{end}/JSON"
        batch = f.get_json(url, optional=True)
        if not batch or not isinstance(batch, list):
            break
        rows.extend(batch)
        if len(batch) < PAGE:
            break
        start += PAGE
    return rows


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--year", type=int, default=2023, help="GHGRP reporting year")
    ap.add_argument("--cap", type=int, default=15000, help="max rows per table")
    args = ap.parse_args()

    f = Fetcher("epa", EPA_RATE)
    universe = load_universe()
    overrides = load_overrides()

    log(f"pulling GHGRP facilities for {args.year} ...")
    facilities = paged(f, "PUB_DIM_FACILITY", f"year/{args.year}", args.cap)
    log(f"  facilities: {len(facilities)}")

    log(f"pulling GHGRP sector emissions for {args.year} ...")
    emissions = paged(f, "PUB_FACTS_SECTOR_GHG_EMISSION", f"year/{args.year}", args.cap * 4)
    log(f"  emission rows: {len(emissions)}")

    if not facilities or not emissions:
        # The documented degradation path. An empty-but-valid payload lets
        # build_universe.py carry on with Climate TRACE + sector proxy.
        log("  ! GHGRP returned nothing — writing an empty payload and continuing")
        write_json(
            CACHE / "derived" / "epa_ghgrp.json",
            {
                "generated_at": utc_now_iso(),
                "source": "EPA GHGRP via Envirofacts",
                "available": False,
                "reason": "no rows returned; EPA has proposed eliminating most GHGRP reporting",
                "emissions_vintage": str(args.year),
                "companies": {},
            },
        )
        return 0

    # Facility totals. co2e_emission is per facility/sector/gas, so sum them and
    # keep the dominant sector for reporting.
    fac_total: dict[int, float] = defaultdict(float)
    fac_sector: dict[int, dict[int, float]] = defaultdict(lambda: defaultdict(float))
    skipped_supplier = 0.0
    for r in emissions:
        try:
            fid = int(r["facility_id"])
            val = float(r["co2e_emission"])
            sector_id = int(r["sector_id"])
        except (TypeError, ValueError, KeyError):
            continue
        if val <= 0:
            continue
        if sector_id not in DIRECT_EMITTER_SECTORS:
            skipped_supplier += val
            continue
        fac_total[fid] += val
        fac_sector[fid][sector_id] += val

    names = {int(r["facility_id"]): (r.get("facility_name") or "").strip()
             for r in facilities if r.get("facility_id") is not None}

    by_norm: dict[str, str] = {}
    for c in universe:
        by_norm.setdefault(normalize_company(c["name"]), c["ticker"])
    choices = list(by_norm.keys())

    resolved: dict[str, dict] = {}
    unattributed = 0.0
    unattributed_count = 0
    sector_totals: dict[str, float] = defaultdict(float)

    for fid, total in fac_total.items():
        top_sector = max(fac_sector[fid].items(), key=lambda kv: kv[1])[0] if fac_sector[fid] else None
        sector_label = SECTOR_NAMES.get(top_sector, f"sector_{top_sector}")
        sector_totals[sector_label] += total

        name = names.get(fid, "")
        norm = normalize_company(name)
        ticker = method = None
        if norm in overrides:
            ticker, method = overrides[norm], "override"
        elif norm in by_norm:
            ticker, method = by_norm[norm], "exact"
        elif norm:
            hit = process.extractOne(norm, choices, scorer=fuzz.token_sort_ratio)
            if hit and hit[1] >= FUZZ_ACCEPT:
                ticker, method = by_norm[hit[0]], "fuzzy"

        if not ticker:
            unattributed += total
            unattributed_count += 1
            continue

        agg = resolved.setdefault(
            ticker,
            {
                "ticker": ticker,
                "emissions_tco2e": 0.0,
                "facility_count": 0,
                "match_method": method,
                "sectors": defaultdict(float),
            },
        )
        agg["emissions_tco2e"] += total
        agg["facility_count"] += 1
        agg["sectors"][sector_label] += total

    for agg in resolved.values():
        agg["sectors"] = dict(sorted(agg["sectors"].items(), key=lambda kv: -kv[1]))

    total_reported = sum(fac_total.values())
    payload = {
        "generated_at": utc_now_iso(),
        "source": "EPA GHGRP via Envirofacts (PUB_DIM_FACILITY + PUB_FACTS_SECTOR_GHG_EMISSION)",
        "source_url": f"{BASE}/PUB_FACTS_SECTOR_GHG_EMISSION/",
        "available": True,
        "emissions_vintage": str(args.year),
        "scope": "Scope 1 (direct reported emissions, US large emitters)",
        "attribution_note": (
            "Envirofacts exposes no parent-company table, only facility_name. Only "
            "override/exact/>=96 fuzzy matches are attributed; everything else is "
            "counted as unattributed rather than guessed at."
        ),
        "fragility_note": (
            "EPA has proposed eliminating most GHGRP reporting categories, so this "
            "feed may stop updating. The pipeline treats it as optional."
        ),
        "direct_emitter_sectors_only": sorted(DIRECT_EMITTER_SECTORS),
        "supplier_tco2e_excluded": skipped_supplier,
        "facilities_total": len(fac_total),
        "reported_tco2e_total": total_reported,
        "attributed_tco2e": total_reported - unattributed,
        "unattributed_tco2e": unattributed,
        "unattributed_facilities": unattributed_count,
        "sector_totals_tco2e": dict(sorted(sector_totals.items(), key=lambda kv: -kv[1])),
        "companies": resolved,
    }
    write_json(CACHE / "derived" / "epa_ghgrp.json", payload)

    pct = 100 * (total_reported - unattributed) / max(total_reported, 1)
    log(f"\n  supplier rows excluded    : {skipped_supplier:,.0f} tCO2e (downstream, not Scope 1)")
    log(f"  facilities with emissions : {len(fac_total)}")
    log(f"  total reported            : {total_reported:,.0f} tCO2e")
    log(f"  attributed to S&P 500     : {total_reported - unattributed:,.0f} ({pct:.1f}%)")
    log(f"  tickers matched           : {len(resolved)}")
    log(f"  {f.stats()}")
    if resolved:
        log("\n  top attributed:")
        for r in sorted(resolved.values(), key=lambda r: -r["emissions_tco2e"])[:10]:
            log(f"    {r['ticker']:<7} {r['emissions_tco2e']:>14,.0f}  "
                f"{r['facility_count']:>4} facilities  {r['match_method']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
