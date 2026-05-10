"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { useWebSocket } from "../hooks/useWebSocket";
import { API_URL } from "../lib/api";

interface Case {
  id: string; incident_id: string; status: string; priority: string;
  escalation_level: number; assigned_to_user_id: string | null;
  assigned_role: string | null; due_date: string | null; updated_at: string;
}
interface Task {
  id: string; case_id: string; title: string; description: string | null;
  assigned_to_user_id: string | null; completed: boolean;
  due_date: string | null; created_at: string;
}
interface IncidentSummary {
  id: string; center_id: string; incident_type: string;
  reported_severity: string; category: string | null; risk_score: number | null;
  status: string; recordable: boolean | null; created_at: string;
}
interface MyWorkResponse {
  role_context: string;
  assigned_cases: Case[];
  overdue_tasks: Task[];
  escalated_cases: Case[];
  pending_osha_review: IncidentSummary[];
  open_incidents_count: number;
  open_tasks_in_orgs: number;
  unread_notifications: number;
}

const PRIORITY_STYLES: Record<string, string> = {
  low: "bg-green-100 text-green-700", medium: "bg-yellow-100 text-yellow-700",
  high: "bg-orange-100 text-orange-700", critical: "bg-red-100 text-red-700",
};
const STATUS_STYLES: Record<string, string> = {
  new: "bg-gray-100 text-gray-600", assigned: "bg-blue-100 text-blue-700",
  investigating: "bg-indigo-100 text-indigo-700",
  awaiting_followup: "bg-yellow-100 text-yellow-700",
  resolved: "bg-green-100 text-green-700", closed: "bg-gray-200 text-gray-500",
};
const SEVERITY_STYLES: Record<string, string> = {
  low: "bg-green-100 text-green-700", medium: "bg-yellow-100 text-yellow-700",
  high: "bg-orange-100 text-orange-700", critical: "bg-red-100 text-red-700",
};

function Badge({ label, style }: { label: string; style: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium capitalize ${style}`}>
      {label}
    </span>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function SectionCard({ title, count, color, children }: {
  title: string; count: number; color: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className={`flex items-center justify-between px-5 py-3 border-b border-gray-100 ${color}`}>
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs font-bold tabular-nums">{count}</span>
      </div>
      <div className="divide-y divide-gray-100">{children}</div>
    </div>
  );
}

const WORK_EVENTS = new Set([
  "INCIDENT_CREATED", "CASE_ASSIGNED", "CASE_ESCALATED", "TASK_COMPLETED", "TASK_REOPENED",
]);

export default function WorkPage() {
  const { isAuthenticated, token } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<MyWorkResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { lastEvent } = useWebSocket(isAuthenticated ? token : null);

  function loadWork() {
    axios.get<MyWorkResponse>(`${API_URL}/my-work`)
      .then((r) => setData(r.data))
      .catch((err: unknown) => setError(axios.isAxiosError(err) ? String(err.response?.data?.detail ?? err.message) : "Failed"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login?from=/work"); return; }
    loadWork();
  }, [isAuthenticated, router]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live refresh on relevant WS events
  useEffect(() => {
    if (lastEvent && WORK_EVENTS.has(lastEvent.type)) loadWork();
  }, [lastEvent]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isAuthenticated) return null;

  const d = data;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">My Work</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {d ? `${d.role_context} view — personalized to your org scope` : "Personalized work queue"}
          </p>
        </div>
        {d && (
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <span><strong className="text-gray-800">{d.open_incidents_count}</strong> open incidents</span>
            <span><strong className="text-gray-800">{d.open_tasks_in_orgs}</strong> open tasks</span>
            {d.unread_notifications > 0 && (
              <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs font-medium">
                {d.unread_notifications} unread
              </span>
            )}
          </div>
        )}
      </div>

      {error && <div className="text-sm bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3">{error}</div>}
      {loading ? (
        <div className="text-center py-20 text-sm text-gray-400">Loading your work queue…</div>
      ) : d && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Assigned cases */}
          <SectionCard title="Assigned to Me" count={d.assigned_cases.length} color="text-blue-800 bg-blue-50">
            {d.assigned_cases.length === 0
              ? <p className="px-5 py-4 text-xs text-gray-400 italic">No cases assigned to you</p>
              : d.assigned_cases.map((c) => (
                <Link key={c.id} href="/cases" className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                      <Badge label={c.status.replace(/_/g," ")} style={STATUS_STYLES[c.status] ?? ""} />
                      <Badge label={c.priority} style={PRIORITY_STYLES[c.priority] ?? ""} />
                      {c.escalation_level >= 1 && <span className="text-xs text-red-600 font-bold">⬆ {c.escalation_level}</span>}
                    </div>
                    <p className="text-xs text-gray-400 font-mono">{c.incident_id.slice(0,8)}…</p>
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0">{relativeTime(c.updated_at)}</span>
                </Link>
              ))}
          </SectionCard>

          {/* Overdue tasks */}
          <SectionCard title="Overdue Tasks" count={d.overdue_tasks.length} color="text-red-800 bg-red-50">
            {d.overdue_tasks.length === 0
              ? <p className="px-5 py-4 text-xs text-gray-400 italic">No overdue tasks</p>
              : d.overdue_tasks.map((t) => (
                <div key={t.id} className="px-5 py-3">
                  <p className="text-sm font-medium text-gray-800">{t.title}</p>
                  {t.description && <p className="text-xs text-gray-400 mt-0.5 truncate">{t.description}</p>}
                  {t.due_date && (
                    <p className="text-xs text-red-600 mt-0.5">
                      Due {new Date(t.due_date).toLocaleDateString()}
                    </p>
                  )}
                </div>
              ))}
          </SectionCard>

          {/* Escalated cases */}
          <SectionCard title="Escalated Cases" count={d.escalated_cases.length} color="text-orange-800 bg-orange-50">
            {d.escalated_cases.length === 0
              ? <p className="px-5 py-4 text-xs text-gray-400 italic">No active escalations</p>
              : d.escalated_cases.map((c) => (
                <Link key={c.id} href="/cases" className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50">
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Badge label={c.priority} style={PRIORITY_STYLES[c.priority] ?? ""} />
                      <span className={`text-xs font-bold ${c.escalation_level >= 3 ? "text-red-600" : c.escalation_level >= 2 ? "text-orange-600" : "text-yellow-600"}`}>
                        Level {c.escalation_level}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 font-mono">{c.incident_id.slice(0,8)}…</p>
                  </div>
                  <span className="text-xs text-gray-400">{relativeTime(c.updated_at)}</span>
                </Link>
              ))}
          </SectionCard>

          {/* Pending OSHA review */}
          <SectionCard title="Pending OSHA Review" count={d.pending_osha_review.length} color="text-yellow-800 bg-yellow-50">
            {d.pending_osha_review.length === 0
              ? <p className="px-5 py-4 text-xs text-gray-400 italic">No incidents pending OSHA review</p>
              : d.pending_osha_review.map((i) => (
                <div key={i.id} className="px-5 py-3">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Badge label={i.reported_severity} style={SEVERITY_STYLES[i.reported_severity] ?? ""} />
                    <span className="text-xs text-gray-500">{i.incident_type}</span>
                  </div>
                  <p className="text-xs text-gray-400">
                    {i.center_id} · {i.category ?? "Uncategorized"}
                    {i.risk_score != null && ` · Risk: ${i.risk_score}`}
                  </p>
                </div>
              ))}
          </SectionCard>
        </div>
      )}
    </div>
  );
}
