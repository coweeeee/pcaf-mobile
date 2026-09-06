import { describe, it, expect } from "vitest";
import {
  type Company,
  type Position,
  attributionFactor,
  buildCapWeightedBenchmark,
  carbonIntensity,
  computeEvic,
  computePortfolio,
  PCAF_SCORE_SCALE,
} from "./pcaf";

/* ------------------------------------------------------------------ *
 * Hand-computed worked example.
 *
 * Three companies with deliberately round numbers so every intermediate
 * quantity below can be checked on paper.
 *
 *  ALFA  (Energy, reported)
 *    EVIC = 800B + 150B + 50B          = 1,000,000,000,000
 *    revenue                           =   400,000 $M
 *    Scope 1+2                         = 100,000,000 tCO2e
 *    intensity = 1e8 / 4e5             =       250 tCO2e/$M
 *
 *  BRVO  (Information Technology, reported)
 *    EVIC = 400B + 100B + 0            =   500,000,000,000
 *    revenue                           =   200,000 $M
 *    Scope 1+2                         =   2,000,000 tCO2e
 *    intensity = 2e6 / 2e5             =        10 tCO2e/$M
 *
 *  CHAR  (Utilities, estimated)
 *    EVIC = 150B + 50B + 0             =   200,000,000,000
 *    revenue                           =    20,000 $M
 *    Scope 1+2 = 2,000 * 20,000        =  40,000,000 tCO2e
 *    intensity = 4e7 / 2e4             =     2,000 tCO2e/$M
 *
 * Portfolio: ALFA $10M, BRVO $20M, CHAR $20M. Total $50M.
 *   weights                 0.2      0.4      0.4
 *   attribution  1e7/1e12=1e-5   2e7/5e11=4e-5   2e7/2e11=1e-4
 *   financed S1+2  1e-5*1e8=1,000   4e-5*2e6=80   1e-4*4e7=4,000
 *                                              total = 5,080 tCO2e
 *   WACI = 0.2*250 + 0.4*10 + 0.4*2000 = 50 + 4 + 800 = 854 tCO2e/$M
 * ------------------------------------------------------------------ */

function company(overrides: Partial<Company> & Pick<Company, "ticker">): Company {
  return {
    name: overrides.ticker,
    sector: "Industrials",
    industry: null,
    market_cap: 0,
    total_debt: 0,
    minority_interest: 0,
    minority_interest_assumed_zero: false,
    evic: 0,
    revenue_musd: 1,
    emissions_tco2e_scope1: null,
    emissions_tco2e_scope2_market: null,
    emissions_tco2e_scope12: 0,
    emissions_tco2e_scope3_estimated: 0,
    scope3_multiplier: 1,
    carbon_intensity_tco2e_per_musd: 0,
    emissions_tier: "reported",
    emissions_source: "test",
    emissions_note: "test",
    emissions_reporting_year: 2024,
    issuer_claims_third_party_assurance: false,
    data_quality_score: 2,
    ...overrides,
  } as Company;
}

const ALFA = company({
  ticker: "ALFA",
  sector: "Energy",
  market_cap: 800e9,
  total_debt: 150e9,
  minority_interest: 50e9,
  evic: 1_000e9,
  revenue_musd: 400_000,
  emissions_tco2e_scope12: 100_000_000,
  emissions_tco2e_scope3_estimated: 800_000_000, // multiplier 8
  scope3_multiplier: 8,
  carbon_intensity_tco2e_per_musd: 250,
  emissions_tier: "reported",
  data_quality_score: 2,
});

const BRVO = company({
  ticker: "BRVO",
  sector: "Information Technology",
  market_cap: 400e9,
  total_debt: 100e9,
  minority_interest: 0,
  evic: 500e9,
  revenue_musd: 200_000,
  emissions_tco2e_scope12: 2_000_000,
  emissions_tco2e_scope3_estimated: 50_000_000, // multiplier 25
  scope3_multiplier: 25,
  carbon_intensity_tco2e_per_musd: 10,
  emissions_tier: "reported",
  data_quality_score: 2,
});

const CHAR = company({
  ticker: "CHAR",
  sector: "Utilities",
  market_cap: 150e9,
  total_debt: 50e9,
  minority_interest: 0,
  evic: 200e9,
  revenue_musd: 20_000,
  emissions_tco2e_scope12: 40_000_000,
  emissions_tco2e_scope3_estimated: 32_000_000, // multiplier 0.8
  scope3_multiplier: 0.8,
  carbon_intensity_tco2e_per_musd: 2000,
  emissions_tier: "estimated",
  data_quality_score: 5,
});

const UNIVERSE = [ALFA, BRVO, CHAR];
const PORTFOLIO: Position[] = [
  { ticker: "ALFA", marketValueUsd: 10_000_000 },
  { ticker: "BRVO", marketValueUsd: 20_000_000 },
  { ticker: "CHAR", marketValueUsd: 20_000_000 },
];

describe("EVIC", () => {
  it("adds market cap, total debt and minority interest", () => {
    expect(computeEvic(800e9, 150e9, 50e9)).toBe(1_000e9);
  });

  it("does NOT subtract cash — EVIC is not enterprise value", () => {
    // Same inputs, plus a large cash balance. EVIC must be unchanged: the
    // function has no cash parameter at all, which is the point.
    const evic = computeEvic(800e9, 150e9, 50e9);
    const standardEv = 800e9 + 150e9 + 50e9 - 200e9; // what EV would give
    expect(evic).toBe(1_000e9);
    expect(evic).not.toBe(standardEv);
    expect(evic - standardEv).toBe(200e9);
  });

  it("matches the evic field precomputed by the build script", () => {
    for (const c of UNIVERSE) {
      expect(computeEvic(c.market_cap, c.total_debt, c.minority_interest)).toBeCloseTo(c.evic, 6);
    }
  });
});

describe("attributionFactor", () => {
  it("is position value over EVIC", () => {
    expect(attributionFactor(10_000_000, 1_000e9)).toBeCloseTo(1e-5, 15);
    expect(attributionFactor(20_000_000, 500e9)).toBeCloseTo(4e-5, 15);
    expect(attributionFactor(20_000_000, 200e9)).toBeCloseTo(1e-4, 15);
  });

  it("throws rather than returning Infinity when EVIC is zero or negative", () => {
    expect(() => attributionFactor(1_000_000, 0)).toThrow(/EVIC must be positive/);
    expect(() => attributionFactor(1_000_000, -5)).toThrow(/EVIC must be positive/);
  });
});

describe("carbonIntensity", () => {
  it("is Scope 1+2 over revenue in $M", () => {
    expect(carbonIntensity(100_000_000, 400_000)).toBe(250);
    expect(carbonIntensity(40_000_000, 20_000)).toBe(2000);
  });

  it("throws on non-positive revenue instead of producing Infinity", () => {
    expect(() => carbonIntensity(1000, 0)).toThrow(/revenue must be positive/);
  });
});

describe("computePortfolio — the hand-computed three-holding example", () => {
  const r = computePortfolio(PORTFOLIO, UNIVERSE);
  const byTicker = Object.fromEntries(r.holdings.map((h) => [h.company.ticker, h]));

  it("matches all three holdings and excludes nothing", () => {
    expect(r.holdings).toHaveLength(3);
    expect(r.excluded).toHaveLength(0);
    expect(r.totalPortfolioValueUsd).toBe(50_000_000);
    expect(r.totalInputValueUsd).toBe(50_000_000);
    expect(r.excludedWeightOfInput).toBe(0);
  });

  it("computes the hand-checked weights", () => {
    expect(byTicker.ALFA.weight).toBeCloseTo(0.2, 12);
    expect(byTicker.BRVO.weight).toBeCloseTo(0.4, 12);
    expect(byTicker.CHAR.weight).toBeCloseTo(0.4, 12);
    expect(r.holdings.reduce((s, h) => s + h.weight, 0)).toBeCloseTo(1, 12);
  });

  it("computes the hand-checked attribution factors", () => {
    expect(byTicker.ALFA.attributionFactor).toBeCloseTo(1e-5, 15);
    expect(byTicker.BRVO.attributionFactor).toBeCloseTo(4e-5, 15);
    expect(byTicker.CHAR.attributionFactor).toBeCloseTo(1e-4, 15);
  });

  it("computes the hand-checked per-holding financed emissions", () => {
    expect(byTicker.ALFA.financedEmissionsScope12).toBeCloseTo(1000, 9);
    expect(byTicker.BRVO.financedEmissionsScope12).toBeCloseTo(80, 9);
    expect(byTicker.CHAR.financedEmissionsScope12).toBeCloseTo(4000, 9);
  });

  it("totals financed emissions to 5,080 tCO2e", () => {
    expect(r.financedEmissionsScope12).toBeCloseTo(5080, 9);
  });

  it("totals financed Scope 3 to 13,200 tCO2e", () => {
    // 1e-5*8e8 = 8,000 | 4e-5*5e7 = 2,000 | 1e-4*3.2e7 = 3,200
    expect(byTicker.ALFA.financedEmissionsScope3).toBeCloseTo(8000, 9);
    expect(byTicker.BRVO.financedEmissionsScope3).toBeCloseTo(2000, 9);
    expect(byTicker.CHAR.financedEmissionsScope3).toBeCloseTo(3200, 9);
    expect(r.financedEmissionsScope3).toBeCloseTo(13200, 9);
  });

  it("computes WACI as 854 tCO2e per $M revenue", () => {
    expect(r.waci).toBeCloseTo(854, 10);
  });

  it("decomposes WACI additively across holdings", () => {
    const summed = r.holdings.reduce((s, h) => s + h.waciContribution, 0);
    expect(summed).toBeCloseTo(r.waci, 12);
    expect(byTicker.ALFA.waciContribution).toBeCloseTo(50, 12);
    expect(byTicker.BRVO.waciContribution).toBeCloseTo(4, 12);
    expect(byTicker.CHAR.waciContribution).toBeCloseTo(800, 12);
  });

  it("computes economic emissions intensity as 101.6 tCO2e per $M invested", () => {
    // 5,080 tCO2e / $50M = 101.6
    expect(r.economicEmissionsIntensity).toBeCloseTo(101.6, 9);
  });

  it("computes the value-weighted PCAF data quality score as 3.2", () => {
    // 0.2*2 + 0.4*2 + 0.4*5
    expect(r.dataQualityScoreByValue).toBeCloseTo(3.2, 12);
  });

  it("computes the emissions-weighted data quality score as 22160/5080", () => {
    // (1000*2 + 80*2 + 4000*5) / 5080
    expect(r.dataQualityScoreByEmissions).toBeCloseTo(22160 / 5080, 12);
    expect(r.dataQualityScoreByEmissions).toBeCloseTo(4.36220472440945, 10);
  });

  it("aggregates by sector, largest emitter first", () => {
    expect(r.sectorBreakdown.map((s) => s.sector)).toEqual([
      "Utilities",
      "Energy",
      "Information Technology",
    ]);
    const [utils, energy, tech] = r.sectorBreakdown;
    expect(utils.financedEmissionsScope12).toBeCloseTo(4000, 9);
    expect(energy.financedEmissionsScope12).toBeCloseTo(1000, 9);
    expect(tech.financedEmissionsScope12).toBeCloseTo(80, 9);
    expect(utils.shareOfEmissions).toBeCloseTo(4000 / 5080, 12);
    expect(r.sectorBreakdown.reduce((s, x) => s + x.shareOfEmissions, 0)).toBeCloseTo(1, 12);
    expect(r.sectorBreakdown.reduce((s, x) => s + x.waciContribution, 0)).toBeCloseTo(r.waci, 12);
  });

  it("splits the reported and estimated tiers without blending them", () => {
    expect(r.tierBreakdown.reported.count).toBe(2);
    expect(r.tierBreakdown.reported.valueUsd).toBe(30_000_000);
    expect(r.tierBreakdown.reported.weight).toBeCloseTo(0.6, 12);
    expect(r.tierBreakdown.reported.financedEmissionsScope12).toBeCloseTo(1080, 9);

    expect(r.tierBreakdown.estimated.count).toBe(1);
    expect(r.tierBreakdown.estimated.valueUsd).toBe(20_000_000);
    expect(r.tierBreakdown.estimated.weight).toBeCloseTo(0.4, 12);
    expect(r.tierBreakdown.estimated.financedEmissionsScope12).toBeCloseTo(4000, 9);
  });

  it("counts holdings at each PCAF score", () => {
    expect(r.dataQualityDistribution).toEqual({ 1: 0, 2: 2, 3: 0, 4: 0, 5: 1 });
  });

  it("orders holdings by financed emissions descending", () => {
    expect(r.holdings.map((h) => h.company.ticker)).toEqual(["CHAR", "ALFA", "BRVO"]);
  });
});

describe("computePortfolio — coverage and input handling", () => {
  it("excludes unknown tickers, reports their weight, and renormalises the rest", () => {
    const r = computePortfolio(
      [...PORTFOLIO, { ticker: "ZZZZ", marketValueUsd: 10_000_000 }],
      UNIVERSE,
    );
    expect(r.excluded).toEqual([
      { ticker: "ZZZZ", marketValueUsd: 10_000_000, reason: "not_in_universe" },
    ]);
    expect(r.totalInputValueUsd).toBe(60_000_000);
    expect(r.totalPortfolioValueUsd).toBe(50_000_000);
    expect(r.excludedValueUsd).toBe(10_000_000);
    expect(r.excludedWeightOfInput).toBeCloseTo(1 / 6, 12);

    // Matched weights still sum to 1 and the headline numbers are unchanged.
    expect(r.holdings.reduce((s, h) => s + h.weight, 0)).toBeCloseTo(1, 12);
    expect(r.waci).toBeCloseTo(854, 10);
    expect(r.financedEmissionsScope12).toBeCloseTo(5080, 9);
  });

  it("folds duplicate rows for the same ticker into one position", () => {
    const r = computePortfolio(
      [
        { ticker: "ALFA", marketValueUsd: 4_000_000 },
        { ticker: "ALFA", marketValueUsd: 6_000_000 },
        { ticker: "BRVO", marketValueUsd: 20_000_000 },
        { ticker: "CHAR", marketValueUsd: 20_000_000 },
      ],
      UNIVERSE,
    );
    expect(r.holdings).toHaveLength(3);
    expect(r.holdings.find((h) => h.company.ticker === "ALFA")!.marketValueUsd).toBe(10_000_000);
    expect(r.waci).toBeCloseTo(854, 10);
  });

  it("resolves tickers case-insensitively and ignores surrounding whitespace", () => {
    const r = computePortfolio(
      [
        { ticker: " alfa ", marketValueUsd: 10_000_000 },
        { ticker: "Brvo", marketValueUsd: 20_000_000 },
        { ticker: "CHAR", marketValueUsd: 20_000_000 },
      ],
      UNIVERSE,
    );
    expect(r.excluded).toHaveLength(0);
    expect(r.waci).toBeCloseTo(854, 10);
  });

  it("returns zeroed, non-NaN results for an empty portfolio", () => {
    const r = computePortfolio([], UNIVERSE);
    expect(r.holdings).toHaveLength(0);
    expect(r.waci).toBe(0);
    expect(r.financedEmissionsScope12).toBe(0);
    expect(r.economicEmissionsIntensity).toBe(0);
    expect(r.dataQualityScoreByValue).toBe(0);
    expect(r.dataQualityScoreByEmissions).toBe(0);
    expect(r.excludedWeightOfInput).toBe(0);
  });

  it("returns zeroed results when nothing matches the universe", () => {
    const r = computePortfolio([{ ticker: "NOPE", marketValueUsd: 1_000_000 }], UNIVERSE);
    expect(r.holdings).toHaveLength(0);
    expect(r.excluded).toHaveLength(1);
    expect(r.excludedWeightOfInput).toBe(1);
    expect(Number.isNaN(r.waci)).toBe(false);
  });

  it("is invariant to scaling every position by the same factor (WACI only)", () => {
    const scaled = PORTFOLIO.map((p) => ({ ...p, marketValueUsd: p.marketValueUsd * 7.5 }));
    const a = computePortfolio(PORTFOLIO, UNIVERSE);
    const b = computePortfolio(scaled, UNIVERSE);
    expect(b.waci).toBeCloseTo(a.waci, 10);
    // Financed emissions, by contrast, scale linearly.
    expect(b.financedEmissionsScope12).toBeCloseTo(a.financedEmissionsScope12 * 7.5, 6);
  });
});

describe("buildCapWeightedBenchmark", () => {
  it("weights by market cap and scales to the requested notional", () => {
    const bench = buildCapWeightedBenchmark(UNIVERSE, 50_000_000);
    const totalCap = 800e9 + 400e9 + 150e9; // 1.35e12
    const total = bench.reduce((s, p) => s + p.marketValueUsd, 0);
    expect(total).toBeCloseTo(50_000_000, 6);
    expect(bench.find((p) => p.ticker === "ALFA")!.marketValueUsd).toBeCloseTo(
      (800e9 / totalCap) * 50_000_000,
      6,
    );
  });

  it("produces a benchmark WACI that is the cap-weighted mean of constituent intensities", () => {
    const bench = buildCapWeightedBenchmark(UNIVERSE, 1_000_000);
    const r = computePortfolio(bench, UNIVERSE);
    const totalCap = 800e9 + 400e9 + 150e9;
    const expected =
      (800e9 / totalCap) * 250 + (400e9 / totalCap) * 10 + (150e9 / totalCap) * 2000;
    expect(r.waci).toBeCloseTo(expected, 8);
  });

  it("returns an empty benchmark for an empty universe rather than dividing by zero", () => {
    expect(buildCapWeightedBenchmark([], 1_000_000)).toEqual([]);
  });
});

describe("PCAF_SCORE_SCALE", () => {
  it("defines all five levels, best to worst", () => {
    expect(PCAF_SCORE_SCALE.map((s) => s.score)).toEqual([1, 2, 3, 4, 5]);
    expect(PCAF_SCORE_SCALE[0].label).toMatch(/verified/i);
    expect(PCAF_SCORE_SCALE[4].label).toMatch(/sector-average/i);
  });
});
