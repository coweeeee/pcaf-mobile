import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import * as Haptics from "expo-haptics";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, Platform, Text, View, type TextStyle } from "react-native";

import {
  Card,
  CardTitle,
  PressableScale,
  Divider,
  KeyValue,
  Notice,
  Paragraph,
  Screen,
  SectionHeader,
  numeric,
  radius,
  space,
  type,
  useTheme,
} from "../../src/components/primitives";
import { formatPct, formatUsd, formatUsdExact } from "../../src/lib/format";
import type { Position } from "../../src/lib/pcaf";
import { usePortfolio } from "../../src/lib/portfolioStore";
import { parsePortfolioCsv, type CsvRowError } from "../../src/lib/portfolioCsv";
import { UNIVERSE_BY_TICKER } from "../../src/lib/universe";

interface Preview {
  fileName: string;
  positions: Position[];
  errors: CsvRowError[];
  detectedColumns: { ticker: string; value: string } | null;
}

/**
 * Reading the picked file has three paths because the picker hands back three
 * different things: a real DOM File on web, a blob URL in some web browsers,
 * and a native file URI on device.
 */
async function readPickedFile(asset: DocumentPicker.DocumentPickerAsset): Promise<string> {
  const maybeDomFile = (asset as { file?: { text?: () => Promise<string> } }).file;
  if (maybeDomFile?.text) return maybeDomFile.text();
  if (Platform.OS === "web") {
    const response = await fetch(asset.uri);
    return response.text();
  }
  return new File(asset.uri).text();
}

export default function ImportScreen() {
  const c = useTheme();
  const { source, result, loadImported, resetToDemo } = usePortfolio();

  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Resolve the previewed tickers so the user sees coverage before committing. */
  const previewStats = useMemo(() => {
    if (!preview) return null;
    const matched: Position[] = [];
    const unmatched: Position[] = [];
    for (const p of preview.positions) {
      (UNIVERSE_BY_TICKER.has(p.ticker.toUpperCase()) ? matched : unmatched).push(p);
    }
    const totalValue = preview.positions.reduce((s, p) => s + p.marketValueUsd, 0);
    const unmatchedValue = unmatched.reduce((s, p) => s + p.marketValueUsd, 0);
    return {
      matched,
      unmatched,
      totalValue,
      unmatchedValue,
      coverage: totalValue > 0 ? 1 - unmatchedValue / totalValue : 0,
    };
  }, [preview]);

  async function pick() {
    setError(null);
    setBusy(true);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        // Some providers (Drive, older iOS exports) report CSV as plain text or
        // octet-stream, so the filter has to be permissive or valid files are
        // greyed out in the picker.
        type: ["text/csv", "text/comma-separated-values", "text/plain", "*/*"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.[0]) return;

      const asset = res.assets[0];
      const text = await readPickedFile(asset);
      const parsed = parsePortfolioCsv(text);

      if (parsed.positions.length === 0) {
        setError(
          parsed.errors[0]?.reason ??
            "No usable rows were found in that file. It needs a ticker column and a market-value column.",
        );
        setPreview(null);
        return;
      }

      setPreview({
        fileName: asset.name ?? "portfolio.csv",
        positions: parsed.positions,
        errors: parsed.errors,
        detectedColumns: parsed.detectedColumns,
      });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setError(
        `That file could not be read: ${e instanceof Error ? e.message : String(e)}`,
      );
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!preview) return;
    await loadImported(preview.positions, preview.fileName);
    setPreview(null);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  return (
    <Screen>
      <Card>
        <CardTitle
          hint={
            source.kind === "demo"
              ? "The bundled sample portfolio"
              : source.importedAt
                ? `Imported ${new Date(source.importedAt).toLocaleString()}`
                : "Imported"
          }
        >
          Currently loaded: {source.label}
        </CardTitle>
        <KeyValue label="Holdings in calculation" value={`${result.holdings.length}`} />
        <KeyValue label="Portfolio value" value={formatUsd(result.totalPortfolioValueUsd)} />
        {result.excluded.length > 0 ? (
          <KeyValue
            label="Excluded (unknown tickers)"
            value={`${result.excluded.length} · ${formatUsd(result.excludedValueUsd)}`}
            valueColor={c.warning}
          />
        ) : null}
      </Card>

      <SectionHeader>Import your own holdings</SectionHeader>

      <Card>
        <Paragraph>
          Pick a CSV from Files, iCloud Drive, Google Drive or anywhere else your device can reach.
          Everything is parsed and calculated on the device — the file is never uploaded, because
          there is nothing to upload it to.
        </Paragraph>

        <View
          style={{
            backgroundColor: c.surfaceAlt,
            borderRadius: radius.md,
            padding: space.md,
            gap: 2,
          }}
        >
          <Text style={[type.caption2 as TextStyle, { color: c.textTertiary }]}>
            EXPECTED FORMAT
          </Text>
          <Text style={[type.footnote as TextStyle, numeric, { color: c.textSecondary }]}>
            ticker,market_value_usd{"\n"}AAPL,8200000{"\n"}XOM,3100000
          </Text>
        </View>

        <Paragraph>
          Common header spellings (symbol, market value, exposure) are accepted, as are
          &quot;$1,234,567&quot; style values. Rows that cannot be read are listed individually
          rather than silently dropped.
        </Paragraph>

        <Button label={busy ? "Reading…" : "Choose a CSV file"} onPress={pick} busy={busy} primary />
      </Card>

      {error ? (
        <Notice tone="danger" title="Could not import that file">
          {error}
        </Notice>
      ) : null}

      {preview && previewStats ? (
        <>
          <SectionHeader>Preview — nothing applied yet</SectionHeader>

          <Card>
            <CardTitle hint={preview.fileName}>
              {preview.positions.length} holdings parsed
            </CardTitle>

            {preview.detectedColumns ? (
              <Paragraph>
                Read <Text style={{ fontWeight: "700" }}>{preview.detectedColumns.ticker}</Text> as
                the ticker and{" "}
                <Text style={{ fontWeight: "700" }}>{preview.detectedColumns.value}</Text> as the
                market value.
              </Paragraph>
            ) : null}

            <Divider />
            <KeyValue label="Total value in file" value={formatUsdExact(previewStats.totalValue)} />
            <KeyValue
              label="Resolved against universe"
              value={`${previewStats.matched.length} of ${preview.positions.length}`}
            />
            <KeyValue
              label="Coverage by value"
              value={formatPct(previewStats.coverage)}
              valueColor={previewStats.coverage < 0.9 ? c.warning : c.success}
            />

            {previewStats.unmatched.length > 0 ? (
              <Notice tone="warning" title={`${previewStats.unmatched.length} ticker(s) not in the reference universe`}>
                {previewStats.unmatched.map((p) => p.ticker).join(", ")} — excluded from the
                calculation, carrying {formatUsd(previewStats.unmatchedValue)}. The app has no
                backend to look them up, so they cannot be priced or attributed.
              </Notice>
            ) : null}

            {preview.errors.length > 0 ? (
              <Notice tone="warning" title={`${preview.errors.length} row(s) skipped`}>
                {preview.errors
                  .slice(0, 5)
                  .map((e) => `Line ${e.line}: ${e.reason}`)
                  .join("\n")}
                {preview.errors.length > 5 ? `\n…and ${preview.errors.length - 5} more.` : ""}
              </Notice>
            ) : null}

            <Divider />
            <View style={{ gap: 4 }}>
              {previewStats.matched.slice(0, 8).map((p) => (
                <View key={p.ticker} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={[type.footnote as TextStyle, numeric, { color: c.text }]}>
                    {p.ticker}
                  </Text>
                  <Text style={[type.footnote as TextStyle, numeric, { color: c.textSecondary }]}>
                    {formatUsdExact(p.marketValueUsd)}
                  </Text>
                </View>
              ))}
              {previewStats.matched.length > 8 ? (
                <Text style={[type.caption as TextStyle, { color: c.textTertiary }]}>
                  …and {previewStats.matched.length - 8} more
                </Text>
              ) : null}
            </View>

            <Button
              label={`Use these ${previewStats.matched.length} holdings`}
              onPress={confirm}
              primary
              disabled={previewStats.matched.length === 0}
            />
            <Button label="Discard" onPress={() => setPreview(null)} />
          </Card>
        </>
      ) : null}

      <SectionHeader>Reset</SectionHeader>

      <Card>
        <Paragraph>
          Go back to the bundled 30-holding demo portfolio. This also clears the imported portfolio
          saved on this device.
        </Paragraph>
        <Button
          label="Reset to demo portfolio"
          onPress={async () => {
            await resetToDemo();
            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          disabled={source.kind === "demo"}
        />
      </Card>
    </Screen>
  );
}

function Button({
  label,
  onPress,
  primary,
  disabled,
  busy,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  busy?: boolean;
}) {
  const c = useTheme();
  const off = disabled || busy;
  return (
    <PressableScale
      onPress={onPress}
      disabled={off}
      style={{
        backgroundColor: primary ? c.accent : c.surfaceAlt,
        opacity: off ? 0.45 : 1,
        paddingVertical: 13,
        borderRadius: radius.md,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: space.sm,
      }}
    >
      {busy ? <ActivityIndicator size="small" color={primary ? "#fff" : c.text} /> : null}
      <Text
        style={[
          type.headline as TextStyle,
          { color: primary ? "#fff" : c.text, fontWeight: "600" },
        ]}
      >
        {label}
      </Text>
    </PressableScale>
  );
}
