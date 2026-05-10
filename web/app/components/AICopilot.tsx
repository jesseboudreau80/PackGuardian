"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { API_URL } from "../lib/api";

interface CopilotResponse {
  risk_level: string;
  risk_explanation: string;
  immediate_actions: string[];
  osha_implications: string | null;
  suggested_next_status: string;
  pattern_insight: string | null;
  estimated_complexity: string;
}

const RISK_STYLES: Record<string, { badge: string; border: string; bg: string }> = {
  critical: { badge: "bg-red-100 text-red-700", border: "border-red-200", bg: "bg-red-50" },
  high:     { badge: "bg-orange-100 text-orange-700", border: "border-orange-200", bg: "bg-orange-50" },
  medium:   { badge: "bg-yellow-100 text-yellow-700", border: "border-yellow-200", bg: "bg-yellow-50" },
  low:      { badge: "bg-green-100 text-green-700", border: "border-green-200", bg: "bg-green-50" },
};

const COMPLEXITY_STYLES: Record<string, string> = {
  simple:   "text-green-700", moderate: "text-yellow-700", complex: "text-red-700",
};

const STATUS_LABELS: Record<string, string> = {
  new: "New", assigned: "Assigned", investigating: "Investigating",
  awaiting_followup: "Awaiting Follow-up", resolved: "Resolved", closed: "Closed",
};

interface Props { caseId: string; }

export default function AICopilot({ caseId }: Props) {
  const [data, setData] = useState<CopilotResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!expanded || data) return;
    setLoading(true);
    axios.get<CopilotResponse>(`${API_URL}/cases/${caseId}/copilot`)
      .then((r) => setData(r.data))
      .catch((err: unknown) => setError(axios.isAxiosError(err) ? String(err.response?.data?.detail ?? err.message) : "Failed"))
      .finally(() => setLoading(false));
  }, [expanded, caseId, data]);

  const style = data ? (RISK_STYLES[data.risk_level] ?? RISK_STYLES.medium) : null;

  return (
    <div className={`rounded-xl border ${style ? style.border : "border-gray-200"} overflow-hidden`}>
      {/* Header (always visible) */}
      <button
        onClick={() => setExpanded((p) => !p)}
        className={`w-full flex items-center gap-2 px-4 py-3 text-left ${style?.bg ?? "bg-gray-50"} hover:opacity-90 transition-opacity`}
      >
        <span className="text-base">🤖</span>
        <span className="text-sm font-semibold text-gray-800 flex-1">AI Copilot Analysis</span>
        {data && (
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium capitalize ${style?.badge}`}>
            {data.risk_level} risk
          </span>
        )}
        <span className="text-xs text-gray-400">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="bg-white px-4 py-4 space-y-4 border-t border-gray-100">
          {loading && <p className="text-xs text-gray-400 text-center py-4">Analyzing case…</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}
          {data && (
            <>
              {/* Risk explanation */}
              <div>
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Risk Assessment</p>
                <div className="flex items-start gap-2">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium capitalize flex-shrink-0 ${style?.badge}`}>
                    {data.risk_level}
                  </span>
                  <p className="text-xs text-gray-700 leading-relaxed">{data.risk_explanation}</p>
                </div>
              </div>

              {/* Immediate actions */}
              {data.immediate_actions.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Immediate Actions</p>
                  <ul className="space-y-1.5">
                    {data.immediate_actions.map((a, i) => (
                      <li key={i} className="flex gap-2 text-xs text-gray-700">
                        <span className="flex-shrink-0 text-indigo-500 font-bold">{i + 1}.</span>
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* OSHA implications */}
              {data.osha_implications && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
                  <p className="text-xs font-semibold text-yellow-800 mb-0.5">OSHA Implications</p>
                  <p className="text-xs text-yellow-700">{data.osha_implications}</p>
                </div>
              )}

              {/* Pattern insight */}
              {data.pattern_insight && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Pattern Insight</p>
                  <p className="text-xs text-gray-600 italic">{data.pattern_insight}</p>
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center gap-4 text-xs text-gray-400 pt-1 border-t border-gray-100">
                <span>
                  Complexity:{" "}
                  <span className={`font-medium ${COMPLEXITY_STYLES[data.estimated_complexity] ?? ""}`}>
                    {data.estimated_complexity}
                  </span>
                </span>
                <span>
                  Suggested next:{" "}
                  <span className="font-medium text-indigo-600">
                    {STATUS_LABELS[data.suggested_next_status] ?? data.suggested_next_status}
                  </span>
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
