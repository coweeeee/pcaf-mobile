/**
 * The bundled reference data.
 *
 * Metro inlines these JSON files into the app binary at build time, so there is
 * no fetch, no loading state and no network dependency at runtime — which is the
 * whole point of the build-time pipeline in scripts/build_universe.py.
 *
 * Regenerate with:  npm run data
 */

import universeJson from "../../assets/data/universe.json";
import referenceJson from "../../assets/data/reference.json";
import demoPortfolioJson from "../../assets/data/demo_portfolio.json";

import { buildCapWeightedBenchmark, indexUniverse, type Company, type Position } from "./pcaf";
import type { Reference } from "./types";

export const UNIVERSE = universeJson as unknown as Company[];
export const REFERENCE = referenceJson as unknown as Reference;
export const UNIVERSE_BY_TICKER = indexUniverse(UNIVERSE);

/** The portfolio shown on first launch, authored in data/demo_portfolio.csv. */
export const DEMO_PORTFOLIO = demoPortfolioJson as unknown as Position[];

export const DEMO_PORTFOLIO_VALUE = DEMO_PORTFOLIO.reduce((s, p) => s + p.marketValueUsd, 0);

/**
 * The comparison benchmark: every company in the reference universe, cap
 * weighted — an "S&P 500 proxy" in the sense that it is a broad, cap-weighted
 * slice of US large caps, but built only from the 82 issuers we hold data for.
 *
 * WACI is scale invariant, so the notional here only affects the absolute
 * financed-emissions figure. It is matched to the portfolio under comparison so
 * the two absolute numbers are like for like; see `benchmarkFor`.
 */
export function benchmarkFor(notionalUsd: number): Position[] {
  return buildCapWeightedBenchmark(UNIVERSE, notionalUsd);
}

export const SECTOR_INTENSITY_BY_SECTOR = new Map(
  REFERENCE.sector_intensity.map((s) => [s.sector, s]),
);
