"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { useWorkspace } from "../../context/WorkspaceContext";
import { API_URL } from "../../lib/api";
import QuickActions from "./QuickActions";

interface OSHARecord {
  incident_id: string; case_number: number | null; center_id: string;
  year: number | null; employee_name: string | null; job_title: string | null;
  incident_type: string; date_of_injury: string | null; classification: string | null;
  days_away: number; restricted_days: number; recordable: boolean | null; is_finalized: boolean;
  category: string | null; risk_score: number | null;
}

const CLASSIFICATION_ACCENT: Record<string, { bg: string; color: string }> = {
  days_away:  { bg: "rgba(185,28,28,0.08)",  color: "#b91c1c" },
  restricted: { bg: "rgba(194,65,12,0.08)",  color: "#c2410c" },
  other:      { bg: "rgba(30,58,95,0.06)",   color: "var(--pg-text-muted)" },
};

function MetricCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-xl px-5 pt-4 pb-3.5 bg-white" style={{ border: "1px solid var(--pg-border)", boxShadow: "var(--shadow-card)" }}>
      <p className="text-xs font-medium uppercase tracking-widest" style={{ color: "var(--pg-text-muted)", letterSpacing: "0.05em" }}>{label}</p>
      <p className="text-2xl font-bold tabular-nums mt-1.5 leading-none" style={{ color: accent ?? "var(--pg-navy)" }}>{value}</p>
    </div>
  );
}

export default function HRView() {
  const { t } = useWorkspace();
  const [injuries, setInjuries] = useState<OSHARecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get<OSHARecord[]>(`${API_URL}/safety/search?recordable_only=true&limit=25`)
      .then((r) => setInjuries(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const empty = !loading && injuries.length === 0;

  return (
    <div className="flex flex-col gap-5">
      <QuickActions />

      {loading ? (
        <div className="flex flex-col gap-5 animate-pulse">
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="pg-skeleton h-20 rounded-xl" />)}
          </div>
          <div className="pg-skeleton h-64 rounded-xl" />
        </div>
      ) : empty ? (
        <EmptyStateHR t={t} />
      ) : (
        <>
          {/* Metric summary */}
          <div className="grid grid-cols-3 gap-3">
            <MetricCard label="OSHA Recordable" value={injuries.length} accent={injuries.length > 0 ? "#b91c1c" : undefined} />
            <MetricCard label="Lost Time Cases" value={injuries.filter((r) => r.classification === "days_away").length}
              accent={injuries.filter((r) => r.classification === "days_away").length > 0 ? "#b91c1c" : undefined} />
            <MetricCard label="Restricted Work" value={injuries.filter((r) => r.classification === "restricted").length}
              accent={injuries.filter((r) => r.classification === "restricted").length > 0 ? "#c2410c" : undefined} />
          </div>

          {/* Employee injury table */}
          <div className="rounded-xl overflow-hidden bg-white" style={{ border: "1px solid var(--pg-border)", boxShadow: "var(--shadow-card)" }}>
            <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--pg-border-soft)" }}>
              <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--pg-text-muted)", letterSpacing: "0.06em" }}>
                Employee Injury Queue
              </h2>
              <Link href="/osha/search" className="text-xs font-medium hover:underline" style={{ color: "var(--pg-steel)" }}>
                Full Search →
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ background: "var(--pg-surface)", borderBottom: "1px solid var(--pg-border-soft)" }}>
                    {["Employee", "Type", "Date", "Classification", "Days"].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-widest"
                        style={{ color: "var(--pg-text-muted)", letterSpacing: "0.05em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {injuries.slice(0, 12).map((r) => {
                    const cls = r.classification ? CLASSIFICATION_ACCENT[r.classification] : null;
                    return (
                      <tr key={r.incident_id}
                        className="transition-colors"
                        style={{ borderBottom: "1px solid var(--pg-border-soft)" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--pg-surface)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                      >
                        <td className="px-4 py-2.5">
                          <p className="text-sm font-medium" style={{ color: "var(--pg-text)" }}>{r.employee_name ?? "—"}</p>
                          {r.job_title && <p className="text-xs mt-0.5" style={{ color: "var(--pg-text-muted)" }}>{r.job_title}</p>}
                        </td>
                        <td className="px-4 py-2.5 text-sm capitalize" style={{ color: "var(--pg-text-sub)" }}>
                          {r.incident_type.replace(/_/g," ")}
                        </td>
                        <td className="px-4 py-2.5 text-sm tabular-nums" style={{ color: "var(--pg-text-muted)" }}>
                          {r.date_of_injury ?? "—"}
                        </td>
                        <td className="px-4 py-2.5">
                          {r.classification && cls ? (
                            <span className="text-xs px-2 py-0.5 rounded font-semibold"
                              style={{ background: cls.bg, color: cls.color }}>
                              {r.classification.replace(/_/g," ")}
                            </span>
                          ) : <span style={{ color: "var(--pg-text-muted)" }}>—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-sm tabular-nums font-medium" style={{ color: "var(--pg-navy)" }}>
                          {r.days_away > 0 ? `${r.days_away}d` : r.restricted_days > 0 ? `${r.restricted_days}r` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* OSHA links */}
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--pg-text-muted)", letterSpacing: "0.06em" }}>OSHA</span>
            {[
              { href: "/osha/search", label: "Audit Search" },
              { href: "/osha", label: "Reports" },
              { href: "/osha/postings", label: "Annual Posting" },
            ].map(({ href, label }) => (
              <Link key={href} href={href} className="text-sm font-medium hover:underline" style={{ color: "var(--pg-steel)" }}>{label}</Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function EmptyStateHR({ t }: { t: (k: string, fb?: string) => string }) {
  return (
    <div className="rounded-xl px-8 py-12 text-center bg-white" style={{ border: "1px solid var(--pg-border)", boxShadow: "var(--shadow-card)" }}>
      <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center"
        style={{ background: "rgba(30,58,95,0.08)" }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="8" r="4" stroke="rgba(30,58,95,0.5)" strokeWidth="1.5" />
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="rgba(30,58,95,0.5)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <h2 className="text-base font-semibold" style={{ color: "var(--pg-navy)" }}>No Employee Injuries Recorded</h2>
      <p className="text-sm mt-1 mb-5" style={{ color: "var(--pg-text-muted)", maxWidth: "300px", margin: "8px auto 20px" }}>
        Employee {t("incident","incidents")} will appear here once recorded by supervisors or field staff.
      </p>
      <Link href="/osha/search"
        className="text-white text-sm font-medium px-5 py-2 rounded-lg transition-opacity hover:opacity-90 inline-block"
        style={{ background: "var(--gradient-navy)" }}>
        Search OSHA Records
      </Link>
    </div>
  );
}
