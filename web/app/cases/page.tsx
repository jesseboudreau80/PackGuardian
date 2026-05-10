"use client";

import {
  useEffect,
  useState,
  useCallback,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { useWebSocket } from "../hooks/useWebSocket";
import { API_URL } from "../lib/api";
import EvidenceTab from "../components/EvidenceTab";
import OperationalTimeline from "../components/OperationalTimeline";
import AICopilot from "../components/AICopilot";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Case {
  id: string;
  incident_id: string;
  organization_id: string | null;
  assigned_to_user_id: string | null;
  assigned_role: string | null;
  status: CaseStatus;
  priority: CasePriority;
  escalation_level: number;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

interface IncidentSummary {
  id: string;
  center_id: string;
  incident_type: string;
  reported_severity: string;
  adjusted_severity: string | null;
  category: string | null;
  risk_score: number | null;
  status: string;
  recordable: boolean | null;
  created_at: string;
}

interface Task {
  id: string;
  case_id: string;
  title: string;
  description: string | null;
  assigned_to_user_id: string | null;
  completed: boolean;
  completed_at: string | null;
  due_date: string | null;
  created_at: string;
}

interface Comment {
  id: string;
  case_id: string;
  user_id: string;
  message: string;
  visibility: string;
  created_at: string;
}

interface TimelineEvent {
  id: string;
  case_id: string;
  actor_id: string;
  event_type: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

interface CaseDetail {
  case: Case;
  incident: IncidentSummary;
  tasks: Task[];
  comments: Comment[];
  timeline: TimelineEvent[];
  task_count: number;
  open_task_count: number;
  evidence_count: number;
}

interface TenantUser {
  id: string;
  email: string;
  role: string;
}

type CaseStatus = "new" | "assigned" | "investigating" | "awaiting_followup" | "resolved" | "closed";
type CasePriority = "low" | "medium" | "high" | "critical";
type CommentVisibility = "all" | "hr_only" | "legal_only" | "management_only";

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<CaseStatus, string> = {
  new:               "New",
  assigned:          "Assigned",
  investigating:     "Investigating",
  awaiting_followup: "Awaiting Follow-up",
  resolved:          "Resolved",
  closed:            "Closed",
};

const STATUS_STYLES: Record<CaseStatus, string> = {
  new:               "bg-gray-100 text-gray-600",
  assigned:          "bg-blue-100 text-blue-700",
  investigating:     "bg-indigo-100 text-indigo-700",
  awaiting_followup: "bg-yellow-100 text-yellow-700",
  resolved:          "bg-green-100 text-green-700",
  closed:            "bg-gray-200 text-gray-500",
};

const PRIORITY_STYLES: Record<CasePriority, string> = {
  low:      "bg-green-100 text-green-700",
  medium:   "bg-yellow-100 text-yellow-700",
  high:     "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

const VISIBILITY_LABELS: Record<CommentVisibility, string> = {
  all: "Everyone", hr_only: "HR Only", legal_only: "Legal Only", management_only: "Management",
};

const EVENT_ICONS: Record<string, string> = {
  case_created:     "✦",
  status_changed:   "⇄",
  assigned:         "→",
  comment_added:    "💬",
  task_created:     "☐",
  task_completed:   "✓",
  task_reopened:    "↺",
  escalated:        "⬆",
  priority_changed: "◈",
  closed:           "✕",
};

const CASE_STATUSES: CaseStatus[] = ["new","assigned","investigating","awaiting_followup","resolved","closed"];
const CASE_PRIORITIES: CasePriority[] = ["low","medium","high","critical"];

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

// ── Main page ─────────────────────────────────────────────────────────────────

// WS event types that affect the case list
const CASE_LIST_EVENTS = new Set([
  "INCIDENT_CREATED", "CASE_ASSIGNED", "CASE_ESCALATED", "CASE_STATUS_CHANGED",
]);
// WS event types that affect the open case detail
const CASE_DETAIL_EVENTS = new Set([
  "CASE_ASSIGNED", "CASE_ESCALATED", "CASE_STATUS_CHANGED",
  "COMMENT_ADDED", "TASK_COMPLETED", "TASK_REOPENED",
  "EVIDENCE_UPLOADED", "EVIDENCE_ANALYZED",
]);

export default function CasesPage() {
  const { isAuthenticated, token } = useAuth();
  const router = useRouter();
  const [cases, setCases] = useState<Case[]>([]);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const [escalationMin, setEscalationMin] = useState(0);

  const { lastEvent } = useWebSocket(isAuthenticated ? token : null);

  useEffect(() => {
    if (!isAuthenticated) router.push("/login?from=/cases");
  }, [isAuthenticated, router]);

  const fetchCases = useCallback(async () => {
    if (!isAuthenticated) return;
    setError(null);
    const params: Record<string, string | number> = { limit: 100 };
    if (statusFilter) params.status = statusFilter;
    if (priorityFilter) params.priority = priorityFilter;
    if (escalationMin > 0) params.escalation_min = escalationMin;
    try {
      const [casesRes, usersRes] = await Promise.all([
        axios.get<Case[]>(`${API_URL}/cases`, { params }),
        axios.get<TenantUser[]>(`${API_URL}/users`),
      ]);
      setCases(casesRes.data);
      setUsers(usersRes.data);
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? String(err.response?.data?.detail ?? err.message) : "Failed to load");
    } finally { setLoading(false); }
  }, [isAuthenticated, statusFilter, priorityFilter, escalationMin]);

  useEffect(() => { fetchCases(); }, [fetchCases]);

  // Live updates: refresh list and/or detail on WS events
  useEffect(() => {
    if (!lastEvent) return;
    const eventCaseId = lastEvent.case_id as string | undefined;
    if (CASE_LIST_EVENTS.has(lastEvent.type)) fetchCases();
    if (CASE_DETAIL_EVENTS.has(lastEvent.type) && selectedCaseId && eventCaseId === selectedCaseId) {
      refreshDetail();
    }
  }, [lastEvent]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bump timelineTick when evidence events arrive for the open case
  // (OperationalTimeline is nested in CaseDetailPanel — we thread this via onFileUploaded/refreshTick)

  async function selectCase(caseId: string) {
    setSelectedCaseId(caseId);
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await axios.get<CaseDetail>(`${API_URL}/cases/${caseId}`);
      setDetail(res.data);
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? String(err.response?.data?.detail ?? err.message) : "Failed to load case");
    } finally { setDetailLoading(false); }
  }

  async function refreshDetail() {
    if (!selectedCaseId) return;
    try {
      const res = await axios.get<CaseDetail>(`${API_URL}/cases/${selectedCaseId}`);
      setDetail(res.data);
      // Also refresh the case in the list
      setCases((prev) => prev.map((c) =>
        c.id === selectedCaseId ? res.data.case : c
      ));
    } catch { /* non-fatal refresh */ }
  }

  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

  if (!isAuthenticated) return null;

  return (
    <div className="flex flex-col gap-4">
      {/* Header + filters */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Case Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Enterprise incident lifecycle and workflow tracking</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white text-gray-600 focus:outline-none">
            <option value="">All statuses</option>
            {CASE_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
          <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white text-gray-600 focus:outline-none">
            <option value="">All priorities</option>
            {CASE_PRIORITIES.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={escalationMin > 0}
              onChange={(e) => setEscalationMin(e.target.checked ? 1 : 0)}
              className="rounded border-gray-300" />
            Escalated only
          </label>
          <button onClick={fetchCases} className="text-sm text-gray-500 hover:text-gray-800 px-3 py-1.5 border border-gray-200 rounded-lg bg-white">
            Refresh
          </button>
        </div>
      </div>

      {error && <div className="text-sm bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2.5">{error}</div>}

      {/* Split panel */}
      <div className="flex gap-4" style={{ minHeight: 600 }}>
        {/* Case list */}
        <div className={`bg-white rounded-xl border border-gray-200 overflow-y-auto ${selectedCaseId ? "w-80 flex-shrink-0" : "flex-1"}`}>
          {loading ? (
            <div className="text-center py-16 text-sm text-gray-400">Loading cases…</div>
          ) : cases.length === 0 ? (
            <div className="text-center py-16 text-sm text-gray-400">No cases found.</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {cases.map((c) => (
                <CaseListItem
                  key={c.id}
                  c={c}
                  userMap={userMap}
                  selected={c.id === selectedCaseId}
                  onClick={() => selectCase(c.id)}
                />
              ))}
            </ul>
          )}
        </div>

        {/* Detail panel */}
        {selectedCaseId && (
          <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-y-auto">
            {detailLoading ? (
              <div className="text-center py-16 text-sm text-gray-400">Loading case detail…</div>
            ) : detail ? (
              <CaseDetailPanel
                detail={detail}
                users={users}
                userMap={userMap}
                onClose={() => { setSelectedCaseId(null); setDetail(null); }}
                onRefresh={refreshDetail}
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Case list item ────────────────────────────────────────────────────────────

function CaseListItem({ c, userMap, selected, onClick }: {
  c: Case; userMap: Record<string, TenantUser>;
  selected: boolean; onClick: () => void;
}) {
  const assignee = c.assigned_to_user_id ? userMap[c.assigned_to_user_id] : null;
  return (
    <li
      onClick={onClick}
      className={`px-4 py-3 cursor-pointer transition-colors ${selected ? "bg-indigo-50 border-l-2 border-indigo-500" : "hover:bg-gray-50 border-l-2 border-transparent"}`}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <StatusBadge status={c.status} />
            <PriorityBadge priority={c.priority} />
            {c.escalation_level >= 2 && (
              <span className="text-xs text-red-600 font-bold">🔥 ESC-{c.escalation_level}</span>
            )}
          </div>
          <p className="text-xs text-gray-500 truncate">
            Incident <span className="font-mono">{c.incident_id.slice(0, 8)}…</span>
          </p>
          {assignee && (
            <p className="text-xs text-gray-400 mt-0.5 truncate">→ {assignee.email}</p>
          )}
        </div>
        <div className="text-xs text-gray-400 flex-shrink-0 text-right">
          <p>{relativeTime(c.updated_at)}</p>
          {c.due_date && (
            <p className={`mt-0.5 ${new Date(c.due_date) < new Date() ? "text-red-500" : "text-gray-400"}`}>
              Due {formatDate(c.due_date)}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

// ── Case detail panel ─────────────────────────────────────────────────────────

function CaseDetailPanel({ detail, users, userMap, onClose, onRefresh }: {
  detail: CaseDetail;
  users: TenantUser[];
  userMap: Record<string, TenantUser>;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const { case: c, incident, tasks, comments } = detail;
  const [activeTab, setActiveTab] = useState<"tasks" | "comments" | "evidence" | "timeline" | "copilot">("tasks");
  // timeline refresh tick for OperationalTimeline component
  const [timelineTick, setTimelineTick] = useState(0);
  const [updatingField, setUpdatingField] = useState<string | null>(null);

  async function patchCase(data: Partial<{
    status: string; priority: string; escalation_level: number;
    assigned_to_user_id: string; assigned_role: string; due_date: string;
  }>) {
    try {
      await axios.patch(`${API_URL}/cases/${c.id}`, data);
      onRefresh();
    } catch (err: unknown) {
      console.error(axios.isAxiosError(err) ? err.response?.data?.detail : err);
    } finally { setUpdatingField(null); }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <StatusBadge status={c.status} />
            <PriorityBadge priority={c.priority} />
            {c.escalation_level >= 1 && (
              <span className={`text-xs font-bold ${c.escalation_level >= 3 ? "text-red-600" : c.escalation_level >= 2 ? "text-orange-600" : "text-yellow-600"}`}>
                ⬆ Escalation Level {c.escalation_level}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500">
            Incident <span className="font-mono">{incident.id.slice(0, 8)}…</span>
            {" · "}{incident.incident_type}
            {incident.category && ` · ${incident.category}`}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            Center: {incident.center_id}
            {incident.risk_score != null && ` · Risk: ${incident.risk_score}/100`}
            {incident.recordable && " · OSHA Recordable"}
          </p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none flex-shrink-0">×</button>
      </div>

      {/* Assignment panel */}
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
        <div className="grid grid-cols-2 gap-3 text-xs">
          {/* Status */}
          <div>
            <p className="text-gray-500 font-medium mb-1">Status</p>
            <select
              value={c.status}
              onChange={(e) => { setUpdatingField("status"); patchCase({ status: e.target.value }); }}
              disabled={updatingField === "status"}
              className="w-full border border-gray-300 rounded px-2 py-1 bg-white text-xs focus:outline-none">
              {CASE_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </div>
          {/* Priority */}
          <div>
            <p className="text-gray-500 font-medium mb-1">Priority</p>
            <select
              value={c.priority}
              onChange={(e) => { setUpdatingField("priority"); patchCase({ priority: e.target.value }); }}
              disabled={updatingField === "priority"}
              className="w-full border border-gray-300 rounded px-2 py-1 bg-white text-xs focus:outline-none">
              {CASE_PRIORITIES.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
            </select>
          </div>
          {/* Assigned to */}
          <div>
            <p className="text-gray-500 font-medium mb-1">Assigned to</p>
            <select
              value={c.assigned_to_user_id ?? ""}
              onChange={(e) => { setUpdatingField("assign"); patchCase({ assigned_to_user_id: e.target.value || undefined }); }}
              disabled={updatingField === "assign"}
              className="w-full border border-gray-300 rounded px-2 py-1 bg-white text-xs focus:outline-none">
              <option value="">Unassigned</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}
            </select>
          </div>
          {/* Escalation */}
          <div>
            <p className="text-gray-500 font-medium mb-1">Escalation Level</p>
            <select
              value={c.escalation_level}
              onChange={(e) => { setUpdatingField("esc"); patchCase({ escalation_level: Number(e.target.value) }); }}
              disabled={updatingField === "esc"}
              className="w-full border border-gray-300 rounded px-2 py-1 bg-white text-xs focus:outline-none">
              <option value="0">0 – Normal</option>
              <option value="1">1 – Escalated</option>
              <option value="2">2 – Urgent</option>
              <option value="3">3 – Critical</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 px-3 overflow-x-auto">
        {([
          { key: "tasks",    label: `Tasks (${detail.open_task_count}/${detail.task_count})` },
          { key: "comments", label: "Comments" },
          { key: "evidence", label: `Evidence (${detail.evidence_count})` },
          { key: "timeline", label: "Timeline" },
          { key: "copilot",  label: "✦ Copilot" },
        ] as const).map(({ key, label }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`px-3 py-2.5 text-xs font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
              activeTab === key ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-800"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {activeTab === "tasks" && (
          <TasksTab caseId={c.id} tasks={tasks} userMap={userMap} users={users} onRefresh={onRefresh} />
        )}
        {activeTab === "comments" && (
          <CommentsTab caseId={c.id} comments={comments} userMap={userMap} onRefresh={onRefresh} />
        )}
        {activeTab === "evidence" && (
          <EvidenceTab
            caseId={c.id}
            onFileUploaded={() => { setTimelineTick((t) => t + 1); onRefresh(); }}
          />
        )}
        {activeTab === "timeline" && (
          <OperationalTimeline caseId={c.id} userMap={userMap} refreshTick={timelineTick} />
        )}
        {activeTab === "copilot" && (
          <AICopilot caseId={c.id} />
        )}
      </div>
    </div>
  );
}

// ── Tasks tab ─────────────────────────────────────────────────────────────────

function TasksTab({ caseId, tasks, userMap, users, onRefresh }: {
  caseId: string; tasks: Task[];
  userMap: Record<string, TenantUser>; users: TenantUser[];
  onRefresh: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", assigned_to_user_id: "" });
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function createTask(e: FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      await axios.post(`${API_URL}/cases/${caseId}/tasks`, {
        title: form.title,
        description: form.description || null,
        assigned_to_user_id: form.assigned_to_user_id || null,
      });
      setForm({ title: "", description: "", assigned_to_user_id: "" });
      setShowForm(false);
      onRefresh();
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  async function toggleTask(task: Task) {
    setTogglingId(task.id);
    try {
      await axios.patch(`${API_URL}/cases/${caseId}/tasks/${task.id}`, { completed: !task.completed });
      onRefresh();
    } catch { /* ignore */ }
    finally { setTogglingId(null); }
  }

  const open = tasks.filter((t) => !t.completed);
  const done = tasks.filter((t) => t.completed);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-gray-500">{open.length} open · {done.length} done</p>
        <button onClick={() => setShowForm((p) => !p)}
          className="text-xs text-indigo-600 hover:underline">{showForm ? "Cancel" : "+ Add Task"}</button>
      </div>

      {showForm && (
        <form onSubmit={createTask} className="space-y-2 bg-gray-50 rounded-lg p-3 border border-gray-200">
          <input required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Task title" className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Description (optional)" rows={2}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none" />
          <select value={form.assigned_to_user_id} onChange={(e) => setForm((f) => ({ ...f, assigned_to_user_id: e.target.value }))}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs bg-white focus:outline-none">
            <option value="">Unassigned</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}
          </select>
          <button type="submit" disabled={saving}
            className="w-full py-1.5 text-xs font-medium text-white rounded disabled:opacity-50"
            style={{ backgroundColor: "var(--brand-primary)" }}>
            {saving ? "Creating…" : "Create Task"}
          </button>
        </form>
      )}

      <ul className="space-y-1.5">
        {tasks.map((t) => {
          const assignee = t.assigned_to_user_id ? userMap[t.assigned_to_user_id] : null;
          return (
            <li key={t.id} className={`flex items-start gap-2 px-2 py-2 rounded-lg border ${t.completed ? "bg-gray-50 border-gray-100 opacity-60" : "bg-white border-gray-200"}`}>
              <button
                onClick={() => toggleTask(t)}
                disabled={togglingId === t.id}
                className={`mt-0.5 w-4 h-4 flex-shrink-0 rounded border flex items-center justify-center text-xs transition-colors disabled:opacity-50 ${t.completed ? "bg-green-500 border-green-500 text-white" : "border-gray-300 hover:border-indigo-400"}`}>
                {t.completed && "✓"}
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-medium ${t.completed ? "line-through text-gray-400" : "text-gray-800"}`}>{t.title}</p>
                {t.description && <p className="text-xs text-gray-400 mt-0.5 truncate">{t.description}</p>}
                <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                  {assignee && <span>→ {assignee.email}</span>}
                  {t.due_date && <span className={new Date(t.due_date) < new Date() && !t.completed ? "text-red-500" : ""}>{formatDate(t.due_date)}</span>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Comments tab ──────────────────────────────────────────────────────────────

function CommentsTab({ caseId, comments, userMap, onRefresh }: {
  caseId: string; comments: Comment[];
  userMap: Record<string, TenantUser>; onRefresh: () => void;
}) {
  const [message, setMessage] = useState("");
  const [visibility, setVisibility] = useState<CommentVisibility>("all");
  const [posting, setPosting] = useState(false);

  async function postComment(e: FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setPosting(true);
    try {
      await axios.post(`${API_URL}/cases/${caseId}/comments`, { message, visibility });
      setMessage("");
      onRefresh();
    } catch { /* ignore */ }
    finally { setPosting(false); }
  }

  const VISIBILITY_BADGES: Record<string, string> = {
    all: "text-gray-400", hr_only: "text-blue-500",
    legal_only: "text-purple-500", management_only: "text-orange-500",
  };

  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {comments.length === 0 && <li className="text-xs text-gray-400 italic">No comments yet</li>}
        {comments.map((c) => {
          const author = userMap[c.user_id];
          return (
            <li key={c.id} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-gray-700">{author?.email ?? c.user_id.slice(0, 8) + "…"}</span>
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${VISIBILITY_BADGES[c.visibility]}`}>{VISIBILITY_LABELS[c.visibility as CommentVisibility] ?? c.visibility}</span>
                  <span className="text-xs text-gray-400">{relativeTime(c.created_at)}</span>
                </div>
              </div>
              <p className="text-xs text-gray-700 whitespace-pre-wrap">{c.message}</p>
            </li>
          );
        })}
      </ul>

      <form onSubmit={postComment} className="border-t border-gray-100 pt-3 space-y-2">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Add a comment…"
          rows={3}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
        />
        <div className="flex items-center gap-2">
          <select value={visibility} onChange={(e) => setVisibility(e.target.value as CommentVisibility)}
            className="border border-gray-300 rounded px-2 py-1.5 text-xs bg-white focus:outline-none flex-1">
            {(Object.entries(VISIBILITY_LABELS) as [CommentVisibility, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <button type="submit" disabled={posting || !message.trim()}
            className="px-4 py-1.5 text-xs font-medium text-white rounded-lg disabled:opacity-50"
            style={{ backgroundColor: "var(--brand-primary)" }}>
            {posting ? "Posting…" : "Post"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Timeline tab ──────────────────────────────────────────────────────────────

function TimelineTab({ events, userMap }: {
  events: TimelineEvent[]; userMap: Record<string, TenantUser>;
}) {
  function eventLabel(e: TimelineEvent): string {
    const d = e.details ?? {};
    switch (e.event_type) {
      case "case_created":      return `Case created — priority: ${d.priority}`;
      case "status_changed":    return `Status: ${d.old_status} → ${d.new_status}`;
      case "assigned":          return `Assigned to ${d.new_assigned_user ? userMap[String(d.new_assigned_user)]?.email ?? "user" : "no one"}`;
      case "comment_added":     return `Comment added (${d.visibility})`;
      case "task_created":      return `Task created: "${d.title}"`;
      case "task_completed":    return `Task completed: "${d.title}"`;
      case "task_reopened":     return `Task reopened: "${d.title}"`;
      case "escalated":         return `Escalated to level ${d.new_level}`;
      case "priority_changed":  return `Priority: ${d.old_priority} → ${d.new_priority}`;
      case "closed":            return "Case closed";
      default:                  return e.event_type.replace(/_/g, " ");
    }
  }

  return (
    <div className="space-y-0">
      {events.length === 0 && <p className="text-xs text-gray-400 italic">No events yet</p>}
      {events.map((e, i) => {
        const actor = userMap[e.actor_id];
        return (
          <div key={e.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 text-xs flex-shrink-0">
                {EVENT_ICONS[e.event_type] ?? "·"}
              </span>
              {i < events.length - 1 && <div className="w-px flex-1 bg-gray-200 my-1" />}
            </div>
            <div className="pb-3 pt-0.5">
              <p className="text-xs text-gray-700 font-medium">{eventLabel(e)}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {actor?.email ?? "System"} · {relativeTime(e.created_at)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Shared badges ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: CaseStatus }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600"}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: CasePriority }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium capitalize ${PRIORITY_STYLES[priority] ?? "bg-gray-100 text-gray-600"}`}>
      {priority}
    </span>
  );
}
