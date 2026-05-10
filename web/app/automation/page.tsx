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
import { API_URL } from "../lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AutomationEvent {
  id: string;
  tenant_id: string;
  event_type: string;
  severity: "low" | "medium" | "high" | "critical";
  payload: Record<string, unknown>;
  created_at: string;
  processed_at: string | null;
}

interface WorkflowConfig {
  id: string;
  tenant_id: string;
  event_type: string;
  workflow_name: string;
  webhook_url: string;
  is_enabled: boolean;
  created_at: string;
}

interface WorkflowDelivery {
  id: string;
  tenant_id: string;
  event_id: string;
  workflow_config_id: string;
  status: "success" | "failure" | "pending";
  response_code: number | null;
  response_body: string | null;
  attempted_at: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const EVENT_TYPE_LABELS: Record<string, string> = {
  HIGH_RISK_HOTSPOT:  "High Risk Hotspot",
  EMERGING_RISK:      "Emerging Risk",
  OSHA_OVERDUE:       "OSHA Overdue",
  INCIDENT_FINALIZED: "Incident Finalized",
  "*":                "All Events",
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border border-red-200",
  high:     "bg-orange-100 text-orange-700 border border-orange-200",
  medium:   "bg-yellow-100 text-yellow-700 border border-yellow-200",
  low:      "bg-blue-100 text-blue-700 border border-blue-200",
};

const TYPE_STYLES: Record<string, string> = {
  HIGH_RISK_HOTSPOT:  "bg-red-50 text-red-800",
  EMERGING_RISK:      "bg-orange-50 text-orange-800",
  OSHA_OVERDUE:       "bg-yellow-50 text-yellow-800",
  INCIDENT_FINALIZED: "bg-gray-100 text-gray-700",
};

const DELIVERY_STATUS_STYLES: Record<string, string> = {
  success: "bg-green-100 text-green-700 border border-green-200",
  failure: "bg-red-100 text-red-700 border border-red-200",
  pending: "bg-yellow-100 text-yellow-700 border border-yellow-200",
};

// ── Utilities ─────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function eventContext(e: AutomationEvent): string {
  const p = e.payload;
  if (p.center_id) return `${p.center_name ?? p.center_id}`;
  if (p.incident_id) return `Incident ${String(p.incident_id).slice(0, 8)}…`;
  return "";
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = "events" | "workflows" | "deliveries";

export default function AutomationPage() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("events");

  useEffect(() => {
    if (!isAuthenticated) router.push("/login?from=/automation");
  }, [isAuthenticated, router]);

  if (!isAuthenticated) return null;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Automation Center</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Events, n8n workflow integrations, and delivery history
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 gap-0">
        {(["events", "workflows", "deliveries"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px capitalize transition-colors ${
              activeTab === tab
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"
            }`}
          >
            {tab === "deliveries" ? "Delivery Logs" : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "events"     && <EventsTab />}
      {activeTab === "workflows"  && <WorkflowsTab />}
      {activeTab === "deliveries" && <DeliveryLogsTab />}
    </div>
  );
}

// ── Events tab ────────────────────────────────────────────────────────────────

type StatusFilter = "all" | "unprocessed" | "processed";

function EventsTab() {
  const [events, setEvents] = useState<AutomationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [severityFilter, setSeverityFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [running, setRunning] = useState(false);
  const [checkResult, setCheckResult] = useState<{ created: number; skipped: number } | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    setError(null);
    const params: Record<string, string> = {};
    if (statusFilter === "unprocessed") params.processed = "false";
    if (statusFilter === "processed") params.processed = "true";
    if (severityFilter) params.severity = severityFilter;
    if (typeFilter) params.event_type = typeFilter;
    try {
      const res = await axios.get<AutomationEvent[]>(`${API_URL}/automation/events`, { params });
      setEvents(res.data);
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? String(err.response?.data?.detail ?? err.message) : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, severityFilter, typeFilter]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // Auto-refresh every 30s when unprocessed events exist
  useEffect(() => {
    if (!events.some((e) => !e.processed_at)) return;
    const id = setInterval(fetchEvents, 30_000);
    return () => clearInterval(id);
  }, [events, fetchEvents]);

  async function runCheck() {
    setRunning(true); setCheckResult(null);
    try {
      const res = await axios.post<{ created: number; skipped: number }>(`${API_URL}/automation/check`);
      setCheckResult(res.data);
      fetchEvents();
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? String(err.response?.data?.detail ?? err.message) : "Check failed");
    } finally { setRunning(false); }
  }

  async function markProcessed(id: string) {
    setProcessingId(id);
    try {
      await axios.patch(`${API_URL}/automation/events/${id}/process`);
      setEvents((prev) => prev.map((e) => e.id === id ? { ...e, processed_at: new Date().toISOString() } : e));
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? String(err.response?.data?.detail ?? err.message) : "Failed");
    } finally { setProcessingId(null); }
  }

  const unprocessedCount = events.filter((e) => !e.processed_at).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Status toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            {(["all", "unprocessed", "processed"] as StatusFilter[]).map((f) => (
              <button key={f} onClick={() => setStatusFilter(f)}
                className={`px-3 py-1.5 capitalize ${statusFilter === f ? "bg-indigo-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                {f}
              </button>
            ))}
          </div>
          <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white text-gray-600 focus:outline-none">
            <option value="">All severities</option>
            {["critical","high","medium","low"].map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white text-gray-600 focus:outline-none">
            <option value="">All types</option>
            {Object.entries(EVENT_TYPE_LABELS).filter(([k]) => k !== "*").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          {unprocessedCount > 0 && (
            <span className="text-xs font-medium bg-red-100 text-red-700 border border-red-200 px-2.5 py-1 rounded-full">
              {unprocessedCount} unprocessed
            </span>
          )}
          <button onClick={fetchEvents} className="text-sm text-gray-500 hover:text-gray-800 px-3 py-1.5 border border-gray-200 rounded-lg bg-white">Refresh</button>
          <button onClick={runCheck} disabled={running}
            className="px-4 py-1.5 text-sm font-medium text-white rounded-lg disabled:opacity-50"
            style={{ backgroundColor: "var(--brand-primary)" }}>
            {running ? "Running…" : "Run Checks"}
          </button>
        </div>
      </div>

      {checkResult && (
        <div className="text-sm bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-2.5 flex items-center gap-2">
          <span className="font-medium">Check complete:</span> {checkResult.created} created, {checkResult.skipped} deduped
          <button onClick={() => setCheckResult(null)} className="ml-auto text-green-600">×</button>
        </div>
      )}
      {error && <div className="text-sm bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2.5">{error}</div>}

      {loading ? (
        <div className="text-center py-16 text-sm text-gray-400">Loading events…</div>
      ) : events.length === 0 ? (
        <div className="text-center py-16 text-sm text-gray-400">
          No events yet — click <span className="font-medium">Run Checks</span> to scan.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500 w-40">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 w-24">Severity</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Context</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 w-24">Age</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 w-32">Status</th>
                <th className="px-4 py-3 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {events.map((ev) => (
                <tr key={ev.id} className={`hover:bg-gray-50 ${ev.processed_at ? "opacity-55" : ""}`}>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${TYPE_STYLES[ev.event_type] ?? "bg-gray-100 text-gray-700"}`}>
                      {EVENT_TYPE_LABELS[ev.event_type] ?? ev.event_type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium capitalize ${SEVERITY_STYLES[ev.severity] ?? ""}`}>
                      {ev.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    <div>{eventContext(ev)}</div>
                    <EventPayloadSummary event={ev} />
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{relativeTime(ev.created_at)}</td>
                  <td className="px-4 py-3 text-xs">
                    {ev.processed_at
                      ? <span className="text-gray-400">Done {relativeTime(ev.processed_at)}</span>
                      : <span className="inline-flex items-center gap-1 text-amber-700"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />Pending</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!ev.processed_at && (
                      <button onClick={() => markProcessed(ev.id)} disabled={processingId === ev.id}
                        className="text-xs text-indigo-600 hover:underline disabled:opacity-50">
                        {processingId === ev.id ? "…" : "Mark done"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 space-y-1">
        <p className="font-medium text-gray-600">n8n Integration</p>
        <p>
          Schedule <code className="bg-white border border-gray-200 rounded px-1">POST /automation/check</code> hourly,
          poll <code className="bg-white border border-gray-200 rounded px-1">GET /automation/events?processed=false</code>,
          and use <code className="bg-white border border-gray-200 rounded px-1">PATCH /automation/events/&#123;id&#125;/process</code> to acknowledge.
          Add webhook receivers in the <span className="text-indigo-600 cursor-pointer" onClick={() => {}}>Workflows</span> tab for automatic push delivery.
          All requests require <code className="bg-white border border-gray-200 rounded px-1">Authorization: Bearer &lt;token&gt;</code>.
        </p>
      </div>
    </div>
  );
}

function EventPayloadSummary({ event }: { event: AutomationEvent }) {
  const p = event.payload;
  const parts: string[] = [];
  if (event.event_type === "HIGH_RISK_HOTSPOT" && typeof p.heat_score === "number")
    parts.push(`Heat: ${(p.heat_score as number).toFixed(0)}/100`);
  if (event.event_type === "EMERGING_RISK" && typeof p.trend_velocity === "number")
    parts.push(`Velocity: ${Math.round((p.trend_velocity as number) * 100) > 0 ? "+" : ""}${Math.round((p.trend_velocity as number) * 100)}%`);
  if (event.event_type === "OSHA_OVERDUE" && p.days_overdue)
    parts.push(`${p.days_overdue} days overdue · ${p.incident_type ?? ""}`);
  if (event.event_type === "INCIDENT_FINALIZED") {
    if (p.recordable === true) parts.push("OSHA recordable");
    if (p.category) parts.push(String(p.category));
  }
  if (!parts.length) return null;
  return <div className="text-gray-400 mt-0.5">{parts.join(" · ")}</div>;
}

// ── Workflows tab ─────────────────────────────────────────────────────────────

function WorkflowsTab() {
  const [workflows, setWorkflows] = useState<WorkflowConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ event_type: "HIGH_RISK_HOTSPOT", workflow_name: "", webhook_url: "" });
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function fetchWorkflows() {
    try {
      const res = await axios.get<WorkflowConfig[]>(`${API_URL}/automation/workflows`);
      setWorkflows(res.data);
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? String(err.response?.data?.detail ?? err.message) : "Failed to load");
    } finally { setLoading(false); }
  }
  useEffect(() => { fetchWorkflows(); }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault(); setCreateError(null);
    setCreating(true);
    try {
      await axios.post(`${API_URL}/automation/workflows`, createForm);
      setShowCreate(false);
      setCreateForm({ event_type: "HIGH_RISK_HOTSPOT", workflow_name: "", webhook_url: "" });
      fetchWorkflows();
    } catch (err: unknown) {
      setCreateError(axios.isAxiosError(err) ? String(err.response?.data?.detail ?? err.message) : "Failed to create");
    } finally { setCreating(false); }
  }

  async function toggleEnabled(wf: WorkflowConfig) {
    setTogglingId(wf.id);
    try {
      await axios.patch(`${API_URL}/automation/workflows/${wf.id}`, { is_enabled: !wf.is_enabled });
      setWorkflows((prev) => prev.map((w) => w.id === wf.id ? { ...w, is_enabled: !wf.is_enabled } : w));
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? String(err.response?.data?.detail ?? err.message) : "Failed");
    } finally { setTogglingId(null); }
  }

  async function deleteWorkflow(id: string) {
    if (!confirm("Delete this workflow? Delivery history will be preserved.")) return;
    setDeletingId(id);
    try {
      await axios.delete(`${API_URL}/automation/workflows/${id}`);
      setWorkflows((prev) => prev.filter((w) => w.id !== id));
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? String(err.response?.data?.detail ?? err.message) : "Failed");
    } finally { setDeletingId(null); }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Webhook endpoints that PackGuardian POSTs to when matching automation events are created.
        </p>
        <button onClick={() => setShowCreate(true)}
          className="px-4 py-1.5 text-sm font-medium text-white rounded-lg"
          style={{ backgroundColor: "var(--brand-primary)" }}>
          Add Workflow
        </button>
      </div>

      {error && <div className="text-sm bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2.5">{error}</div>}

      {loading ? (
        <div className="text-center py-16 text-sm text-gray-400">Loading…</div>
      ) : workflows.length === 0 ? (
        <div className="text-center py-16 text-sm text-gray-400">No workflows yet. Add one to start receiving webhook deliveries.</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 w-40">Event Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Webhook URL</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 w-20">Status</th>
                <th className="px-4 py-3 w-32" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {workflows.map((wf) => (
                <tr key={wf.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{wf.workflow_name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${wf.event_type === "*" ? "bg-purple-50 text-purple-700" : (TYPE_STYLES[wf.event_type] ?? "bg-gray-100 text-gray-700")}`}>
                      {EVENT_TYPE_LABELS[wf.event_type] ?? wf.event_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 font-mono truncate max-w-xs">{wf.webhook_url}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleEnabled(wf)}
                      disabled={togglingId === wf.id}
                      className={`text-xs px-2 py-0.5 rounded-full font-medium border transition-colors disabled:opacity-50 ${wf.is_enabled ? "bg-green-100 text-green-700 border-green-200" : "bg-gray-100 text-gray-500 border-gray-200"}`}>
                      {togglingId === wf.id ? "…" : wf.is_enabled ? "Active" : "Paused"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => deleteWorkflow(wf.id)} disabled={deletingId === wf.id}
                      className="text-xs text-red-500 hover:text-red-700 hover:underline disabled:opacity-50">
                      {deletingId === wf.id ? "…" : "Delete"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-md p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Add Workflow</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Workflow Name</label>
                <input required value={createForm.workflow_name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, workflow_name: e.target.value }))}
                  placeholder="e.g. Slack High-Risk Alert"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Trigger Event</label>
                <select value={createForm.event_type}
                  onChange={(e) => setCreateForm((f) => ({ ...f, event_type: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">n8n Webhook URL</label>
                <input required type="url" value={createForm.webhook_url}
                  onChange={(e) => setCreateForm((f) => ({ ...f, webhook_url: e.target.value }))}
                  placeholder="https://your-n8n.example.com/webhook/…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              {createError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{createError}</p>
              )}
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={creating}
                  className="flex-1 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
                  style={{ backgroundColor: "var(--brand-primary)" }}>
                  {creating ? "Creating…" : "Create Workflow"}
                </button>
                <button type="button" onClick={() => { setShowCreate(false); setCreateError(null); }}
                  className="flex-1 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Delivery Logs tab ─────────────────────────────────────────────────────────

function DeliveryLogsTab() {
  const [deliveries, setDeliveries] = useState<WorkflowDelivery[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [workflowFilter, setWorkflowFilter] = useState("");
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function fetchAll() {
    try {
      const [dRes, wRes] = await Promise.all([
        axios.get<WorkflowDelivery[]>(`${API_URL}/automation/deliveries`, {
          params: {
            ...(statusFilter ? { status: statusFilter } : {}),
            ...(workflowFilter ? { workflow_id: workflowFilter } : {}),
          },
        }),
        axios.get<WorkflowConfig[]>(`${API_URL}/automation/workflows`),
      ]);
      setDeliveries(dRes.data);
      setWorkflows(wRes.data);
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? String(err.response?.data?.detail ?? err.message) : "Failed");
    } finally { setLoading(false); }
  }
  useEffect(() => { fetchAll(); }, [statusFilter, workflowFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function retry(id: string) {
    setRetryingId(id);
    try {
      const res = await axios.post<WorkflowDelivery>(`${API_URL}/automation/deliveries/${id}/retry`);
      setDeliveries((prev) => [res.data, ...prev]);
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? String(err.response?.data?.detail ?? err.message) : "Retry failed");
    } finally { setRetryingId(null); }
  }

  const workflowName = (id: string) => workflows.find((w) => w.id === id)?.workflow_name ?? id.slice(0, 8) + "…";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white text-gray-600 focus:outline-none">
          <option value="">All statuses</option>
          <option value="success">Success</option>
          <option value="failure">Failure</option>
          <option value="pending">Pending</option>
        </select>
        <select value={workflowFilter} onChange={(e) => setWorkflowFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white text-gray-600 focus:outline-none">
          <option value="">All workflows</option>
          {workflows.map((w) => <option key={w.id} value={w.id}>{w.workflow_name}</option>)}
        </select>
        <button onClick={fetchAll} className="text-sm text-gray-500 hover:text-gray-800 px-3 py-1.5 border border-gray-200 rounded-lg bg-white">Refresh</button>
      </div>

      {error && <div className="text-sm bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2.5">{error}</div>}

      {loading ? (
        <div className="text-center py-16 text-sm text-gray-400">Loading…</div>
      ) : deliveries.length === 0 ? (
        <div className="text-center py-16 text-sm text-gray-400">No deliveries yet. Webhooks are dispatched when automation events are created.</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Workflow</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 w-24">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 w-20">HTTP</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 w-28">Event ID</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 w-24">Age</th>
                <th className="px-4 py-3 w-32" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {deliveries.map((d) => (
                <>
                  <tr key={d.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedId(expandedId === d.id ? null : d.id)}>
                    <td className="px-4 py-3 font-medium text-gray-800">{workflowName(d.workflow_config_id)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium capitalize ${DELIVERY_STATUS_STYLES[d.status] ?? ""}`}>
                        {d.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 font-mono">{d.response_code ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-gray-400 font-mono">{d.event_id.slice(0, 8)}…</td>
                    <td className="px-4 py-3 text-xs text-gray-400">{relativeTime(d.attempted_at)}</td>
                    <td className="px-4 py-3 text-right">
                      {d.status === "failure" && (
                        <button onClick={(e) => { e.stopPropagation(); retry(d.id); }} disabled={retryingId === d.id}
                          className="text-xs text-indigo-600 hover:underline disabled:opacity-50 mr-3">
                          {retryingId === d.id ? "Retrying…" : "Retry"}
                        </button>
                      )}
                      <span className="text-xs text-gray-400">{expandedId === d.id ? "▲" : "▼"}</span>
                    </td>
                  </tr>
                  {expandedId === d.id && d.response_body && (
                    <tr key={`${d.id}-body`}>
                      <td colSpan={6} className="px-4 py-3 bg-gray-50 border-t border-gray-100">
                        <p className="text-xs font-medium text-gray-500 mb-1">Response body</p>
                        <pre className="text-xs text-gray-700 bg-white border border-gray-200 rounded p-2 overflow-x-auto max-h-40 whitespace-pre-wrap">
                          {d.response_body}
                        </pre>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
