"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { useAuth } from "../../context/AuthContext";
import { API_URL } from "../../lib/api";

interface OSHASearchResult {
  incident_id: string;
  case_number: number | null;
  center_id: string;
  year: number | null;
  employee_name: string | null;
  job_title: string | null;
  incident_type: string;
  date_of_injury: string | null;
  classification: string | null;
  days_away: number;
  restricted_days: number;
  recordable: boolean | null;
  is_finalized: boolean;
  category: string | null;
  risk_score: number | null;
}

const CLASSIFICATION_LABELS: Record<string, string> = {
  days_away: "Days Away", restricted: "Restricted", other: "Other",
};
const CLASSIFICATION_STYLES: Record<string, string> = {
  days_away: "bg-red-100 text-red-700",
  restricted: "bg-yellow-100 text-yellow-700",
  other: "bg-gray-100 text-gray-600",
};

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = ["", ...Array.from({ length: 6 }, (_, i) => String(CURRENT_YEAR - i))];

export default function OSHAAuditSearch() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  const [employee, setEmployee] = useState("");
  const [center, setCenter] = useState("");
  const [year, setYear] = useState("");
  const [classification, setClassification] = useState("");
  const [recordableOnly, setRecordableOnly] = useState(false);
  const [finalizedOnly, setFinalizedOnly] = useState(false);
  const [q, setQ] = useState("");

  const [results, setResults] = useState<OSHASearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isAuthenticated) { router.push("/login?from=/osha/search"); return null; }

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const params: Record<string, string | boolean> = { limit: "100" };
      if (employee) params.employee = employee;
      if (center) params.center = center;
      if (year) params.year = year;
      if (classification) params.classification = classification;
      if (recordableOnly) params.recordable_only = true;
      if (finalizedOnly) params.finalized_only = true;
      if (q.length >= 2) params.q = q;

      const r = await axios.get<OSHASearchResult[]>(`${API_URL}/safety/search`, { params });
      setResults(r.data);
      setSearched(true);
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? String(err.response?.data?.detail ?? err.message) : "Search failed");
    } finally { setLoading(false); }
  }

  function clearAll() {
    setEmployee(""); setCenter(""); setYear(""); setClassification("");
    setRecordableOnly(false); setFinalizedOnly(false); setQ("");
    setResults([]); setSearched(false);
  }

  const INPUT = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white";

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">OSHA Audit Search</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Search across OSHA recordable incident records by employee, center, year, or injury type
        </p>
      </div>

      {/* Search form */}
      <form onSubmit={handleSearch} className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Employee Name</label>
            <input value={employee} onChange={(e) => setEmployee(e.target.value)}
              placeholder="Full or partial name" className={INPUT} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Center</label>
            <input value={center} onChange={(e) => setCenter(e.target.value)}
              placeholder="e.g. NYC-01" className={INPUT} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Year</label>
            <select value={year} onChange={(e) => setYear(e.target.value)} className={INPUT}>
              {YEARS.map((y) => <option key={y} value={y}>{y || "All years"}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">OSHA Classification</label>
            <select value={classification} onChange={(e) => setClassification(e.target.value)} className={INPUT}>
              <option value="">All classifications</option>
              <option value="days_away">Days Away from Work</option>
              <option value="restricted">Job Transfer / Restriction</option>
              <option value="other">Other Recordable</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Keyword Search</label>
            <input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Injury type, body part, description…" className={INPUT} />
          </div>
          <div className="flex items-end gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={recordableOnly}
                onChange={(e) => setRecordableOnly(e.target.checked)} className="rounded" />
              Recordable only
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={finalizedOnly}
                onChange={(e) => setFinalizedOnly(e.target.checked)} className="rounded" />
              Finalized only
            </label>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={loading}
            className="px-6 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
            style={{ backgroundColor: "var(--brand-primary)" }}>
            {loading ? "Searching…" : "Search"}
          </button>
          {searched && (
            <button type="button" onClick={clearAll}
              className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">
              Clear
            </button>
          )}
        </div>
      </form>

      {error && <div className="text-sm bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3">{error}</div>}

      {/* Results */}
      {searched && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-600">
              {results.length} result{results.length !== 1 ? "s" : ""}
            </p>
            {results.length > 0 && (
              <div className="flex items-center gap-3 text-xs">
                <span className="text-gray-400">Export:</span>
                <a href={`${API_URL}/safety/export/300/${year || CURRENT_YEAR}/csv${center ? `?center_code=${center}` : ""}`}
                  target="_blank" rel="noreferrer"
                  className="text-indigo-600 hover:underline">CSV</a>
              </div>
            )}
          </div>

          {results.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-400 bg-white rounded-xl border border-gray-200">
              No OSHA records matching your search criteria.
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Case #</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Employee</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Center</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Type</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Date</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Classification</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Days</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {results.map((r) => (
                    <tr key={r.incident_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-gray-600">
                        {r.case_number ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800">{r.employee_name ?? "—"}</p>
                        {r.job_title && <p className="text-xs text-gray-400">{r.job_title}</p>}
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-600">{r.center_id}</td>
                      <td className="px-4 py-3 text-gray-700 capitalize">
                        {r.incident_type.replace(/_/g, " ")}
                        {r.category && <p className="text-xs text-gray-400">{r.category}</p>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {r.date_of_injury ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {r.classification ? (
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${CLASSIFICATION_STYLES[r.classification] ?? ""}`}>
                            {CLASSIFICATION_LABELS[r.classification] ?? r.classification}
                          </span>
                        ) : <span className="text-gray-300 text-xs">Not recordable</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {r.days_away > 0 ? `${r.days_away}d away` : ""}
                        {r.restricted_days > 0 ? ` ${r.restricted_days}d restricted` : ""}
                        {r.days_away === 0 && r.restricted_days === 0 ? "—" : ""}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {r.recordable && (
                            <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">Rec</span>
                          )}
                          {r.is_finalized && (
                            <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Final</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
