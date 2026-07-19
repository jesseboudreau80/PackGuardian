"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { useWorkspace } from "../../context/WorkspaceContext";
import { API_URL } from "../../lib/api";
import QuickActions from "./QuickActions";

interface OSHARecord {
  incident_id: string; case_number: number | null; center_id: string;
  incident_type: string; date_of_injury: string | null; classification: string | null;
  days_away: number; restricted_days: number; recordable: boolean | null;
  is_finalized: boolean; employee_name: string | null; job_title: string | null;
  risk_score: number | null;
}

const CLASSIFICATION_STYLES: Record<string, string> = {
  days_away:  "bg-red-100 text-red-700",
  restricted: "bg-yellow-100 text-yellow-700",
  other:      "bg-gray-100 text-gray-600",
};

export default function LegalHRView() {
  const { t } = useWorkspace();
  const [records, setRecords] = useState<OSHARecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get<OSHARecord[]>(`${API_URL}/safety/search?recordable_only=true&limit=25`)
      .then((r) => setRecords(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const pending = records.filter((r) => !r.is_finalized);
  const finalized = records.filter((r) => r.is_finalized);
  const daysAway = records.filter((r) => r.classification === "days_away");
  const restricted = records.filter((r) => r.classification === "restricted");

  return (
    <div className="flex flex-col gap-5">
      <QuickActions />

      {loading ? (
        <div className="text-center py-12 text-sm text-gray-400">Loading compliance data…</div>
      ) : (
        <>
          {/* Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Pending OSHA Review",   value: pending.length,    color: pending.length > 0 ? "text-amber-600" : "text-gray-900" },
              { label: "Finalized Records",      value: finalized.length,  color: "text-green-600"  },
              { label: "Lost Time Cases",        value: daysAway.length,   color: daysAway.length > 0 ? "text-red-600" : "text-gray-900" },
              { label: "Restricted Work Cases",  value: restricted.length, color: restricted.length > 0 ? "text-orange-600" : "text-gray-900" },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white rounded-xl border border-gray-200 px-5 py-4">
                <p className="text-xs text-gray-500 font-medium leading-snug">{label}</p>
                <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Pending review banner */}
          {pending.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
              <div className="flex items-start gap-3">
                <span className="text-amber-500 text-xl mt-0.5">⚠</span>
                <div>
                  <p className="text-sm font-semibold text-amber-800">
                    {pending.length} {pending.length === 1 ? "record requires" : "records require"} OSHA review
                  </p>
                  <p className="text-xs text-amber-600 mt-0.5">
                    These incidents have been flagged for OSHA recordability review. Human confirmation is required before records are finalized.
                  </p>
                  <Link href="/osha" className="inline-block mt-2 text-xs font-semibold text-amber-700 hover:underline">
                    Open OSHA Review Queue →
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* OSHA records table */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-5 py-3 border-b border-gray-100 bg-blue-50 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-blue-900">OSHA Recordable Incidents</h2>
              <Link href="/osha/search" className="text-xs text-blue-600 hover:underline">Full Audit Search →</Link>
            </div>

            {records.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-gray-400">No OSHA recordable incidents found.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Employee</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Incident</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Date</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Classification</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {records.slice(0, 15).map((r) => (
                      <tr key={r.incident_id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-gray-800">{r.employee_name ?? "—"}</p>
                          {r.job_title && <p className="text-xs text-gray-400">{r.job_title}</p>}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600 capitalize">
                          {r.incident_type.replace(/_/g, " ")}
                          {r.center_id && <p className="text-xs text-gray-400">{r.center_id}</p>}
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                          {r.date_of_injury ?? "—"}
                        </td>
                        <td className="px-4 py-2.5">
                          {r.classification ? (
                            <span className={`text-xs px-2 py-0.5 rounded font-medium ${CLASSIFICATION_STYLES[r.classification] ?? "bg-gray-100 text-gray-600"}`}>
                              {r.classification.replace(/_/g, " ")}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-2.5">
                          {r.is_finalized ? (
                            <span className="text-xs text-green-600 font-medium">Finalized</span>
                          ) : (
                            <Link href="/osha" className="text-xs text-amber-600 font-medium hover:underline">
                              Needs Review
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Navigation links */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "OSHA Reports",    href: "/osha",          desc: "Full recordkeeping log" },
              { label: "Audit Search",    href: "/osha/search",   desc: "Search all incidents"   },
              { label: "Annual Postings", href: "/osha/postings",  desc: "300A required postings" },
              { label: "Case Review",     href: "/cases",          desc: "Investigations & actions"},
            ].map(({ label, href, desc }) => (
              <Link key={href} href={href}
                className="bg-white border border-gray-200 rounded-xl px-4 py-3 hover:bg-gray-50 hover:border-gray-300 transition-colors">
                <p className="text-sm font-medium text-gray-800">{label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
