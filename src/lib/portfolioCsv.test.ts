import { describe, it, expect } from "vitest";
import { parseMoney, parsePortfolioCsv } from "./portfolioCsv";

describe("parseMoney", () => {
  it("reads plain and formatted numbers", () => {
    expect(parseMoney("1234567")).toBe(1234567);
    expect(parseMoney("$1,234,567.89")).toBeCloseTo(1234567.89, 6);
    expect(parseMoney(" 1 234 567 ")).toBe(1234567);
    expect(parseMoney("1.2e6")).toBe(1200000);
    expect(parseMoney("€500")).toBe(500);
  });

  it("reads accounting-style parentheses as negative", () => {
    expect(parseMoney("(500)")).toBe(-500);
    expect(parseMoney("-500")).toBe(-500);
  });

  it("returns null for anything that is not a number", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("n/a")).toBeNull();
    expect(parseMoney("--")).toBeNull();
    expect(parseMoney("12abc")).toBeNull();
  });
});

describe("parsePortfolioCsv", () => {
  it("parses the documented schema", () => {
    const r = parsePortfolioCsv("ticker,market_value_usd\nAAPL,1000000\nMSFT,2000000\n");
    expect(r.errors).toEqual([]);
    expect(r.positions).toEqual([
      { ticker: "AAPL", marketValueUsd: 1000000 },
      { ticker: "MSFT", marketValueUsd: 2000000 },
    ]);
    expect(r.detectedColumns).toEqual({ ticker: "ticker", value: "market_value_usd" });
  });

  it("accepts common header aliases and extra columns in any order", () => {
    const r = parsePortfolioCsv("Account,Market Value,Symbol\nX,\"$1,500,000\",aapl\n");
    expect(r.errors).toEqual([]);
    expect(r.positions).toEqual([{ ticker: "AAPL", marketValueUsd: 1500000 }]);
  });

  it("handles a UTF-8 BOM and CRLF line endings", () => {
    const r = parsePortfolioCsv("﻿ticker,market_value_usd\r\nAAPL,1000\r\n");
    expect(r.errors).toEqual([]);
    expect(r.positions).toEqual([{ ticker: "AAPL", marketValueUsd: 1000 }]);
  });

  it("handles quoted fields containing commas", () => {
    const r = parsePortfolioCsv('ticker,name,market_value_usd\nAAPL,"Apple, Inc.",1000\n');
    expect(r.errors).toEqual([]);
    expect(r.positions).toEqual([{ ticker: "AAPL", marketValueUsd: 1000 }]);
  });

  it("falls back to positional columns when there is no header", () => {
    const r = parsePortfolioCsv("AAPL,1000000\nMSFT,2000000\n");
    expect(r.positions).toHaveLength(2);
    expect(r.detectedColumns).toEqual({ ticker: "column 1", value: "column 2" });
  });

  it("reports a header it cannot understand rather than guessing", () => {
    const r = parsePortfolioCsv("foo,bar\nAAPL,1000\n");
    expect(r.positions).toEqual([]);
    expect(r.errors[0].reason).toMatch(/Could not find a ticker column/);
  });

  it("rejects bad rows individually and keeps the good ones", () => {
    const r = parsePortfolioCsv(
      "ticker,market_value_usd\nAAPL,1000\n,5000\nMSFT,n/a\nGOOGL,0\nAMZN,-100\nNVDA,2000\n",
    );
    expect(r.positions).toEqual([
      { ticker: "AAPL", marketValueUsd: 1000 },
      { ticker: "NVDA", marketValueUsd: 2000 },
    ]);
    expect(r.errors.map((e) => e.line)).toEqual([3, 4, 5, 6]);
    expect(r.errors[3].reason).toMatch(/Short positions/);
  });

  it("flags a value that cannot be read instead of defaulting it to zero", () => {
    const r = parsePortfolioCsv("ticker,market_value_usd\nAAPL,TBD\n");
    expect(r.positions).toEqual([]);
    expect(r.errors[0].reason).toMatch(/Could not read "TBD"/);
  });

  it("reports an empty file", () => {
    expect(parsePortfolioCsv("").errors[0].reason).toMatch(/empty/i);
    expect(parsePortfolioCsv("   \n \n").errors[0].reason).toMatch(/empty/i);
  });

  it("reports a header with no data rows", () => {
    const r = parsePortfolioCsv("ticker,market_value_usd\n");
    expect(r.errors[0].reason).toMatch(/No data rows/);
  });

  it("skips fully blank rows without raising an error", () => {
    const r = parsePortfolioCsv("ticker,market_value_usd\nAAPL,1000\n,\nMSFT,2000\n");
    expect(r.positions).toHaveLength(2);
    expect(r.errors).toEqual([]);
  });
});
