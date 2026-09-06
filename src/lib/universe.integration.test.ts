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

  it("maps every emissions source to the PCAF score the methodology requires", () => {
    for (const c of universe) {
      if (c.emissions_source === "sector_proxy") {
        // Sector-average economic data is level 5 by definition.
        expect(c.data_quality_score, c.ticker).toBe(5);
        expect(c.emissions_match_confidence, c.ticker).toBe("n/a");
        expect(c.emissions_vintage, c.ticker).toBeNull();
      } else {
        // Facility/reported activity data: 3 at high entity-match confidence,
        // 4 when the match was weaker.
        expect(["climatetrace", "epa_ghgrp"], c.ticker).toContain(c.emissions_source);
        expect(c.data_quality_score, c.ticker).toBe(
          c.emissions_match_confidence === "high" ? 3 : 4,
        );
        expect(c.emissions_vintage, c.ticker).toBeTruthy();
      }
    }
  });

  it("derives every sector-proxy figure from the published sector intensity", () => {
    const bySector = new Map<string, number>(
      reference.sector_intensity.map((s: { sector: string; avg_intensity_tco2e_per_musd_revenue: number }) => [
        s.sector,
        s.avg_intensity_tco2e_per_musd_revenue,
      ]),
    );
    for (const c of universe.filter((c) => c.emissions_source === "sector_proxy")) {
      expect(c.carbon_intensity_tco2e_per_musd, c.ticker).toBeCloseTo(bySector.get(c.sector)!, 3);
    }
  });

  it("carries full provenance on every record", () => {
    for (const c of universe) {
      expect(c.cik, c.ticker).toMatch(/^\d{10}$/);
      expect(["high", "medium", "low"], c.ticker).toContain(c.financials_confidence);
      // Revenue is the WACI denominator; a null vintage would mean we cannot say
      // what period the figure describes.
      expect(c.financials_vintage, c.ticker).toBeTruthy();
      expect(c.market_cap_basis, c.ticker).toBeTruthy();
    }
  });

  it("never keeps a facility rollup below the coverage guard", () => {
    const threshold = reference.coverage_guard.reject_below_ratio;
    for (const c of universe.filter((c) => c.emissions_source !== "sector_proxy")) {
      // A kept rollup must have cleared the guard. This is the invariant that
      // stops a partial rollup being published as a total.
      expect(c.emissions_coverage_ratio, c.ticker).not.toBeNull();
      expect(c.emissions_coverage_ratio!, c.ticker).toBeGreaterThanOrEqual(threshold);
    }
    for (const r of reference.coverage_guard.rejected) {
      expect(r.ratio, r.ticker).toBeLessThan(threshold);
    }
  });

  it("has measured facility data for at least the big generators", () => {
    const measured = universe.filter((c) => c.emissions_source !== "sector_proxy");
    expect(measured.length).toBeGreaterThanOrEqual(15);
    // Utilities are the sector Climate TRACE ownership actually covers well; if
    // none of them resolved, entity resolution has silently broken.
    const utilities = measured.filter((c) => c.sector === "Utilities");
    expect(utilities.length).toBeGreaterThanOrEqual(10);
  });

  it("accounts for every dropped ticker with a reason", () => {
    // Dropping is allowed — a filer with no usable XBRL revenue has no WACI
    // denominator — but it must be recorded, never silent.
    for (const e of reference.excluded) {
      expect(e.ticker).toBeTruthy();
      expect(e.reason.length).toBeGreaterThan(5);
    }
    expect(reference.excluded.length).toBeLessThan(20);
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

  it("spans more than one emissions source — the demo must demonstrate the tiering", () => {
    // Regression guard: a single-source demo portfolio renders a data-quality
    // heatmap with one occupied column and hides the point of the app.
    const r = computePortfolio(parsed.positions, universe);
    expect(r.sourceBreakdown.climatetrace.count).toBeGreaterThan(0);
    expect(r.sourceBreakdown.sector_proxy.count).toBeGreaterThan(0);
    expect(r.dataQualityScoreByValue).toBeGreaterThan(3);
    expect(r.dataQualityScoreByValue).toBeLessThanOrEqual(5);
  });

  it("carries most of its VALUE on estimates but most of its EMISSIONS on measured data", () => {
    // This inversion is the single most important thing the demo shows, and it
    // is a property of the real world rather than of the portfolio: mega-cap
    // tech and banks dominate market value but have no facility footprint, while
    // the two utilities carry a small weight and most of the financed tonnes.
    //
    // It is also why the app reports data quality weighted BOTH ways. Weighted
    // by value the portfolio looks almost entirely estimated; weighted by
    // financed emissions it looks far better, because the tonnes that actually
    // matter are the ones sitting on measured facility data.
    const r = computePortfolio(parsed.positions, universe);
    const measuredWeight =
      r.sourceBreakdown.climatetrace.weight + r.sourceBreakdown.epa_ghgrp.weight;
    const measuredEmissions =
      (r.sourceBreakdown.climatetrace.financedEmissionsScope12 +
        r.sourceBreakdown.epa_ghgrp.financedEmissionsScope12) /
      r.financedEmissionsScope12;

    expect(measuredWeight).toBeLessThan(0.25);
    expect(measuredEmissions).toBeGreaterThan(measuredWeight);
    expect(r.dataQualityScoreByEmissions).toBeLessThan(r.dataQualityScoreByValue);
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
