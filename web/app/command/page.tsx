"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { useWebSocket } from "../hooks/useWebSocket";
import { API_URL } from "../lib/api";

interface Case {
  id: string; incident_id: string; status: string; priority: string;
  escalation_level: number; updated_at: string;
}
interface ActivityItem {
  id: string; actor_id: string; action: string; resource_type: string;
  resource_id: string | null; details: Record<string, unknown> | null; created_at: string;
}
interface AutomationEventSummary {
  id: string; event_type: string; severity: string;
  payload: Record<string, unknown>; created_at: string; processed_at: string | null;
}
interface CommandSummary {
  total_incidents: number; open_incidents: number;
  critical_incidents: number; average_risk_score: number;
  open_cases_by_status: Record<string, number>;
  escalated_case_count: number;
  recent_activity: ActivityItem[];
  recent_automation_events: AutomationEventSummary[];
  unprocessed_automation_count: number;
  escalated_cases: Case[];
}

const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-red-500", high: "bg-orange-400",
  medium: "bg-yellow-400", low: "bg-blue-400",
};
const EVENT_LABELS: Record<string, string> = {
  HIGH_RISK_HOTSPOT: "High Risk Hotspot", EMERGING_RISK: "Emerging Risk",
  OSHA_OVERDUE: "OSHA Overdue", INCIDENT_FINALIZED: "Incident Finalized",
};
const ACTION_ICONS: Record<string, string> = {
  incident_accessed: "👁", incident_modified: "✎", role_assigned: "👤",
  role_removed: "✕", org_created: "🏢", org_updated: "🔄",
  org_moved: "⇄", org_deleted: "🗑",
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function MetricCard({ label, value, sub, accent }: {
  label: string; value: number | string; sub?: string; accent?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${accent ?? "text-gray-900"}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// Events that warrant a command center refresh
const COMMAND_EVENTS = new Set([
  "INCIDENT_CREATED", "CASE_ASSIGNED", "CASE_ESCALATED",
  "CASE_STATUS_CHANGED", "AUTOMATION_TRIGGERED",
]);

export default function CommandPage() {
  const { isAuthenticated, token } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<CommandSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const { lastEvent, connected } = useWebSocket(isAuthenticated ? token : null);

  const fetch = useCallback(async () => {
    try {
      const r = await axios.get<CommandSummary>(`${API_URL}/command/summary`);
      setData(r.data);
      setLastUpdated(new Date());
      setError(null);
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? String(err.response?.data?.detail ?? err.message) : "Failed");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login?from=/command"); return; }
    fetch();
    // Fallback polling every 60s even when WS is connected
    const id = setInterval(fetch, 60_000);
    return () => clearInterval(id);
  }, [isAuthenticated, router, fetch]);

  // Live refresh on WS events
  useEffect(() => {
    if (lastEvent && COMMAND_EVENTS.has(lastEvent.type)) fetch();
  }, [lastEvent, fetch]);

  if (!isAuthenticated) return null;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Command Center</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Live operational intelligence
            {lastUpdated && ` · Updated: ${relativeTime(lastUpdated.toISOString())}`}
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-400" : "bg-gray-300"}`} />
          {connected ? "Live" : "Polling"}
        </div>
        <button onClick={fetch} className="text-sm text-gray-500 hover:text-gray-800 px-3 py-1.5 border border-gray-200 rounded-lg bg-white">
          Refresh
        </button>
      </div>

      {error && <div className="text-sm bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3">{error}</div>}

      {loading ? (
        <div className="text-center py-20 text-sm text-gray-400">Loading command center…</div>
      ) : data && (
        <>
          {/* Risk metric cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard label="Total Incidents" value={data.total_incidents} />
            <MetricCard label="Open Incidents" value={data.open_incidents}
              sub={`${Math.round((data.open_incidents / Math.max(data.total_incidents, 1)) * 100)}% of total`}
              accent={data.open_incidents > 10 ? "text-orange-600" : "text-gray-900"} />
            <MetricCard label="Critical Incidents" value={data.critical_incidents}
              accent={data.critical_incidents > 0 ? "text-red-600" : "text-gray-900"} />
            <MetricCard label="Avg Risk Score" value={`${data.average_risk_score}/100`}
              accent={data.average_risk_score >= 70 ? "text-red-600" : data.average_risk_score >= 40 ? "text-orange-600" : "text-gray-900"} />
          </div>

          {/* Case status + automation stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard label="Escalated Cases" value={data.escalated_case_count}
              accent={data.escalated_case_count > 0 ? "text-orange-600" : "text-gray-900"} />
            <MetricCard label="Unprocessed Events" value={data.unprocessed_automation_count}
              accent={data.unprocessed_automation_count > 0 ? "text-yellow-600" : "text-gray-900"} />
            {Object.entries(data.open_cases_by_status).map(([s, c]) => (
              <MetricCard key={s} label={s.replace(/_/g, " ")} value={c} />
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Escalation ticker */}
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-5 py-3 border-b border-gray-100 bg-orange-50 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-orange-800">Active Escalations</h2>
                <span className="text-xs font-bold text-orange-700">{data.escalated_cases.length}</span>
              </div>
              <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
                {data.escalated_cases.length === 0 && (
                  <p className="px-5 py-4 text-xs text-gray-400 italic">No active escalations</p>
                )}
                {data.escalated_cases.map((c) => (
                  <Link key={c.id} href="/cases"
                    className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50">
                    <span className={`text-sm font-bold ${c.escalation_level >= 3 ? "text-red-600" : c.escalation_level >= 2 ? "text-orange-600" : "text-yellow-600"}`}>
                      L{c.escalation_level}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono text-gray-500 truncate">{c.incident_id.slice(0,8)}…</p>
                      <p className="text-xs text-gray-400 capitalize">{c.priority} · {c.status.replace(/_/g," ")}</p>
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0">{relativeTime(c.updated_at)}</span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Live activity stream */}
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-5 py-3 border-b border-gray-100 bg-indigo-50 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-indigo-800">Activity Stream</h2>
                <span className="text-xs text-indigo-500">live</span>
              </div>
              <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
                {data.recent_activity.map((a) => (
                  <div key={a.id} className="px-4 py-2.5 flex items-start gap-2">
                    <span className="text-base leading-tight flex-shrink-0" title={a.action}>
                      {ACTION_ICONS[a.action] ?? "·"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-700 capitalize">{a.action.replace(/_/g," ")}</p>
                      <p className="text-xs text-gray-400">{a.resource_type} · {relativeTime(a.created_at)}</p>
                    </div>
                  </div>
                ))}
                {data.recent_activity.length === 0 && (
                  <p className="px-5 py-4 text-xs text-gray-400 italic">No recent activity</p>
                )}
              </div>
            </div>

            {/* Automation event feed */}
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700">Automation Events</h2>
                {data.unprocessed_automation_count > 0 && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                    {data.unprocessed_automation_count} pending
                  </span>
                )}
              </div>
              <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
                {data.recent_automation_events.map((e) => (
                  <div key={e.id} className="px-4 py-2.5 flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${SEVERITY_DOT[e.severity] ?? "bg-gray-400"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-700">
                        {EVENT_LABELS[e.event_type] ?? e.event_type}
                      </p>
                      <p className="text-xs text-gray-400 truncate">
                        {e.payload.center_id ? String(e.payload.center_id) : ""}
                        {e.payload.incident_id ? `Incident ${String(e.payload.incident_id).slice(0,8)}…` : ""}
                        {" · "}{relativeTime(e.created_at)}
                      </p>
                    </div>
                    {!e.processed_at && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" title="Unprocessed" />
                    )}
                  </div>
                ))}
                {data.recent_automation_events.length === 0 && (
                  <p className="px-5 py-4 text-xs text-gray-400 italic">No recent events</p>
                )}
              </div>
            </div>
          </div>

          {/* Quick links */}
          <div className="flex items-center gap-3 flex-wrap">
            {[
              { href: "/cases", label: "→ Case Management" },
              { href: "/map", label: "→ Risk Map" },
              { href: "/automation", label: "→ Automation" },
              { href: "/work", label: "→ My Work" },
              { href: "/osha", label: "→ OSHA Reports" },
            ].map(({ href, label }) => (
              <Link key={href} href={href}
                className="text-sm text-indigo-600 hover:text-indigo-800 hover:underline">
                {label}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
