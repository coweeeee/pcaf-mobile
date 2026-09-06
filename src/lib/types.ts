/** Shape of public/data/reference.json, written by scripts/build_universe.py. */
export interface SectorIntensity {
  sector: string;
  avg_intensity_tco2e_per_musd_revenue: number;
  scope3_multiplier: number;
  basis_note: string;
  source: string;
}

export interface Reference {
  generated_at: string;
  financial_data_source: string;
  company_count: number;
  reported_tier_count: number;
  estimated_tier_count: number;
  excluded: { ticker: string; reason: string }[];
  sector_gics_disagreements: { ticker: string; curated: string; yahoo_mapped: string }[];
  sector_intensity: SectorIntensity[];
}
