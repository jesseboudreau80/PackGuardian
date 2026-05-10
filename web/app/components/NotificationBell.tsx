"use client";

import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { API_URL } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useWebSocket } from "../hooks/useWebSocket";

interface Notification {
  id: string; notification_type: string; title: string; message: string;
  resource_type: string | null; resource_id: string | null;
  is_read: boolean; created_at: string;
}

const TYPE_ICONS: Record<string, string> = {
  case_assigned: "→", task_assigned: "☐",
  escalated: "⬆", overdue: "⏰", mention: "@", case_updated: "✎",
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function NotificationBell() {
  const { isAuthenticated, token } = useAuth();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Live notification events — immediately bump the count
  const { lastEvent } = useWebSocket(isAuthenticated ? token : null);
  useEffect(() => {
    if (lastEvent?.type === "NOTIFICATION_CREATED") {
      setCount((c) => c + 1);
    }
  }, [lastEvent]);

  // Fetch unread count every 60s (fallback when WS not connected)
  useEffect(() => {
    if (!isAuthenticated) return;
    async function fetchCount() {
      try {
        const r = await axios.get<{ count: number }>(`${API_URL}/notifications/unread-count`);
        setCount(r.data.count);
      } catch { /* non-fatal */ }
    }
    fetchCount();
    const id = setInterval(fetchCount, 60_000);
    return () => clearInterval(id);
  }, [isAuthenticated]);

  // Close on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function openPanel() {
    if (open) { setOpen(false); return; }
    setOpen(true);
    setLoading(true);
    try {
      const r = await axios.get<Notification[]>(`${API_URL}/notifications`, { params: { limit: 20 } });
      setNotifications(r.data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  async function markRead(id: string) {
    try {
      await axios.patch(`${API_URL}/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
      setCount((c) => Math.max(0, c - 1));
    } catch { /* ignore */ }
  }

  async function markAllRead() {
    try {
      await axios.post(`${API_URL}/notifications/read-all`);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setCount(0);
    } catch { /* ignore */ }
  }

  if (!isAuthenticated) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={openPanel}
        className="relative text-gray-500 hover:text-gray-800 p-1 rounded-lg hover:bg-gray-100"
        aria-label="Notifications"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {count > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center leading-none">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-xl z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
            {count > 0 && (
              <button onClick={markAllRead} className="text-xs text-indigo-600 hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
            {loading && <p className="px-4 py-6 text-xs text-gray-400 text-center">Loading…</p>}
            {!loading && notifications.length === 0 && (
              <p className="px-4 py-6 text-xs text-gray-400 text-center">No notifications</p>
            )}
            {!loading && notifications.map((n) => (
              <div
                key={n.id}
                className={`flex items-start gap-3 px-4 py-3 ${n.is_read ? "opacity-60" : "bg-blue-50/40"}`}
              >
                <span className="text-base flex-shrink-0 mt-0.5">{TYPE_ICONS[n.notification_type] ?? "·"}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800">{n.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{n.message}</p>
                  <p className="text-xs text-gray-400 mt-1">{relativeTime(n.created_at)}</p>
                </div>
                {!n.is_read && (
                  <button onClick={() => markRead(n.id)}
                    className="text-xs text-indigo-600 hover:underline flex-shrink-0">
                    ✓
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
