"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { useWorkspace } from "../../context/WorkspaceContext";
import { API_URL } from "../../lib/api";
import QuickActions from "./QuickActions";

interface SafetyIntel {
  year: number; recordable_count: number; lost_time_cases: number;
  restricted_cases: number; total_days_away: number; prior_year_recordables: number;
  yoy_change_pct: number | null;
  repeat_hazard_categories: { category: string; count: number }[];
  high_risk_centers: { center_code: string; recordable_count: number }[];
  unresolved_corrective_actions: number; inspection_pass_rate: number | null;
  open_incidents_count: number;
}

const CURRENT_YEAR = new Date().getFullYear();

function MetricCard({ label, value, accent, sub }: { label: string; value: string | number; accent?: string; sub?: string }) {
  return (
    <div className="rounded-xl px-5 pt-4 pb-3.5 bg-white" style={{ border: "1px solid var(--pg-border)", boxShadow: "var(--shadow-card)" }}>
      <p className="text-xs font-medium uppercase tracking-widest" style={{ color: "var(--pg-text-muted)", letterSpacing: "0.05em" }}>{label}</p>
      <p className="text-2xl font-bold tabular-nums mt-1.5 leading-none" style={{ color: accent ?? "var(--pg-navy)" }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: "var(--pg-text-muted)" }}>{sub}</p>}
    </div>
  );
}

export default function SafetyView() {
  const { t } = useWorkspace();
  const [intel, setIntel] = useState<SafetyIntel | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get<SafetyIntel>(`${API_URL}/safety/intelligence?year=${CURRENT_YEAR}`)
      .then((r) => setIntel(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const empty = !loading && (intel?.recordable_count === 0 && intel?.open_incidents_count === 0);

  return (
    <div className="flex flex-col gap-5">
      <QuickActions />

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
        <EmptyStateSafety t={t} />
      ) : intel && (
        <>
          {/* OSHA summary metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard label={`OSHA Recordables ${CURRENT_YEAR}`} value={intel.recordable_count}
              accent={intel.recordable_count > 0 ? "#b91c1c" : undefined}
              sub={intel.yoy_change_pct !== null ? `${intel.yoy_change_pct > 0 ? "▲" : "▼"} ${Math.abs(intel.yoy_change_pct)}% vs ${CURRENT_YEAR - 1}` : undefined} />
            <MetricCard label="Lost Time Cases" value={intel.lost_time_cases}
              accent={intel.lost_time_cases > 0 ? "#b91c1c" : undefined} />
            <MetricCard label="Restricted Work" value={intel.restricted_cases}
              accent={intel.restricted_cases > 0 ? "#c2410c" : undefined} />
            <MetricCard label="Unresolved Actions" value={intel.unresolved_corrective_actions}
              accent={intel.unresolved_corrective_actions > 0 ? "#c2410c" : undefined} />
          </div>

          {/* Two-column: repeat hazards + high-risk centers */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl overflow-hidden bg-white" style={{ border: "1px solid var(--pg-border)", boxShadow: "var(--shadow-card)" }}>
              <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--pg-border-soft)" }}>
                <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--pg-text-muted)", letterSpacing: "0.06em" }}>Repeat Hazard Categories</h2>
                <p className="text-xs mt-0.5" style={{ color: "var(--pg-text-muted)" }}>2+ recordable incidents with same category</p>
              </div>
              <div className="divide-y" style={{ divideColor: "var(--pg-border-soft)" }}>
                {intel.repeat_hazard_categories.length === 0 ? (
                  <p className="px-5 py-4 text-xs font-medium" style={{ color: "#15803d" }}>✓ No repeat hazards detected</p>
                ) : intel.repeat_hazard_categories.map((h) => (
                  <div key={h.category} className="flex items-center justify-between px-5 py-2.5">
                    <span className="text-sm" style={{ color: "var(--pg-text-sub)" }}>{h.category}</span>
                    <span className="text-sm font-bold tabular-nums" style={{ color: "#c2410c" }}>{h.count}×</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl overflow-hidden bg-white" style={{ border: "1px solid var(--pg-border)", boxShadow: "var(--shadow-card)" }}>
              <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--pg-border-soft)" }}>
                <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--pg-text-muted)", letterSpacing: "0.06em" }}>
                  High-Risk {t("center", "Centers")}
                </h2>
              </div>
              <div className="divide-y" style={{ divideColor: "var(--pg-border-soft)" }}>
                {intel.high_risk_centers.map((c, i) => (
                  <Link key={c.center_code} href="/map"
                    className="flex items-center justify-between px-5 py-2.5 transition-colors"
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--pg-surface)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold tabular-nums w-5" style={{ color: i === 0 ? "#b91c1c" : "var(--pg-text-muted)" }}>#{i+1}</span>
                      <span className="text-sm font-mono" style={{ color: "var(--pg-text-sub)" }}>{c.center_code}</span>
                    </div>
                    <span className="text-sm font-bold tabular-nums" style={{ color: "var(--pg-navy)" }}>{c.recordable_count}</span>
                  </Link>
                ))}
                {intel.high_risk_centers.length === 0 && (
                  <p className="px-5 py-4 text-xs font-medium" style={{ color: "#15803d" }}>✓ No high-risk centers</p>
                )}
              </div>
            </div>
          </div>

          {/* Export links */}
          <div className="flex items-center gap-4 flex-wrap text-sm">
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--pg-text-muted)", letterSpacing: "0.06em" }}>
              OSHA {CURRENT_YEAR}
            </span>
            {[
              { href: "/osha", label: "Reports" },
              { href: "/osha/search", label: "Audit Search" },
              { href: "/osha/postings", label: "Annual Posting" },
              { href: "/cases", label: "Case Management" },
            ].map(({ href, label }) => (
              <Link key={href} href={href} className="text-sm font-medium hover:underline" style={{ color: "var(--pg-steel)" }}>{label}</Link>
            ))}
            <a href={`${API_URL}/safety/export/bundle/${CURRENT_YEAR}`} target="_blank" rel="noreferrer"
              className="text-sm font-medium hover:underline" style={{ color: "var(--pg-steel)" }}>
              Download Bundle →
            </a>
          </div>
        </>
      )}
    </div>
  );
}

function EmptyStateSafety({ t }: { t: (k: string, fb?: string) => string }) {
  return (
    <div className="rounded-xl px-8 py-12 text-center bg-white" style={{ border: "1px solid var(--pg-border)", boxShadow: "var(--shadow-card)" }}>
      <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center"
        style={{ background: "rgba(30,58,95,0.08)" }}>
        <svg width="24" height="27" viewBox="0 0 20 22" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M10 1L18 4.5V10.5C18 15.2 14.4 19.3 10 21C5.6 19.3 2 15.2 2 10.5V4.5L10 1Z"
            fill="rgba(30,58,95,0.1)" stroke="rgba(30,58,95,0.4)" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M7 11L9.5 13.5L13.5 8.5" stroke="rgba(30,58,95,0.6)" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h2 className="text-base font-semibold" style={{ color: "var(--pg-navy)" }}>No OSHA Data Yet</h2>
      <p className="text-sm mt-1 mb-5" style={{ color: "var(--pg-text-muted)", maxWidth: "320px", margin: "8px auto 20px" }}>
        Start recording {t("incident","incidents")} and documenting corrective actions to build your safety intelligence baseline.
      </p>
      <div className="flex items-center justify-center gap-3 flex-wrap">
        <Link href="/mobile/incident"
          className="text-white text-sm font-medium px-5 py-2 rounded-lg transition-opacity hover:opacity-90"
          style={{ background: "var(--gradient-navy)" }}>
          Record {t("incident", "Incident")}
        </Link>
        <Link href="/osha" className="text-sm font-medium px-5 py-2 rounded-lg border transition-all"
          style={{ color: "var(--pg-slate)", borderColor: "var(--pg-border)", background: "white" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--pg-mist)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "white"; }}>
          OSHA Setup
        </Link>
      </div>
    </div>
  );
}
