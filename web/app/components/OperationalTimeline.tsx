"use client";

import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { API_URL } from "../lib/api";

interface OperationalEvent {
  id: string;
  source: "timeline" | "comment" | "evidence";
  event_type: string;
  actor_id: string | null;
  created_at: string;
  details: Record<string, unknown>;
}

interface TenantUser {
  id: string;
  email: string;
}

const EVENT_META: Record<string, { icon: string; color: string; bg: string }> = {
  case_created:                       { icon: "✦", color: "text-indigo-700", bg: "bg-indigo-100" },
  status_changed:                     { icon: "⇄", color: "text-blue-700",   bg: "bg-blue-100" },
  assigned:                           { icon: "→", color: "text-cyan-700",   bg: "bg-cyan-100" },
  comment:                            { icon: "💬", color: "text-gray-600",  bg: "bg-gray-100" },
  comment_added:                      { icon: "💬", color: "text-gray-600",  bg: "bg-gray-100" },
  evidence_upload:                    { icon: "📎", color: "text-amber-700", bg: "bg-amber-100" },
  evidence_uploaded:                  { icon: "📎", color: "text-amber-700", bg: "bg-amber-100" },
  task_created:                       { icon: "☐",  color: "text-green-600", bg: "bg-green-50" },
  task_completed:                     { icon: "✓",  color: "text-green-700", bg: "bg-green-100" },
  task_reopened:                      { icon: "↺",  color: "text-yellow-700",bg: "bg-yellow-100" },
  escalated:                          { icon: "⬆", color: "text-red-700",   bg: "bg-red-100" },
  priority_changed:                   { icon: "◈", color: "text-orange-700",bg: "bg-orange-100" },
  closed:                             { icon: "✕",  color: "text-gray-500",  bg: "bg-gray-200" },
  corrective_action_added:            { icon: "⚑",  color: "text-violet-700",bg: "bg-violet-100" },
  corrective_action_completed:        { icon: "⚑",  color: "text-green-700", bg: "bg-green-100" },
  corrective_action_needs_verification:{ icon: "⚑", color: "text-amber-700", bg: "bg-amber-100" },
  witness_statement_added:            { icon: "👁",  color: "text-teal-700",  bg: "bg-teal-100" },
  ai_analysis_generated:              { icon: "✦",  color: "text-indigo-700",bg: "bg-indigo-100" },
  osha_review_started:                { icon: "⚠",  color: "text-amber-700", bg: "bg-amber-100" },
  osha_decision_logged:               { icon: "⚠",  color: "text-amber-800", bg: "bg-amber-200" },
  safety_review_initiated:            { icon: "🛡",  color: "text-blue-700",  bg: "bg-blue-100" },
  training_assigned:                  { icon: "📚", color: "text-purple-700",bg: "bg-purple-100" },
  vet_visit_logged:                   { icon: "🐾", color: "text-teal-700",  bg: "bg-teal-100" },
  employee_medical_followup:          { icon: "🏥", color: "text-red-700",   bg: "bg-red-100" },
  case_reopened:                      { icon: "↺",  color: "text-orange-700",bg: "bg-orange-100" },
  case_resolved:                      { icon: "✓",  color: "text-green-700", bg: "bg-green-100" },
};

const DEFAULT_META = { icon: "·", color: "text-gray-500", bg: "bg-gray-100" };

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d}d ago`;
}

function absTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function eventLabel(e: OperationalEvent): string {
  const d = e.details;
  switch (e.event_type) {
    case "case_created":                        return `Case opened · priority: ${d.priority ?? "–"}`;
    case "status_changed":                      return `Status → ${String(d.new_status ?? "").replace(/_/g, " ")}`;
    case "assigned":                            return `Assigned to ${d.new_assigned_user ?? "–"}`;
    case "comment": case "comment_added":       return d.preview ? `"${String(d.preview)}"` : "Comment added";
    case "evidence_upload":
    case "evidence_uploaded":                   return `Evidence added: ${d.file_name ?? "file"} (${String(d.category ?? "").replace(/_/g, " ")})`;
    case "task_created":                        return `Task opened: "${d.title}"`;
    case "task_completed":                      return `Task completed: "${d.title}"`;
    case "task_reopened":                       return `Task reopened: "${d.title}"`;
    case "escalated":                           return `Escalated to level ${d.new_level}`;
    case "priority_changed":                    return `Priority → ${d.new_priority}`;
    case "closed":                              return "Case closed";
    case "corrective_action_added":             return `Corrective action added: "${d.title}"`;
    case "corrective_action_completed":         return `Corrective action completed: "${d.title}"`;
    case "corrective_action_needs_verification":return `Corrective action needs verification: "${d.title}"`;
    case "witness_statement_added":             return `Witness statement recorded — ${d.witness_name ?? "witness"} ${d.observed_directly ? "(direct observer)" : "(secondary)"}`;
    case "ai_analysis_generated":               return "AI analysis generated";
    case "osha_review_started":                 return "OSHA review initiated";
    case "osha_decision_logged":                return `OSHA determination: ${d.decision ?? "recorded"}`;
    case "safety_review_initiated":             return "Safety review initiated";
    case "training_assigned":                   return `Training assigned: "${d.training_name ?? "–"}"`;
    case "vet_visit_logged":                    return `Vet visit logged — ${d.animal_name ?? "animal"}`;
    case "employee_medical_followup":           return "Employee medical follow-up logged";
    case "case_reopened":                       return "Case reopened";
    case "case_resolved":                       return "Case resolved";
    default:                                    return e.event_type.replace(/_/g, " ");
  }
}

function eventSubline(e: OperationalEvent): string | null {
  const d = e.details;
  if (e.event_type === "comment" || e.event_type === "comment_added") {
    const vis = d.visibility as string | undefined;
    if (vis && vis !== "all") return `Visibility: ${vis.replace(/_/g, " ")}`;
  }
  if (e.event_type === "evidence_upload" || e.event_type === "evidence_uploaded") {
    if (d.ai_processed) return "AI analysis complete";
    const vis = d.visibility as string | undefined;
    if (vis && vis !== "all") return `Restricted: ${vis.replace(/_/g, " ")}`;
  }
  if (e.event_type === "corrective_action_added") {
    const rc = d.root_cause as string | undefined;
    if (rc) return `Root cause: ${rc.replace(/_/g, " ")}`;
  }
  return null;
}

interface Props {
  caseId: string;
  userMap: Record<string, TenantUser>;
  refreshTick?: number;
}

export default function OperationalTimeline({ caseId, userMap, refreshTick }: Props) {
  const [events, setEvents] = useState<OperationalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      const r = await axios.get<OperationalEvent[]>(
        `${API_URL}/cases/${caseId}/operational-timeline`,
        { params: { limit: 200 } }
      );
      setEvents([...r.data].reverse());
      setError(null);
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? String(err.response?.data?.detail ?? err.message) : "Failed");
    } finally { setLoading(false); }
  }, [caseId]);

  useEffect(() => { fetchEvents(); }, [fetchEvents, refreshTick]);

  if (loading) return (
    <div className="space-y-3 py-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex gap-3 animate-pulse">
          <div className="w-7 h-7 rounded-full bg-gray-200 flex-shrink-0" />
          <div className="flex-1 space-y-1 pt-1">
            <div className="h-3 bg-gray-200 rounded w-3/4" />
            <div className="h-2 bg-gray-100 rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );

  if (error) return <p className="text-xs text-red-600 text-center py-4">{error}</p>;

  if (events.length === 0) return (
    <div className="text-center py-10 text-gray-400">
      <p className="text-2xl mb-2">◎</p>
      <p className="text-xs">No events recorded yet</p>
      <p className="text-xs mt-1 text-gray-300">Timeline events appear automatically as the case progresses</p>
    </div>
  );

  // Group by date
  type DateGroup = { label: string; events: OperationalEvent[] };
  const groups: DateGroup[] = [];
  for (const e of events) {
    const dateLabel = new Date(e.created_at).toLocaleDateString(undefined, {
      weekday: "short", month: "short", day: "numeric",
    });
    const last = groups[groups.length - 1];
    if (last && last.label === dateLabel) {
      last.events.push(e);
    } else {
      groups.push({ label: dateLabel, events: [e] });
    }
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.label}>
          {/* Date separator */}
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-xs text-gray-400 font-medium px-2">{group.label}</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>

          <div className="space-y-0">
            {group.events.map((e, idx) => {
              const meta = EVENT_META[e.event_type] ?? DEFAULT_META;
              const actor = e.actor_id ? userMap[e.actor_id] : null;
              const subline = eventSubline(e);
              const isLast = idx === group.events.length - 1;

              return (
                <div key={`${e.source}-${e.id}`} className="flex gap-3">
                  <div className="flex flex-col items-center flex-shrink-0">
                    <span className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold flex-shrink-0 ${meta.bg} ${meta.color}`}>
                      {meta.icon}
                    </span>
                    {!isLast && <div className="w-px flex-1 bg-gray-150 my-1" style={{ backgroundColor: "#e5e7eb" }} />}
                  </div>

                  <div className="pb-4 pt-0.5 min-w-0 flex-1">
                    <p className="text-xs font-medium text-gray-800 leading-snug">{eventLabel(e)}</p>
                    {subline && <p className="text-xs text-gray-500 mt-0.5">{subline}</p>}
                    <p className="text-xs text-gray-400 mt-1" title={absTime(e.created_at)}>
                      {actor ? actor.email.split("@")[0] : "System"} · {relativeTime(e.created_at)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
