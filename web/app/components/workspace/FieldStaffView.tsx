"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import axios from "axios";
import { useWebSocket } from "../../hooks/useWebSocket";
import { useAuth } from "../../context/AuthContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { API_URL } from "../../lib/api";
import QuickActions from "./QuickActions";

interface Task {
  id: string; case_id: string; title: string;
  due_date: string | null; overdue: boolean;
}

interface Inspection {
  id: string; center_code: string; title: string;
  status: string; inspection_type: string; created_at: string;
}

export default function FieldStaffView() {
  const { token } = useAuth();
  const { t } = useWorkspace();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [overdueCount, setOverdueCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const { lastEvent } = useWebSocket(token);

  const fetch = useCallback(async () => {
    try {
      const [shiftRes, inspRes] = await Promise.all([
        axios.get(`${API_URL}/mobile/my-shift`),
        axios.get<Inspection[]>(`${API_URL}/inspections?limit=5`),
      ]);
      setTasks(shiftRes.data.my_tasks ?? []);
      setOverdueCount(shiftRes.data.overdue_task_count ?? 0);
      setInspections(inspRes.data.filter((i: Inspection) => i.status === "in_progress").slice(0, 3));
    } catch { /* offline */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  useEffect(() => {
    if (lastEvent && ["TASK_COMPLETED", "EVIDENCE_UPLOADED"].includes(lastEvent.type)) fetch();
  }, [lastEvent, fetch]);

  return (
    <div className="flex flex-col gap-5">
      {/* Emergency actions row */}
      <div className="bg-red-600 text-white rounded-2xl p-4">
        <p className="text-xs font-semibold uppercase tracking-wide mb-3 opacity-75">Emergency Actions</p>
        <div className="grid grid-cols-3 gap-2">
          <Link href="/mobile/incident?type=employee_injury"
            className="bg-white/20 rounded-xl py-3 flex flex-col items-center gap-1 active:opacity-75">
            <span className="text-2xl">🧑‍⚕️</span>
            <span className="text-xs font-medium">Injury</span>
          </Link>
          <Link href="/mobile/incident?type=escape"
            className="bg-white/20 rounded-xl py-3 flex flex-col items-center gap-1 active:opacity-75">
            <span className="text-2xl">🚪</span>
            <span className="text-xs font-medium">Escape</span>
          </Link>
          <Link href="/mobile/incident"
            className="bg-white/20 rounded-xl py-3 flex flex-col items-center gap-1 active:opacity-75">
            <span className="text-2xl">⚠️</span>
            <span className="text-xs font-medium">Report</span>
          </Link>
        </div>
      </div>

      <QuickActions />

      {loading ? (
        <div className="text-center py-8 text-sm text-gray-400">Loading…</div>
      ) : (
        <>
          {/* Active inspections */}
          {inspections.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-5 py-3 border-b border-gray-100 bg-green-50 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-green-800">Active {t("inspection","Inspections")}</h2>
                <Link href="/mobile/inspect" className="text-xs text-green-600 hover:underline">All →</Link>
              </div>
              {inspections.map((insp) => (
                <Link key={insp.id} href="/mobile/inspect"
                  className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-0">
                  <span className="text-2xl">📋</span>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{insp.title}</p>
                    <p className="text-xs text-gray-400">{insp.center_code} · {insp.inspection_type}</p>
                  </div>
                  <span className="ml-auto text-xs text-yellow-600 font-medium">In Progress</span>
                </Link>
              ))}
            </div>
          )}

          {/* My tasks */}
          {tasks.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200">
              <div className={`px-5 py-3 border-b border-gray-100 flex items-center justify-between ${overdueCount > 0 ? "bg-red-50" : "bg-blue-50"}`}>
                <h2 className={`text-sm font-semibold ${overdueCount > 0 ? "text-red-800" : "text-blue-800"}`}>
                  My Tasks {overdueCount > 0 && `(${overdueCount} overdue)`}
                </h2>
              </div>
              {tasks.map((task) => (
                <div key={task.id}
                  className={`flex items-center gap-3 px-5 py-3 border-b border-gray-100 last:border-0 ${task.overdue ? "bg-red-50" : ""}`}>
                  <span>{task.overdue ? "🔴" : "☐"}</span>
                  <div className="flex-1">
                    <p className="text-sm text-gray-800">{task.title}</p>
                    {task.due_date && (
                      <p className={`text-xs ${task.overdue ? "text-red-500" : "text-gray-400"}`}>
                        {task.overdue ? "Overdue: " : "Due: "}{new Date(task.due_date).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tasks.length === 0 && inspections.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <p className="text-4xl mb-3">✅</p>
              <h2 className="text-lg font-semibold text-gray-900">All Clear!</h2>
              <p className="text-sm text-gray-500 mt-1">No assigned tasks or active inspections. Use the buttons above to report any issues or scan a QR code.</p>
            </div>
          )}

          {/* Scan CTA */}
          <Link href="/mobile/scan"
            className="flex items-center gap-4 bg-indigo-600 text-white rounded-2xl px-6 py-4 active:opacity-80">
            <span className="text-3xl">📷</span>
            <div>
              <p className="font-semibold">Scan Location QR Code</p>
              <p className="text-xs opacity-75">Quickly report issues or start inspections at any tagged location</p>
            </div>
            <span className="ml-auto text-lg">›</span>
          </Link>
        </>
      )}
    </div>
  );
}
