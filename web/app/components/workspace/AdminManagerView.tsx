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

const ESCALATION_LABELS: Record<number, string> = { 1: "SUP", 2: "SD", 3: "EXEC" };

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
      <QuickActions />

      {empty ? (
        <EmptyState role={profile?.primary_role ?? "admin"} t={t} />
      ) : loading ? (
        <LoadingSkeleton />
      ) : data && (
        <>
          {/* Metric cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard label="Total Incidents" value={data.total_incidents} />
            <MetricCard label="Open" value={data.open_incidents}
              accent={data.open_incidents > 5 ? "#c2410c" : undefined} />
            <MetricCard label="Critical" value={data.critical_incidents}
              accent={data.critical_incidents > 0 ? "#b91c1c" : undefined} />
            <MetricCard
              label="Avg Risk Score"
              value={`${data.average_risk_score}`}
              suffix="/100"
              accent={data.average_risk_score >= 70 ? "#b91c1c" : data.average_risk_score >= 40 ? "#c2410c" : undefined}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Open cases by status */}
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--pg-border)", boxShadow: "var(--shadow-card)" }}>
              <div className="px-5 py-3 bg-white" style={{ borderBottom: "1px solid var(--pg-border-soft)" }}>
                <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--pg-text-muted)", letterSpacing: "0.06em" }}>
                  {t("case", "Cases")} by Status
                </h2>
              </div>
              <div className="bg-white divide-y" style={{ divideColor: "var(--pg-border-soft)" }}>
                {Object.entries(data.open_cases_by_status).map(([s, c]) => (
                  <div key={s} className="flex items-center justify-between px-5 py-2.5">
                    <span className="text-sm capitalize" style={{ color: "var(--pg-text-sub)" }}>{s.replace(/_/g, " ")}</span>
                    <span className="text-sm font-bold tabular-nums" style={{ color: "var(--pg-navy)" }}>{c}</span>
                  </div>
                ))}
                {Object.keys(data.open_cases_by_status).length === 0 && (
                  <p className="px-5 py-4 text-xs italic" style={{ color: "var(--pg-text-muted)" }}>No open cases</p>
                )}
              </div>
            </div>

            {/* Cases under review */}
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--pg-border)", boxShadow: "var(--shadow-card)" }}>
              <div className="px-5 py-3 flex items-center justify-between bg-white" style={{ borderBottom: "1px solid var(--pg-border-soft)" }}>
                <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--pg-text-muted)", letterSpacing: "0.06em" }}>
                  Cases Under Review
                </h2>
                {data.escalated_case_count > 0 && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(194,65,12,0.1)", color: "#c2410c" }}>
                    {data.escalated_case_count}
                  </span>
                )}
              </div>
              <div className="bg-white divide-y" style={{ divideColor: "var(--pg-border-soft)" }}>
                {data.escalated_cases.slice(0, 5).map((c) => (
                  <Link key={c.id} href="/cases"
                    className="flex items-center gap-2.5 px-5 py-2.5 transition-colors"
                    style={{ color: "inherit" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(242,245,249,0.7)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded"
                      style={{
                        background: c.escalation_level >= 3 ? "rgba(185,28,28,0.1)" : "rgba(194,65,12,0.1)",
                        color: c.escalation_level >= 3 ? "#b91c1c" : "#c2410c",
                      }}>
                      {ESCALATION_LABELS[c.escalation_level] ?? `L${c.escalation_level}`}
                    </span>
                    <span className="text-xs capitalize flex-1 truncate" style={{ color: "var(--pg-text-sub)" }}>
                      {c.priority} · {c.status.replace(/_/g, " ")}
                    </span>
                    <span className="text-xs flex-shrink-0" style={{ color: "var(--pg-text-muted)" }}>
                      {relTime(c.updated_at)}
                    </span>
                  </Link>
                ))}
                {data.escalated_cases.length === 0 && (
                  <p className="px-5 py-4 text-xs italic" style={{ color: "var(--pg-text-muted)" }}>No active escalations</p>
                )}
              </div>
            </div>

            {/* Activity stream */}
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--pg-border)", boxShadow: "var(--shadow-card)" }}>
              <div className="px-5 py-3 flex items-center justify-between bg-white" style={{ borderBottom: "1px solid var(--pg-border-soft)" }}>
                <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--pg-text-muted)", letterSpacing: "0.06em" }}>
                  Recent Activity
                </h2>
                {data.unprocessed_automation_count > 0 && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(217,119,6,0.1)", color: "#b45309" }}>
                    {data.unprocessed_automation_count} pending
                  </span>
                )}
              </div>
              <div className="bg-white divide-y" style={{ divideColor: "var(--pg-border-soft)" }}>
                {data.recent_activity.slice(0, 6).map((a) => (
                  <div key={a.id} className="px-5 py-2.5">
                    <p className="text-xs capitalize font-medium" style={{ color: "var(--pg-text)" }}>
                      {a.action.replace(/_/g, " ")}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--pg-text-muted)" }}>
                      {a.resource_type} · {relTime(a.created_at)}
                    </p>
                  </div>
                ))}
                {data.recent_activity.length === 0 && (
                  <p className="px-5 py-4 text-xs italic" style={{ color: "var(--pg-text-muted)" }}>No recent activity</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MetricCard({ label, value, suffix, accent }: {
  label: string; value: string | number; suffix?: string; accent?: string;
}) {
  return (
    <div
      className="rounded-xl px-5 pt-4 pb-3.5 transition-shadow bg-white"
      style={{ border: "1px solid var(--pg-border)", boxShadow: "var(--shadow-card)" }}
    >
      <p className="text-xs font-medium uppercase tracking-widest" style={{ color: "var(--pg-text-muted)", letterSpacing: "0.05em" }}>
        {label}
      </p>
      <div className="flex items-baseline gap-0.5 mt-1.5">
        <p className="text-2xl font-bold tabular-nums leading-none" style={{ color: accent ?? "var(--pg-navy)" }}>
          {value}
        </p>
        {suffix && <span className="text-sm" style={{ color: "var(--pg-text-muted)" }}>{suffix}</span>}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-5 animate-pulse">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="pg-skeleton h-20 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="pg-skeleton h-48 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function EmptyState({ role, t }: { role: string; t: (k: string, fb?: string) => string }) {
  return (
    <div
      className="rounded-xl px-8 py-12 text-center bg-white"
      style={{ border: "1px solid var(--pg-border)", boxShadow: "var(--shadow-card)" }}
    >
      <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center"
        style={{ background: "rgba(30,58,95,0.08)" }}>
        <svg width="24" height="27" viewBox="0 0 20 22" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M10 1L18 4.5V10.5C18 15.2 14.4 19.3 10 21C5.6 19.3 2 15.2 2 10.5V4.5L10 1Z"
            fill="rgba(30,58,95,0.1)" stroke="rgba(30,58,95,0.4)" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M7 11L9.5 13.5L13.5 8.5" stroke="rgba(30,58,95,0.6)" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h2 className="text-base font-semibold" style={{ color: "var(--pg-navy)" }}>Welcome to PackGuardian</h2>
      <p className="text-sm mt-1 mb-5" style={{ color: "var(--pg-text-muted)", maxWidth: "320px", margin: "8px auto 20px" }}>
        Your operational safety platform is ready. Start by reporting your first {t("incident", "incident")} or reviewing OSHA compliance status.
      </p>
      <div className="flex items-center justify-center gap-3">
        <Link href="/mobile/incident"
          className="text-white text-sm font-medium px-5 py-2 rounded-lg transition-opacity hover:opacity-90"
          style={{ background: "var(--gradient-navy)" }}>
          Report {t("incident", "Incident")}
        </Link>
        <Link href="/osha"
          className="text-sm font-medium px-5 py-2 rounded-lg transition-all border"
          style={{ color: "var(--pg-slate)", borderColor: "var(--pg-border)", background: "white" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--pg-mist)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "white"; }}>
          OSHA Reports
        </Link>
      </div>
    </div>
  );
}
