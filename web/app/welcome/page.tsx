"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { API_URL } from "../lib/api";

interface ChecklistItem { id: string; label: string; done: boolean; }
interface OnboardingStatus {
  step: number; completed: boolean; is_trial: boolean;
  trial_expires_at: string | null; checklist: ChecklistItem[];
}

const ITEM_ACTIONS: Record<string, { label: string; href: string }> = {
  org:        { label: "Set up org →",          href: "/organizations"     },
  users:      { label: "Invite team →",          href: "/settings/users"   },
  incident:   { label: "Report incident →",      href: "/mobile/incident"  },
  inspection: { label: "View OSHA reports →",     href: "/osha"             },
  osha:       { label: "Configure postings →",   href: "/osha/postings"    },
};

function DaysRemaining({ iso }: { iso: string }) {
  const days = Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
  return (
    <span className={`text-sm font-semibold ${days <= 3 ? "text-red-600" : "text-amber-600"}`}>
      {days} day{days !== 1 ? "s" : ""} remaining
    </span>
  );
}

export default function WelcomePage() {
  const { isAuthenticated, isAdmin } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login?from=/welcome"); return; }
    axios.get<OnboardingStatus>(`${API_URL}/provision/status`)
      .then((r) => setStatus(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isAuthenticated, router]);

  async function seedDemo() {
    setSeeding(true);
    try {
      const r = await axios.post(`${API_URL}/provision/seed-demo`);
      setSeedResult(r.data);
    } catch (err: unknown) {
      console.error(err);
    } finally { setSeeding(false); }
  }

  if (!isAuthenticated) return null;

  const doneCount = status?.checklist.filter((i) => i.done).length ?? 0;
  const totalCount = status?.checklist.length ?? 7;
  const pct = Math.round((doneCount / totalCount) * 100);

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto">
      {/* Welcome header */}
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
        <p className="text-4xl mb-3">🛡️</p>
        <h1 className="text-2xl font-bold text-gray-900">Welcome to PackGuardian</h1>
        <p className="text-gray-500 mt-1">Operational Safety & OSHA Automation Platform</p>
        {!loading && status?.is_trial && status.trial_expires_at && (
          <div className="mt-3 inline-flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-full px-4 py-1.5">
            <span className="text-xs text-amber-700 font-medium">Trial</span>
            <DaysRemaining iso={status.trial_expires_at} />
          </div>
        )}
      </div>

      {/* Setup progress */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Setup Progress</h2>
            <p className="text-sm text-gray-500">{doneCount} of {totalCount} steps complete</p>
          </div>
          <span className={`text-2xl font-bold ${pct === 100 ? "text-green-600" : "text-indigo-600"}`}>{pct}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5 mb-5">
          <div className="h-2.5 rounded-full transition-all"
            style={{ width: `${pct}%`, backgroundColor: pct === 100 ? "#16a34a" : "var(--brand-primary)" }} />
        </div>

        {loading ? (
          <p className="text-sm text-gray-400 text-center">Loading checklist…</p>
        ) : (
          <ul className="space-y-2">
            {status?.checklist.map((item) => {
              const action = ITEM_ACTIONS[item.id];
              return (
                <li key={item.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      item.done ? "bg-green-500 text-white" : "bg-gray-200 text-gray-500"
                    }`}>
                      {item.done ? "✓" : "○"}
                    </span>
                    <span className={`text-sm ${item.done ? "line-through text-gray-400" : "text-gray-700"}`}>
                      {item.label}
                    </span>
                  </div>
                  {!item.done && action && (
                    <Link href={action.href}
                      className="text-xs text-indigo-600 hover:underline font-medium">
                      {action.label}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { href: "/mobile/incident", icon: "⚠️", label: "Report Incident", color: "bg-red-600"    },
          { href: "/cases",           icon: "📁", label: "Case Management", color: "bg-indigo-600" },
          { href: "/osha",            icon: "📋", label: "OSHA Reports",    color: "bg-blue-600"   },
          { href: "/safety",          icon: "🛡️", label: "Safety Intel",    color: "bg-purple-600" },
        ].map(({ href, icon, label, color }) => (
          <Link key={href} href={href}
            className={`${color} text-white rounded-2xl py-5 flex flex-col items-center gap-2 hover:opacity-90 transition-opacity`}>
            <span className="text-3xl">{icon}</span>
            <span className="text-xs font-semibold text-center">{label}</span>
          </Link>
        ))}
      </div>

      {/* Trial: demo data */}
      {status?.is_trial && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <h3 className="font-semibold text-amber-800">Trial Mode — Load Demo Data</h3>
              <p className="text-sm text-amber-700 mt-0.5">
                Populate your workspace with realistic sample incidents, OSHA records, and cases to explore the platform.
              </p>
            </div>
            <button onClick={seedDemo} disabled={seeding}
              className="bg-amber-600 text-white px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 active:opacity-80">
              {seeding ? "Loading…" : "Load Sample Data"}
            </button>
          </div>
          {seedResult && (
            <p className="text-sm text-amber-700 mt-3">
              ✓ Created {seedResult.incidents} incidents, {seedResult.cases} cases, {seedResult.centers} centers.
            </p>
          )}
        </div>
      )}

      {/* Navigation links */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Explore PackGuardian</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
          {[
            ["/command",       "Command Center"],
            ["/cases",         "Case Management"],
            ["/map",           "Field Risk Map"],
            ["/automation",    "Automation Engine"],
            ["/organizations", "Org Hierarchy"],
            ["/osha/postings", "OSHA Postings"],
          ].map(([href, label]) => (
            <Link key={href} href={href}
              className="text-indigo-600 hover:text-indigo-800 hover:underline">
              → {label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
