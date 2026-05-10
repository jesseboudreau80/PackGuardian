"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { API_URL } from "../lib/api";

interface IncidentSummary {
  id: string; center_id: string; incident_type: string;
  reported_severity: string; category: string | null; risk_score: number | null;
}
interface CaseResult {
  id: string; incident_id: string; status: string; priority: string;
}
interface CenterResult {
  id: string; center_code: string; name: string; city: string | null; state: string | null;
}
interface EvidenceHit {
  file_id: string; case_id: string; file_name: string;
  category: string; ai_summary: string | null; uploaded_at: string;
}
interface SearchResults {
  query: string; incidents: IncidentSummary[];
  cases: CaseResult[]; centers: CenterResult[];
  evidence: EvidenceHit[]; total: number;
}

const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-red-500", high: "bg-orange-400",
  medium: "bg-yellow-400", low: "bg-green-400",
};

interface Props { onClose: () => void; }

export default function SearchModal({ onClose }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (query.length < 2) { setResults(null); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await axios.get<SearchResults>(`${API_URL}/search`, { params: { q: query } });
        setResults(r.data);
      } catch { setResults(null); }
      finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const hasResults = results && results.total > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl border border-gray-200 shadow-2xl w-full max-w-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search incidents, cases, centers…"
            className="flex-1 text-sm text-gray-800 outline-none placeholder-gray-400"
          />
          {loading && <span className="text-xs text-gray-400">Searching…</span>}
          <kbd className="text-xs text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto">
          {!hasResults && query.length >= 2 && !loading && (
            <p className="px-5 py-6 text-sm text-gray-400 text-center">No results for &ldquo;{query}&rdquo;</p>
          )}
          {!hasResults && query.length < 2 && (
            <p className="px-5 py-6 text-sm text-gray-400 text-center">Type at least 2 characters to search</p>
          )}

          {results && (
            <div className="divide-y divide-gray-100">
              {results.incidents.length > 0 && (
                <div>
                  <p className="px-4 py-2 text-xs font-semibold text-gray-500 bg-gray-50 uppercase tracking-wide">
                    Incidents ({results.incidents.length})
                  </p>
                  {results.incidents.map((i) => (
                    <button key={i.id} onClick={() => { router.push("/"); onClose(); }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${SEVERITY_DOT[i.reported_severity] ?? "bg-gray-400"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800">{i.incident_type}</p>
                        <p className="text-xs text-gray-400">{i.center_id} · {i.category ?? "General"}{i.risk_score != null ? ` · Risk: ${i.risk_score}` : ""}</p>
                      </div>
                      <span className="text-xs text-gray-400 capitalize">{i.reported_severity}</span>
                    </button>
                  ))}
                </div>
              )}

              {results.cases.length > 0 && (
                <div>
                  <p className="px-4 py-2 text-xs font-semibold text-gray-500 bg-gray-50 uppercase tracking-wide">
                    Cases ({results.cases.length})
                  </p>
                  {results.cases.map((c) => (
                    <button key={c.id} onClick={() => { router.push("/cases"); onClose(); }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 capitalize">{c.status.replace(/_/g," ")} · {c.priority}</p>
                        <p className="text-xs text-gray-400 font-mono">{c.incident_id.slice(0,8)}…</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {results.centers.length > 0 && (
                <div>
                  <p className="px-4 py-2 text-xs font-semibold text-gray-500 bg-gray-50 uppercase tracking-wide">
                    Centers ({results.centers.length})
                  </p>
                  {results.centers.map((c) => (
                    <button key={c.id} onClick={() => { router.push("/map"); onClose(); }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-800">{c.name}</p>
                        <p className="text-xs text-gray-400">{c.center_code}{c.city ? ` · ${c.city}` : ""}{c.state ? `, ${c.state}` : ""}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {results.evidence && results.evidence.length > 0 && (
                <div>
                  <p className="px-4 py-2 text-xs font-semibold text-gray-500 bg-gray-50 uppercase tracking-wide">
                    Evidence ({results.evidence.length})
                  </p>
                  {results.evidence.map((e) => (
                    <button key={e.file_id} onClick={() => { router.push("/cases"); onClose(); }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left">
                      <span className="text-base flex-shrink-0">📎</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{e.file_name}</p>
                        <p className="text-xs text-gray-400 truncate">
                          {e.category.replace(/_/g," ")}
                          {e.ai_summary ? ` · ${e.ai_summary.slice(0, 60)}…` : ""}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
