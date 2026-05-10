"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import axios from "axios";
import { useWebSocket } from "../../hooks/useWebSocket";
import { useAuth } from "../../context/AuthContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { API_URL } from "../../lib/api";
import QuickActions from "./QuickActions";

interface CommandSummary {
  total_incidents: number; open_incidents: number; critical_incidents: number;
  average_risk_score: number; escalated_case_count: number;
  open_cases_by_status: Record<string, number>;
  escalated_cases: { id: string; incident_id: string; priority: string; escalation_level: number; updated_at: string }[];
}

interface CenterHeat {
  center_id: string; name: string; lat: number; lng: number;
  incident_count: number; heat_score: number; emerging_risk_level: string;
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

const RISK_STYLES: Record<string, string> = {
  high: "bg-red-100 text-red-700", medium: "bg-orange-100 text-orange-700", low: "bg-green-100 text-green-700",
};

export default function DistrictManagerView() {
  const { token } = useAuth();
  const { t } = useWorkspace();
  const [summary, setSummary] = useState<CommandSummary | null>(null);
  const [centers, setCenters] = useState<CenterHeat[]>([]);
  const [loading, setLoading] = useState(true);

  const { lastEvent } = useWebSocket(token);

  const fetch = useCallback(async () => {
    try {
      const [sRes, cRes] = await Promise.all([
        axios.get<CommandSummary>(`${API_URL}/command/summary`),
        axios.get<CenterHeat[]>(`${API_URL}/map/heat?timeframe=30d`).catch(() => ({ data: [] })),
      ]);
      setSummary(sRes.data);
      setCenters((cRes as { data: CenterHeat[] }).data);
    } catch { /* offline */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  useEffect(() => {
    if (lastEvent && ["CASE_ESCALATED", "INCIDENT_CREATED"].includes(lastEvent.type)) fetch();
  }, [lastEvent, fetch]);

  return (
    <div className="flex flex-col gap-5">
      <QuickActions />

      {loading ? (
        <div className="text-center py-12 text-sm text-gray-400">Loading district data…</div>
      ) : (
        <>
          {/* Metrics */}
          {summary && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
                <p className="text-xs text-gray-500 font-medium">Open {t("incident","Incidents")}</p>
                <p className={`text-2xl font-bold mt-1 ${summary.open_incidents > 5 ? "text-orange-600" : "text-gray-900"}`}>
                  {summary.open_incidents}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
                <p className="text-xs text-gray-500 font-medium">Critical</p>
                <p className={`text-2xl font-bold mt-1 ${summary.critical_incidents > 0 ? "text-red-600" : "text-gray-900"}`}>
                  {summary.critical_incidents}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
                <p className="text-xs text-gray-500 font-medium">Active Escalations</p>
                <p className={`text-2xl font-bold mt-1 ${summary.escalated_case_count > 0 ? "text-orange-600" : "text-green-600"}`}>
                  {summary.escalated_case_count}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
                <p className="text-xs text-gray-500 font-medium">Avg Risk Score</p>
                <p className={`text-2xl font-bold mt-1 ${summary.average_risk_score >= 70 ? "text-red-600" : "text-gray-900"}`}>
                  {summary.average_risk_score}/100
                </p>
              </div>
            </div>
          )}

          {/* Center comparison + escalations */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Center heat comparison */}
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-5 py-3 border-b border-gray-100 bg-indigo-50 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-indigo-800">{t("center","Center")} Risk Comparison</h2>
                <Link href="/map" className="text-xs text-indigo-600 hover:underline">Full Map →</Link>
              </div>
              <div className="divide-y divide-gray-100">
                {centers.length === 0 ? (
                  <div className="px-5 py-4 text-xs text-gray-400">
                    <p className="italic mb-2">No center data yet.</p>
                    <Link href="/map" className="text-indigo-600 hover:underline">Register centers on the Risk Map →</Link>
                  </div>
                ) : centers.slice(0, 8).map((c) => (
                  <div key={c.center_id} className="flex items-center gap-3 px-5 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{c.name}</p>
                      <p className="text-xs text-gray-400">{c.incident_count} incidents</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-20 bg-gray-200 rounded-full h-1.5">
                        <div className="h-1.5 rounded-full bg-indigo-500 transition-all"
                          style={{ width: `${Math.min(100, c.heat_score)}%` }} />
                      </div>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${RISK_STYLES[c.emerging_risk_level] ?? ""}`}>
                        {c.emerging_risk_level}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Escalations */}
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-5 py-3 border-b border-gray-100 bg-orange-50 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-orange-800">Escalation Tracker</h2>
                <Link href="/cases" className="text-xs text-orange-600 hover:underline">All Cases →</Link>
              </div>
              <div className="divide-y divide-gray-100">
                {summary?.escalated_cases && summary.escalated_cases.length > 0 ? (
                  summary.escalated_cases.map((c) => (
                    <Link key={c.id} href="/cases"
                      className="flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50">
                      <span className={`text-sm font-bold flex-shrink-0 ${
                        c.escalation_level >= 3 ? "text-red-600" : "text-orange-600"
                      }`}>
                        L{c.escalation_level}
                      </span>
                      <span className="text-sm text-gray-700 capitalize flex-1">{c.priority}</span>
                      <span className="text-xs text-gray-400">{relTime(c.updated_at)}</span>
                    </Link>
                  ))
                ) : (
                  <p className="px-5 py-4 text-xs text-green-600">✓ No active escalations</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
