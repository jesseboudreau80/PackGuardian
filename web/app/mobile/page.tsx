"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { useWebSocket } from "../hooks/useWebSocket";
import { OfflineQueue } from "../lib/offlineQueue";
import { API_URL } from "../lib/api";

interface Alert { type: string; title: string; body: string; resource_id: string | null; severity: string; }
interface MyShift {
  role_context: string;
  assigned_case_count: number; overdue_task_count: number;
  active_incident_count: number; pending_inspection_count: number;
  unread_notification_count: number;
  urgent_cases: { id: string; incident_id: string; status: string; priority: string; escalation_level: number; due_date: string | null }[];
  my_tasks: { id: string; case_id: string; title: string; due_date: string | null; overdue: boolean }[];
  alerts: Alert[];
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-500", high: "bg-orange-400", medium: "bg-yellow-400", low: "bg-green-400",
};
const SEVERITY_BG: Record<string, string> = {
  critical: "bg-red-100 border-red-300 text-red-800",
  high: "bg-orange-100 border-orange-300 text-orange-800",
  medium: "bg-yellow-100 border-yellow-300 text-yellow-800",
};

function relTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso), now = new Date();
  const diff = d.getTime() - now.getTime();
  if (diff < 0) return "follow-up needed";
  const h = Math.floor(diff / 3600000);
  if (h < 24) return `due in ${h}h`;
  return `due ${d.toLocaleDateString()}`;
}

export default function MobileShift() {
  const { token } = useAuth();
  const [data, setData] = useState<MyShift | null>(null);
  const [loading, setLoading] = useState(true);
  const [offlineCount, setOfflineCount] = useState(0);
  const [online, setOnline] = useState(true);

  const { lastEvent } = useWebSocket(token);

  const fetchShift = useCallback(async () => {
    try {
      const r = await axios.get<MyShift>(`${API_URL}/mobile/my-shift`);
      setData(r.data);
    } catch { /* offline */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchShift();
    setOfflineCount(OfflineQueue.size());

    const handleOnline = async () => {
      setOnline(true);
      if (token && OfflineQueue.size() > 0) {
        await OfflineQueue.sync(token);
        setOfflineCount(OfflineQueue.size());
        fetchShift();
      }
    };
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [fetchShift, token]);

  // Refresh on escalation/assignment WS events
  useEffect(() => {
    if (lastEvent && ["CASE_ASSIGNED","CASE_ESCALATED","TASK_COMPLETED","INCIDENT_CREATED"].includes(lastEvent.type)) {
      fetchShift();
    }
  }, [lastEvent, fetchShift]);

  if (loading) return (
    <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading shift…</div>
  );

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--pg-navy)" }}>My Shift</h1>
          <p className="text-sm" style={{ color: "var(--pg-text-muted)" }}>{data?.role_context ?? ""}</p>
        </div>
        <div className="flex items-center gap-2">
          {!online && (
            <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-medium">Offline</span>
          )}
          {offlineCount > 0 && (
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-medium">
              {offlineCount} queued
            </span>
          )}
          {data?.unread_notification_count != null && data.unread_notification_count > 0 && (
            <span className="bg-red-500 text-white text-xs w-6 h-6 rounded-full flex items-center justify-center font-bold">
              {data.unread_notification_count}
            </span>
          )}
        </div>
      </div>

      {/* Alerts */}
      {data?.alerts && data.alerts.length > 0 && (
        <div className="space-y-2">
          {data.alerts.map((a, i) => (
            <div key={i} className={`border rounded-xl px-4 py-3 ${SEVERITY_BG[a.severity] ?? "bg-gray-100 border-gray-200"}`}>
              <p className="font-semibold text-sm">{a.title}</p>
              <p className="text-xs mt-0.5">{a.body}</p>
            </div>
          ))}
        </div>
      )}

      {/* Stat grid */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "My Cases",   value: data?.assigned_case_count ?? 0,  accent: "var(--pg-navy)" },
          { label: "Follow-Up",  value: data?.overdue_task_count ?? 0,   accent: (data?.overdue_task_count ?? 0) > 0 ? "#c2410c" : "var(--pg-text-muted)" },
          { label: "Incidents",  value: data?.active_incident_count ?? 0, accent: (data?.active_incident_count ?? 0) > 0 ? "#c2410c" : "var(--pg-text-muted)" },
        ].map(({ label, value, accent }) => (
          <div key={label} className="bg-white rounded-2xl px-4 py-3" style={{ border: "1px solid var(--pg-border)" }}>
            <p className="text-xs font-medium" style={{ color: "var(--pg-text-muted)" }}>{label}</p>
            <p className="text-3xl font-bold mt-0.5 tabular-nums" style={{ color: accent }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { href: "/mobile/incident", icon: "⚠️", label: "Report Incident", bg: "rgba(220,38,38,0.9)" },
          { href: "/mobile/scan",     icon: "📷", label: "Scan Case QR",    bg: "var(--pg-slate)" },
          { href: "/work",            icon: "📋", label: "My Follow-Ups",   bg: "var(--pg-navy)" },
        ].map(({ href, icon, label, bg }) => (
          <Link key={href} href={href}
            className="flex flex-col items-center gap-2 text-white rounded-2xl py-5 transition-opacity hover:opacity-90 active:opacity-80"
            style={{ background: bg }}>
            <span className="text-3xl">{icon}</span>
            <span className="text-sm font-semibold text-center">{label}</span>
          </Link>
        ))}
      </div>

      {/* Urgent cases — link to work page, not case management */}
      {data?.urgent_cases && data.urgent_cases.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-2" style={{ color: "var(--pg-text-sub)" }}>Assigned to Me</h2>
          <div className="space-y-2">
            {data.urgent_cases.map((c) => (
              <Link key={c.id} href="/work"
                className="flex items-center gap-3 bg-white border rounded-xl px-4 py-3 transition-colors hover:bg-gray-50 active:bg-gray-50"
                style={{ borderColor: "var(--pg-border)" }}>
                <span className={`w-3 h-3 rounded-full flex-shrink-0 ${PRIORITY_COLORS[c.priority] ?? "bg-gray-400"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium capitalize" style={{ color: "var(--pg-text)" }}>
                    {c.priority} · {c.status.replace(/_/g, " ")}
                    {c.escalation_level >= 1 && ` ⬆${c.escalation_level}`}
                  </p>
                  <p className="text-xs font-mono" style={{ color: "var(--pg-text-muted)" }}>{c.incident_id.slice(0, 8)}…</p>
                </div>
                {c.due_date && (
                  <span className={`text-xs flex-shrink-0 ${new Date(c.due_date) < new Date() ? "text-red-500" : ""}`}
                    style={{ color: new Date(c.due_date) < new Date() ? undefined : "var(--pg-text-muted)" }}>
                    {relTime(c.due_date)}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* My tasks */}
      {data?.my_tasks && data.my_tasks.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">My Tasks</h2>
          <div className="space-y-2">
            {data.my_tasks.map((t) => (
              <div key={t.id} className={`flex items-center gap-3 bg-white border rounded-xl px-4 py-3 ${t.overdue ? "border-red-200" : "border-gray-200"}`}>
                <span className="text-lg">{t.overdue ? "⏰" : "☐"}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800">{t.title}</p>
                  {t.due_date && (
                    <p className={`text-xs ${t.overdue ? "text-red-500" : "text-gray-400"}`}>
                      {relTime(t.due_date)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
