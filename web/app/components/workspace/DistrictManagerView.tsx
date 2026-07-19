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
  escalated_cases: { id: string; incident_id: string; priority: string; escalation_level: number; status: string; updated_at: string }[];
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

const RISK_ACCENT: Record<string, string> = {
  high: "#b91c1c", medium: "#c2410c", low: "#15803d",
};

const ESC_LABEL: Record<number, string> = { 1: "SUP", 2: "SD", 3: "EXEC" };

function MetricCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="rounded-xl px-5 pt-4 pb-3.5 bg-white" style={{ border: "1px solid var(--pg-border)", boxShadow: "var(--shadow-card)" }}>
      <p className="text-xs font-medium uppercase tracking-widest" style={{ color: "var(--pg-text-muted)", letterSpacing: "0.05em" }}>{label}</p>
      <p className="text-2xl font-bold tabular-nums mt-1.5 leading-none" style={{ color: accent ?? "var(--pg-navy)" }}>{value}</p>
    </div>
  );
}

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
        <div className="flex flex-col gap-5 animate-pulse">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="pg-skeleton h-20 rounded-xl" />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {Array.from({ length: 2 }).map((_, i) => <div key={i} className="pg-skeleton h-56 rounded-xl" />)}
          </div>
        </div>
      ) : (
        <>
          {summary && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MetricCard label={`Open ${t("incident","Incidents")}`} value={summary.open_incidents}
                accent={summary.open_incidents > 5 ? "#c2410c" : undefined} />
              <MetricCard label="Critical" value={summary.critical_incidents}
                accent={summary.critical_incidents > 0 ? "#b91c1c" : undefined} />
              <MetricCard label="Escalations" value={summary.escalated_case_count}
                accent={summary.escalated_case_count > 0 ? "#c2410c" : undefined} />
              <MetricCard label="Avg Risk Score" value={`${summary.average_risk_score}/100`}
                accent={summary.average_risk_score >= 70 ? "#b91c1c" : summary.average_risk_score >= 40 ? "#c2410c" : undefined} />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Center risk comparison */}
            <div className="rounded-xl overflow-hidden bg-white" style={{ border: "1px solid var(--pg-border)", boxShadow: "var(--shadow-card)" }}>
              <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--pg-border-soft)" }}>
                <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--pg-text-muted)", letterSpacing: "0.06em" }}>
                  {t("center","Center")} Risk Comparison
                </h2>
                <Link href="/map" className="text-xs font-medium hover:underline" style={{ color: "var(--pg-steel)" }}>
                  Full Map →
                </Link>
              </div>
              <div className="divide-y" style={{ divideColor: "var(--pg-border-soft)" }}>
                {centers.length === 0 ? (
                  <div className="px-5 py-5 text-center">
                    <p className="text-xs italic mb-2" style={{ color: "var(--pg-text-muted)" }}>No center data yet.</p>
                    <Link href="/map" className="text-xs font-medium hover:underline" style={{ color: "var(--pg-steel)" }}>
                      Register centers on the Risk Map →
                    </Link>
                  </div>
                ) : centers.slice(0, 8).map((c) => (
                  <Link key={c.center_id} href="/map"
                    className="flex items-center gap-3 px-5 py-2.5 transition-colors"
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--pg-surface)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "var(--pg-text)" }}>{c.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--pg-text-muted)" }}>{c.incident_count} incidents</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-20 rounded-full h-1.5" style={{ background: "var(--pg-border)" }}>
                        <div className="h-1.5 rounded-full transition-all"
                          style={{ width: `${Math.min(100, c.heat_score)}%`, background: "var(--pg-slate)" }} />
                      </div>
                      <span className="text-xs font-semibold w-12 text-right" style={{ color: RISK_ACCENT[c.emerging_risk_level] ?? "var(--pg-text-muted)" }}>
                        {c.emerging_risk_level}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* Escalation tracker */}
            <div className="rounded-xl overflow-hidden bg-white" style={{ border: "1px solid var(--pg-border)", boxShadow: "var(--shadow-card)" }}>
              <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--pg-border-soft)" }}>
                <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--pg-text-muted)", letterSpacing: "0.06em" }}>
                  Escalation Tracker
                </h2>
                <Link href="/cases" className="text-xs font-medium hover:underline" style={{ color: "var(--pg-steel)" }}>
                  All Cases →
                </Link>
              </div>
              <div className="divide-y" style={{ divideColor: "var(--pg-border-soft)" }}>
                {summary?.escalated_cases && summary.escalated_cases.length > 0 ? (
                  summary.escalated_cases.slice(0, 8).map((c) => (
                    <Link key={c.id} href="/cases"
                      className="flex items-center gap-2.5 px-5 py-2.5 transition-colors"
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--pg-surface)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                    >
                      <span className="text-xs font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                        style={{
                          background: c.escalation_level >= 3 ? "rgba(185,28,28,0.1)" : "rgba(194,65,12,0.1)",
                          color: c.escalation_level >= 3 ? "#b91c1c" : "#c2410c",
                        }}>
                        {ESC_LABEL[c.escalation_level] ?? `L${c.escalation_level}`}
                      </span>
                      <span className="text-xs capitalize flex-1 truncate" style={{ color: "var(--pg-text-sub)" }}>
                        {c.priority} · {c.status.replace(/_/g," ")}
                      </span>
                      <span className="text-xs flex-shrink-0" style={{ color: "var(--pg-text-muted)" }}>{relTime(c.updated_at)}</span>
                    </Link>
                  ))
                ) : (
                  <div className="px-5 py-6 text-center">
                    <p className="text-xs font-medium" style={{ color: "#15803d" }}>✓ No active escalations</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
