"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import axios from "axios";
import { useWebSocket } from "../../hooks/useWebSocket";
import { useAuth } from "../../context/AuthContext";
import { API_URL } from "../../lib/api";
import QuickActions from "./QuickActions";

interface Task {
  id: string; case_id: string; title: string;
  due_date: string | null; overdue: boolean;
}

function relTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso), now = new Date();
  const diff = d.getTime() - now.getTime();
  if (diff < 0) return "follow-up needed";
  const h = Math.floor(diff / 3600000);
  if (h < 24) return `due in ${h}h`;
  const days = Math.floor(h / 24);
  return `due in ${days}d`;
}

export default function FieldStaffView() {
  const { token } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [overdueCount, setOverdueCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const { lastEvent } = useWebSocket(token);

  const fetchData = useCallback(async () => {
    try {
      const r = await axios.get(`${API_URL}/mobile/my-shift`);
      setTasks(r.data.my_tasks ?? []);
      setOverdueCount(r.data.overdue_task_count ?? 0);
    } catch { /* offline — show what we have */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    if (lastEvent && ["TASK_COMPLETED", "CASE_ASSIGNED"].includes(lastEvent.type)) fetchData();
  }, [lastEvent, fetchData]);

  const pendingTasks = tasks.filter((t) => !t.overdue);
  const overdueTasks = tasks.filter((t) => t.overdue);

  return (
    <div className="flex flex-col gap-5">
      {/* 2-column on desktop: actions left, tasks right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: actions */}
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
            <Link href="/mobile/incident"
              className="flex flex-col lg:flex-row items-center lg:items-center gap-2 lg:gap-3 rounded-2xl py-5 lg:py-4 lg:px-5 active:opacity-80 hover:opacity-90 transition-opacity"
              style={{ background: "rgba(220,38,38,0.9)", color: "white" }}>
              <span className="text-2xl lg:text-xl">⚠️</span>
              <span className="text-xs font-semibold text-center lg:text-left">Report Incident</span>
            </Link>
            <Link href="/mobile/scan"
              className="flex flex-col lg:flex-row items-center lg:items-center gap-2 lg:gap-3 rounded-2xl py-5 lg:py-4 lg:px-5 active:opacity-80 hover:opacity-90 transition-opacity"
              style={{ background: "var(--pg-slate)", color: "white" }}>
              <span className="text-2xl lg:text-xl">📷</span>
              <span className="text-xs font-semibold text-center lg:text-left">Scan Case QR</span>
            </Link>
          </div>

            </div>

        {/* Right: tasks (2 col span on desktop) */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {loading ? (
            <div className="pg-skeleton h-48 rounded-xl" />
          ) : (
            <>
              {overdueTasks.length > 0 && (
                <div className="rounded-xl overflow-hidden bg-white" style={{ border: "1px solid rgba(251,191,36,0.4)", boxShadow: "var(--shadow-card)" }}>
                  <div className="px-5 py-3" style={{ borderBottom: "1px solid rgba(251,191,36,0.3)", background: "rgba(254,243,199,0.5)" }}>
                    <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#92400e", letterSpacing: "0.06em" }}>
                      {overdueTasks.length === 1 ? "1 follow-up needs attention" : `${overdueTasks.length} follow-ups need attention`}
                    </h2>
                  </div>
                  <div className="divide-y" style={{ divideColor: "var(--pg-border-soft)" }}>
                    {overdueTasks.map((task) => (
                      <Link key={task.id} href="/work"
                        className="flex items-start gap-3 px-5 py-3 transition-colors last:rounded-b-xl"
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(254,243,199,0.3)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                        <span className="flex-shrink-0 mt-0.5 text-sm" style={{ color: "#d97706" }}>⏰</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm" style={{ color: "var(--pg-text)" }}>{task.title}</p>
                          <p className="text-xs mt-0.5" style={{ color: "#d97706" }}>Follow-up needed</p>
                        </div>
                        <span className="text-xs flex-shrink-0" style={{ color: "var(--pg-text-muted)" }}>→</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {pendingTasks.length > 0 && (
                <div className="rounded-xl overflow-hidden bg-white" style={{ border: "1px solid var(--pg-border)", boxShadow: "var(--shadow-card)" }}>
                  <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--pg-border-soft)" }}>
                    <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--pg-text-muted)", letterSpacing: "0.06em" }}>Upcoming Follow-Ups</h2>
                  </div>
                  <div className="divide-y" style={{ divideColor: "var(--pg-border-soft)" }}>
                    {pendingTasks.map((task) => (
                      <Link key={task.id} href="/work"
                        className="flex items-start gap-3 px-5 py-3 transition-colors"
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--pg-surface)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                        <span className="flex-shrink-0 mt-0.5 text-sm" style={{ color: "var(--pg-text-muted)" }}>☐</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm" style={{ color: "var(--pg-text)" }}>{task.title}</p>
                          {task.due_date && <p className="text-xs mt-0.5" style={{ color: "var(--pg-text-muted)" }}>{relTime(task.due_date)}</p>}
                        </div>
                        <span className="text-xs flex-shrink-0" style={{ color: "var(--pg-text-muted)" }}>→</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {tasks.length === 0 && (
                <div className="rounded-xl px-6 py-10 text-center bg-white" style={{ border: "1px solid var(--pg-border)", boxShadow: "var(--shadow-card)" }}>
                  <div className="w-10 h-10 rounded-full mx-auto mb-3 flex items-center justify-center"
                    style={{ background: "rgba(22,163,74,0.1)" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M5 13l4 4L19 7" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <h2 className="text-base font-semibold" style={{ color: "var(--pg-navy)" }}>You're all caught up</h2>
                  <p className="text-sm mt-1 leading-relaxed" style={{ color: "var(--pg-text-muted)" }}>
                    No follow-ups right now. If you notice a safety issue, report it using the buttons on the left.
                  </p>
                </div>
              )}

              <Link href="/work"
                className="flex items-center gap-4 bg-white rounded-xl px-5 py-4 transition-colors"
                style={{ border: "1px solid var(--pg-border)", boxShadow: "var(--shadow-xs)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--pg-surface)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "white"; }}>
                <span className="text-xl" style={{ color: "var(--pg-text-muted)" }}>📋</span>
                <div className="flex-1">
                  <p className="text-sm font-medium" style={{ color: "var(--pg-text)" }}>My Reports & Follow-Ups</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--pg-text-muted)" }}>View all your submitted reports and assigned tasks</p>
                </div>
                <span style={{ color: "var(--pg-text-muted)" }}>›</span>
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
