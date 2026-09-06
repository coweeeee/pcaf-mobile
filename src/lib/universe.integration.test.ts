/**
 * Integration checks against the real generated artefacts.
 *
 * These run over assets/data/universe.json and data/demo_portfolio.csv exactly
 * as the browser will load them, so a bad build_universe.py run fails the test
 * suite rather than reaching the UI.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  type Company,
  buildCapWeightedBenchmark,
  computeEvic,
  computePortfolio,
} from "./pcaf";
import { parsePortfolioCsv } from "./portfolioCsv";

const root = resolve(__dirname, "../..");
const universe: Company[] = JSON.parse(
  readFileSync(resolve(root, "assets/data/universe.json"), "utf8"),
);
const reference = JSON.parse(readFileSync(resolve(root, "assets/data/reference.json"), "utf8"));
const demoCsv = readFileSync(resolve(root, "data/demo_portfolio.csv"), "utf8");

describe("generated universe.json", () => {
  it("is a non-empty array covering every GICS sector in the reference table", () => {
    expect(Array.isArray(universe)).toBe(true);
    expect(universe.length).toBeGreaterThan(50);
    const sectors = new Set(universe.map((c) => c.sector));
    for (const s of reference.sector_intensity) {
      expect(sectors.has(s.sector)).toBe(true);
    }
  });

  it("has unique tickers", () => {
    const tickers = universe.map((c) => c.ticker);
    expect(new Set(tickers).size).toBe(tickers.length);
  });

  it("has a positive, finite EVIC consistent with its components for every company", () => {
    for (const c of universe) {
      expect(Number.isFinite(c.evic), c.ticker).toBe(true);
      expect(c.evic, c.ticker).toBeGreaterThan(0);
      expect(computeEvic(c.market_cap, c.total_debt, c.minority_interest)).toBeCloseTo(c.evic, 2);
      // EVIC must be at least market cap, since debt and minority interest are added.
      expect(c.evic, c.ticker).toBeGreaterThanOrEqual(c.market_cap);
    }
  });

  it("has positive revenue and non-negative emissions everywhere", () => {
    for (const c of universe) {
      expect(c.revenue_musd, c.ticker).toBeGreaterThan(0);
      expect(c.emissions_tco2e_scope12, c.ticker).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(c.emissions_tco2e_scope12), c.ticker).toBe(true);
      expect(c.carbon_intensity_tco2e_per_musd).toBeCloseTo(
        c.emissions_tco2e_scope12 / c.revenue_musd,
        3,
      );
    }
  });

  it("assigns exactly score 2 to every reported holding and 5 to every estimated one", () => {
    for (const c of universe) {
      if (c.emissions_tier === "reported") {
        expect(c.data_quality_score, c.ticker).toBe(2);
        expect(c.emissions_reporting_year, c.ticker).toBeGreaterThan(2015);
        expect(c.emissions_source.length, c.ticker).toBeGreaterThan(10);
      } else {
        expect(c.emissions_tier, c.ticker).toBe("estimated");
        expect(c.data_quality_score, c.ticker).toBe(5);
        expect(c.emissions_source, c.ticker).toMatch(/Sector-average economic proxy/);
      }
    }
  });

  it("derives every estimated figure from the published sector intensity", () => {
    const bySector = new Map<string, number>(
      reference.sector_intensity.map((s: { sector: string; avg_intensity_tco2e_per_musd_revenue: number }) => [
        s.sector,
        s.avg_intensity_tco2e_per_musd_revenue,
      ]),
    );
    for (const c of universe.filter((c) => c.emissions_tier === "estimated")) {
      expect(c.carbon_intensity_tco2e_per_musd, c.ticker).toBeCloseTo(bySector.get(c.sector)!, 3);
    }
  });

  it("has both tiers well represented", () => {
    const reported = universe.filter((c) => c.emissions_tier === "reported").length;
    expect(reported).toBeGreaterThanOrEqual(25);
    expect(universe.length - reported).toBeGreaterThan(10);
  });

  it("recorded no dropped tickers in the build", () => {
    expect(reference.excluded).toEqual([]);
    expect(reference.company_count).toBe(universe.length);
  });
});

describe("demo portfolio against the real universe", () => {
  const parsed = parsePortfolioCsv(demoCsv);

  it("parses cleanly", () => {
    expect(parsed.errors).toEqual([]);
    expect(parsed.positions.length).toBeGreaterThanOrEqual(20);
  });

  it("resolves every demo holding — the demo must never show an exclusion banner", () => {
    const r = computePortfolio(parsed.positions, universe);
    expect(r.excluded).toEqual([]);
    expect(r.holdings).toHaveLength(parsed.positions.length);
  });

  it("produces finite, self-consistent headline figures", () => {
    const r = computePortfolio(parsed.positions, universe);

    expect(r.holdings.reduce((s, h) => s + h.weight, 0)).toBeCloseTo(1, 10);
    expect(r.holdings.reduce((s, h) => s + h.waciContribution, 0)).toBeCloseTo(r.waci, 8);
    expect(r.sectorBreakdown.reduce((s, x) => s + x.financedEmissionsScope12, 0)).toBeCloseTo(
      r.financedEmissionsScope12,
      6,
    );
    expect(r.sectorBreakdown.reduce((s, x) => s + x.shareOfEmissions, 0)).toBeCloseTo(1, 10);

    for (const v of [r.waci, r.financedEmissionsScope12, r.economicEmissionsIntensity]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
    expect(r.dataQualityScoreByValue).toBeGreaterThanOrEqual(1);
    expect(r.dataQualityScoreByValue).toBeLessThanOrEqual(5);
    expect(r.dataQualityScoreByEmissions).toBeGreaterThanOrEqual(1);
    expect(r.dataQualityScoreByEmissions).toBeLessThanOrEqual(5);
  });

  it("keeps every attribution factor well below 1 — no position implies owning the issuer", () => {
    const r = computePortfolio(parsed.positions, universe);
    for (const h of r.holdings) {
      expect(h.attributionFactor, h.company.ticker).toBeGreaterThan(0);
      expect(h.attributionFactor, h.company.ticker).toBeLessThan(1);
    }
  });

  it("spans BOTH emissions tiers — the demo must actually demonstrate the tiering", () => {
    // Regression guard: an all-reported demo portfolio renders a data-quality
    // heatmap with a single occupied column and hides the point of the app.
    const r = computePortfolio(parsed.positions, universe);
    expect(r.tierBreakdown.reported.count).toBeGreaterThan(0);
    expect(r.tierBreakdown.estimated.count).toBeGreaterThan(0);
    expect(r.tierBreakdown.estimated.weight).toBeGreaterThan(0.1);
    expect(r.tierBreakdown.reported.weight).toBeGreaterThan(0.3);
    expect(r.dataQualityScoreByValue).toBeGreaterThan(2);
    expect(r.dataQualityScoreByValue).toBeLessThan(5);
  });

  it("spans every GICS sector so the waterfall is not degenerate", () => {
    const r = computePortfolio(parsed.positions, universe);
    expect(r.sectorBreakdown.length).toBe(reference.sector_intensity.length);
  });

  it("has utilities and energy dominating financed emissions, as the methodology implies", () => {
    const r = computePortfolio(parsed.positions, universe);
    const top2 = r.sectorBreakdown.slice(0, 2).map((s) => s.sector);
    expect(top2).toContain("Utilities");
    expect(top2).toContain("Energy");
  });
});

describe("cap-weighted benchmark against the real universe", () => {
  it("spans the whole universe and matches the requested notional", () => {
    const bench = buildCapWeightedBenchmark(universe, 71_800_000);
    expect(bench).toHaveLength(universe.length);
    expect(bench.reduce((s, p) => s + p.marketValueUsd, 0)).toBeCloseTo(71_800_000, 2);

    const r = computePortfolio(bench, universe);
    expect(r.excluded).toEqual([]);
    expect(r.waci).toBeGreaterThan(0);
    expect(Number.isFinite(r.waci)).toBe(true);
  });

  it("gives a WACI within the range of its constituent intensities", () => {
    const r = computePortfolio(buildCapWeightedBenchmark(universe, 1e6), universe);
    const intensities = universe.map((c) => c.carbon_intensity_tco2e_per_musd);
    expect(r.waci).toBeGreaterThan(Math.min(...intensities));
    expect(r.waci).toBeLessThan(Math.max(...intensities));
  });
});
