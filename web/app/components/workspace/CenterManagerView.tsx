"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import axios from "axios";
import { useWebSocket } from "../../hooks/useWebSocket";
import { useAuth } from "../../context/AuthContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { API_URL } from "../../lib/api";
import QuickActions from "./QuickActions";

interface ShiftData {
  role_context: string;
  assigned_case_count: number; overdue_task_count: number;
  active_incident_count: number; pending_inspection_count: number;
  urgent_cases: { id: string; incident_id: string; status: string; priority: string; escalation_level: number; due_date: string | null }[];
  my_tasks: { id: string; case_id: string; title: string; due_date: string | null; overdue: boolean }[];
  alerts: { type: string; title: string; body: string; severity: string }[];
}

const PRIORITY_DOT: Record<string, string> = {
  critical: "#b91c1c", high: "#c2410c", medium: "#d97706", low: "#15803d",
};

function relTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso), now = new Date();
  const diff = d.getTime() - now.getTime();
  if (diff < 0) return "follow-up needed";
  const h = Math.floor(diff / 3600000);
  if (h < 24) return `due in ${h}h`;
  return `due ${d.toLocaleDateString()}`;
}

function MetricCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-xl px-5 pt-4 pb-3.5 bg-white" style={{ border: "1px solid var(--pg-border)", boxShadow: "var(--shadow-card)" }}>
      <p className="text-xs font-medium uppercase tracking-widest" style={{ color: "var(--pg-text-muted)", letterSpacing: "0.05em" }}>{label}</p>
      <p className="text-2xl font-bold tabular-nums mt-1.5 leading-none" style={{ color: accent ?? "var(--pg-navy)" }}>{value}</p>
    </div>
  );
}

export default function CenterManagerView() {
  const { token } = useAuth();
  const { t } = useWorkspace();
  const [data, setData] = useState<ShiftData | null>(null);
  const [loading, setLoading] = useState(true);

  const { lastEvent } = useWebSocket(token);

  const fetch = useCallback(async () => {
    try {
      const r = await axios.get<ShiftData>(`${API_URL}/mobile/my-shift`);
      setData(r.data);
    } catch { /* offline */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  useEffect(() => {
    if (lastEvent && ["CASE_ASSIGNED", "TASK_COMPLETED", "INCIDENT_CREATED"].includes(lastEvent.type)) fetch();
  }, [lastEvent, fetch]);

  const empty = !loading && !data?.assigned_case_count && !data?.active_incident_count;

  return (
    <div className="flex flex-col gap-5">
      <QuickActions />

      {/* Alerts */}
      {data?.alerts && data.alerts.length > 0 && (
        <div className="space-y-2">
          {data.alerts.map((a, i) => (
            <div key={i} className="rounded-xl px-4 py-3" style={{
              background: a.severity === "critical" ? "rgba(185,28,28,0.06)" : a.severity === "high" ? "rgba(194,65,12,0.06)" : "rgba(217,119,6,0.06)",
              border: a.severity === "critical" ? "1px solid rgba(185,28,28,0.2)" : a.severity === "high" ? "1px solid rgba(194,65,12,0.2)" : "1px solid rgba(217,119,6,0.2)",
            }}>
              <p className="text-sm font-semibold" style={{ color: a.severity === "critical" ? "#b91c1c" : a.severity === "high" ? "#c2410c" : "#b45309" }}>{a.title}</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--pg-text-sub)" }}>{a.body}</p>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-5 animate-pulse">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="pg-skeleton h-20 rounded-xl" />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {Array.from({ length: 2 }).map((_, i) => <div key={i} className="pg-skeleton h-48 rounded-xl" />)}
          </div>
        </div>
      ) : empty ? (
        <EmptyStateCenter t={t} />
      ) : data && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <MetricCard label={`My ${t("case","Cases")}`} value={data.assigned_case_count} />
            <MetricCard label="Follow-Ups Needed" value={data.overdue_task_count}
              accent={data.overdue_task_count > 0 ? "#c2410c" : undefined} />
            <MetricCard label={`Active ${t("incident","Incidents")}`} value={data.active_incident_count}
              accent={data.active_incident_count > 0 ? "#c2410c" : undefined} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Assigned cases */}
            <div className="rounded-xl overflow-hidden bg-white" style={{ border: "1px solid var(--pg-border)", boxShadow: "var(--shadow-card)" }}>
              <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--pg-border-soft)" }}>
                <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--pg-text-muted)", letterSpacing: "0.06em" }}>
                  My Assigned {t("case","Cases")}
                </h2>
              </div>
              <div className="divide-y" style={{ divideColor: "var(--pg-border-soft)" }}>
                {data.urgent_cases.length === 0 ? (
                  <p className="px-5 py-4 text-xs italic" style={{ color: "var(--pg-text-muted)" }}>No cases assigned</p>
                ) : data.urgent_cases.map((c) => (
                  <Link key={c.id} href="/cases"
                    className="flex items-center gap-2.5 px-5 py-2.5 transition-colors"
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--pg-surface)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: PRIORITY_DOT[c.priority] ?? "var(--pg-text-muted)" }} />
                    <span className="text-sm capitalize flex-1 truncate" style={{ color: "var(--pg-text-sub)" }}>
                      {c.priority} · {c.status.replace(/_/g," ")}
                    </span>
                    {c.escalation_level >= 1 && (
                      <span className="text-xs font-bold flex-shrink-0" style={{ color: "#c2410c" }}>⬆{c.escalation_level}</span>
                    )}
                    {c.due_date && (
                      <span className="text-xs flex-shrink-0" style={{ color: new Date(c.due_date) < new Date() ? "#b91c1c" : "var(--pg-text-muted)" }}>
                        {relTime(c.due_date)}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>

            {/* My tasks */}
            <div className="rounded-xl overflow-hidden bg-white" style={{ border: "1px solid var(--pg-border)", boxShadow: "var(--shadow-card)" }}>
              <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--pg-border-soft)" }}>
                <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--pg-text-muted)", letterSpacing: "0.06em" }}>My Tasks</h2>
              </div>
              <div className="divide-y" style={{ divideColor: "var(--pg-border-soft)" }}>
                {data.my_tasks.length === 0 ? (
                  <p className="px-5 py-4 text-xs italic" style={{ color: "var(--pg-text-muted)" }}>No tasks assigned</p>
                ) : data.my_tasks.map((task) => (
                  <Link key={task.id} href="/work"
                    className="flex items-center gap-2.5 px-5 py-2.5 transition-colors"
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = task.overdue ? "rgba(194,65,12,0.04)" : "var(--pg-surface)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <span className="text-sm flex-shrink-0 w-4 text-center"
                      style={{ color: task.overdue ? "#c2410c" : "var(--pg-text-muted)" }}>
                      {task.overdue ? "⏰" : "☐"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate" style={{ color: "var(--pg-text)" }}>{task.title}</p>
                      {task.due_date && (
                        <p className="text-xs mt-0.5" style={{ color: task.overdue ? "#c2410c" : "var(--pg-text-muted)" }}>
                          {relTime(task.due_date)}
                        </p>
                      )}
                    </div>
                    <span className="text-xs flex-shrink-0" style={{ color: "var(--pg-text-muted)" }}>→</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function EmptyStateCenter({ t }: { t: (k: string, fb?: string) => string }) {
  return (
    <div className="rounded-xl px-8 py-12 text-center bg-white" style={{ border: "1px solid var(--pg-border)", boxShadow: "var(--shadow-card)" }}>
      <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center"
        style={{ background: "rgba(30,58,95,0.08)" }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="3" width="18" height="18" rx="2" stroke="rgba(30,58,95,0.5)" strokeWidth="1.5" />
          <path d="M3 9h18M9 21V9" stroke="rgba(30,58,95,0.5)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <h2 className="text-base font-semibold" style={{ color: "var(--pg-navy)" }}>Your {t("center","Center")} is All Clear</h2>
      <p className="text-sm mt-1 mb-5" style={{ color: "var(--pg-text-muted)", maxWidth: "300px", margin: "8px auto 20px" }}>
        No open {t("case","cases")} or overdue items at your center. Stay proactive — report any safety concerns as they arise.
      </p>
      <Link href="/mobile/incident"
        className="text-white text-sm font-medium px-5 py-2 rounded-lg transition-opacity hover:opacity-90 inline-block"
        style={{ background: "var(--gradient-navy)" }}>
        Report an Incident
      </Link>
    </div>
  );
}
