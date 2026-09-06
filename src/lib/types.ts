/** Shape of assets/data/reference.json, written by scripts/build_universe.py. */

export interface SectorIntensity {
  sector: string;
  avg_intensity_tco2e_per_musd_revenue: number;
  scope3_multiplier: number;
  basis_note: string;
  source: string;
}

export interface EmissionsSourceMeta {
  source?: string | null;
  url?: string | null;
  available?: boolean;
  vintage?: string | null;
  companies: number;
  subsector_owner_coverage?: Record<string, { assets: number; with_owner: number; without_owner: number }>;
  ownership_split_assumption?: string | null;
  attribution_note?: string | null;
  fragility_note?: string | null;
}

export interface CoverageRejection {
  ticker: string;
  sector: string;
  climatetrace_tco2e: number;
  sector_proxy_tco2e: number;
  ratio: number;
  subsectors: string[];
}

export interface Reference {
  generated_at: string;
  company_count: number;
  excluded: { ticker: string; reason: string }[];
  financial_data_source: string;
  financial_data_url: string;
  market_cap_basis: string;
  emissions_sources: {
    climatetrace: EmissionsSourceMeta;
    epa_ghgrp: EmissionsSourceMeta;
    sector_proxy: EmissionsSourceMeta;
  };
  coverage_guard: {
    reject_below_ratio: number;
    explanation: string;
    rejected_count: number;
    rejected: CoverageRejection[];
  };
  data_quality_distribution: Record<string, number>;
  financials_confidence_distribution: Record<string, number>;
  sector_intensity: SectorIntensity[];
}
