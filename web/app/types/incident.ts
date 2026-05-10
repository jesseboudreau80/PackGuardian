export type Severity = "low" | "medium" | "high" | "critical";
export type IncidentStatus = "open" | "in_progress" | "closed";
export type TreatmentType = "first_aid" | "medical" | "emergency_room" | "hospitalization";

export interface Incident {
  id: string;
  center_id: string;
  incident_type: string;
  description: string;
  reported_severity: Severity;
  adjusted_severity: Severity | null;
  status: IncidentStatus;
  created_at: string;
  category: string | null;
  risk_score: number | null;
  recommendations: string[] | null;
  explanation: string | null;
  // OSHA fields
  employee_name: string | null;
  job_title: string | null;
  date_of_injury: string | null;
  time_of_injury: string | null;
  body_part: string | null;
  treatment_type: TreatmentType | null;
  days_away: number | null;
  restricted_days: number | null;
  recordable: boolean | null;
}

export interface IncidentCreate {
  center_id: string;
  incident_type: string;
  description: string;
  reported_severity: Severity;
  status: IncidentStatus;
  // OSHA fields — all optional
  employee_name?: string;
  job_title?: string;
  date_of_injury?: string;
  time_of_injury?: string;
  body_part?: string;
  treatment_type?: TreatmentType;
  days_away?: number;
  restricted_days?: number;
}

// ── OSHA reporting ────────────────────────────────────────────────────────────

export type OshaClassification = "days_away" | "restricted" | "other";

export interface Form301 {
  incident_id: string;
  case_number: number | null;
  employee_name: string | null;
  job_title: string | null;
  center_id: string;
  date_of_injury: string | null;
  time_of_injury: string | null;
  incident_type: string;
  body_part: string | null;
  description: string;
  treatment_type: string | null;
  days_away: number;
  restricted_days: number;
  recordable: boolean;
  created_at: string;
}

export interface Form300Entry {
  case_number: number;
  employee_name: string | null;
  job_title: string | null;
  date_of_injury: string | null;
  incident_type: string;
  body_part: string | null;
  days_away: number;
  restricted_days: number;
  classification: OshaClassification;
  incident_id: string;
}

export interface Form300Log {
  year: number;
  center_id: string | null;
  entries: Form300Entry[];
  total_cases: number;
}

export interface Form300ASummary {
  year: number;
  center_id: string | null;
  total_cases: number;
  days_away_cases: number;
  restricted_cases: number;
  other_cases: number;
  total_days_away: number;
  total_restricted_days: number;
}

export interface CategoryCount {
  category: string;
  count: number;
}

export interface DashboardSummary {
  total_incidents: number;
  open_incidents: number;
  critical_incidents: number;
  average_risk_score: number;
  top_risk_categories: CategoryCount[];
}

export interface KeywordCount {
  keyword: string;
  count: number;
}

export interface SeverityTransition {
  from_severity: string;
  to_severity: string;
  count: number;
}

export interface KeywordCluster {
  keyword: string;
  incident_count: number;
  categories: string[];
}

export type ActionPriority = "low" | "medium" | "high";

export interface RecommendedAction {
  action: string;
  confidence: number;
  priority: ActionPriority;
}

export type RiskTrend = "increasing" | "stable" | "decreasing";

export interface EmergingRisk {
  keyword: string;
  trend: RiskTrend;
  risk_level: ActionPriority;
}

export interface PatternAnalysis {
  top_category_keywords: KeywordCount[];
  top_escalation_keywords: KeywordCount[];
  severity_transitions: SeverityTransition[];
  keyword_clusters: KeywordCluster[];
  summary: string;
  recommended_actions: RecommendedAction[];
  emerging_risks: EmergingRisk[];
}
