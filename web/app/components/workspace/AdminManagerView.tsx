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
  total_incidents: number; open_incidents: number;
  critical_incidents: number; average_risk_score: number;
  open_cases_by_status: Record<string, number>;
  escalated_case_count: number;
  unprocessed_automation_count: number;
  escalated_cases: { id: string; incident_id: string; status: string; priority: string; escalation_level: number; updated_at: string }[];
  recent_activity: { id: string; action: string; resource_type: string; created_at: string }[];
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export default function AdminManagerView() {
  const { token } = useAuth();
  const { profile, t } = useWorkspace();
  const [data, setData] = useState<CommandSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const { lastEvent } = useWebSocket(token);

  const fetch = useCallback(async () => {
    try {
      const r = await axios.get<CommandSummary>(`${API_URL}/command/summary`);
      setData(r.data);
    } catch { /* offline */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  useEffect(() => {
    if (lastEvent && ["INCIDENT_CREATED", "CASE_ASSIGNED", "CASE_ESCALATED"].includes(lastEvent.type)) fetch();
  }, [lastEvent, fetch]);

  const empty = !loading && !data;

  return (
    <div className="flex flex-col gap-5">
      {/* Quick actions */}
      <QuickActions />

      {empty ? (
        <EmptyState role={profile?.primary_role ?? "admin"} t={t} />
      ) : loading ? (
        <div className="text-center py-12 text-sm text-gray-400">Loading dashboard…</div>
      ) : data && (
        <>
          {/* Metric cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard label="Total Incidents" value={data.total_incidents} />
            <MetricCard label="Open Incidents" value={data.open_incidents}
              accent={data.open_incidents > 5 ? "text-orange-600" : undefined} />
            <MetricCard label="Critical" value={data.critical_incidents}
              accent={data.critical_incidents > 0 ? "text-red-600" : undefined} />
            <MetricCard label="Avg Risk Score" value={`${data.average_risk_score}/100`}
              accent={data.average_risk_score >= 70 ? "text-red-600" : data.average_risk_score >= 40 ? "text-orange-600" : undefined} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Open cases by status */}
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-5 py-3 border-b border-gray-100 bg-indigo-50">
                <h2 className="text-sm font-semibold text-indigo-800">Open {t("case", "Cases")} by Status</h2>
              </div>
              <div className="divide-y divide-gray-100">
                {Object.entries(data.open_cases_by_status).map(([s, c]) => (
                  <div key={s} className="flex items-center justify-between px-5 py-2.5">
                    <span className="text-sm text-gray-600 capitalize">{s.replace(/_/g," ")}</span>
                    <span className="text-sm font-bold text-gray-800">{c}</span>
                  </div>
                ))}
                {Object.keys(data.open_cases_by_status).length === 0 && (
                  <p className="px-5 py-4 text-xs text-gray-400 italic">No open cases</p>
                )}
              </div>
            </div>

            {/* Escalations */}
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-5 py-3 border-b border-gray-100 bg-orange-50 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-orange-800">Active Escalations</h2>
                <span className="text-xs font-bold text-orange-700">{data.escalated_case_count}</span>
              </div>
              <div className="divide-y divide-gray-100">
                {data.escalated_cases.slice(0, 5).map((c) => (
                  <Link key={c.id} href="/cases"
                    className="flex items-center gap-2 px-5 py-2.5 hover:bg-gray-50">
                    <span className={`text-xs font-bold ${c.escalation_level >= 3 ? "text-red-600" : "text-orange-600"}`}>
                      L{c.escalation_level}
                    </span>
                    <span className="text-xs text-gray-600 capitalize">{c.priority} · {c.status.replace(/_/g," ")}</span>
                    <span className="ml-auto text-xs text-gray-400">{relTime(c.updated_at)}</span>
                  </Link>
                ))}
                {data.escalated_cases.length === 0 && (
                  <p className="px-5 py-4 text-xs text-gray-400 italic">No active escalations</p>
                )}
              </div>
            </div>

            {/* Activity stream */}
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700">Recent Activity</h2>
                {data.unprocessed_automation_count > 0 && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                    {data.unprocessed_automation_count} pending
                  </span>
                )}
              </div>
              <div className="divide-y divide-gray-100">
                {data.recent_activity.slice(0, 6).map((a) => (
                  <div key={a.id} className="px-5 py-2.5">
                    <p className="text-xs text-gray-700 capitalize">{a.action.replace(/_/g," ")}</p>
                    <p className="text-xs text-gray-400">{a.resource_type} · {relTime(a.created_at)}</p>
                  </div>
                ))}
                {data.recent_activity.length === 0 && (
                  <p className="px-5 py-4 text-xs text-gray-400 italic">No recent activity</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${accent ?? "text-gray-900"}`}>{value}</p>
    </div>
  );
}

function EmptyState({ role, t }: { role: string; t: (k: string, fb?: string) => string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
      <p className="text-4xl mb-3">🛡️</p>
      <h2 className="text-lg font-semibold text-gray-900">Welcome to PackGuardian</h2>
      <p className="text-sm text-gray-500 mt-1 mb-4">
        Your operational safety platform is ready. Start by reporting your first {t("incident", "incident")} or running an {t("inspection", "inspection")}.
      </p>
      <div className="flex items-center justify-center gap-3">
        <Link href="/mobile/incident" className="bg-red-600 text-white px-5 py-2 rounded-xl text-sm font-medium">
          Report {t("incident", "Incident")}
        </Link>
        <Link href="/mobile/inspect" className="bg-green-600 text-white px-5 py-2 rounded-xl text-sm font-medium">
          Start {t("inspection", "Inspection")}
        </Link>
      </div>
    </div>
  );
}
