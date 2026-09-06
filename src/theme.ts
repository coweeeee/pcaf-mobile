/**
 * Design system.
 *
 * Deliberately small: a colour set that resolves per scheme, an 8pt-derived
 * spacing scale, and a type scale mapped onto the iOS text styles. Everything
 * in the app pulls from here so a change lands everywhere at once.
 *
 * Colours follow Apple's semantic naming (systemBackground / secondary /
 * grouped) rather than inventing a parallel vocabulary, because the layouts are
 * built to look native on iOS. Values are taken from the iOS system palette so
 * the app sits correctly next to Settings and Mail in both schemes.
 */

import { Platform, type TextStyle, type ViewStyle } from "react-native";

export interface Palette {
  /** Page background behind a grouped list — the canvas of every screen. */
  bg: string;
  /** Card / grouped-cell fill that sits on `bg`. */
  surface: string;
  /** A raised fill inside a card (chart plot areas, table headers). */
  surfaceAlt: string;
  /** Hairline separators. */
  border: string;
  /** Primary reading text. */
  text: string;
  /** Labels, secondary values. */
  textSecondary: string;
  /** Captions, footnotes, axis ticks. */
  textTertiary: string;
  /** Accent — links, active tab, primary action. */
  accent: string;
  accentSoft: string;
  /** Semantic states. */
  warning: string;
  danger: string;
  success: string;
  /** Chart ink for the portfolio series (benchmark uses textTertiary). */
  series: string;
  seriesBenchmark: string;
}

const light: Palette = {
  bg: "#f2f2f7",
  surface: "#ffffff",
  surfaceAlt: "#f7f7fa",
  border: "#d8d8dd",
  text: "#1c1c1e",
  textSecondary: "#5b5b60",
  textTertiary: "#8a8a8e",
  accent: "#0a6b5d",
  accentSoft: "#e3f1ee",
  warning: "#b06d1a",
  danger: "#c0392b",
  success: "#2f8f5b",
  series: "#0a6b5d",
  seriesBenchmark: "#a9a9b0",
};

const dark: Palette = {
  bg: "#000000",
  surface: "#1c1c1e",
  surfaceAlt: "#2c2c2e",
  border: "#39393d",
  text: "#f2f2f7",
  textSecondary: "#a4a4ab",
  textTertiary: "#7c7c82",
  accent: "#3fbfa4",
  accentSoft: "#12332e",
  warning: "#e0a458",
  danger: "#ff6b5e",
  success: "#4cc98a",
  series: "#3fbfa4",
  seriesBenchmark: "#6a6a70",
};

export const palettes = { light, dark };

/** 8pt grid, with a 4pt half-step for tight vertical rhythm inside cells. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
} as const;

/**
 * Type scale mapped to the iOS text styles. Line heights are set explicitly
 * because RN does not derive them, and the default leading is too tight for
 * the dense numeric rows this app is mostly made of.
 */
export const type = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: "700" },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: "700" },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: "700" },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: "600" },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: "600" },
  body: { fontSize: 17, lineHeight: 24, fontWeight: "400" },
  callout: { fontSize: 16, lineHeight: 22, fontWeight: "400" },
  subhead: { fontSize: 15, lineHeight: 20, fontWeight: "400" },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: "400" },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "400" },
  caption2: { fontSize: 11, lineHeight: 13, fontWeight: "400" },
} as const;

/**
 * Tabular figures. Numbers in a column must not jitter as digits change, which
 * matters on every screen here — the holdings list and the heatmap are almost
 * entirely right-aligned numerals.
 */
export const numeric: TextStyle = { fontVariant: ["tabular-nums"] };

/** Shadow for cards. Subtle — iOS grouped lists rely on fill contrast, not depth. */
export const cardShadow: ViewStyle = Platform.select<ViewStyle>({
  ios: {
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  android: { elevation: 1 },
  default: {},
})!;
