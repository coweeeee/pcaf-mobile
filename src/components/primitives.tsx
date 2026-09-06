/**
 * The shared building blocks every screen is assembled from.
 *
 * Kept in one file because they are small and always used together; splitting
 * them into eleven modules would add imports without adding clarity.
 */

import React, { useCallback, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { cardShadow, numeric, palettes, radius, space, type, type Palette } from "../theme";

export function useTheme(): Palette {
  const scheme = useColorScheme();
  return scheme === "dark" ? palettes.dark : palettes.light;
}

/**
 * A grouped-list screen container. Adds the bottom inset so the last card is
 * not hidden behind the tab bar, which the tab navigator does not do for a
 * plain ScrollView.
 */
export function Screen({
  children,
  contentStyle,
}: {
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={[
        { padding: space.lg, paddingBottom: insets.bottom + space.xxl, gap: space.lg },
        contentStyle,
      ]}
      contentInsetAdjustmentBehavior="automatic"
      indicatorStyle={useColorScheme() === "dark" ? "white" : "black"}
    >
      {children}
    </ScrollView>
  );
}

export function Card({
  children,
  style,
  padded = true,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  const c = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: c.surface,
          borderRadius: radius.lg,
          padding: padded ? space.lg : 0,
          gap: padded ? space.md : 0,
          overflow: "hidden",
        },
        cardShadow,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function CardTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  const c = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <Text style={[type.headline as TextStyle, { color: c.text }]}>{children}</Text>
      {hint ? (
        <Text style={[type.footnote as TextStyle, { color: c.textSecondary }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

/** Section header above a group of cards, styled like an iOS grouped-list header. */
export function SectionHeader({ children }: { children: React.ReactNode }) {
  const c = useTheme();
  return (
    <Text
      style={[
        type.footnote as TextStyle,
        {
          color: c.textSecondary,
          textTransform: "uppercase",
          letterSpacing: 0.6,
          fontWeight: "600",
          marginTop: space.sm,
          marginBottom: -space.sm,
          marginLeft: space.xs,
        },
      ]}
    >
      {children}
    </Text>
  );
}

/** A headline metric: big tabular value, label above, context line below. */
export function Stat({
  label,
  value,
  unit,
  caption,
  tone,
}: {
  label: string;
  value: string;
  unit?: string;
  caption?: string;
  tone?: string;
}) {
  const c = useTheme();
  return (
    <View style={{ gap: 2, flex: 1 }}>
      <Text style={[type.caption as TextStyle, { color: c.textSecondary }]} numberOfLines={2}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
        <Text style={[type.title2 as TextStyle, numeric, { color: tone ?? c.text }]}>{value}</Text>
        {unit ? (
          <Text style={[type.caption as TextStyle, { color: c.textTertiary }]}>{unit}</Text>
        ) : null}
      </View>
      {caption ? (
        <Text style={[type.caption2 as TextStyle, { color: c.textTertiary }]}>{caption}</Text>
      ) : null}
    </View>
  );
}

/**
 * Emissions-source pill. The badge that must sit next to every emissions
 * figure, so a facility-measured number and a sector estimate are never read as
 * the same thing.
 */
export const SOURCE_LABEL: Record<string, { short: string; long: string }> = {
  climatetrace: { short: "Climate TRACE", long: "Climate TRACE (facility data)" },
  epa_ghgrp: { short: "EPA GHGRP", long: "EPA GHGRP (reported)" },
  sector_proxy: { short: "Sector proxy", long: "Estimated (sector proxy)" },
};

export function SourceBadge({
  source,
  score,
  compact = false,
}: {
  source: string;
  score?: number;
  compact?: boolean;
}) {
  const c = useTheme();
  const measured = source !== "sector_proxy";
  const fg = source === "climatetrace" ? c.success : source === "epa_ghgrp" ? c.accent : c.warning;
  const label = SOURCE_LABEL[source] ?? { short: source, long: source };
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        gap: 4,
        paddingHorizontal: compact ? 6 : space.sm,
        paddingVertical: compact ? 2 : 3,
        borderRadius: radius.pill,
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderColor: fg,
        // Measured sources get a filled tint; the estimate stays outline-only so
        // it never reads as the stronger of the two at a glance.
        backgroundColor: measured ? undefined : "transparent",
      }}
    >
      <Text
        style={[
          (compact ? type.caption2 : type.caption) as TextStyle,
          { color: fg, fontWeight: "600" },
        ]}
      >
        {compact ? label.short : label.long}
      </Text>
      {score !== undefined ? (
        <Text style={[type.caption2 as TextStyle, numeric, { color: fg, opacity: 0.85 }]}>
          · PCAF {score}
        </Text>
      ) : null}
    </View>
  );
}

/** A label/value line inside a card. */
export function KeyValue({
  label,
  value,
  valueColor,
  mono = true,
}: {
  label: string;
  value: string;
  valueColor?: string;
  mono?: boolean;
}) {
  const c = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: space.md,
      }}
    >
      <Text style={[type.subhead as TextStyle, { color: c.textSecondary, flexShrink: 1 }]}>
        {label}
      </Text>
      <Text
        style={[
          type.subhead as TextStyle,
          mono ? numeric : null,
          { color: valueColor ?? c.text, fontWeight: "600" },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

export function Divider() {
  const c = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border }} />;
}

export function Paragraph({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const c = useTheme();
  return (
    <Text style={[type.subhead as TextStyle, { color: c.textSecondary }, style]}>{children}</Text>
  );
}

/** A callout for caveats and data-quality warnings. */
export function Notice({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warning" | "danger";
  title?: string;
  children: React.ReactNode;
}) {
  const c = useTheme();
  const color = tone === "danger" ? c.danger : tone === "warning" ? c.warning : c.accent;
  return (
    <View
      style={{
        backgroundColor: c.surface,
        borderRadius: radius.md,
        borderLeftWidth: 3,
        borderLeftColor: color,
        padding: space.md,
        gap: 4,
      }}
    >
      {title ? (
        <Text style={[type.footnote as TextStyle, { color, fontWeight: "700" }]}>{title}</Text>
      ) : null}
      <Text style={[type.footnote as TextStyle, { color: c.textSecondary }]}>{children}</Text>
    </View>
  );
}

/**
 * Width for a chart that has to fill its container.
 *
 * `onLayout` is the accurate source, but it cannot be the only one: it does not
 * fire for descendants of a Reanimated entering animation on web, and it is a
 * known flake on native during the first frames of a screen. A chart whose width
 * is 0 renders nothing at all — which is the worst possible failure, because an
 * empty card looks like "no data" rather than a bug.
 *
 * So we start from the window width minus the known gutters and refine it the
 * moment a real measurement arrives. The chart is always drawn.
 */
export function useMeasuredWidth(fallbackInset = space.lg * 4) {
  const { width: windowWidth } = useWindowDimensions();
  const [measured, setMeasured] = useState(0);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    // Only accept a real measurement; a transient 0 must not blank the chart.
    if (w > 0) setMeasured((prev) => (Math.abs(prev - w) > 0.5 ? w : prev));
  }, []);

  return {
    width: measured > 0 ? measured : Math.max(0, windowWidth - fallbackInset),
    onLayout,
  };
}

/**
 * A pressable that dips slightly under the finger.
 *
 * There is no hover on a phone, so press is the only moment the interface can
 * acknowledge a touch — and it has to happen on press-*in*, not on the tap
 * completing, or the control feels dead for the length of the gesture.
 *
 * The scale is driven by a Reanimated CSS transition rather than a shared
 * value: this is a two-state change with no finger tracking, so a worklet and a
 * gesture handler would be machinery for nothing. Scaling the whole view takes
 * the labels and icons with it, which is what makes it read as a physical
 * object rather than a colour change.
 */
export function PressableScale({
  children,
  onPress,
  disabled,
  style,
  scaleTo = 0.97,
  hitSlop = 4,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  hitSlop?: number;
}) {
  const [pressed, setPressed] = useState(false);
  const reduced = useReducedMotion();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      hitSlop={hitSlop}
      // A finger drifting a few pixels should not cancel a press the user meant.
      pressRetentionOffset={12}
    >
      <Animated.View
        style={[
          style,
          {
            transform: [{ scale: pressed && !reduced ? scaleTo : 1 }],
            transitionProperty: "transform",
            transitionDuration: 120,
            transitionTimingFunction: "ease-out",
          } as ViewStyle,
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}

export { numeric, radius, space, type };
