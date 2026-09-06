/**
 * PCAF (Partnership for Carbon Accounting Financials) listed-equity methodology.
 *
 * Pure functions, no I/O, no React. Everything here is unit tested against a
 * hand-computed worked example in pcaf.test.ts.
 *
 * The four equations implemented, in order:
 *
 *   EVIC_c              = market_cap_c + total_debt_c + minority_interest_c
 *   attribution_c       = position_value_c / EVIC_c
 *   financed_emissions  = SUM_c attribution_c * emissions_c
 *   WACI                = SUM_c (position_value_c / portfolio_value) * intensity_c
 *
 * Note on EVIC: unlike standard enterprise value, PCAF does NOT subtract cash.
 * The EVIC on each company record is computed in scripts/build_universe.py and
 * re-derived here by `computeEvic` so the front end can verify it.
 */

export type EmissionsTier = "reported" | "estimated";

/** One company in the static reference universe (public/data/universe.json). */
export interface Company {
  ticker: string;
  name: string;
  sector: string;
  industry: string | null;
  market_cap: number;
  total_debt: number;
  minority_interest: number;
  minority_interest_assumed_zero: boolean;
  evic: number;
  revenue_musd: number;
  emissions_tco2e_scope1: number | null;
  emissions_tco2e_scope2_market: number | null;
  emissions_tco2e_scope12: number;
  emissions_tco2e_scope3_estimated: number;
  scope3_multiplier: number;
  carbon_intensity_tco2e_per_musd: number;
  emissions_tier: EmissionsTier;
  emissions_source: string;
  emissions_note: string;
  emissions_reporting_year: number | null;
  issuer_claims_third_party_assurance: boolean;
  data_quality_score: number;
}

/** A row of the user's portfolio: a ticker and the dollar value held. */
export interface Position {
  ticker: string;
  marketValueUsd: number;
}

/** A position that could not be priced, with the reason why. */
export interface ExcludedPosition {
  ticker: string;
  marketValueUsd: number;
  reason: "not_in_universe";
}

/** A fully-resolved holding with every PCAF quantity derived. */
export interface Holding {
  company: Company;
  marketValueUsd: number;
  /** Share of the *matched* portfolio value. Sums to 1 across holdings. */
  weight: number;
  /** position value / EVIC. Dimensionless; the share of the issuer financed. */
  attributionFactor: number;
  /** attributionFactor * company Scope 1+2, in tCO2e. */
  financedEmissionsScope12: number;
  /** attributionFactor * estimated company Scope 3, in tCO2e. Always an estimate. */
  financedEmissionsScope3: number;
  /** Company Scope 1+2 per $M of company revenue. */
  carbonIntensity: number;
  /** weight * carbonIntensity — this holding's additive contribution to WACI. */
  waciContribution: number;
  dataQualityScore: number;
}

export interface SectorAggregate {
  sector: string;
  marketValueUsd: number;
  weight: number;
  financedEmissionsScope12: number;
  /** Share of total portfolio financed emissions. */
  shareOfEmissions: number;
  waciContribution: number;
  holdingCount: number;
}

export interface PortfolioResult {
  holdings: Holding[];
  excluded: ExcludedPosition[];

  /** Sum of every input row, matched or not. */
  totalInputValueUsd: number;
  /** Sum of matched rows only. All weights are relative to this. */
  totalPortfolioValueUsd: number;
  excludedValueUsd: number;
  /** Excluded value as a share of total input value. 0 when everything matched. */
  excludedWeightOfInput: number;

  /** Absolute financed emissions, tCO2e. */
  financedEmissionsScope12: number;
  financedEmissionsScope3: number;

  /** tCO2e per $M revenue. */
  waci: number;
  /** tCO2e per $M invested — the TCFD "carbon footprint" metric. */
  economicEmissionsIntensity: number;

  /** PCAF weighted-average data quality score, 1 (best) to 5 (worst). */
  dataQualityScoreByValue: number;
  dataQualityScoreByEmissions: number;

  sectorBreakdown: SectorAggregate[];
  /** Count and value split between the reported and estimated emissions tiers. */
  tierBreakdown: Record<EmissionsTier, { count: number; valueUsd: number; weight: number; financedEmissionsScope12: number }>;
  /** Holding count at each PCAF score 1..5. */
  dataQualityDistribution: Record<number, number>;
}

/** The PCAF data quality scale, all five levels. Our data occupies 2 and 5. */
export const PCAF_SCORE_SCALE = [
  {
    score: 1,
    label: "Verified reported",
    description:
      "Emissions reported by the company and independently verified to a recognised assurance standard by a third party.",
  },
  {
    score: 2,
    label: "Unverified reported",
    description:
      "Emissions self-reported by the company in a public disclosure, without third-party assurance that we have independently confirmed.",
  },
  {
    score: 3,
    label: "Primary activity data",
    description:
      "Calculated from the company's own primary physical activity data — metered energy use, fuel consumption — via a recognised calculation method.",
  },
  {
    score: 4,
    label: "Proxy activity data",
    description:
      "Estimated from proxy physical activity data — floor area, production units, employee headcount — using regional emission factors.",
  },
  {
    score: 5,
    label: "Sector-average economic data",
    description:
      "Estimated from revenue using a sector-average carbon intensity. The weakest tier: no company-specific physical or reported input.",
  },
] as const;

/**
 * PCAF Enterprise Value Including Cash.
 * Cash is deliberately NOT subtracted — that is what distinguishes EVIC from EV.
 */
export function computeEvic(
  marketCap: number,
  totalDebt: number,
  minorityInterest: number,
): number {
  return marketCap + totalDebt + minorityInterest;
}

/**
 * The share of an issuer that an investor finances.
 * Throws on a non-positive EVIC rather than returning Infinity or 0 — a company
 * with no enterprise value cannot be attributed and must be surfaced, not hidden.
 */
export function attributionFactor(positionValueUsd: number, evic: number): number {
  if (!(evic > 0)) {
    throw new Error(`attributionFactor: EVIC must be positive, received ${evic}`);
  }
  return positionValueUsd / evic;
}

/** Company-level carbon intensity: tCO2e of Scope 1+2 per $M of revenue. */
export function carbonIntensity(emissionsTco2e: number, revenueMusd: number): number {
  if (!(revenueMusd > 0)) {
    throw new Error(`carbonIntensity: revenue must be positive, received ${revenueMusd}`);
  }
  return emissionsTco2e / revenueMusd;
}

/** Index a universe array by ticker for O(1) resolution. */
export function indexUniverse(universe: Company[]): Map<string, Company> {
  return new Map(universe.map((c) => [c.ticker.toUpperCase(), c]));
}

/**
 * Run the full PCAF calculation for a set of positions against a universe.
 *
 * Positions whose ticker is absent from the universe are not dropped silently:
 * they are returned in `excluded` with their combined value, and every weight in
 * the result is normalised over matched value only. Coverage is reported, never
 * assumed.
 */
export function computePortfolio(
  positions: Position[],
  universe: Company[] | Map<string, Company>,
): PortfolioResult {
  const byTicker = universe instanceof Map ? universe : indexUniverse(universe);

  const matched: { company: Company; marketValueUsd: number }[] = [];
  const excluded: ExcludedPosition[] = [];

  // Fold duplicate rows for the same ticker into a single position.
  const merged = new Map<string, number>();
  for (const p of positions) {
    const key = p.ticker.trim().toUpperCase();
    if (!key) continue;
    merged.set(key, (merged.get(key) ?? 0) + p.marketValueUsd);
  }

  for (const [ticker, marketValueUsd] of merged) {
    const company = byTicker.get(ticker);
    if (!company) {
      excluded.push({ ticker, marketValueUsd, reason: "not_in_universe" });
    } else {
      matched.push({ company, marketValueUsd });
    }
  }

  const totalPortfolioValueUsd = matched.reduce((s, m) => s + m.marketValueUsd, 0);
  const excludedValueUsd = excluded.reduce((s, e) => s + e.marketValueUsd, 0);
  const totalInputValueUsd = totalPortfolioValueUsd + excludedValueUsd;

  const holdings: Holding[] = matched.map(({ company, marketValueUsd }) => {
    const weight = totalPortfolioValueUsd > 0 ? marketValueUsd / totalPortfolioValueUsd : 0;
    const af = attributionFactor(marketValueUsd, company.evic);
    const intensity = carbonIntensity(company.emissions_tco2e_scope12, company.revenue_musd);
    return {
      company,
      marketValueUsd,
      weight,
      attributionFactor: af,
      financedEmissionsScope12: af * company.emissions_tco2e_scope12,
      financedEmissionsScope3: af * company.emissions_tco2e_scope3_estimated,
      carbonIntensity: intensity,
      waciContribution: weight * intensity,
      dataQualityScore: company.data_quality_score,
    };
  });

  holdings.sort((a, b) => b.financedEmissionsScope12 - a.financedEmissionsScope12);

  const financedEmissionsScope12 = holdings.reduce((s, h) => s + h.financedEmissionsScope12, 0);
  const financedEmissionsScope3 = holdings.reduce((s, h) => s + h.financedEmissionsScope3, 0);
  const waci = holdings.reduce((s, h) => s + h.waciContribution, 0);

  const dataQualityScoreByValue = holdings.reduce((s, h) => s + h.weight * h.dataQualityScore, 0);
  const dataQualityScoreByEmissions =
    financedEmissionsScope12 > 0
      ? holdings.reduce(
          (s, h) => s + (h.financedEmissionsScope12 / financedEmissionsScope12) * h.dataQualityScore,
          0,
        )
      : 0;

  // Sector aggregation.
  const sectorMap = new Map<string, SectorAggregate>();
  for (const h of holdings) {
    const key = h.company.sector;
    const agg =
      sectorMap.get(key) ??
      {
        sector: key,
        marketValueUsd: 0,
        weight: 0,
        financedEmissionsScope12: 0,
        shareOfEmissions: 0,
        waciContribution: 0,
        holdingCount: 0,
      };
    agg.marketValueUsd += h.marketValueUsd;
    agg.weight += h.weight;
    agg.financedEmissionsScope12 += h.financedEmissionsScope12;
    agg.waciContribution += h.waciContribution;
    agg.holdingCount += 1;
    sectorMap.set(key, agg);
  }
  const sectorBreakdown = [...sectorMap.values()]
    .map((s) => ({
      ...s,
      shareOfEmissions:
        financedEmissionsScope12 > 0 ? s.financedEmissionsScope12 / financedEmissionsScope12 : 0,
    }))
    .sort((a, b) => b.financedEmissionsScope12 - a.financedEmissionsScope12);

  const tierBreakdown = {
    reported: { count: 0, valueUsd: 0, weight: 0, financedEmissionsScope12: 0 },
    estimated: { count: 0, valueUsd: 0, weight: 0, financedEmissionsScope12: 0 },
  } as PortfolioResult["tierBreakdown"];
  const dataQualityDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  for (const h of holdings) {
    const t = tierBreakdown[h.company.emissions_tier];
    t.count += 1;
    t.valueUsd += h.marketValueUsd;
    t.weight += h.weight;
    t.financedEmissionsScope12 += h.financedEmissionsScope12;
    dataQualityDistribution[h.dataQualityScore] =
      (dataQualityDistribution[h.dataQualityScore] ?? 0) + 1;
  }

  return {
    holdings,
    excluded,
    totalInputValueUsd,
    totalPortfolioValueUsd,
    excludedValueUsd,
    excludedWeightOfInput: totalInputValueUsd > 0 ? excludedValueUsd / totalInputValueUsd : 0,
    financedEmissionsScope12,
    financedEmissionsScope3,
    waci,
    economicEmissionsIntensity:
      totalPortfolioValueUsd > 0 ? financedEmissionsScope12 / (totalPortfolioValueUsd / 1e6) : 0,
    dataQualityScoreByValue,
    dataQualityScoreByEmissions,
    sectorBreakdown,
    tierBreakdown,
    dataQualityDistribution,
  };
}

/**
 * Build a cap-weighted benchmark portfolio from the universe, scaled to a given
 * notional so its financed emissions are directly comparable to a real portfolio
 * of the same size. WACI itself is scale-invariant, so the notional only affects
 * the absolute financed-emissions figure.
 */
export function buildCapWeightedBenchmark(
  universe: Company[],
  notionalUsd: number,
): Position[] {
  const totalCap = universe.reduce((s, c) => s + c.market_cap, 0);
  if (!(totalCap > 0)) return [];
  return universe.map((c) => ({
    ticker: c.ticker,
    marketValueUsd: (c.market_cap / totalCap) * notionalUsd,
  }));
}
