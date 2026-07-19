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
import InvestigationBrief from "../components/InvestigationBrief";
import OshaReadiness from "../components/OshaReadiness";
import CaseQRCode from "../components/CaseQRCode";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CorrectiveAction {
  id: string;
  case_id: string;
  title: string;
  description: string | null;
  root_cause: string | null;
  assigned_to_name: string | null;
  assigned_to_user_id: string | null;
  status: string;
  due_date: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
  is_overdue: boolean;
}

interface WitnessStatement {
  id: string;
  case_id: string;
  witness_name: string;
  witness_role: string | null;
  shift_at_time: string | null;
  observed_directly: boolean;
  intervention_attempted: boolean;
  statement: string;
  ai_summary: string | null;
  recorded_by_user_id: string;
  statement_timestamp: string | null;
  created_at: string;
}

interface WitnessAISummary {
  statement_count: number;
  common_sequence: string;
  discrepancies: string[];
  likely_triggers: string[];
  missing_information: string[];
  engine: string;
}

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
  incident_type: string | null;
  center_id: string | null;
}

interface IncidentSummary {
  id: string;
  center_id: string;
  incident_type: string;
  reported_severity: string;
  adjusted_severity: string | null;
  category: string | null;
  risk_score: number | null;
  operational_risk_score: number | null;
  risk_band: string | null;
  status: string;
  recordable: boolean | null;
  created_at: string;
  description: string | null;
  explanation: string | null;
  employee_name: string | null;
  body_part: string | null;
  treatment_type: string | null;
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
          <p className="text-sm text-gray-500 mt-0.5">Open investigations, corrective actions, and follow-up tracking</p>
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
            <div className="space-y-3 p-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="animate-pulse bg-gray-100 rounded-xl h-16" />
              ))}
            </div>
          ) : cases.length === 0 ? (
            <div className="px-6 py-12 text-center space-y-4">
              <div className="text-4xl">📋</div>
              <div>
                <p className="text-sm font-semibold text-gray-700">No cases yet</p>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed max-w-xs mx-auto">
                  Cases are created automatically when incidents are reported. Submit your first incident from the mobile app or Field Ops.
                </p>
              </div>
              <div className="space-y-2 text-xs text-gray-400 text-left bg-gray-50 border border-gray-200 rounded-xl p-4">
                <p className="font-semibold text-gray-600 mb-2">How cases work:</p>
                <p>① A field team member reports an incident</p>
                <p>② PackGuardian creates a case automatically</p>
                <p>③ You investigate, assign tasks, add corrective actions</p>
                <p>④ OSHA documentation is tracked through to finalization</p>
              </div>
            </div>
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
            {c.escalation_level >= 1 && (
              <span className={`text-xs font-bold ${c.escalation_level >= 2 ? "text-red-600" : "text-yellow-600"}`}>
                ⬆ {c.escalation_level >= 3 ? "Executive" : c.escalation_level >= 2 ? "Safety Dir." : "Supervisor"}
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-gray-800 capitalize truncate">
            {c.incident_type ? c.incident_type.replace(/_/g, " ") : "Incident"}
            {c.center_id && <span className="font-normal text-gray-400 text-xs"> · {c.center_id}</span>}
          </p>
          {assignee && (
            <p className="text-xs text-gray-400 mt-0.5 truncate">→ {assignee.email.split("@")[0]}</p>
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
  const [activeTab, setActiveTab] = useState<"tasks" | "comments" | "evidence" | "timeline" | "actions" | "witnesses" | "osha" | "copilot">("tasks");
  const [showQR, setShowQR] = useState(false);
  // timeline refresh tick for OperationalTimeline component
  const [timelineTick, setTimelineTick] = useState(0);
  const [updatingField, setUpdatingField] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function patchCase(data: Partial<{
    status: string; priority: string; escalation_level: number;
    assigned_to_user_id: string; assigned_role: string; due_date: string;
  }>) {
    setSaveStatus("saving");
    try {
      await axios.patch(`${API_URL}/cases/${c.id}`, data);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
      onRefresh();
    } catch (err: unknown) {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
      console.error(axios.isAxiosError(err) ? err.response?.data?.detail : err);
    } finally { setUpdatingField(null); }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {/* Status / priority / escalation row */}
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <StatusBadge status={c.status} />
              <PriorityBadge priority={c.priority} />
              {c.escalation_level >= 1 && (
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                  c.escalation_level >= 3 ? "bg-red-100 text-red-700"
                  : c.escalation_level >= 2 ? "bg-orange-100 text-orange-700"
                  : "bg-yellow-100 text-yellow-700"
                }`}>
                  ⬆ {c.escalation_level >= 3 ? "Executive Review" : c.escalation_level >= 2 ? "Safety Director Review" : "Supervisor Review"}
                </span>
              )}
              {incident.recordable && (
                <span className="text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-full">
                  ⚠ OSHA Review Required
                </span>
              )}
            </div>

            {/* Incident type + category */}
            <p className="text-sm font-semibold text-gray-800 capitalize">
              {incident.incident_type.replace(/_/g, " ")}
              {incident.category && incident.category !== "General" && (
                <span className="font-normal text-gray-500"> · {incident.category}</span>
              )}
            </p>

            {/* Center + risk + meta */}
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-xs text-gray-400">{incident.center_id}</span>
              {(() => {
                const score = incident.operational_risk_score ?? incident.risk_score;
                const band = incident.risk_band;
                if (score == null) return null;
                const cls = score >= 80 ? "bg-red-100 text-red-700 border border-red-200"
                  : score >= 60 ? "bg-orange-100 text-orange-700 border border-orange-200"
                  : score >= 40 ? "bg-amber-50 text-amber-700 border border-amber-200"
                  : "bg-gray-50 text-gray-500 border border-gray-200";
                return (
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>
                    Risk {score}/100{band ? ` · ${band}` : ""}
                  </span>
                );
              })()}
              {incident.treatment_type && (
                <span className="text-xs text-gray-400 capitalize">{incident.treatment_type.replace(/_/g, " ")}</span>
              )}
              {incident.employee_name && (
                <span className="text-xs text-gray-400">· {incident.employee_name}</span>
              )}
            </div>

            {/* OSHA readiness chip */}
            {incident.recordable !== false && (
              <div className="mt-1.5">
                <OshaReadiness incident={incident} compact />
              </div>
            )}

            {/* Incident description excerpt */}
            {incident.description && (
              <p className="text-xs text-gray-500 mt-2 italic line-clamp-2 leading-relaxed">
                &ldquo;{incident.description.slice(0, 200)}{incident.description.length > 200 ? "…" : ""}&rdquo;
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            {saveStatus === "saving" && <span className="text-xs text-gray-400 animate-pulse">Saving…</span>}
            {saveStatus === "saved" && <span className="text-xs text-green-600">✓ Saved</span>}
            {saveStatus === "error" && <span className="text-xs text-red-500">Save failed</span>}
            <button
              onClick={() => setShowQR((v) => !v)}
              title="Show case QR code"
              className="text-xs px-2 py-1 rounded-lg border transition-colors hover:bg-gray-50"
              style={{ borderColor: showQR ? "var(--pg-steel)" : "#e5e7eb", color: showQR ? "var(--pg-steel)" : "#9ca3af" }}>
              QR
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
          </div>
        </div>
      </div>

      {/* Case QR code panel */}
      {showQR && (
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-5">
          <CaseQRCode caseId={c.id} />
          <div>
            <p className="text-xs font-semibold text-gray-700">Case QR Code</p>
            <p className="text-xs text-gray-400 mt-0.5 max-w-xs leading-relaxed">
              Scan this code with the PackGuardian mobile app to instantly pull up this case. Share as a screenshot with team members or print for a physical case file.
            </p>
          </div>
        </div>
      )}

      {/* Investigation brief */}
      <InvestigationBrief caseId={c.id} />

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
          {/* Review stage */}
          <div>
            <p className="text-gray-500 font-medium mb-1">Review Stage</p>
            <select
              value={c.escalation_level}
              onChange={(e) => { setUpdatingField("esc"); patchCase({ escalation_level: Number(e.target.value) }); }}
              disabled={updatingField === "esc"}
              className="w-full border border-gray-300 rounded px-2 py-1 bg-white text-xs focus:outline-none">
              <option value="0">Normal</option>
              <option value="1">Supervisor Review</option>
              <option value="2">Safety Director Review</option>
              <option value="3">Executive Review</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 px-3 overflow-x-auto">
        {([
          { key: "tasks",     label: `Tasks (${detail.open_task_count}/${detail.task_count})` },
          { key: "actions",   label: "Corrective Actions" },
          { key: "witnesses", label: "Witnesses" },
          { key: "osha",      label: incident.recordable !== false ? "⚠ OSHA" : "OSHA" },
          { key: "comments",  label: "Comments" },
          { key: "evidence",  label: `Evidence (${detail.evidence_count})` },
          { key: "timeline",  label: "Timeline" },
          { key: "copilot",   label: "✦ Copilot" },
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
        {activeTab === "actions" && (
          <CorrectiveActionsTab caseId={c.id} users={users} />
        )}
        {activeTab === "witnesses" && (
          <WitnessesTab caseId={c.id} />
        )}
        {activeTab === "osha" && (
          <div className="space-y-4">
            <OshaReadiness incident={incident} />
            <div className="text-xs text-gray-400 space-y-1 border-t border-gray-100 pt-3">
              <p className="font-medium text-gray-600">About OSHA recordability</p>
              <p>Under 29 CFR 1904, work-related injuries requiring medical treatment beyond first aid, days away from work, or restricted duty must be recorded on OSHA Form 300.</p>
              <p>PackGuardian determines recordability automatically from treatment type and work restriction data. Review and finalize records in the OSHA section.</p>
            </div>
          </div>
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
        {comments.length === 0 && (
          <li className="text-xs text-gray-400 py-2">
            No notes yet. Add internal observations, updates, or context for the investigation team.
          </li>
        )}
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
      {events.length === 0 && (
        <div className="text-center py-8 space-y-2">
          <p className="text-2xl">◎</p>
          <p className="text-xs text-gray-400">No events recorded yet</p>
          <p className="text-xs text-gray-300">Timeline updates automatically as the investigation progresses</p>
        </div>
      )}
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

// ── Corrective Actions tab ─────────────────────────────────────────────────────

const ROOT_CAUSE_LABELS: Record<string, string> = {
  staffing: "Staffing", training: "Training", equipment: "Equipment",
  facility: "Facility", animal_behavior: "Animal Behavior", communication: "Communication",
  process_gap: "Process Gap", environmental: "Environmental", unknown: "Unknown",
};

const CA_STATUS_STYLES: Record<string, string> = {
  open: "bg-gray-100 text-gray-600",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  needs_verification: "bg-amber-100 text-amber-700",
};

const CA_STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  completed: "Completed",
  needs_verification: "Ready to Verify",
};

const CA_STATUSES = ["open", "in_progress", "completed", "needs_verification"] as const;
type CAStatus = typeof CA_STATUSES[number];

function CorrectiveActionsTab({ caseId, users }: { caseId: string; users: TenantUser[] }) {
  const [actions, setActions] = useState<CorrectiveAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "", description: "", root_cause: "", assigned_to_name: "", due_date: "",
  });

  const fetch = useCallback(async () => {
    try {
      const r = await axios.get<CorrectiveAction[]>(`${API_URL}/cases/${caseId}/corrective-actions`);
      setActions(r.data);
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  }, [caseId]);

  useEffect(() => { fetch(); }, [fetch]);

  async function create(e: FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      await axios.post(`${API_URL}/cases/${caseId}/corrective-actions`, {
        title: form.title,
        description: form.description || null,
        root_cause: form.root_cause || null,
        assigned_to_name: form.assigned_to_name || null,
        due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
      });
      setForm({ title: "", description: "", root_cause: "", assigned_to_name: "", due_date: "" });
      setShowForm(false);
      fetch();
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  async function updateStatus(id: string, status: string) {
    setUpdatingId(id);
    try {
      await axios.patch(`${API_URL}/cases/${caseId}/corrective-actions/${id}`, { status });
      fetch();
    } catch { /* ignore */ }
    finally { setUpdatingId(null); }
  }

  const open = actions.filter((a) => a.status !== "completed");
  const done = actions.filter((a) => a.status === "completed");

  if (loading) return <p className="text-xs text-gray-400 text-center py-6">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500 font-medium">
          {open.length} open · {done.length} completed
          {actions.some((a) => a.is_overdue) && (
            <span className="ml-2 text-red-500 font-semibold">· {actions.filter((a) => a.is_overdue).length} follow-up needed</span>
          )}
        </p>
        <button onClick={() => setShowForm((p) => !p)} className="text-xs text-indigo-600 hover:underline">
          {showForm ? "Cancel" : "+ Add Action"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={create} className="space-y-2 bg-gray-50 rounded-xl border border-gray-200 p-3">
          <input required placeholder="Action title (e.g. Deep clean required)"
            value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          <textarea placeholder="Description (optional)" rows={2}
            value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          <div className="grid grid-cols-2 gap-2">
            <select value={form.root_cause} onChange={(e) => setForm((f) => ({ ...f, root_cause: e.target.value }))}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none">
              <option value="">Root cause…</option>
              {Object.entries(ROOT_CAUSE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input type="text" placeholder="Assigned to (name)"
              value={form.assigned_to_name} onChange={(e) => setForm((f) => ({ ...f, assigned_to_name: e.target.value }))}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
          <input type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none" />
          <button type="submit" disabled={saving}
            className="w-full py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg disabled:opacity-50">
            {saving ? "Saving…" : "Create Corrective Action"}
          </button>
        </form>
      )}

      {actions.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <p className="text-2xl mb-2">✓</p>
          <p className="text-xs">No corrective actions yet</p>
          <p className="text-xs mt-1 text-gray-300">Add actions to track follow-through on this incident</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {actions.map((a) => (
            <li key={a.id} className={`border rounded-xl p-3 transition-all ${
              a.is_overdue ? "border-red-300 bg-red-50"
              : a.status === "completed" ? "border-gray-100 bg-gray-50 opacity-60"
              : a.status === "needs_verification" ? "border-amber-200 bg-amber-50/40"
              : a.status === "in_progress" ? "border-blue-200 bg-blue-50/20"
              : "border-gray-200 bg-white"
            }`}>
              <div className="flex items-start gap-2">
                {/* Status icon / quick-check */}
                <button
                  onClick={() => a.status !== "completed" && updateStatus(a.id, "completed")}
                  disabled={updatingId === a.id || a.status === "completed"}
                  className={`mt-0.5 w-8 h-8 flex-shrink-0 rounded-full border-2 flex items-center justify-center transition-colors ${
                    a.status === "completed"
                      ? "border-green-500 bg-green-500 text-white"
                      : a.is_overdue
                        ? "border-red-400 hover:bg-red-100 active:bg-red-200"
                        : "border-gray-300 hover:border-green-400 hover:bg-green-50 active:bg-green-100"
                  } disabled:cursor-default`}
                  title={a.status === "completed" ? "Completed" : "Mark as completed"}
                >
                  {a.status === "completed" && <span className="text-sm leading-none">✓</span>}
                  {updatingId === a.id && <span className="text-sm leading-none animate-spin">⟳</span>}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                    {a.root_cause && (
                      <span className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-medium">
                        {ROOT_CAUSE_LABELS[a.root_cause] ?? a.root_cause}
                      </span>
                    )}
                    <span className={`text-xs px-1.5 py-0.5 rounded ${CA_STATUS_STYLES[a.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {CA_STATUS_LABELS[a.status] ?? a.status.replace(/_/g, " ")}
                    </span>
                    {a.is_overdue && (
                      <span className="text-xs text-red-600 font-bold">⚑ Follow-up needed</span>
                    )}
                  </div>
                  <p className={`text-sm font-medium leading-snug ${a.status === "completed" ? "line-through text-gray-400" : "text-gray-800"}`}>
                    {a.title}
                  </p>
                  {a.description && <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{a.description}</p>}
                  {a.notes && a.status === "completed" && (
                    <p className="text-xs text-green-700 bg-green-50 border border-green-100 rounded px-2 py-1 mt-1 leading-relaxed">
                      {a.notes}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400 flex-wrap">
                    {a.assigned_to_name && (
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                        {a.assigned_to_name}
                      </span>
                    )}
                    {a.due_date && (
                      <span className={a.is_overdue ? "text-red-500 font-medium" : ""}>
                        Due {formatDate(a.due_date)}
                      </span>
                    )}
                    {a.completed_at && <span className="text-green-600">✓ {formatDate(a.completed_at)}</span>}
                  </div>
                </div>

                {/* Status dropdown for non-done items */}
                {a.status !== "completed" && (
                  <select
                    value={a.status}
                    disabled={updatingId === a.id}
                    onChange={(e) => updateStatus(a.id, e.target.value)}
                    className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white focus:outline-none flex-shrink-0 disabled:opacity-50">
                    {CA_STATUSES.map((s) => (
                      <option key={s} value={s}>{CA_STATUS_LABELS[s] ?? s.replace(/_/g, " ")}</option>
                    ))}
                  </select>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Witnesses tab ─────────────────────────────────────────────────────────────

function WitnessesTab({ caseId }: { caseId: string }) {
  const [statements, setStatements] = useState<WitnessStatement[]>([]);
  const [synthesis, setSynthesis] = useState<WitnessAISummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [synthesizing, setSynthesizing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState({
    witness_name: "", witness_role: "", shift_at_time: "",
    observed_directly: true, intervention_attempted: false, statement: "",
  });

  const fetch = useCallback(async () => {
    try {
      const r = await axios.get<WitnessStatement[]>(`${API_URL}/cases/${caseId}/witnesses`);
      setStatements(r.data);
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  }, [caseId]);

  useEffect(() => { fetch(); }, [fetch]);

  async function save(e: FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      await axios.post(`${API_URL}/cases/${caseId}/witnesses`, {
        witness_name: form.witness_name,
        witness_role: form.witness_role || null,
        shift_at_time: form.shift_at_time || null,
        observed_directly: form.observed_directly,
        intervention_attempted: form.intervention_attempted,
        statement: form.statement,
      });
      setForm({ witness_name: "", witness_role: "", shift_at_time: "", observed_directly: true, intervention_attempted: false, statement: "" });
      setShowForm(false);
      fetch();
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  async function synthesize() {
    setSynthesizing(true);
    try {
      const r = await axios.get<WitnessAISummary>(`${API_URL}/cases/${caseId}/witnesses/synthesize`);
      setSynthesis(r.data);
    } catch { /* ignore */ }
    finally { setSynthesizing(false); }
  }

  if (loading) return <p className="text-xs text-gray-400 text-center py-6">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500 font-medium">{statements.length} statement{statements.length !== 1 ? "s" : ""} collected</p>
        <div className="flex gap-2">
          {statements.length >= 2 && (
            <button onClick={synthesize} disabled={synthesizing}
              className="text-xs text-indigo-600 hover:underline disabled:opacity-50">
              {synthesizing ? "Analyzing…" : "✦ AI Synthesis"}
            </button>
          )}
          <button onClick={() => setShowForm((p) => !p)} className="text-xs text-indigo-600 hover:underline">
            {showForm ? "Cancel" : "+ Add Statement"}
          </button>
        </div>
      </div>

      {/* AI Synthesis Panel */}
      {synthesis && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-indigo-800">✦ AI Witness Synthesis</p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-indigo-500">{synthesis.engine === "claude" ? "Claude" : "Rule-based"}</span>
              <button onClick={() => setSynthesis(null)} className="text-indigo-400 hover:text-indigo-700 text-sm">×</button>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-indigo-700 mb-1">Common Sequence of Events</p>
            <p className="text-xs text-indigo-900">{synthesis.common_sequence}</p>
          </div>
          {synthesis.likely_triggers.length > 0 && (
            <div>
              <p className="text-xs font-medium text-indigo-700 mb-1">Likely Triggers</p>
              <ul className="space-y-0.5">
                {synthesis.likely_triggers.map((t, i) => (
                  <li key={i} className="text-xs text-indigo-800 before:content-['·'] before:mr-1.5">{t}</li>
                ))}
              </ul>
            </div>
          )}
          {synthesis.discrepancies.length > 0 && (
            <div>
              <p className="text-xs font-medium text-amber-700 mb-1">Discrepancies to Review</p>
              <ul className="space-y-0.5">
                {synthesis.discrepancies.map((d, i) => (
                  <li key={i} className="text-xs text-amber-800 before:content-['!'] before:mr-1.5">{d}</li>
                ))}
              </ul>
            </div>
          )}
          {synthesis.missing_information.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">Missing Information</p>
              <ul className="space-y-0.5">
                {synthesis.missing_information.map((m, i) => (
                  <li key={i} className="text-xs text-gray-600 before:content-['?'] before:mr-1.5">{m}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <form onSubmit={save} className="space-y-2 bg-gray-50 rounded-xl border border-gray-200 p-3">
          <div className="grid grid-cols-2 gap-2">
            <input required placeholder="Witness name *"
              value={form.witness_name} onChange={(e) => setForm((f) => ({ ...f, witness_name: e.target.value }))}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            <input placeholder="Role (e.g. Lead Handler)"
              value={form.witness_role} onChange={(e) => setForm((f) => ({ ...f, witness_role: e.target.value }))}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none" />
          </div>
          <input placeholder="Shift at time of incident (e.g. Morning shift)"
            value={form.shift_at_time} onChange={(e) => setForm((f) => ({ ...f, shift_at_time: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none" />
          <textarea required placeholder="Witness statement *" rows={4}
            value={form.statement} onChange={(e) => setForm((f) => ({ ...f, statement: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          <div className="flex gap-4">
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
              <input type="checkbox" checked={form.observed_directly}
                onChange={(e) => setForm((f) => ({ ...f, observed_directly: e.target.checked }))}
                className="rounded border-gray-300" />
              Directly observed
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
              <input type="checkbox" checked={form.intervention_attempted}
                onChange={(e) => setForm((f) => ({ ...f, intervention_attempted: e.target.checked }))}
                className="rounded border-gray-300" />
              Attempted intervention
            </label>
          </div>
          <button type="submit" disabled={saving}
            className="w-full py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg disabled:opacity-50">
            {saving ? "Saving…" : "Save Witness Statement"}
          </button>
        </form>
      )}

      {statements.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <p className="text-2xl mb-2">👁</p>
          <p className="text-xs">No witness statements yet</p>
          <p className="text-xs mt-1 text-gray-300">Collect accounts from people who observed the incident</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {statements.map((s) => (
            <li key={s.id} className="border border-gray-200 rounded-xl bg-white overflow-hidden">
              <div className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{s.witness_name}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400 flex-wrap">
                      {s.witness_role && <span>{s.witness_role}</span>}
                      {s.shift_at_time && <span>· {s.shift_at_time}</span>}
                      {s.observed_directly && <span className="text-green-600">✓ Direct observer</span>}
                      {s.intervention_attempted && <span className="text-blue-600">↗ Intervened</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{relativeTime(s.created_at)}</span>
                    <button onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                      className="text-xs text-gray-400 hover:text-gray-700">
                      {expandedId === s.id ? "▲" : "▼"}
                    </button>
                  </div>
                </div>
              </div>
              {expandedId === s.id && (
                <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-2">
                  <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{s.statement}</p>
                  {s.ai_summary && (
                    <div className="bg-indigo-50 rounded-lg px-3 py-2 text-xs text-indigo-800">
                      <span className="font-medium">✦ AI: </span>{s.ai_summary}
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
