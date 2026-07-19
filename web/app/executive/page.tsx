"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import Link from "next/link";
import { useAuth } from "../context/AuthContext";
import { API_URL } from "../lib/api";
import CenterHealthPanel from "../components/CenterHealthPanel";

interface Briefing {
  generated_at: string;
  period_days: number;
  total_incidents_30d: number;
  total_incidents_7d: number;
  incident_trend_wow: "up" | "down" | "flat";
  prior_week_count: number;
  risk_band_distribution: Record<string, number>;
  osha_recordable_total: number;
  osha_pending_finalization: number;
  open_cases: number;
  escalated_cases: number;
  overdue_corrective_actions: number;
  top_incident_types: { type: string; count: number }[];
  top_centers_by_volume: { center_id: string; count: number }[];
}

const BAND_COLORS: Record<string, string> = {
  critical: "bg-red-500",
  high:     "bg-orange-400",
  elevated: "bg-amber-400",
  moderate: "bg-yellow-400",
  low:      "bg-green-400",
  unscored: "bg-gray-300",
};

const BAND_TEXT: Record<string, string> = {
  critical: "text-red-700",
  high:     "text-orange-700",
  elevated: "text-amber-700",
  moderate: "text-yellow-700",
  low:      "text-green-700",
  unscored: "text-gray-500",
};

function TrendBadge({ trend, current, prior }: { trend: string; current: number; prior: number }) {
  if (trend === "up") return (
    <span className="text-xs text-red-600 font-semibold">↑ {current - prior} vs last week</span>
  );
  if (trend === "down") return (
    <span className="text-xs text-green-600 font-semibold">↓ {prior - current} vs last week</span>
  );
  return <span className="text-xs text-gray-400">→ flat vs last week</span>;
}

function KPI({ label, value, sub, accent = "text-gray-900" }: {
  label: string; value: string | number; sub?: string; accent?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${accent}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function ExecutiveBriefingPage() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get<Briefing>(`${API_URL}/command/executive-briefing`);
      setData(r.data);
      setError(null);
    } catch (e) {
      setError(axios.isAxiosError(e) ? (e.response?.data?.detail ?? e.message) : "Failed to load");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login?from=/executive"); return; }
    load();
  }, [isAuthenticated, router, load]);

  if (!isAuthenticated) return null;

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

  const maxBand = data ? Math.max(...Object.values(data.risk_band_distribution), 1) : 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Executive Briefing</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Safety performance across all locations — last 30 days
            {data && ` · Updated ${formatDate(data.generated_at)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 border border-gray-200 rounded-lg bg-white flex-shrink-0">
            ↻ Refresh
          </button>
          <Link href="/command" className="text-sm text-indigo-600 hover:text-indigo-800 px-3 py-1.5 border border-indigo-200 rounded-lg">
            ← Command Center
          </Link>
        </div>
      </div>

      {error && <div className="text-sm bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3">{error}</div>}

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 px-5 py-4 animate-pulse">
                <div className="h-3 bg-gray-200 rounded w-2/3 mb-3" /><div className="h-7 bg-gray-200 rounded w-1/2" />
              </div>
            ))}
          </div>
        </div>
      ) : data && (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KPI label="Incidents (30 days)" value={data.total_incidents_30d}
              sub={`${data.total_incidents_7d} this week`}
              accent={data.total_incidents_7d > data.prior_week_count ? "text-red-600" : "text-gray-900"} />
            <KPI label="Open Cases" value={data.open_cases}
              sub={`${data.escalated_cases} escalated`}
              accent={data.escalated_cases > 0 ? "text-orange-600" : "text-gray-900"} />
            <KPI label="OSHA Recordable" value={data.osha_recordable_total}
              sub={`${data.osha_pending_finalization} pending finalization`}
              accent={data.osha_pending_finalization > 0 ? "text-amber-600" : "text-gray-900"} />
            <KPI label="Follow-up Actions Due" value={data.overdue_corrective_actions}
              accent={data.overdue_corrective_actions > 0 ? "text-red-600" : "text-gray-900"} />
          </div>

          {/* Week-over-week trend */}
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center gap-4">
            <div>
              <p className="text-sm font-semibold text-gray-700">Week-over-week incident trend</p>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-2xl font-bold text-gray-900">{data.total_incidents_7d}</span>
                <TrendBadge trend={data.incident_trend_wow} current={data.total_incidents_7d} prior={data.prior_week_count} />
              </div>
            </div>
            <div className="flex-1 h-px bg-gray-100" />
            <p className="text-xs text-gray-400">{data.prior_week_count} last week</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Risk distribution */}
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                <h2 className="text-sm font-semibold text-gray-700">Risk Distribution (30d)</h2>
              </div>
              <div className="px-5 py-4 space-y-3">
                {["critical","high","elevated","moderate","low"].map((band) => {
                  const count = data.risk_band_distribution[band] ?? 0;
                  return (
                    <div key={band} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className={`font-medium capitalize ${BAND_TEXT[band]}`}>{band}</span>
                        <span className="text-gray-500">{count}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${BAND_COLORS[band]}`}
                          style={{ width: count > 0 ? `${(count / maxBand) * 100}%` : "0%" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Top incident types */}
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                <h2 className="text-sm font-semibold text-gray-700">Top Incident Types (30d)</h2>
              </div>
              <div className="divide-y divide-gray-50">
                {data.top_incident_types.length === 0 && (
                  <p className="px-5 py-4 text-xs text-gray-400 italic">No incidents this period</p>
                )}
                {data.top_incident_types.map((t, i) => (
                  <div key={t.type} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="text-xs text-gray-400 w-4 flex-shrink-0">#{i + 1}</span>
                    <p className="text-xs font-medium text-gray-700 flex-1">{t.type}</p>
                    <span className="text-xs font-bold text-gray-900">{t.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top locations by volume */}
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                <h2 className="text-sm font-semibold text-gray-700">Highest Volume Locations (30d)</h2>
              </div>
              <div className="divide-y divide-gray-50">
                {data.top_centers_by_volume.length === 0 && (
                  <p className="px-5 py-4 text-xs text-gray-400 italic">No incidents this period</p>
                )}
                {data.top_centers_by_volume.map((c, i) => (
                  <div key={c.center_id} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="text-xs text-gray-400 w-4 flex-shrink-0">#{i + 1}</span>
                    <p className="text-xs font-mono font-medium text-gray-700 flex-1">{c.center_id}</p>
                    <span className={`text-xs font-bold ${c.count >= 5 ? "text-red-600" : c.count >= 3 ? "text-orange-500" : "text-gray-900"}`}>
                      {c.count} incident{c.count !== 1 ? "s" : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Center health — full list */}
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Location Health Overview</h2>
            <CenterHealthPanel />
          </div>

          {/* OSHA summary */}
          {data.osha_recordable_total > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
              <div className="flex items-start gap-3">
                <span className="text-xl">⚠</span>
                <div>
                  <p className="text-sm font-semibold text-amber-800">OSHA Compliance Status</p>
                  <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                    <strong>{data.osha_recordable_total}</strong> recordable incident{data.osha_recordable_total !== 1 ? "s" : ""} on file.
                    {data.osha_pending_finalization > 0 && (
                      <> <strong className="text-amber-800">{data.osha_pending_finalization}</strong> pending finalization — review and complete OSHA documentation.</>
                    )}
                  </p>
                  <Link href="/osha" className="text-xs text-amber-700 underline mt-1 inline-block">
                    Open OSHA Reports →
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Quick actions */}
          <div className="flex items-center gap-3 flex-wrap pt-2 border-t border-gray-100">
            {[
              { href: "/cases", label: "→ Open Cases" },
              { href: "/osha", label: "→ OSHA Reports" },
              { href: "/map", label: "→ Risk Map" },
              { href: "/command", label: "→ Command Center" },
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
