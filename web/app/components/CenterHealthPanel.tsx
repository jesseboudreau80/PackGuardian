"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { API_URL } from "../lib/api";

interface CenterHealth {
  center_code: string;
  center_name: string;
  city: string;
  state: string;
  health_score: number;
  tier: string;
  trend: string;
  incident_count_30d: number;
  open_corrective_actions: number;
  overdue_corrective_actions: number;
  escalated_cases: number;
  avg_risk_score: number | null;
  last_inspection_score: number | null;
  last_inspection_date: string | null;
}

const TIER_STYLE: Record<string, { bar: string; text: string; bg: string; label: string }> = {
  good:            { bar: "bg-green-400",  text: "text-green-700",  bg: "bg-green-50",  label: "Good" },
  fair:            { bar: "bg-yellow-400", text: "text-yellow-700", bg: "bg-yellow-50", label: "Fair" },
  needs_attention: { bar: "bg-orange-400", text: "text-orange-700", bg: "bg-orange-50", label: "Needs Attention" },
  critical:        { bar: "bg-red-500",    text: "text-red-700",    bg: "bg-red-50",    label: "Critical" },
};

const TREND_ICON: Record<string, string> = {
  improving: "↑",
  stable:    "→",
  declining: "↓",
};

const TREND_COLOR: Record<string, string> = {
  improving: "text-green-500",
  stable:    "text-gray-400",
  declining: "text-red-500",
};

export default function CenterHealthPanel({ compact = false }: { compact?: boolean }) {
  const [centers, setCenters] = useState<CenterHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await axios.get<CenterHealth[]>(`${API_URL}/command/center-health`);
      setCenters(r.data);
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const display = expanded ? centers : centers.slice(0, compact ? 3 : 5);
  const atRisk = centers.filter((c) => c.tier === "critical" || c.tier === "needs_attention").length;

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      {/* Header */}
      <div className={`px-5 py-3 border-b border-gray-100 flex items-center justify-between ${
        atRisk > 0 ? "bg-orange-50" : "bg-gray-50"
      }`}>
        <div>
          <h2 className={`text-sm font-semibold ${atRisk > 0 ? "text-orange-800" : "text-gray-700"}`}>
            Center Health
          </h2>
          {!loading && (
            <p className="text-xs text-gray-400 mt-0.5">
              {atRisk > 0
                ? `${atRisk} location${atRisk !== 1 ? "s" : ""} need attention`
                : "All locations operational"}
            </p>
          )}
        </div>
        <button onClick={load} className="text-xs text-gray-400 hover:text-gray-600">↻</button>
      </div>

      {/* Content */}
      <div className="divide-y divide-gray-50">
        {loading ? (
          [...Array(compact ? 3 : 5)].map((_, i) => (
            <div key={i} className="px-5 py-3 animate-pulse flex items-center gap-3">
              <div className="h-3 bg-gray-200 rounded w-1/4" />
              <div className="flex-1 h-1.5 bg-gray-100 rounded-full" />
              <div className="h-3 bg-gray-200 rounded w-8" />
            </div>
          ))
        ) : centers.length === 0 ? (
          <p className="px-5 py-4 text-xs text-gray-400 italic">No centers configured</p>
        ) : (
          display.map((c) => {
            const t = TIER_STYLE[c.tier] ?? TIER_STYLE.fair;
            return (
              <div key={c.center_code} className={`px-5 py-3 ${c.tier === "critical" ? "bg-red-50/30" : ""}`}>
                <div className="flex items-center gap-3">
                  {/* Center name + location */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-semibold text-gray-800 truncate">{c.center_name}</p>
                      <span className={`text-xs font-bold ${TREND_COLOR[c.trend] ?? "text-gray-400"}`}
                            title={`Trend: ${c.trend}`}>
                        {TREND_ICON[c.trend]}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400">{c.city}, {c.state}</p>
                  </div>

                  {/* Health score bar */}
                  <div className="w-20 flex-shrink-0">
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${t.bar}`}
                          style={{ width: `${c.health_score}%` }}
                        />
                      </div>
                      <span className={`text-xs font-bold flex-shrink-0 ${t.text}`}>{c.health_score}</span>
                    </div>
                    <p className={`text-xs mt-0.5 ${t.text}`}>{t.label}</p>
                  </div>

                  {/* Incident count */}
                  <div className="text-right flex-shrink-0 w-12">
                    <p className={`text-sm font-bold ${c.incident_count_30d > 3 ? "text-orange-600" : "text-gray-600"}`}>
                      {c.incident_count_30d}
                    </p>
                    <p className="text-xs text-gray-400">30d</p>
                  </div>
                </div>

                {/* Sub-row: flags */}
                {(c.overdue_corrective_actions > 0 || c.escalated_cases > 0) && (
                  <div className="flex items-center gap-3 mt-1.5 pl-0">
                    {c.overdue_corrective_actions > 0 && (
                      <span className="text-xs text-red-600 font-medium">
                        ⚑ {c.overdue_corrective_actions} follow-up needed
                      </span>
                    )}
                    {c.escalated_cases > 0 && (
                      <span className="text-xs text-orange-600 font-medium">
                        ⬆ {c.escalated_cases} under review
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Show more / less */}
      {!loading && centers.length > (compact ? 3 : 5) && (
        <div className="px-5 py-2 border-t border-gray-100">
          <button onClick={() => setExpanded((p) => !p)}
            className="text-xs text-indigo-600 hover:underline">
            {expanded ? "Show fewer" : `Show all ${centers.length} locations`}
          </button>
        </div>
      )}
    </div>
  );
}
