"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { API_URL } from "../lib/api";

interface SafetySignal {
  id: string;
  signal_type: string;
  severity: string;
  title: string;
  description: string;
  center_id: string | null;
  incident_type: string | null;
  incident_count: number;
  window_days: number;
  detected_at: string;
  dismissed: boolean;
}

const SEVERITY_META: Record<string, { bg: string; border: string; icon: string; label: string }> = {
  alert:   { bg: "bg-red-50",    border: "border-red-200",   icon: "🚨", label: "Alert" },
  caution: { bg: "bg-amber-50",  border: "border-amber-200", icon: "⚠",  label: "Caution" },
  watch:   { bg: "bg-blue-50",   border: "border-blue-200",  icon: "◎",  label: "Watch" },
};

const SIGNAL_TYPE_LABELS: Record<string, string> = {
  repeat_incident_type:  "Repeat Incident Type",
  repeat_location:       "Location Concentration",
  animal_recurrence:     "Animal Recurrence",
  temporal_cluster:      "Incident Burst",
  escalation_pattern:    "Escalation Pattern",
  unresolved_corrective: "Unresolved Corrective Actions",
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

interface Props {
  compact?: boolean;
}

export default function SafetySignals({ compact = false }: Props) {
  const [signals, setSignals] = useState<SafetySignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  const fetchSignals = useCallback(async () => {
    try {
      const r = await axios.get<SafetySignal[]>(`${API_URL}/signals`);
      setSignals(r.data);
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSignals(); }, [fetchSignals]);

  async function refresh() {
    setRefreshing(true);
    try {
      const r = await axios.post<SafetySignal[]>(`${API_URL}/signals/refresh`);
      setSignals(r.data);
    } catch { /* ignore */ }
    finally { setRefreshing(false); }
  }

  async function dismiss(id: string) {
    setDismissingId(id);
    try {
      await axios.patch(`${API_URL}/signals/${id}/dismiss`);
      setSignals((prev) => prev.filter((s) => s.id !== id));
    } catch { /* ignore */ }
    finally { setDismissingId(null); }
  }

  const alerts = signals.filter((s) => s.severity === "alert");
  const cautions = signals.filter((s) => s.severity === "caution");
  const watches = signals.filter((s) => s.severity === "watch");
  const sorted = [...alerts, ...cautions, ...watches];

  if (loading) return (
    <div className={`bg-white rounded-xl border border-gray-200 ${compact ? "p-3" : "p-5"}`}>
      <div className="animate-pulse space-y-2">
        <div className="h-4 bg-gray-200 rounded w-1/3" />
        <div className="h-3 bg-gray-100 rounded w-2/3" />
        <div className="h-3 bg-gray-100 rounded w-1/2" />
      </div>
    </div>
  );

  return (
    <div className={`bg-white rounded-xl border border-gray-200 ${compact ? "p-3" : "p-5"}`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className={`font-semibold text-gray-900 ${compact ? "text-sm" : "text-base"}`}>Safety Signals</h3>
          {!compact && (
            <p className="text-xs text-gray-400 mt-0.5">Pattern-based risk indicators from incident data</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {signals.length > 0 && (
            <div className="flex items-center gap-1 text-xs text-gray-500">
              {alerts.length > 0 && <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">{alerts.length} alert{alerts.length !== 1 ? "s" : ""}</span>}
              {cautions.length > 0 && <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">{cautions.length} caution{cautions.length !== 1 ? "s" : ""}</span>}
            </div>
          )}
          <button
            onClick={refresh}
            disabled={refreshing}
            className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-40 border border-gray-200 rounded px-2 py-1">
            {refreshing ? "Scanning…" : "Refresh"}
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-6 text-gray-400">
          <p className="text-xl mb-1">✓</p>
          <p className="text-xs">No active safety signals</p>
          <p className="text-xs mt-1 text-gray-300">Run a refresh to scan for patterns</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {sorted.map((sig) => {
            const meta = SEVERITY_META[sig.severity] ?? SEVERITY_META.watch;
            return (
              <li key={sig.id} className={`rounded-xl border ${meta.bg} ${meta.border} ${compact ? "p-2.5" : "p-3"}`}>
                <div className="flex items-start gap-2">
                  <span className="text-base flex-shrink-0 mt-0.5">{meta.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                      <span className="text-xs font-semibold text-gray-800">{sig.title}</span>
                      <span className="text-xs text-gray-400">
                        {SIGNAL_TYPE_LABELS[sig.signal_type] ?? sig.signal_type.replace(/_/g, " ")}
                      </span>
                    </div>
                    {!compact && (
                      <p className="text-xs text-gray-600 leading-relaxed">{sig.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-400 flex-wrap">
                      {sig.center_id && <span>Location: {sig.center_id}</span>}
                      <span>{sig.incident_count} incident{sig.incident_count !== 1 ? "s" : ""} · {sig.window_days}d window</span>
                      <span>{relativeTime(sig.detected_at)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => dismiss(sig.id)}
                    disabled={dismissingId === sig.id}
                    className="text-gray-300 hover:text-gray-500 text-sm flex-shrink-0 disabled:opacity-40"
                    title="Dismiss signal">
                    {dismissingId === sig.id ? "…" : "×"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
