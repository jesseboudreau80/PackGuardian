"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { useWorkspace } from "../../context/WorkspaceContext";
import { API_URL } from "../../lib/api";
import QuickActions from "./QuickActions";

interface OSHARecord {
  incident_id: string; case_number: number | null; center_id: string;
  year: number | null; employee_name: string | null; job_title: string | null;
  incident_type: string; date_of_injury: string | null; classification: string | null;
  days_away: number; restricted_days: number; recordable: boolean | null; is_finalized: boolean;
  category: string | null; risk_score: number | null;
}

const CLASSIFICATION_STYLES: Record<string, string> = {
  days_away:  "bg-red-100 text-red-700",
  restricted: "bg-yellow-100 text-yellow-700",
  other:      "bg-gray-100 text-gray-600",
};

export default function HRView() {
  const { t } = useWorkspace();
  const [injuries, setInjuries] = useState<OSHARecord[]>([]);
  const [workersComp, setWorkersComp] = useState<OSHARecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      axios.get<OSHARecord[]>(`${API_URL}/safety/search?recordable_only=true&limit=20`),
      axios.get<OSHARecord[]>(`${API_URL}/safety/search?q=medical&limit=20`),
    ])
      .then(([injRes, wcRes]) => {
        setInjuries(injRes.data);
        setWorkersComp(wcRes.data.filter((r) =>
          ["medical", "emergency_room", "hospitalization"].some((t) =>
            r.incident_type?.includes(t)
          )
        ));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const empty = !loading && injuries.length === 0;

  return (
    <div className="flex flex-col gap-5">
      <QuickActions />

      {loading ? (
        <div className="text-center py-12 text-sm text-gray-400">Loading HR data…</div>
      ) : empty ? (
        <EmptyStateHR t={t} />
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
              <p className="text-xs text-gray-500 font-medium">OSHA Recordable</p>
              <p className="text-3xl font-bold text-red-600">{injuries.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
              <p className="text-xs text-gray-500 font-medium">Lost Time Cases</p>
              <p className="text-3xl font-bold text-orange-600">
                {injuries.filter((r) => r.classification === "days_away").length}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
              <p className="text-xs text-gray-500 font-medium">Restricted Work</p>
              <p className="text-3xl font-bold text-yellow-600">
                {injuries.filter((r) => r.classification === "restricted").length}
              </p>
            </div>
          </div>

          {/* Employee injury queue */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-5 py-3 border-b border-gray-100 bg-red-50 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-red-800">Employee Injury Queue</h2>
              <Link href="/osha/search" className="text-xs text-red-600 hover:underline">Full Search →</Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Employee</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Type</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Date</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Classification</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Days</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {injuries.slice(0, 10).map((r) => (
                    <tr key={r.incident_id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-gray-800">{r.employee_name ?? "—"}</p>
                        {r.job_title && <p className="text-xs text-gray-400">{r.job_title}</p>}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 capitalize">{r.incident_type.replace(/_/g," ")}</td>
                      <td className="px-4 py-2.5 text-gray-500">{r.date_of_injury ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        {r.classification && (
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${CLASSIFICATION_STYLES[r.classification] ?? ""}`}>
                            {r.classification.replace(/_/g," ")}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {r.days_away > 0 ? `${r.days_away}d` : r.restricted_days > 0 ? `${r.restricted_days}r` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* OSHA links */}
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-500 font-medium">OSHA Actions:</span>
            <Link href="/osha/search" className="text-indigo-600 hover:underline">Audit Search</Link>
            <Link href="/osha" className="text-indigo-600 hover:underline">OSHA Reports</Link>
            <Link href="/osha/postings" className="text-indigo-600 hover:underline">Annual Posting</Link>
          </div>
        </>
      )}
    </div>
  );
}

function EmptyStateHR({ t }: { t: (k: string, fb?: string) => string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
      <p className="text-4xl mb-3">🧑‍⚕️</p>
      <h2 className="text-lg font-semibold text-gray-900">No Employee Injuries Recorded</h2>
      <p className="text-sm text-gray-500 mt-1 mb-4">
        Employee {t("incident", "incidents")} will appear here once recorded by supervisors or field staff.
      </p>
      <Link href="/osha/search" className="bg-indigo-600 text-white px-5 py-2 rounded-xl text-sm font-medium">
        Search OSHA Records
      </Link>
    </div>
  );
}
