"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { API_URL } from "../lib/api";

interface SafetyIntelligence {
  year: number;
  recordable_count: number;
  lost_time_cases: number;
  restricted_cases: number;
  total_days_away: number;
  total_restricted_days: number;
  prior_year_recordables: number;
  yoy_change_pct: number | null;
  top_injury_types: { incident_type: string; count: number }[];
  repeat_hazard_categories: { category: string; count: number }[];
  high_risk_centers: { center_code: string; recordable_count: number }[];
  unresolved_corrective_actions: number;
  inspection_pass_rate: number | null;
  open_incidents_count: number;
}

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

function MetricCard({ label, value, sub, accent, danger }: {
  label: string; value: string | number; sub?: string;
  accent?: string; danger?: boolean;
}) {
  return (
    <div className={`bg-white rounded-xl border px-5 py-4 ${danger ? "border-red-200 bg-red-50" : "border-gray-200"}`}>
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${accent ?? (danger ? "text-red-700" : "text-gray-900")}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function YoYBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-gray-400">No prior year data</span>;
  const up = pct > 0;
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-semibold ${up ? "text-red-600" : pct < 0 ? "text-green-600" : "text-gray-500"}`}>
      {up ? "▲" : pct < 0 ? "▼" : "—"}
      {Math.abs(pct)}% vs prior year
    </span>
  );
}

export default function SafetyDashboard() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const [year, setYear] = useState(CURRENT_YEAR);
  const [data, setData] = useState<SafetyIntelligence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await axios.get<SafetyIntelligence>(`${API_URL}/safety/intelligence`, {
        params: { year },
      });
      setData(r.data);
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? String(err.response?.data?.detail ?? err.message) : "Failed");
    } finally { setLoading(false); }
  }, [year]);

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login?from=/safety"); return; }
    fetch();
  }, [isAuthenticated, router, fetch]);

  if (!isAuthenticated) return null;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Safety Intelligence</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            OSHA recordable analysis · Lost time trends · Repeat hazards · Field safety metrics
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none">
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <Link href="/osha" className="text-sm text-indigo-600 hover:underline">OSHA Reports →</Link>
          <Link href="/osha/postings" className="text-sm text-indigo-600 hover:underline">Postings →</Link>
        </div>
      </div>

      {error && <div className="text-sm bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3">{error}</div>}

      {loading ? (
        <div className="text-center py-16 text-sm text-gray-400">Loading safety intelligence…</div>
      ) : data && (
        <>
          {/* Year-over-year summary */}
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-xs text-gray-500 font-medium mb-1">
                OSHA Recordable Cases — {data.year}
              </p>
              <p className="text-4xl font-bold text-gray-900">{data.recordable_count}</p>
            </div>
            <YoYBadge pct={data.yoy_change_pct} />
            <div className="flex gap-6 text-center">
              <div>
                <p className="text-2xl font-bold text-red-600">{data.lost_time_cases}</p>
                <p className="text-xs text-gray-500">Lost Time</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-yellow-600">{data.restricted_cases}</p>
                <p className="text-xs text-gray-500">Restricted</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-700">{data.total_days_away}</p>
                <p className="text-xs text-gray-500">Days Away</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-700">{data.total_restricted_days}</p>
                <p className="text-xs text-gray-500">Restricted Days</p>
              </div>
            </div>
          </div>

          {/* Operational metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard label="Open Incidents" value={data.open_incidents_count}
              danger={data.open_incidents_count > 10} />
            <MetricCard label="Unresolved Corrective Actions" value={data.unresolved_corrective_actions}
              danger={data.unresolved_corrective_actions > 0} />
            <MetricCard label="Open Cases" value={data.open_incidents_count}
              accent={data.open_incidents_count > 5 ? "text-orange-600" : "text-gray-900"} />
            <MetricCard label="Prior Year Recordables" value={data.prior_year_recordables}
              sub={`${data.year - 1}`} />
          </div>

          {/* Three columns: injury types, repeat hazards, high-risk centers */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Top injury types */}
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-5 py-3 border-b border-gray-100 bg-red-50">
                <h2 className="text-sm font-semibold text-red-800">Top Injury Types</h2>
                <p className="text-xs text-red-600">From OSHA recordable incidents</p>
              </div>
              <div className="divide-y divide-gray-100">
                {data.top_injury_types.length === 0 && (
                  <p className="px-5 py-4 text-xs text-gray-400 italic">No recordable incidents this year</p>
                )}
                {data.top_injury_types.map((t) => (
                  <div key={t.incident_type} className="flex items-center justify-between px-5 py-2.5">
                    <span className="text-sm text-gray-700 capitalize">{t.incident_type.replace(/_/g, " ")}</span>
                    <span className="text-sm font-bold text-red-600">{t.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Repeat hazards */}
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-5 py-3 border-b border-gray-100 bg-orange-50">
                <h2 className="text-sm font-semibold text-orange-800">Repeat Hazard Categories</h2>
                <p className="text-xs text-orange-600">Categories with 2+ recordable incidents</p>
              </div>
              <div className="divide-y divide-gray-100">
                {data.repeat_hazard_categories.length === 0 ? (
                  <p className="px-5 py-4 text-xs text-gray-400 italic">No repeat hazards detected</p>
                ) : (
                  data.repeat_hazard_categories.map((h) => (
                    <div key={h.category} className="flex items-center justify-between px-5 py-2.5">
                      <span className="text-sm text-gray-700">{h.category}</span>
                      <span className="text-sm font-bold text-orange-600">{h.count}×</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* High-risk centers */}
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-5 py-3 border-b border-gray-100 bg-yellow-50">
                <h2 className="text-sm font-semibold text-yellow-800">High-Risk Centers</h2>
                <p className="text-xs text-yellow-600">By OSHA recordable count</p>
              </div>
              <div className="divide-y divide-gray-100">
                {data.high_risk_centers.length === 0 ? (
                  <p className="px-5 py-4 text-xs text-gray-400 italic">No center data available</p>
                ) : (
                  data.high_risk_centers.map((c, i) => (
                    <div key={c.center_code} className="flex items-center justify-between px-5 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold w-5 text-center ${i === 0 ? "text-red-600" : "text-gray-400"}`}>
                          #{i + 1}
                        </span>
                        <span className="text-sm text-gray-700 font-mono">{c.center_code}</span>
                      </div>
                      <span className="text-sm font-bold text-gray-700">{c.recordable_count}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Export links */}
          <div className="flex items-center gap-4 flex-wrap text-sm">
            <span className="text-gray-500 font-medium">Export {data.year}:</span>
            <a href={`${API_URL}/safety/export/300/${data.year}/csv`} target="_blank" rel="noreferrer"
              className="text-indigo-600 hover:underline">Form 300 CSV</a>
            <a href={`${API_URL}/safety/export/300a/${data.year}/csv`} target="_blank" rel="noreferrer"
              className="text-indigo-600 hover:underline">Form 300A CSV</a>
            <a href={`${API_URL}/safety/export/bundle/${data.year}`} target="_blank" rel="noreferrer"
              className="text-indigo-600 hover:underline font-medium">Download Full Bundle (ZIP) →</a>
          </div>
        </>
      )}
    </div>
  );
}
