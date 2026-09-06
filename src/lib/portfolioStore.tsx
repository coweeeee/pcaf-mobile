/**
 * The one piece of app state: which portfolio is loaded, and the PCAF result
 * derived from it.
 *
 * The result is memoised on the positions, so every screen reads the same
 * computed object rather than each recomputing it. The whole calculation over
 * 30 holdings is sub-millisecond, but sharing it also guarantees the Home,
 * Holdings and Data Quality tabs can never disagree with each other.
 *
 * An imported portfolio is persisted to AsyncStorage so it survives a restart.
 * A failed read is not fatal: we fall back to the demo portfolio and surface the
 * problem rather than starting with an empty screen.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { computePortfolio, type Position, type PortfolioResult } from "./pcaf";
import { DEMO_PORTFOLIO, UNIVERSE, UNIVERSE_BY_TICKER, benchmarkFor } from "./universe";

const STORAGE_KEY = "pcaf.portfolio.v1";

export interface PortfolioSource {
  kind: "demo" | "imported";
  /** File name for an import, or the demo label. Shown in the UI. */
  label: string;
  /** ISO timestamp of when an imported file was loaded. */
  importedAt?: string;
}

interface StoredPortfolio {
  source: PortfolioSource;
  positions: Position[];
}

interface PortfolioContextValue {
  positions: Position[];
  source: PortfolioSource;
  /** PCAF result for the loaded portfolio. */
  result: PortfolioResult;
  /** PCAF result for the cap-weighted benchmark at the same notional. */
  benchmark: PortfolioResult;
  /** False only during the initial AsyncStorage read. */
  ready: boolean;
  /** Set when a persisted portfolio could not be restored. */
  restoreError: string | null;
  loadImported: (positions: Position[], label: string) => Promise<void>;
  resetToDemo: () => Promise<void>;
}

const DEMO_SOURCE: PortfolioSource = { kind: "demo", label: "Demo portfolio" };

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  const [positions, setPositions] = useState<Position[]>(DEMO_PORTFOLIO);
  const [source, setSource] = useState<PortfolioSource>(DEMO_SOURCE);
  const [ready, setReady] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && raw) {
          const parsed = JSON.parse(raw) as StoredPortfolio;
          // Validate rather than trust: a malformed or partially-written record
          // must not take the app down on launch.
          if (
            Array.isArray(parsed?.positions) &&
            parsed.positions.length > 0 &&
            parsed.positions.every(
              (p) => typeof p?.ticker === "string" && Number.isFinite(p?.marketValueUsd),
            )
          ) {
            setPositions(parsed.positions);
            setSource(parsed.source ?? { kind: "imported", label: "Imported portfolio" });
          } else {
            setRestoreError("The saved portfolio was unreadable, so the demo portfolio was loaded.");
          }
        }
      } catch (e) {
        if (!cancelled) {
          setRestoreError(
            `The saved portfolio could not be restored (${
              e instanceof Error ? e.message : String(e)
            }). The demo portfolio is shown instead.`,
          );
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadImported = useCallback(async (next: Position[], label: string) => {
    const nextSource: PortfolioSource = {
      kind: "imported",
      label,
      importedAt: new Date().toISOString(),
    };
    setPositions(next);
    setSource(nextSource);
    setRestoreError(null);
    try {
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ source: nextSource, positions: next } satisfies StoredPortfolio),
      );
    } catch {
      // The portfolio is loaded in memory either way; persistence is a
      // convenience, so a storage failure must not block the import.
    }
  }, []);

  const resetToDemo = useCallback(async () => {
    setPositions(DEMO_PORTFOLIO);
    setSource(DEMO_SOURCE);
    setRestoreError(null);
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      /* see above */
    }
  }, []);

  const result = useMemo(
    () => computePortfolio(positions, UNIVERSE_BY_TICKER),
    [positions],
  );

  /**
   * The benchmark is scaled to the matched portfolio value so that absolute
   * financed emissions are comparable. When nothing matched we fall back to the
   * raw input value to avoid a zero-notional benchmark.
   */
  const benchmark = useMemo(() => {
    const notional = result.totalPortfolioValueUsd || result.totalInputValueUsd || 1;
    return computePortfolio(benchmarkFor(notional), UNIVERSE_BY_TICKER);
  }, [result.totalPortfolioValueUsd, result.totalInputValueUsd]);

  const value = useMemo<PortfolioContextValue>(
    () => ({
      positions,
      source,
      result,
      benchmark,
      ready,
      restoreError,
      loadImported,
      resetToDemo,
    }),
    [positions, source, result, benchmark, ready, restoreError, loadImported, resetToDemo],
  );

  return <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>;
}

export function usePortfolio(): PortfolioContextValue {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error("usePortfolio must be used inside a PortfolioProvider");
  return ctx;
}

export { UNIVERSE };
