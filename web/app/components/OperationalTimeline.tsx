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

const EVENT_ICONS: Record<string, string> = {
  case_created:     "✦",
  status_changed:   "⇄",
  assigned:         "→",
  comment:          "💬",
  comment_added:    "💬",
  evidence_upload:  "📎",
  evidence_uploaded:"📎",
  task_created:     "☐",
  task_completed:   "✓",
  task_reopened:    "↺",
  escalated:        "⬆",
  priority_changed: "◈",
  closed:           "✕",
};

const EVENT_COLORS: Record<string, string> = {
  case_created:    "bg-indigo-100 text-indigo-700",
  status_changed:  "bg-blue-100 text-blue-700",
  assigned:        "bg-cyan-100 text-cyan-700",
  comment:         "bg-gray-100 text-gray-600",
  comment_added:   "bg-gray-100 text-gray-600",
  evidence_upload: "bg-amber-100 text-amber-700",
  task_completed:  "bg-green-100 text-green-700",
  task_created:    "bg-green-50 text-green-600",
  escalated:       "bg-red-100 text-red-700",
  priority_changed:"bg-orange-100 text-orange-700",
  closed:          "bg-gray-200 text-gray-500",
};

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
    case "case_created":     return `Case created · priority: ${d.priority}`;
    case "status_changed":   return `Status → ${String(d.new_status).replace(/_/g," ")}`;
    case "assigned":         return `Assigned to ${d.new_assigned_user ?? "unassigned"}`;
    case "comment":
    case "comment_added":    return d.preview ? `"${String(d.preview)}"` : "Comment added";
    case "evidence_upload":
    case "evidence_uploaded":return `File uploaded: ${d.file_name ?? "unknown"} (${String(d.category).replace(/_/g," ")})`;
    case "task_created":     return `Task created: "${d.title}"`;
    case "task_completed":   return `Task completed: "${d.title}"`;
    case "task_reopened":    return `Task reopened: "${d.title}"`;
    case "escalated":        return `Escalated to level ${d.new_level}`;
    case "priority_changed": return `Priority → ${d.new_priority}`;
    case "closed":           return "Case closed";
    default:                 return e.event_type.replace(/_/g, " ");
  }
}

function eventDetail(e: OperationalEvent): string | null {
  const d = e.details;
  if (e.event_type === "comment" || e.event_type === "comment_added") {
    const vis = d.visibility as string | undefined;
    if (vis && vis !== "all") return `Visibility: ${vis.replace(/_/g," ")}`;
  }
  if (e.event_type === "evidence_upload" || e.event_type === "evidence_uploaded") {
    const vis = d.visibility as string | undefined;
    if (vis && vis !== "all") return `Restricted: ${vis.replace(/_/g," ")}`;
    if (d.ai_processed) return "AI analysis complete";
  }
  return null;
}

interface Props {
  caseId: string;
  userMap: Record<string, TenantUser>;
  // Refresh trigger from parent (e.g. when new WS event arrives)
  refreshTick?: number;
}

export default function OperationalTimeline({ caseId, userMap, refreshTick }: Props) {
  const [events, setEvents] = useState<OperationalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    try {
      const r = await axios.get<OperationalEvent[]>(
        `${API_URL}/cases/${caseId}/operational-timeline`,
        { params: { limit: 200 } }
      );
      // Newest first for display
      setEvents([...r.data].reverse());
      setError(null);
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? String(err.response?.data?.detail ?? err.message) : "Failed");
    } finally { setLoading(false); }
  }, [caseId]);

  useEffect(() => { fetch(); }, [fetch, refreshTick]);

  if (loading) return <p className="text-xs text-gray-400 text-center py-6">Loading timeline…</p>;
  if (error) return <p className="text-xs text-red-600 text-center py-4">{error}</p>;
  if (events.length === 0) return <p className="text-xs text-gray-400 text-center py-6 italic">No events yet</p>;

  return (
    <div className="space-y-0">
      {events.map((e, idx) => {
        const icon = EVENT_ICONS[e.event_type] ?? "·";
        const color = EVENT_COLORS[e.event_type] ?? "bg-gray-100 text-gray-500";
        const actor = e.actor_id ? userMap[e.actor_id] : null;
        const detail = eventDetail(e);
        const isLast = idx === events.length - 1;

        return (
          <div key={`${e.source}-${e.id}`} className="flex gap-3">
            {/* Icon + connector */}
            <div className="flex flex-col items-center flex-shrink-0">
              <span className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold ${color}`}>
                {icon}
              </span>
              {!isLast && <div className="w-px flex-1 bg-gray-200 my-1" />}
            </div>

            {/* Content */}
            <div className="pb-4 pt-0.5 min-w-0 flex-1">
              <p className="text-xs font-medium text-gray-800">{eventLabel(e)}</p>
              {detail && (
                <p className="text-xs text-gray-500 mt-0.5">{detail}</p>
              )}
              <p className="text-xs text-gray-400 mt-1" title={absTime(e.created_at)}>
                {actor?.email ?? "System"} · {relativeTime(e.created_at)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
