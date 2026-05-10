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

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-500", high: "bg-orange-400", medium: "bg-yellow-400", low: "bg-green-400",
};

function relTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso), now = new Date();
  const diff = d.getTime() - now.getTime();
  if (diff < 0) return "overdue";
  const h = Math.floor(diff / 3600000);
  if (h < 24) return `due in ${h}h`;
  return `due ${d.toLocaleDateString()}`;
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
            <div key={i} className={`border rounded-xl px-4 py-3 ${
              a.severity === "critical" ? "bg-red-50 border-red-300 text-red-800" :
              a.severity === "high" ? "bg-orange-50 border-orange-300 text-orange-800" :
              "bg-yellow-50 border-yellow-300 text-yellow-800"
            }`}>
              <p className="font-semibold text-sm">{a.title}</p>
              <p className="text-xs mt-0.5">{a.body}</p>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-sm text-gray-400">Loading…</div>
      ) : empty ? (
        <EmptyStateCenter t={t} />
      ) : data && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: `My ${t("case", "Cases")}`,           value: data.assigned_case_count,    red: false },
              { label: `Overdue ${t("corrective_action","Tasks")}`, value: data.overdue_task_count, red: data.overdue_task_count > 0 },
              { label: `Active ${t("incident", "Incidents")}`, value: data.active_incident_count, red: false },
              { label: `Pending ${t("inspection", "Inspections")}`, value: data.pending_inspection_count, red: false },
            ].map(({ label, value, red }) => (
              <div key={label} className="bg-white rounded-xl border border-gray-200 px-5 py-4">
                <p className="text-xs text-gray-500 font-medium">{label}</p>
                <p className={`text-2xl font-bold mt-1 ${red ? "text-red-600" : "text-gray-900"}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Cases + Tasks */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-5 py-3 border-b border-gray-100 bg-blue-50">
                <h2 className="text-sm font-semibold text-blue-800">My Assigned {t("case", "Cases")}</h2>
              </div>
              <div className="divide-y divide-gray-100">
                {data.urgent_cases.length === 0 ? (
                  <p className="px-5 py-4 text-xs text-gray-400 italic">No cases assigned</p>
                ) : data.urgent_cases.map((c) => (
                  <Link key={c.id} href="/cases" className="flex items-center gap-2 px-5 py-2.5 hover:bg-gray-50">
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${PRIORITY_COLORS[c.priority] ?? "bg-gray-400"}`} />
                    <span className="text-sm text-gray-700 capitalize flex-1">{c.priority} · {c.status.replace(/_/g," ")}</span>
                    {c.escalation_level >= 1 && (
                      <span className="text-xs text-orange-600 font-bold">⬆{c.escalation_level}</span>
                    )}
                    {c.due_date && (
                      <span className={`text-xs ${new Date(c.due_date) < new Date() ? "text-red-500" : "text-gray-400"}`}>
                        {relTime(c.due_date)}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-5 py-3 border-b border-gray-100 bg-green-50">
                <h2 className="text-sm font-semibold text-green-800">My Tasks</h2>
              </div>
              <div className="divide-y divide-gray-100">
                {data.my_tasks.length === 0 ? (
                  <p className="px-5 py-4 text-xs text-gray-400 italic">No tasks assigned</p>
                ) : data.my_tasks.map((task) => (
                  <div key={task.id} className={`flex items-center gap-2 px-5 py-2.5 ${task.overdue ? "bg-red-50" : ""}`}>
                    <span className="text-sm">{task.overdue ? "🔴" : "☐"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 truncate">{task.title}</p>
                      {task.due_date && (
                        <p className={`text-xs ${task.overdue ? "text-red-500" : "text-gray-400"}`}>
                          {relTime(task.due_date)}
                        </p>
                      )}
                    </div>
                  </div>
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
    <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
      <p className="text-4xl mb-3">🏢</p>
      <h2 className="text-lg font-semibold text-gray-900">Your {t("center", "Center")} is All Clear</h2>
      <p className="text-sm text-gray-500 mt-1 mb-4">
        No open {t("case","cases")} or overdue items. Keep up the great work! Run a routine
        {" "}{t("inspection","inspection")} to stay proactive.
      </p>
      <div className="flex items-center justify-center gap-3">
        <Link href="/mobile/inspect" className="bg-green-600 text-white px-5 py-2 rounded-xl text-sm font-medium">
          Start {t("inspection","Inspection")}
        </Link>
        <Link href="/mobile/incident" className="bg-gray-600 text-white px-5 py-2 rounded-xl text-sm font-medium">
          Report Issue
        </Link>
      </div>
    </div>
  );
}
