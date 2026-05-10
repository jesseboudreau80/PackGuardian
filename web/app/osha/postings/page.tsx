"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { useAuth } from "../../context/AuthContext";
import { API_URL } from "../../lib/api";

interface Posting {
  id: string;
  tenant_id: string;
  center_code: string | null;
  year: number;
  generated_at: string;
  posted_at: string | null;
  posted_by_user_id: string | null;
  acknowledgement_notes: string | null;
  form_300a_snapshot: Record<string, unknown> | null;
  is_posted: boolean;
}

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

// Feb 1 – Apr 30 posting window
function postingWindowStatus(year: number): { label: string; style: string } {
  const now = new Date();
  const start = new Date(year + 1, 1, 1); // Feb 1 of following year
  const end = new Date(year + 1, 3, 30);  // Apr 30 of following year
  if (now < start) return { label: "Upcoming (Feb 1 – Apr 30)", style: "text-gray-500" };
  if (now <= end) return { label: "ACTIVE POSTING WINDOW", style: "text-green-700 font-semibold" };
  return { label: "Window closed", style: "text-gray-400" };
}

function relativeTime(iso: string) {
  return new Date(iso).toLocaleString();
}

export default function PostingsPage() {
  const { isAuthenticated, isAdmin } = useAuth();
  const router = useRouter();
  const [postings, setPostings] = useState<Posting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  // Generate form state
  const [genYear, setGenYear] = useState(CURRENT_YEAR);
  const [genCenter, setGenCenter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!isAuthenticated) { router.push("/login?from=/osha/postings"); return null; }

  async function fetchPostings() {
    try {
      const r = await axios.get<Posting[]>(`${API_URL}/safety/postings`);
      setPostings(r.data);
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? String(err.response?.data?.detail ?? err.message) : "Failed");
    } finally { setLoading(false); }
  }

  useEffect(() => { fetchPostings(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function generate(e: FormEvent) {
    e.preventDefault(); setGenerating(true); setError(null);
    try {
      const params: Record<string, string> = {};
      if (genCenter) params.center_code = genCenter;
      await axios.post(`${API_URL}/safety/postings/${genYear}`, null, { params });
      await fetchPostings();
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? String(err.response?.data?.detail ?? err.message) : "Generation failed");
    } finally { setGenerating(false); }
  }

  async function markPosted(postingId: string) {
    setMarkingId(postingId); setError(null);
    try {
      await axios.patch(`${API_URL}/safety/postings/${postingId}/mark-posted`, null, {
        params: { notes },
      });
      setNotes("");
      await fetchPostings();
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? String(err.response?.data?.detail ?? err.message) : "Failed");
    } finally { setMarkingId(null); }
  }

  const INPUT = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white";

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">OSHA Annual Postings</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Form 300A must be posted Feb 1 – Apr 30 each year per 29 CFR 1904.32
        </p>
      </div>

      {/* Compliance notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3">
        <p className="text-sm font-semibold text-amber-800">29 CFR 1904.32 — Annual Posting Requirement</p>
        <p className="text-xs text-amber-700 mt-0.5">
          Employers must post the OSHA Form 300A Summary in a conspicuous location from February 1 through
          April 30 of the year following the year covered by the form. This record must be retained for
          five years per 29 CFR 1904.33.
        </p>
      </div>

      {error && <div className="text-sm bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3">{error}</div>}

      {/* Generate new posting */}
      {isAdmin && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Generate 300A Posting Packet</h2>
          <form onSubmit={generate} className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Year</label>
              <select value={genYear} onChange={(e) => setGenYear(Number(e.target.value))} className={INPUT}>
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Center (leave blank for all)</label>
              <input value={genCenter} onChange={(e) => setGenCenter(e.target.value)}
                placeholder="e.g. NYC-01" className={INPUT} />
            </div>
            <button type="submit" disabled={generating}
              className="px-5 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
              style={{ backgroundColor: "var(--brand-primary)" }}>
              {generating ? "Generating…" : "Generate 300A Snapshot"}
            </button>
          </form>
        </div>
      )}

      {/* Postings list */}
      {loading ? (
        <div className="text-center py-12 text-sm text-gray-400">Loading postings…</div>
      ) : postings.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-400 bg-white rounded-xl border border-gray-200">
          No posting records yet. Generate your first 300A snapshot above.
        </div>
      ) : (
        <div className="space-y-3">
          {postings.map((p) => {
            const window = postingWindowStatus(p.year);
            const snap = p.form_300a_snapshot;
            return (
              <div key={p.id} className={`bg-white rounded-xl border-2 ${p.is_posted ? "border-green-200" : "border-gray-200"}`}>
                <div className="flex items-start justify-between px-5 py-4 flex-wrap gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900">
                        Form 300A — {p.year}{p.center_code ? ` · ${p.center_code}` : " · All Centers"}
                      </h3>
                      {p.is_posted ? (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                          ✓ Posted
                        </span>
                      ) : (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                          Pending
                        </span>
                      )}
                    </div>
                    <p className={`text-xs ${window.style}`}>{window.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Generated: {relativeTime(p.generated_at)}</p>
                    {p.posted_at && (
                      <p className="text-xs text-green-600">Posted: {relativeTime(p.posted_at)}</p>
                    )}
                    {p.acknowledgement_notes && (
                      <p className="text-xs text-gray-500 italic mt-0.5">Note: {p.acknowledgement_notes}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                      className="text-xs text-indigo-600 hover:underline">
                      {expanded === p.id ? "Hide Summary" : "View 300A Summary"}
                    </button>
                    <a href={`${API_URL}/safety/export/300a/${p.year}/csv${p.center_code ? `?center_code=${p.center_code}` : ""}`}
                      target="_blank" rel="noreferrer"
                      className="text-xs text-indigo-600 hover:underline">
                      Download CSV
                    </a>
                    <a href={`${API_URL}/safety/export/bundle/${p.year}`}
                      target="_blank" rel="noreferrer"
                      className="text-xs text-indigo-600 hover:underline">
                      ZIP Bundle
                    </a>
                    {!p.is_posted && isAdmin && (
                      <div className="flex items-center gap-1.5">
                        <input value={notes} onChange={(e) => setNotes(e.target.value)}
                          placeholder="Posting notes (optional)"
                          className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-40 focus:outline-none" />
                        <button onClick={() => markPosted(p.id)} disabled={markingId === p.id}
                          className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg font-medium disabled:opacity-50">
                          {markingId === p.id ? "…" : "Mark Posted"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* 300A snapshot */}
                {expanded === p.id && snap && (
                  <div className="border-t border-gray-100 px-5 py-4 bg-gray-50">
                    <p className="text-xs font-semibold text-gray-600 mb-3 uppercase tracking-wide">
                      Form 300A Summary — Year {snap.year} Snapshot
                    </p>
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                      {[
                        ["Total Cases", snap.total_cases],
                        ["Days Away", snap.days_away_cases],
                        ["Restricted", snap.restricted_cases],
                        ["Other", snap.other_cases],
                        ["Total Days Away", snap.total_days_away],
                        ["Restricted Days", snap.total_restricted_days],
                      ].map(([label, val]) => (
                        <div key={String(label)} className="bg-white rounded-lg border border-gray-200 px-3 py-2 text-center">
                          <p className="text-lg font-bold text-gray-900">{String(val)}</p>
                          <p className="text-xs text-gray-500">{label}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-3">
                      Snapshot captured at {relativeTime(String(snap.generated_at))} — immutable audit record.
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Retention reminder */}
      <div className="text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
        <p className="font-medium text-gray-600">Record Retention — 29 CFR 1904.33</p>
        <p>OSHA 300, 300A, and 301 records must be retained for 5 years following the calendar year they cover.
           View retention status at <a href="/safety" className="text-indigo-600 hover:underline">Safety Intelligence</a>.
        </p>
      </div>
    </div>
  );
}
