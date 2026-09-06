/**
 * Display formatting. Kept out of the calculation module on purpose.
 *
 * React Native port: the web build resolved colours through CSS custom
 * properties and blended them with `color-mix()`. Neither exists here, so the
 * palette is literal hex and the blend is done in JS.
 */

const nf = (min: number, max: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: min, maximumFractionDigits: max });

/** Compact tCO2e: 1,240 / 18.3k / 4.21M. Emissions span seven orders of magnitude. */
export function formatEmissions(t: number): string {
  const abs = Math.abs(t);
  if (abs >= 1e9) return `${nf(2, 2).format(t / 1e9)}bn`;
  if (abs >= 1e6) return `${nf(2, 2).format(t / 1e6)}M`;
  if (abs >= 1e4) return `${nf(1, 1).format(t / 1e3)}k`;
  if (abs >= 1) return nf(0, 0).format(t);
  return nf(2, 2).format(t);
}

/** Full precision with separators, for detail rows. */
export function formatExact(t: number, dp = 0): string {
  return nf(dp, dp).format(t);
}

/** Compact USD: $9.20M / $1.34bn. */
export function formatUsd(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e12) return `$${nf(2, 2).format(v / 1e12)}tn`;
  if (abs >= 1e9) return `$${nf(2, 2).format(v / 1e9)}bn`;
  if (abs >= 1e6) return `$${nf(2, 2).format(v / 1e6)}M`;
  if (abs >= 1e3) return `$${nf(1, 1).format(v / 1e3)}k`;
  return `$${nf(0, 0).format(v)}`;
}

export function formatUsdExact(v: number): string {
  return `$${nf(0, 0).format(v)}`;
}

export function formatPct(fraction: number, dp = 1): string {
  return `${nf(dp, dp).format(fraction * 100)}%`;
}

/**
 * Attribution factors are tiny (1e-4 to 1e-7). Percentages round to zero and
 * decimals are unreadable, so show basis points of the issuer's EVIC — the unit
 * a credit or ESG analyst would actually use.
 */
export function formatAttribution(af: number): string {
  const bps = af * 10_000;
  if (bps >= 1) return `${nf(2, 2).format(bps)} bp`;
  return `${nf(1, 1).format(af * 1e6)} ppm`;
}

export function formatIntensity(v: number): string {
  if (v >= 100) return nf(0, 0).format(v);
  if (v >= 10) return nf(1, 1).format(v);
  return nf(2, 2).format(v);
}

/**
 * PCAF data-quality palette, 1 (best) to 5 (worst).
 * Green→red, desaturated to sit alongside the sector palette without shouting.
 */
export const DQ_COLORS: Record<number, string> = {
  1: "#3f9d6f",
  2: "#7fa64d",
  3: "#d8a13a",
  4: "#e08a3c",
  5: "#c85440",
};

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
};

const rgbToHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, "0")).join("")}`;

/** Blend the discrete 1–5 scale for a fractional weighted-average score. */
export function dqColorContinuous(score: number): string {
  const lo = Math.max(1, Math.min(5, Math.floor(score)));
  const hi = Math.max(1, Math.min(5, Math.ceil(score)));
  if (lo === hi) return DQ_COLORS[lo];
  const t = score - lo;
  const [r1, g1, b1] = hexToRgb(DQ_COLORS[lo]);
  const [r2, g2, b2] = hexToRgb(DQ_COLORS[hi]);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

export const SECTOR_COLORS: Record<string, string> = {
  Utilities: "#c85440",
  Energy: "#e08a3c",
  Materials: "#d8a13a",
  Industrials: "#b0894a",
  "Consumer Staples": "#7f9a52",
  "Consumer Discretionary": "#4f9e7a",
  "Health Care": "#3f9d96",
  "Information Technology": "#4283ab",
  "Communication Services": "#5c6fae",
  Financials: "#7d63a8",
  "Real Estate": "#a15f96",
};

/** Fallback is a neutral grey rather than a CSS variable. */
export const sectorColor = (s: string) => SECTOR_COLORS[s] ?? "#8a8a8e";

/**
 * Round an axis maximum up to a clean value, so the last tick on a chart is a
 * readable number rather than the padded data maximum.
 *
 * The ladder includes 3 and 4 as well as the usual 1/2/2.5/5/10: with only the
 * coarse steps, a total of 3,283 rounds to an axis of 5,000 and the longest bar
 * fills two thirds of the plot.
 */
const NICE_STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

export function niceCeil(v: number): number {
  if (!(v > 0)) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  const norm = v / mag;
  const step = NICE_STEPS.find((s) => norm <= s + 1e-9) ?? 10;
  return step * mag;
}

/** Axis ticks: one consistent format across the whole axis, unlike per-value formatters. */
export function axisTick(v: number): string {
  const abs = Math.abs(v);
  if (abs === 0) return "0";
  if (abs >= 1e9) return `${nf(0, 1).format(v / 1e9)}bn`;
  if (abs >= 1e6) return `${nf(0, 1).format(v / 1e6)}M`;
  if (abs >= 1e4) return `${nf(0, 0).format(v / 1e3)}k`;
  if (abs >= 1) return nf(0, 0).format(v);
  return nf(0, 2).format(v);
}

/**
 * Axis-length sector labels. Three GICS names are long enough to wrap a chart's
 * category gutter; abbreviating them beats widening the gutter or shrinking the
 * type. Full names stay in detail rows and legends.
 */
const SECTOR_SHORT: Record<string, string> = {
  "Consumer Discretionary": "Cons. Discretionary",
  "Communication Services": "Comm. Services",
  "Information Technology": "Info Technology",
  "Consumer Staples": "Cons. Staples",
};

export const shortSector = (s: string) => SECTOR_SHORT[s] ?? s;
