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
        <div className="text-center py-12 text-sm text-gray-400">Loading safety data…</div>
      ) : empty ? (
        <EmptyStateSafety t={t} />
      ) : intel && (
        <>
          {/* OSHA summary */}
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-xs text-gray-500 font-medium">OSHA Recordables — {CURRENT_YEAR}</p>
              <p className="text-4xl font-bold text-gray-900">{intel.recordable_count}</p>
            </div>
            {intel.yoy_change_pct !== null && (
              <span className={`text-sm font-semibold ${intel.yoy_change_pct > 0 ? "text-red-600" : "text-green-600"}`}>
                {intel.yoy_change_pct > 0 ? "▲" : "▼"} {Math.abs(intel.yoy_change_pct)}% vs {CURRENT_YEAR - 1}
              </span>
            )}
            <div className="flex gap-6 text-center">
              {[
                { label: "Lost Time", value: intel.lost_time_cases, color: "text-red-600" },
                { label: "Restricted", value: intel.restricted_cases, color: "text-yellow-600" },
                { label: "Days Away", value: intel.total_days_away, color: "text-gray-700" },
                { label: "Unresolved Corrective", value: intel.unresolved_corrective_actions, color: intel.unresolved_corrective_actions > 0 ? "text-red-600" : "text-green-600" },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <p className={`text-xl font-bold ${color}`}>{value}</p>
                  <p className="text-xs text-gray-500">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Two-column: repeat hazards + high-risk centers */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-5 py-3 border-b border-gray-100 bg-orange-50">
                <h2 className="text-sm font-semibold text-orange-800">Repeat Hazard Categories</h2>
                <p className="text-xs text-orange-600">2+ recordable incidents with same category</p>
              </div>
              <div className="divide-y divide-gray-100">
                {intel.repeat_hazard_categories.length === 0 ? (
                  <p className="px-5 py-4 text-xs text-green-600">✓ No repeat hazards detected</p>
                ) : intel.repeat_hazard_categories.map((h) => (
                  <div key={h.category} className="flex items-center justify-between px-5 py-2.5">
                    <span className="text-sm text-gray-700">{h.category}</span>
                    <span className="text-sm font-bold text-orange-600">{h.count}×</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-5 py-3 border-b border-gray-100 bg-red-50">
                <h2 className="text-sm font-semibold text-red-800">High-Risk {t("center", "Centers")}</h2>
              </div>
              <div className="divide-y divide-gray-100">
                {intel.high_risk_centers.map((c, i) => (
                  <div key={c.center_code} className="flex items-center justify-between px-5 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold w-5 ${i === 0 ? "text-red-600" : "text-gray-400"}`}>#{i+1}</span>
                      <span className="text-sm font-mono text-gray-700">{c.center_code}</span>
                    </div>
                    <span className="text-sm font-bold text-gray-700">{c.recordable_count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Export links */}
          <div className="flex items-center gap-4 flex-wrap text-sm">
            <span className="text-gray-500 font-medium">OSHA {CURRENT_YEAR}:</span>
            <Link href="/osha" className="text-indigo-600 hover:underline">Reports</Link>
            <Link href="/osha/search" className="text-indigo-600 hover:underline">Audit Search</Link>
            <Link href="/osha/postings" className="text-indigo-600 hover:underline">Annual Posting</Link>
            <a href={`${API_URL}/safety/export/bundle/${CURRENT_YEAR}`} target="_blank" rel="noreferrer"
              className="text-indigo-600 hover:underline font-medium">Download ZIP Bundle →</a>
          </div>
        </>
      )}
    </div>
  );
}

function EmptyStateSafety({ t }: { t: (k: string, fb?: string) => string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
      <p className="text-4xl mb-3">🛡️</p>
      <h2 className="text-lg font-semibold text-gray-900">No OSHA Data Yet</h2>
      <p className="text-sm text-gray-500 mt-1 mb-4">
        Start recording {t("incident", "incidents")} and running {t("inspection", "inspections")} to
        build your safety intelligence baseline.
      </p>
      <div className="flex items-center justify-center gap-3 flex-wrap">
        <Link href="/mobile/incident" className="bg-red-600 text-white px-5 py-2 rounded-xl text-sm font-medium">
          Record {t("incident", "Incident")}
        </Link>
        <Link href="/mobile/inspect" className="bg-green-600 text-white px-5 py-2 rounded-xl text-sm font-medium">
          Run {t("inspection", "Inspection")}
        </Link>
        <Link href="/osha" className="bg-indigo-600 text-white px-5 py-2 rounded-xl text-sm font-medium">
          OSHA Setup
        </Link>
      </div>
    </div>
  );
}
