import type { Incident } from "../types/incident";

const severityColors: Record<string, string> = {
  low: "bg-green-100 text-green-700",
  medium: "bg-yellow-100 text-yellow-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

const statusColors: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  in_progress: "bg-purple-100 text-purple-700",
  closed: "bg-gray-100 text-gray-600",
};

function riskColor(score: number): string {
  if (score <= 33) return "text-green-600";
  if (score <= 66) return "text-yellow-600";
  return "text-red-600";
}

function riskLabel(score: number): string {
  if (score <= 33) return "Low Risk";
  if (score <= 66) return "Medium Risk";
  return "High Risk";
}

interface Props {
  incidents: Incident[];
}

export default function IncidentList({ incidents }: Props) {
  if (incidents.length === 0) {
    return (
      <p className="text-gray-500 text-sm text-center py-10">
        No incidents reported yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {incidents.map((inc) => (
        <div
          key={inc.id}
          className="bg-white border border-gray-200 rounded-lg px-5 py-4 space-y-3"
        >
          {/* ── Row 1: type, badges, risk score ── */}
          <div className="flex flex-col sm:flex-row sm:items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{inc.incident_type}</span>

                {inc.adjusted_severity ? (
                  // Escalated: show "Reported: medium → Adjusted: high"
                  <span className="inline-flex items-center gap-1 text-xs font-medium">
                    <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-500">
                      Reported: {inc.reported_severity}
                    </span>
                    <span className="text-gray-400">→</span>
                    <span
                      className={`px-2 py-0.5 rounded ${severityColors[inc.adjusted_severity] ?? ""}`}
                    >
                      Adjusted: {inc.adjusted_severity}
                    </span>
                  </span>
                ) : (
                  // No escalation: plain severity badge
                  <span
                    className={`text-xs px-2 py-0.5 rounded font-medium ${severityColors[inc.reported_severity] ?? ""}`}
                  >
                    {inc.reported_severity}
                  </span>
                )}

                <span
                  className={`text-xs px-2 py-0.5 rounded font-medium ${statusColors[inc.status] ?? ""}`}
                >
                  {inc.status.replace("_", " ")}
                </span>
                {inc.category && (
                  <span className="text-xs px-2 py-0.5 rounded font-medium bg-indigo-50 text-indigo-700">
                    {inc.category}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">{inc.description}</p>
            </div>

            <div className="shrink-0 text-right">
              {inc.risk_score !== null && (
                <div className="mb-1">
                  <span
                    className={`text-lg font-bold tabular-nums ${riskColor(inc.risk_score)}`}
                  >
                    {inc.risk_score}
                  </span>
                  <span className="text-xs text-gray-400 ml-1">/100</span>
                  <p className={`text-xs font-medium ${riskColor(inc.risk_score)}`}>
                    {riskLabel(inc.risk_score)}
                  </p>
                </div>
              )}
              <p className="text-xs text-gray-400">{inc.center_id}</p>
              <p className="text-xs text-gray-400">
                {new Date(inc.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* ── Row 2: recommended actions ── */}
          {inc.recommendations && inc.recommendations.length > 0 && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Recommended Actions
              </p>
              <ul className="space-y-1">
                {inc.recommendations.map((rec, i) => (
                  <li key={i} className="flex gap-2 text-xs text-gray-600">
                    <span className="shrink-0 text-indigo-400 font-bold">{i + 1}.</span>
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── Row 3: why this was flagged ── */}
          {inc.explanation && (
            <div className="border-t border-gray-100 pt-3 flex gap-2">
              <span className="shrink-0 text-amber-400 mt-0.5" aria-hidden="true">
                ⚑
              </span>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">
                  Why this was flagged
                </p>
                <p className="text-xs text-gray-500">{inc.explanation}</p>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
