/**
 * Tests for the React Native port of the formatter.
 *
 * The web build resolved data-quality colours through CSS custom properties and
 * blended them with `color-mix()`. Neither exists in React Native, so both were
 * reimplemented — and a blend that silently returned a non-colour string would
 * render as a transparent cell rather than throwing. These tests exist mainly to
 * pin that down.
 */

import { describe, it, expect } from "vitest";

import {
  DQ_COLORS,
  axisTick,
  dqColorContinuous,
  formatAttribution,
  formatEmissions,
  formatIntensity,
  formatPct,
  formatUsd,
  niceCeil,
  sectorColor,
  shortSector,
} from "./format";

const HEX = /^#[0-9a-f]{6}$/;

describe("emissions formatting", () => {
  it("scales across the seven orders of magnitude emissions actually span", () => {
    expect(formatEmissions(0.5)).toBe("0.50");
    expect(formatEmissions(1_240)).toBe("1,240");
    expect(formatEmissions(18_300)).toBe("18.3k");
    expect(formatEmissions(4_210_000)).toBe("4.21M");
    expect(formatEmissions(2_500_000_000)).toBe("2.50bn");
  });
});

describe("usd formatting", () => {
  it("picks a unit per magnitude", () => {
    expect(formatUsd(950)).toBe("$950");
    expect(formatUsd(9_200_000)).toBe("$9.20M");
    expect(formatUsd(1_340_000_000)).toBe("$1.34bn");
    expect(formatUsd(3_506_000_000_000)).toBe("$3.51tn");
  });
});

describe("attribution formatting", () => {
  it("uses basis points, then parts per million as factors get smaller", () => {
    expect(formatAttribution(0.0001)).toBe("1.00 bp");
    // 5e-6 is 0.05 bp, which would round to "0.05 bp" — ppm reads better.
    expect(formatAttribution(0.000005)).toBe("5.0 ppm");
  });
});

describe("percent and intensity", () => {
  it("formats percentages from fractions", () => {
    expect(formatPct(0.1234)).toBe("12.3%");
    expect(formatPct(0.1234, 0)).toBe("12%");
  });

  it("shows more decimals as intensity gets smaller", () => {
    expect(formatIntensity(2100)).toBe("2,100");
    expect(formatIntensity(30.5)).toBe("30.5");
    expect(formatIntensity(1.234)).toBe("1.23");
  });
});

describe("data quality colours", () => {
  it("has a colour for every point on the PCAF scale", () => {
    for (const score of [1, 2, 3, 4, 5]) {
      expect(DQ_COLORS[score]).toMatch(HEX);
    }
  });

  it("returns the exact scale colour on whole scores", () => {
    expect(dqColorContinuous(1)).toBe(DQ_COLORS[1]);
    expect(dqColorContinuous(5)).toBe(DQ_COLORS[5]);
  });

  it("blends to a real hex colour between scores", () => {
    // The portfolio-level score is a weighted average, so it is almost never a
    // whole number — this is the case that actually renders in the app.
    const blended = dqColorContinuous(4.31);
    expect(blended).toMatch(HEX);
    expect(blended).not.toBe(DQ_COLORS[4]);
    expect(blended).not.toBe(DQ_COLORS[5]);
  });

  it("blends monotonically towards the higher score", () => {
    // Measured as distance to the endpoint colour, not as any single channel:
    // DQ 4 (orange) actually has a *higher* red channel than DQ 5 (red), so a
    // per-channel assertion would test the palette rather than the blend.
    const rgb = (hex: string) =>
      [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
    const distanceTo5 = (hex: string) => {
      const [r, g, b] = rgb(hex);
      const [r5, g5, b5] = rgb(DQ_COLORS[5]);
      return Math.hypot(r - r5, g - g5, b - b5);
    };

    const steps = [4.0, 4.25, 4.5, 4.75, 5.0].map((s) => distanceTo5(dqColorContinuous(s)));
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]).toBeLessThan(steps[i - 1]);
    }
    expect(steps[steps.length - 1]).toBe(0);
  });

  it("clamps out-of-range scores rather than producing NaN colours", () => {
    expect(dqColorContinuous(0)).toMatch(HEX);
    expect(dqColorContinuous(9)).toMatch(HEX);
    expect(dqColorContinuous(-3)).toMatch(HEX);
  });
});

describe("sector colours", () => {
  it("returns a hex colour for every GICS sector, and for unknown ones", () => {
    expect(sectorColor("Utilities")).toMatch(HEX);
    expect(sectorColor("Information Technology")).toMatch(HEX);
    // The web build fell back to a CSS variable here, which would not render.
    expect(sectorColor("Not A Sector")).toMatch(HEX);
  });

  it("abbreviates only the sector names too long for a chart gutter", () => {
    expect(shortSector("Consumer Discretionary")).toBe("Cons. Discretionary");
    expect(shortSector("Energy")).toBe("Energy");
  });
});

describe("axis helpers", () => {
  it("rounds an axis maximum up to a readable number", () => {
    expect(niceCeil(3_283)).toBe(4_000);
    expect(niceCeil(0.42)).toBe(0.5);
    expect(niceCeil(0)).toBe(1);
    expect(niceCeil(-5)).toBe(1);
  });

  it("formats ticks consistently across an axis", () => {
    expect(axisTick(0)).toBe("0");
    expect(axisTick(25_000)).toBe("25k");
    expect(axisTick(1_500_000)).toBe("1.5M");
  });
});
