"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import type {
  Form300Log,
  Form300Entry,
  Form300ASummary,
  Form301,
  OshaClassification,
} from "../types/incident";
import { API_URL } from "../lib/api";

const CURRENT_YEAR = new Date().getFullYear();

const classificationLabel: Record<OshaClassification, string> = {
  days_away: "Days Away",
  restricted: "Restricted",
  other: "Other",
};

const classificationColors: Record<OshaClassification, string> = {
  days_away: "bg-red-100 text-red-700",
  restricted: "bg-yellow-100 text-yellow-700",
  other: "bg-gray-100 text-gray-600",
};

export default function OshaReportingPage() {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [centerId, setCenterId] = useState("");
  const [summary, setSummary] = useState<Form300ASummary | null>(null);
  const [log, setLog] = useState<Form300Log | null>(null);
  const [selected301, setSelected301] = useState<Form301 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setSelected301(null);

    const params = centerId ? `?center_id=${encodeURIComponent(centerId)}` : "";

    Promise.all([
      axios.get<Form300ASummary>(`${API_URL}/osha/300a/${year}${params}`),
      axios.get<Form300Log>(`${API_URL}/osha/300/${year}${params}`),
    ])
      .then(([sumRes, logRes]) => {
        setSummary(sumRes.data);
        setLog(logRes.data);
      })
      .catch((err: unknown) => {
        const msg = axios.isAxiosError(err)
          ? (err.response?.data?.detail ?? err.message)
          : "Failed to load OSHA data.";
        setError(String(msg));
      })
      .finally(() => setLoading(false));
  }, [year, centerId]);

  async function load301(incidentId: string) {
    if (selected301?.incident_id === incidentId) {
      setSelected301(null);
      return;
    }
    try {
      const res = await axios.get<Form301>(`${API_URL}/osha/301/${incidentId}`);
      setSelected301(res.data);
    } catch {
      setSelected301(null);
    }
  }

  return (
    <div className="space-y-8">
      {/* Header + filters */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold">OSHA Reporting</h1>
          <p className="text-gray-500 text-sm mt-1">
            Form 300 Log · Form 300A Summary · Form 301 Incident Reports
          </p>
        </div>
        <div className="flex gap-3 ml-auto">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Year</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="border border-gray-300 rounded px-3 py-1.5 text-sm"
            >
              {[CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Center ID (optional)</label>
            <input
              value={centerId}
              onChange={(e) => setCenterId(e.target.value)}
              className="border border-gray-300 rounded px-3 py-1.5 text-sm w-36"
              placeholder="All centers"
            />
          </div>
        </div>
      </div>

      {loading && <p className="text-gray-400 text-sm">Loading…</p>}
      {error && <p className="text-red-500 text-sm">{error}</p>}

      {!loading && !error && summary && (
        <>
          {/* Form 300A Summary */}
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Form 300A — Annual Summary ({year})
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <SummaryCard label="Total Cases" value={summary.total_cases} />
              <SummaryCard label="Days Away" value={summary.days_away_cases} highlight />
              <SummaryCard label="Restricted" value={summary.restricted_cases} />
              <SummaryCard label="Other Recordable" value={summary.other_cases} />
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <SummaryCard label="Total Days Away from Work" value={summary.total_days_away} />
              <SummaryCard label="Total Restricted Days" value={summary.total_restricted_days} />
            </div>
          </section>

          {/* Form 300 Log */}
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Form 300 — Recordable Injury Log ({log?.total_cases ?? 0} cases)
            </h2>

            {log && log.entries.length === 0 ? (
              <p className="text-gray-400 text-sm py-6 text-center">
                No recordable incidents for {year}
                {centerId ? ` at ${centerId}` : ""}.
              </p>
            ) : (
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">#</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Employee</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Date</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Type</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Body Part</th>
                      <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500">Days Away</th>
                      <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500">Restricted</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Classification</th>
                    </tr>
                  </thead>
                  <tbody>
                    {log?.entries.map((entry) => (
                      <>
                        <tr
                          key={entry.incident_id}
                          onClick={() => load301(entry.incident_id)}
                          className="border-b border-gray-100 hover:bg-indigo-50 cursor-pointer"
                        >
                          <td className="px-4 py-2.5 tabular-nums text-gray-500">{entry.case_number}</td>
                          <td className="px-4 py-2.5">{entry.employee_name ?? <span className="text-gray-400">—</span>}</td>
                          <td className="px-4 py-2.5 tabular-nums text-gray-600">
                            {entry.date_of_injury ?? "—"}
                          </td>
                          <td className="px-4 py-2.5">{entry.incident_type}</td>
                          <td className="px-4 py-2.5 text-gray-600">{entry.body_part ?? "—"}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{entry.days_away}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{entry.restricted_days}</td>
                          <td className="px-4 py-2.5">
                            <span className={`text-xs px-2 py-0.5 rounded font-medium ${classificationColors[entry.classification]}`}>
                              {classificationLabel[entry.classification]}
                            </span>
                          </td>
                        </tr>

                        {/* Inline Form 301 detail */}
                        {selected301?.incident_id === entry.incident_id && (
                          <tr key={`301-${entry.incident_id}`}>
                            <td colSpan={8} className="bg-indigo-50 px-6 py-4">
                              <Form301Detail form={selected301} />
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-4 ${highlight && value > 0 ? "border-red-200 bg-red-50" : "border-gray-200 bg-white"}`}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${highlight && value > 0 ? "text-red-600" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function Form301Detail({ form }: { form: Form301 }) {
  const fields: [string, string | number | boolean | null][] = [
    ["Incident ID", form.incident_id],
    ["Case #", form.case_number ?? "—"],
    ["Employee", form.employee_name ?? "—"],
    ["Job Title", form.job_title ?? "—"],
    ["Center", form.center_id],
    ["Date of Injury", form.date_of_injury ?? "—"],
    ["Time", form.time_of_injury ?? "—"],
    ["Incident Type", form.incident_type],
    ["Body Part", form.body_part ?? "—"],
    ["Treatment", form.treatment_type ?? "—"],
    ["Days Away", form.days_away],
    ["Restricted Days", form.restricted_days],
    ["Recordable", form.recordable ? "Yes" : "No"],
  ];

  return (
    <div>
      <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-3">
        Form 301 — Incident Report
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1">
        {fields.map(([label, val]) => (
          <div key={label}>
            <span className="text-xs text-gray-500">{label}: </span>
            <span className="text-xs font-medium text-gray-800">{String(val)}</span>
          </div>
        ))}
      </div>
      {form.description && (
        <p className="mt-3 text-xs text-gray-600 border-t border-indigo-100 pt-2">
          <span className="font-medium">Description: </span>{form.description}
        </p>
      )}
    </div>
  );
}
