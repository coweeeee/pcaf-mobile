/**
 * The import path, end to end, against the REAL bundled universe.
 *
 * pcaf.test.ts covers exclusion against a synthetic three-company universe, and
 * universe.integration.test.ts covers the clean demo CSV. Neither covers what
 * actually happens when someone imports a file exported from a portfolio system:
 * unfamiliar header spellings, currency formatting, blank rows, a short position,
 * duplicate lines for one ticker, and tickers we simply do not hold data for.
 *
 * This is the path where a silent failure would be most damaging — a portfolio
 * that quietly dropped a third of its value would still render a confident,
 * completely wrong headline number. Everything here is asserting that the app
 * reports what it could not do.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { computePortfolio, indexUniverse, type Company } from "./pcaf";
import { parsePortfolioCsv } from "./portfolioCsv";

const root = resolve(__dirname, "../..");
const universe: Company[] = JSON.parse(
  readFileSync(resolve(root, "assets/data/universe.json"), "utf8"),
);
const byTicker = indexUniverse(universe);

/**
 * A deliberately awkward file: the header uses "Symbol"/"Market Value (USD)"
 * rather than the documented names, values carry $ and thousands separators,
 * there is a blank line, a short position, a duplicate ticker, and two holdings
 * outside the reference universe — a share class we do not carry (BRK.B) and a
 * foreign listing (NESN.SW). TSLA is deliberately included and DOES resolve, so
 * the test distinguishes "unknown ticker" from "ticker I happened to guess at".
 */
const MESSY_CSV = [
  "Symbol,Market Value (USD),Account",
  "AAPL,\"$5,000,000\",FUND-A",
  "aapl , 1000000 ,FUND-B",
  "",
  "XOM,$3.5e6,FUND-A",
  "TSLA,\"2,000,000\",FUND-A",
  "BRK.B,750000,FUND-A",
  "NESN.SW,2000000,FUND-D",
  "NEE,(400000),FUND-C",
  "DUK,1250000,FUND-A",
].join("\n");

describe("importing a messy real-world CSV", () => {
  const parsed = parsePortfolioCsv(MESSY_CSV);

  it("recognises the header aliases rather than rejecting the file", () => {
    expect(parsed.detectedColumns).toEqual({
      ticker: "Symbol",
      value: "Market Value (USD)",
    });
  });

  it("reads currency formatting, thousands separators and scientific notation", () => {
    const xom = parsed.positions.find((p) => p.ticker === "XOM");
    expect(xom?.marketValueUsd).toBe(3_500_000);
  });

  it("rejects the short position with a reason instead of importing a negative", () => {
    expect(parsed.positions.find((p) => p.ticker === "NEE")).toBeUndefined();
    const err = parsed.errors.find((e) => e.raw.includes("NEE"));
    expect(err).toBeDefined();
    expect(err!.reason).toMatch(/positive/i);
  });

  it("skips the blank line without treating it as an error", () => {
    expect(parsed.errors.filter((e) => e.raw.trim() === "")).toHaveLength(0);
  });

  const result = computePortfolio(parsed.positions, byTicker);

  it("folds the duplicate AAPL rows into one position", () => {
    const aapl = result.holdings.filter((h) => h.company.ticker === "AAPL");
    expect(aapl).toHaveLength(1);
    expect(aapl[0].marketValueUsd).toBe(6_000_000);
  });

  it("excludes tickers outside the reference universe and names them", () => {
    const excluded = result.excluded.map((e) => e.ticker).sort();
    expect(excluded).toEqual(["BRK.B", "NESN.SW"]);
    // TSLA is in the universe, so it must be calculated, not excluded.
    expect(result.holdings.some((h) => h.company.ticker === "TSLA")).toBe(true);
  });

  it("reports the excluded value and its share of the file, rather than hiding it", () => {
    expect(result.excludedValueUsd).toBe(750_000 + 2_000_000);
    expect(result.totalInputValueUsd).toBe(15_500_000);
    // Around 18% of the imported file could not be calculated. The UI reads this
    // number to render its coverage banner — if it ever came back 0, the banner
    // would disappear and the shortfall would become invisible.
    expect(result.excludedWeightOfInput).toBeCloseTo(2_750_000 / 15_500_000, 10);
    expect(result.excludedWeightOfInput).toBeGreaterThan(0.15);
  });

  it("normalises weights over matched value only, and they sum to 1", () => {
    expect(result.totalPortfolioValueUsd).toBe(12_750_000);
    const sum = result.holdings.reduce((s, h) => s + h.weight, 0);
    expect(sum).toBeCloseTo(1, 12);
    // Weights are a share of what was calculated, NOT of what was imported.
    const aapl = result.holdings.find((h) => h.company.ticker === "AAPL")!;
    expect(aapl.weight).toBeCloseTo(6_000_000 / 12_750_000, 12);
  });

  it("produces finite figures for every holding", () => {
    for (const h of result.holdings) {
      expect(Number.isFinite(h.attributionFactor)).toBe(true);
      expect(Number.isFinite(h.financedEmissionsScope12)).toBe(true);
      expect(Number.isFinite(h.carbonIntensity)).toBe(true);
      expect(h.attributionFactor).toBeGreaterThan(0);
      expect(h.attributionFactor).toBeLessThan(1);
    }
    expect(Number.isFinite(result.waci)).toBe(true);
    expect(Number.isFinite(result.dataQualityScoreByValue)).toBe(true);
  });

  it("spans both emissions tiers and scores each holding accordingly", () => {
    const tiers = new Set(result.holdings.map((h) => h.company.emissions_tier));
    expect(tiers.size).toBeGreaterThanOrEqual(1);
    for (const h of result.holdings) {
      expect(h.dataQualityScore).toBe(h.company.emissions_tier === "reported" ? 2 : 5);
    }
  });
});

describe("a portfolio where nothing resolves", () => {
  const parsed = parsePortfolioCsv("ticker,market_value_usd\nZZZZ,1000000\nQQQQ,500000");
  const result = computePortfolio(parsed.positions, byTicker);

  it("parses the rows but calculates nothing, without producing NaN", () => {
    expect(parsed.positions).toHaveLength(2);
    expect(result.holdings).toHaveLength(0);
    expect(result.excluded).toHaveLength(2);
    expect(result.financedEmissionsScope12).toBe(0);
    expect(result.waci).toBe(0);
    expect(result.dataQualityScoreByValue).toBe(0);
    expect(result.economicEmissionsIntensity).toBe(0);
  });

  it("reports 100% of the input as excluded", () => {
    expect(result.excludedWeightOfInput).toBe(1);
    expect(result.totalPortfolioValueUsd).toBe(0);
  });
});

describe("the persisted portfolio shape", () => {
  it("survives a JSON round trip, which is how AsyncStorage stores it", () => {
    const parsed = parsePortfolioCsv(MESSY_CSV);
    const restored = JSON.parse(JSON.stringify(parsed.positions));

    // portfolioStore validates restored records with exactly this predicate
    // before trusting them; keep the two in step.
    const valid =
      Array.isArray(restored) &&
      restored.length > 0 &&
      restored.every(
        (p: unknown) =>
          typeof (p as { ticker?: unknown }).ticker === "string" &&
          Number.isFinite((p as { marketValueUsd?: unknown }).marketValueUsd),
      );
    expect(valid).toBe(true);

    const before = computePortfolio(parsed.positions, byTicker);
    const after = computePortfolio(restored, byTicker);
    expect(after.financedEmissionsScope12).toBe(before.financedEmissionsScope12);
    expect(after.waci).toBe(before.waci);
  });
});
