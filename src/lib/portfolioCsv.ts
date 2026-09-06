/**
 * Tolerant CSV parsing for the portfolio upload.
 *
 * Accepts the documented schema — `ticker, market_value_usd` — plus the header
 * spellings people actually paste out of a portfolio system. Bad rows are
 * reported individually rather than failing the whole file, and nothing is
 * silently coerced: a row whose value cannot be read as a positive number is
 * rejected with the reason, not defaulted to zero.
 */

import type { Position } from "./pcaf";

export interface CsvRowError {
  line: number;
  raw: string;
  reason: string;
}

export interface ParseResult {
  positions: Position[];
  errors: CsvRowError[];
  /** Header cells as detected, for the "we read your file like this" hint. */
  detectedColumns: { ticker: string; value: string } | null;
}

const TICKER_ALIASES = ["ticker", "symbol", "security", "identifier", "ric", "instrument"];
const VALUE_ALIASES = [
  "market_value_usd",
  "market_value",
  "marketvalue",
  "market value (usd)",
  "market value",
  "value_usd",
  "value",
  "mv",
  "position_value",
  "exposure",
  "amount",
];

/** Split one CSV line, honouring double-quoted fields with embedded commas. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const norm = (s: string) => s.trim().toLowerCase().replace(/^﻿/, "");

/**
 * Read a currency-ish string as a number.
 * Handles "$1,234,567.89", "1 234 567", "(500)" for negatives, and "1.2e6".
 * Returns null when the string carries no usable numeric content.
 */
export function parseMoney(raw: string): number | null {
  let s = raw.trim().replace(/^﻿/, "");
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[$£€\s,_]/g, "");
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  if (!/^\d*\.?\d+(e[+-]?\d+)?$/i.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

export function parsePortfolioCsv(text: string): ParseResult {
  const errors: CsvRowError[] = [];
  const positions: Position[] = [];

  const lines = text
    .split(/\r\n|\n|\r/)
    .map((l, i) => ({ raw: l, line: i + 1 }))
    .filter((l) => l.raw.trim().length > 0);

  if (lines.length === 0) {
    return { positions, errors: [{ line: 0, raw: "", reason: "The file is empty." }], detectedColumns: null };
  }

  const headerCells = splitCsvLine(lines[0].raw);
  const headerNorm = headerCells.map(norm);

  let tickerIdx = headerNorm.findIndex((h) => TICKER_ALIASES.includes(h));
  let valueIdx = headerNorm.findIndex((h) => VALUE_ALIASES.includes(h));

  let bodyStart = 1;
  let detectedColumns: ParseResult["detectedColumns"] = null;

  if (tickerIdx === -1 || valueIdx === -1) {
    // No recognisable header. Fall back to positional (col 0 = ticker, col 1 =
    // value) but only if the first row parses as data — otherwise it is a header
    // we do not understand, and we say so rather than guessing.
    const looksLikeData = headerCells.length >= 2 && parseMoney(headerCells[1]) !== null;
    if (!looksLikeData) {
      return {
        positions,
        errors: [
          {
            line: 1,
            raw: lines[0].raw,
            reason:
              "Could not find a ticker column and a market-value column. Expected a header row like: ticker,market_value_usd",
          },
        ],
        detectedColumns: null,
      };
    }
    tickerIdx = 0;
    valueIdx = 1;
    bodyStart = 0;
    detectedColumns = { ticker: "column 1", value: "column 2" };
  } else {
    detectedColumns = { ticker: headerCells[tickerIdx], value: headerCells[valueIdx] };
  }

  for (let i = bodyStart; i < lines.length; i++) {
    const { raw, line } = lines[i];
    const cells = splitCsvLine(raw);

    const tickerRaw = (cells[tickerIdx] ?? "").trim();
    const valueRaw = (cells[valueIdx] ?? "").trim();

    if (!tickerRaw && !valueRaw) continue;

    if (!tickerRaw) {
      errors.push({ line, raw, reason: "No ticker in this row." });
      continue;
    }
    const ticker = tickerRaw.toUpperCase().replace(/^["']|["']$/g, "");
    if (!/^[A-Z0-9][A-Z0-9.\-]{0,11}$/.test(ticker)) {
      errors.push({ line, raw, reason: `"${tickerRaw}" does not look like a ticker.` });
      continue;
    }

    const value = parseMoney(valueRaw);
    if (value === null) {
      errors.push({ line, raw, reason: `Could not read "${valueRaw}" as a market value.` });
      continue;
    }
    if (value <= 0) {
      errors.push({
        line,
        raw,
        reason: `Market value must be positive; got ${value}. Short positions are outside PCAF's listed-equity scope.`,
      });
      continue;
    }

    positions.push({ ticker, marketValueUsd: value });
  }

  if (positions.length === 0 && errors.length === 0) {
    errors.push({ line: 0, raw: "", reason: "No data rows found below the header." });
  }

  return { positions, errors, detectedColumns };
}
