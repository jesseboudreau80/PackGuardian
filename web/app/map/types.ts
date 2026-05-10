export interface CenterHeat {
  center_id: string;
  name: string;
  lat: number;
  lng: number;
  incident_count: number;
  avg_risk_score: number;
  heat_score: number;
  emerging_risk_level: "low" | "medium" | "high";
  trend_velocity: number;
  top_drivers: string[];
  recommended_actions: string[];
  osha_recordable_count: number;
}

export interface CenterRead {
  id: string;
  tenant_id: string;
  center_code: string;
  name: string;
  latitude: number;
  longitude: number;
  address: string | null;
  city: string | null;
  state: string | null;
  created_at: string;
}

export type Timeframe = "7d" | "30d" | "90d" | "all";
