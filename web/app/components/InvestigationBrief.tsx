"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { API_URL } from "../lib/api";

interface RecurrencePattern {
  pattern_type: string;
  label: string;
  count: number;
  window_days: number;
  related_incident_ids: string[];
}

interface Brief {
  case_id: string;
  headline: string;
  severity_effective: string;
  risk_score: number | null;
  risk_band: string | null;
  risk_contributors: Record<string, number> | null;
  employee_name: string | null;
  witness_count: number;
  open_corrective_action_count: number;
  overdue_corrective_action_count: number;
  recurrence_patterns: RecurrencePattern[];
  osha_review_required: boolean;
  recommended_next_step: string;
}

const BAND_STYLE: Record<string, string> = {
  critical: "bg-red-100 text-red-800 border-red-300",
  high:     "bg-orange-100 text-orange-800 border-orange-300",
  elevated: "bg-amber-100 text-amber-800 border-amber-300",
  moderate: "bg-yellow-50 text-yellow-800 border-yellow-300",
  low:      "bg-green-50 text-green-800 border-green-300",
};

const PATTERN_ICONS: Record<string, string> = {
  dog_name:      "🐕",
  incident_type: "↺",
  location:      "📍",
  equipment:     "⚙️",
  employee:      "👤",
};

const CONTRIBUTOR_LABELS: Record<string, string> = {
  severity:                   "Incident severity",
  incident_type:              "Incident type weight",
  osha_recordable:            "OSHA recordable",
  days_away:                  "Days away from work",
  escalation:                 "Case escalation level",
  overdue_corrective_actions: "Overdue follow-up actions",
  repeat_incidents:           "Repeat incidents at location",
  missing_documentation:      "Missing documentation",
};

function ScorePip({ score, band }: { score: number; band: string | null }) {
  const pct = Math.min(score, 100);
  const color = band === "critical" ? "#ef4444"
    : band === "high" ? "#f97316"
    : band === "elevated" ? "#f59e0b"
    : band === "moderate" ? "#eab308"
    : "#22c55e";

  return (
    <div className="flex items-center gap-2">
      <div className="relative w-10 h-10 flex-shrink-0">
        <svg viewBox="0 0 36 36" className="w-10 h-10 -rotate-90">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3" />
          <circle cx="18" cy="18" r="15.9" fill="none" stroke={color} strokeWidth="3"
            strokeDasharray={`${pct} 100`} strokeLinecap="round" />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold" style={{ color }}>
          {score}
        </span>
      </div>
      {band && (
        <div>
          <p className="text-xs font-semibold capitalize" style={{ color }}>{band} risk</p>
          <p className="text-xs text-gray-400">{score}/100</p>
        </div>
      )}
    </div>
  );
}

export default function InvestigationBrief({ caseId }: { caseId: string }) {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);
  const [showContributors, setShowContributors] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await axios.get<Brief>(`${API_URL}/cases/${caseId}/brief`);
      setBrief(r.data);
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  }, [caseId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="px-5 py-4 border-b border-gray-100 animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
      <div className="flex gap-3">
        <div className="h-10 w-10 rounded-full bg-gray-200" />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-gray-200 rounded w-1/2" />
          <div className="h-3 bg-gray-200 rounded w-2/3" />
        </div>
      </div>
    </div>
  );

  if (!brief) return null;

  const hasRecurrence = brief.recurrence_patterns.length > 0;
  const hasOverdue = brief.overdue_corrective_action_count > 0;

  return (
    <div className="border-b border-gray-100">
      {/* Main brief card */}
      <div className="px-5 py-4 space-y-3">
        {/* Headline + risk score */}
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 leading-snug">{brief.headline}</p>
            {brief.employee_name && (
              <p className="text-xs text-gray-500 mt-0.5">Employee: {brief.employee_name}</p>
            )}
          </div>
          {brief.risk_score != null && (
            <ScorePip score={brief.risk_score} band={brief.risk_band} />
          )}
        </div>

        {/* Status chips */}
        <div className="flex items-center gap-2 flex-wrap">
          {brief.osha_review_required && (
            <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2.5 py-0.5 font-medium">
              ⚠ OSHA Review Required
            </span>
          )}
          {brief.witness_count > 0 && (
            <span className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full px-2.5 py-0.5">
              {brief.witness_count} witness{brief.witness_count !== 1 ? "es" : ""}
            </span>
          )}
          {brief.open_corrective_action_count > 0 && (
            <span className={`inline-flex items-center gap-1 text-xs border rounded-full px-2.5 py-0.5 font-medium ${
              hasOverdue ? "bg-red-50 text-red-700 border-red-200" : "bg-blue-50 text-blue-700 border-blue-100"
            }`}>
              {hasOverdue ? "⚑" : "◎"} {brief.open_corrective_action_count} open action{brief.open_corrective_action_count !== 1 ? "s" : ""}
              {hasOverdue && ` (${brief.overdue_corrective_action_count} follow-up needed)`}
            </span>
          )}
          {hasRecurrence && (
            <span className="inline-flex items-center gap-1 text-xs bg-orange-50 text-orange-700 border border-orange-200 rounded-full px-2.5 py-0.5 font-medium">
              ↺ Pattern detected
            </span>
          )}
        </div>

        {/* Risk contributors — collapsible */}
        {brief.risk_contributors && Object.keys(brief.risk_contributors).length > 0 && (
          <div>
            <button
              onClick={() => setShowContributors((p) => !p)}
              className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
            >
              {showContributors ? "▴" : "▾"} Risk factors
            </button>
            {showContributors && (
              <div className="mt-2 space-y-1">
                {Object.entries(brief.risk_contributors)
                  .sort(([, a], [, b]) => b - a)
                  .map(([key, pts]) => (
                    <div key={key} className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-600 truncate">
                          {CONTRIBUTOR_LABELS[key] ?? key.replace(/_/g, " ")}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <div className="h-1.5 rounded-full bg-orange-200" style={{ width: `${Math.min(pts * 2, 60)}px` }} />
                        <span className="text-xs font-medium text-gray-500 w-6 text-right">+{pts}</span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* Recurrence patterns */}
        {hasRecurrence && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-1.5">
            <p className="text-xs font-semibold text-orange-800">Operational patterns detected</p>
            {brief.recurrence_patterns.map((p, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-sm flex-shrink-0">{PATTERN_ICONS[p.pattern_type] ?? "◎"}</span>
                <p className="text-xs text-orange-700">{p.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Recommended next step */}
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2.5 flex items-start gap-2">
          <span className="text-base flex-shrink-0">→</span>
          <p className="text-xs text-indigo-800 font-medium">{brief.recommended_next_step}</p>
        </div>
      </div>
    </div>
  );
}
