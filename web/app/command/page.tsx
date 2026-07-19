"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { useWebSocket } from "../hooks/useWebSocket";
import { API_URL } from "../lib/api";
import SafetySignals from "../components/SafetySignals";
import CenterHealthPanel from "../components/CenterHealthPanel";

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
  const [now, setNow] = useState(Date.now());

  // Tick clock every 30s for stale indicator
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const isStale = lastUpdated && (now - lastUpdated.getTime()) > 3 * 60 * 1000;

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
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Command Center</h1>
          <p className="text-sm text-gray-400 mt-0.5 flex items-center gap-2">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${connected ? "bg-green-400" : "bg-gray-300"}`} />
            {connected ? "Live" : "Polling"}
            {lastUpdated && ` · Updated ${relativeTime(lastUpdated.toISOString())}`}
          </p>
        </div>
        <button onClick={fetch} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 border border-gray-200 rounded-lg bg-white flex-shrink-0 mt-0.5">
          ↻ Refresh
        </button>
      </div>

      {error && <div className="text-sm bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3">{error}</div>}
      {isStale && !error && (
        <div className="text-xs bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-4 py-2 flex items-center gap-2">
          <span>⚠</span> Data may be stale — <button onClick={fetch} className="underline font-medium">refresh now</button>
        </div>
      )}

      {loading ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 px-5 py-4 animate-pulse">
                <div className="h-3 bg-gray-200 rounded w-2/3 mb-3" />
                <div className="h-7 bg-gray-200 rounded w-1/2" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 px-5 py-4 animate-pulse">
                <div className="h-3 bg-gray-200 rounded w-2/3 mb-3" />
                <div className="h-7 bg-gray-200 rounded w-1/3" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 animate-pulse">
                <div className="px-5 py-3 border-b border-gray-100">
                  <div className="h-4 bg-gray-200 rounded w-1/2" />
                </div>
                <div className="p-4 space-y-3">
                  {[...Array(4)].map((_, j) => (
                    <div key={j} className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-gray-200 flex-shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 bg-gray-200 rounded w-3/4" />
                        <div className="h-2.5 bg-gray-100 rounded w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
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
            <MetricCard label="Pending Actions" value={data.unprocessed_automation_count}
              sub={data.unprocessed_automation_count > 0 ? "Automation events queued" : undefined}
              accent={data.unprocessed_automation_count > 0 ? "text-yellow-600" : "text-gray-900"} />
            {Object.entries(data.open_cases_by_status).map(([s, c]) => (
              <MetricCard key={s} label={s.replace(/_/g, " ")} value={c} />
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Escalation ticker */}
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-5 py-3 border-b border-gray-100 bg-orange-50 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-orange-800">Cases Under Review</h2>
                <span className="text-xs font-bold text-orange-700">{data.escalated_cases.length}</span>
              </div>
              <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
                {data.escalated_cases.length === 0 && (
                  <p className="px-5 py-4 text-xs text-gray-400 italic">No active escalations</p>
                )}
                {data.escalated_cases.map((c) => (
                  <Link key={c.id} href="/cases"
                    className={`flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors ${c.escalation_level >= 2 ? "bg-red-50/30" : ""}`}>
                    <div className="flex-shrink-0 relative">
                      {c.escalation_level >= 2 && (
                        <span className="absolute inset-0 rounded-full animate-ping bg-red-400 opacity-40" />
                      )}
                      <span className={`relative text-xs font-bold leading-tight ${c.escalation_level >= 3 ? "text-red-600" : c.escalation_level >= 2 ? "text-orange-600" : "text-yellow-600"}`}>
                        {c.escalation_level >= 3 ? "EXEC" : c.escalation_level >= 2 ? "SD" : "SUP"}
                      </span>
                    </div>
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
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between" style={{ borderBottomColor: "var(--pg-border-soft)" }}>
                <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--pg-text-muted)", letterSpacing: "0.06em" }}>Activity Stream</h2>
                <span className="flex items-center gap-1 text-xs" style={{ color: "var(--pg-text-muted)" }}>
                  <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-emerald-400" : "bg-gray-300"}`} />
                  {connected ? "Live" : "Polling"}
                </span>
              </div>
              <div className="divide-y max-h-72 overflow-y-auto" style={{ divideColor: "var(--pg-border-soft)" }}>
                {data.recent_activity.map((a) => {
                  const href = a.resource_type === "incident" ? "/safety" : a.resource_type === "case" ? "/cases" : a.resource_type === "org" ? "/organizations" : null;
                  const inner = (
                    <>
                      <span className="text-sm leading-tight flex-shrink-0 w-6 text-center" title={a.action} style={{ color: "var(--pg-text-muted)" }}>
                        {ACTION_ICONS[a.action] ?? "·"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium capitalize" style={{ color: "var(--pg-text)" }}>{a.action.replace(/_/g," ")}</p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--pg-text-muted)" }}>{a.resource_type} · {relativeTime(a.created_at)}</p>
                      </div>
                      {href && <span className="text-xs flex-shrink-0" style={{ color: "var(--pg-text-muted)" }}>→</span>}
                    </>
                  );
                  return href ? (
                    <Link key={a.id} href={href}
                      className="flex items-start gap-2.5 px-4 py-2.5 transition-colors"
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--pg-surface)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                      {inner}
                    </Link>
                  ) : (
                    <div key={a.id} className="flex items-start gap-2.5 px-4 py-2.5">{inner}</div>
                  );
                })}
                {data.recent_activity.length === 0 && (
                  <p className="px-5 py-4 text-xs italic" style={{ color: "var(--pg-text-muted)" }}>No recent activity</p>
                )}
              </div>
            </div>

            {/* Automation event feed */}
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between" style={{ borderBottomColor: "var(--pg-border-soft)" }}>
                <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--pg-text-muted)", letterSpacing: "0.06em" }}>System Events</h2>
                {data.unprocessed_automation_count > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: "rgba(217,119,6,0.1)", color: "#b45309" }}>
                    {data.unprocessed_automation_count} pending
                  </span>
                )}
              </div>
              <div className="divide-y max-h-72 overflow-y-auto" style={{ divideColor: "var(--pg-border-soft)" }}>
                {data.recent_automation_events.map((e) => {
                  const incidentId = e.payload.incident_id ? String(e.payload.incident_id) : null;
                  const centerId = e.payload.center_id ? String(e.payload.center_id) : null;
                  const href = incidentId ? "/cases" : centerId ? "/map" : "/safety";
                  return (
                    <Link key={e.id} href={href}
                      className="flex items-center gap-2.5 px-4 py-2.5 transition-colors"
                      onMouseEnter={(ev) => { (ev.currentTarget as HTMLElement).style.background = "var(--pg-surface)"; }}
                      onMouseLeave={(ev) => { (ev.currentTarget as HTMLElement).style.background = "transparent"; }}
                    >
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${SEVERITY_DOT[e.severity] ?? "bg-gray-400"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium" style={{ color: "var(--pg-text)" }}>
                          {EVENT_LABELS[e.event_type] ?? e.event_type.replace(/_/g," ")}
                        </p>
                        <p className="text-xs truncate mt-0.5" style={{ color: "var(--pg-text-muted)" }}>
                          {centerId ? `${centerId} · ` : ""}{relativeTime(e.created_at)}
                        </p>
                      </div>
                      {!e.processed_at && (
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0 animate-pulse" title="Pending review" />
                      )}
                      <span className="text-xs flex-shrink-0" style={{ color: "var(--pg-text-muted)" }}>→</span>
                    </Link>
                  );
                })}
                {data.recent_automation_events.length === 0 && (
                  <p className="px-5 py-4 text-xs italic" style={{ color: "var(--pg-text-muted)" }}>No recent events</p>
                )}
              </div>
            </div>
          </div>

          {/* Safety Signals */}
          <SafetySignals />

          {/* Center Health — multi-location overview */}
          <CenterHealthPanel compact />

          {/* Quick links */}
          <div className="flex items-center gap-3 flex-wrap">
            {[
              { href: "/executive", label: "→ Executive Briefing" },
              { href: "/cases", label: "→ Case Management" },
              { href: "/map", label: "→ Risk Map" },
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
