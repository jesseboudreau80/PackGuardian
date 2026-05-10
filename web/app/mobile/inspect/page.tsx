"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import axios from "axios";
import { API_URL } from "../../lib/api";

interface Inspection {
  id: string; center_code: string; title: string;
  inspection_type: string; status: string; score: number | null;
  created_at: string; completed_at: string | null;
  items: InspectionItem[];
}

interface InspectionItem {
  id: string; inspection_id: string; sort_order: number;
  label: string; severity: string;
  result: "pending" | "pass" | "fail" | "na";
  notes: string | null; evidence_file_id: string | null;
}

const TYPE_ICONS: Record<string, string> = {
  general: "🏢", kennel: "🐕", safety: "⛑️", sanitation: "🧹", equipment: "⚙️",
};
const STATUS_STYLES: Record<string, string> = {
  in_progress: "bg-yellow-100 text-yellow-700",
  completed:   "bg-gray-100 text-gray-600",
  passed:      "bg-green-100 text-green-700",
  failed:      "bg-red-100 text-red-700",
};
const RESULT_STYLES: Record<string, string> = {
  pending: "bg-gray-100 text-gray-500",
  pass:    "bg-green-600 text-white",
  fail:    "bg-red-600 text-white",
  na:      "bg-gray-200 text-gray-600",
};

export default function InspectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillCenter = searchParams.get("center") ?? "";

  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [creating, setCreating] = useState(false);
  const [activeInspection, setActiveInspection] = useState<Inspection | null>(null);
  const [completing, setCompleting] = useState(false);

  // New form state
  const [newCenter, setNewCenter] = useState(prefillCenter);
  const [newType, setNewType] = useState("general");
  const [newTitle, setNewTitle] = useState("");

  async function fetchInspections() {
    try {
      const r = await axios.get<Inspection[]>(`${API_URL}/inspections?limit=20`);
      setInspections(r.data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { fetchInspections(); }, []);

  async function createInspection(e: FormEvent) {
    e.preventDefault(); setCreating(true);
    try {
      const r = await axios.post<Inspection>(`${API_URL}/inspections`, {
        center_code: newCenter || "general",
        title: newTitle || `${newType} inspection`,
        inspection_type: newType,
      });
      setActiveInspection(r.data);
      setShowNew(false);
    } catch { /* ignore */ }
    finally { setCreating(false); }
  }

  async function updateItem(item: InspectionItem, result: "pass" | "fail" | "na") {
    if (!activeInspection) return;
    try {
      await axios.patch(`${API_URL}/inspections/${activeInspection.id}/items/${item.id}`, { result });
      setActiveInspection((prev) => prev ? {
        ...prev,
        items: prev.items.map((i) => i.id === item.id ? { ...i, result } : i)
      } : prev);
    } catch { /* ignore */ }
  }

  async function completeInspection() {
    if (!activeInspection) return;
    setCompleting(true);
    try {
      const r = await axios.post<Inspection>(`${API_URL}/inspections/${activeInspection.id}/complete`);
      setActiveInspection(r.data);
      fetchInspections();
    } catch { /* ignore */ }
    finally { setCompleting(false); }
  }

  // ── Active inspection walkthrough ─────────────────────────────────────────
  if (activeInspection) {
    const items = activeInspection.items;
    const total = items.length;
    const done = items.filter((i) => i.result !== "pending").length;
    const progress = total > 0 ? Math.round((done / total) * 100) : 0;
    const failCount = items.filter((i) => i.result === "fail").length;
    const isCompleted = activeInspection.status !== "in_progress";

    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-10">
          <div className="flex items-center justify-between mb-2">
            <button onClick={() => setActiveInspection(null)} className="text-gray-400 text-2xl">←</button>
            <div className="text-center flex-1">
              <p className="text-sm font-semibold text-gray-900 truncate">{activeInspection.title}</p>
              <p className="text-xs text-gray-400">{activeInspection.center_code}</p>
            </div>
            {!isCompleted ? (
              <button onClick={completeInspection} disabled={completing}
                className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-xl font-medium disabled:opacity-50">
                {completing ? "…" : "Finish"}
              </button>
            ) : (
              <span className={`text-xs px-2 py-1 rounded-xl font-medium ${STATUS_STYLES[activeInspection.status] ?? ""}`}>
                {activeInspection.status}
              </span>
            )}
          </div>
          {/* Progress bar */}
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-200 rounded-full h-2">
              <div className="bg-indigo-500 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-xs text-gray-500 whitespace-nowrap">{done}/{total}</span>
            {failCount > 0 && (
              <span className="text-xs text-red-600 font-medium">{failCount} fail</span>
            )}
          </div>
          {isCompleted && activeInspection.score != null && (
            <div className={`mt-2 text-center text-sm font-bold ${
              activeInspection.score >= 80 ? "text-green-700" : activeInspection.score >= 60 ? "text-yellow-700" : "text-red-700"
            }`}>
              Score: {activeInspection.score}/100
              {activeInspection.case_id && (
                <span className="text-xs font-normal text-orange-600 ml-2">· Corrective case created</span>
              )}
            </div>
          )}
        </div>

        {/* Items */}
        <div className="p-3 space-y-3 pb-8">
          {items.map((item) => (
            <div key={item.id}
              className={`bg-white rounded-2xl border-2 p-4 ${
                item.result === "fail" ? "border-red-300" :
                item.result === "pass" ? "border-green-300" : "border-gray-200"
              }`}>
              <div className="flex items-start gap-2 mb-3">
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 mt-0.5 ${
                  item.severity === "critical" ? "bg-red-100 text-red-700" :
                  item.severity === "major" ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-600"
                }`}>{item.severity}</span>
                <p className="text-sm font-medium text-gray-800 flex-1">{item.label}</p>
              </div>
              {!isCompleted && (
                <div className="flex gap-2">
                  {(["pass", "fail", "na"] as const).map((r) => (
                    <button key={r} onClick={() => updateItem(item, r)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-bold capitalize border-2 transition-colors ${
                        item.result === r ? RESULT_STYLES[r] + " border-transparent" : "bg-white border-gray-200 text-gray-500"
                      }`}>
                      {r === "na" ? "N/A" : r.toUpperCase()}
                    </button>
                  ))}
                </div>
              )}
              {item.result !== "pending" && (
                <div className={`flex items-center gap-1 mt-1 justify-center text-xs font-medium ${
                  item.result === "pass" ? "text-green-600" : item.result === "fail" ? "text-red-600" : "text-gray-400"
                }`}>
                  {item.result === "pass" ? "✓ PASS" : item.result === "fail" ? "✕ FAIL" : "N/A"}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Inspection list ────────────────────────────────────────────────────────
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3 pt-2">
        <button onClick={() => router.push("/mobile")} className="text-gray-400 text-2xl">←</button>
        <h1 className="text-xl font-bold text-gray-900 flex-1">Inspections</h1>
        <button onClick={() => setShowNew(true)}
          className="bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-semibold active:opacity-80">
          + New
        </button>
      </div>

      {/* New inspection form */}
      {showNew && (
        <form onSubmit={createInspection} className="bg-white border-2 border-indigo-200 rounded-2xl p-4 space-y-3">
          <p className="font-semibold text-gray-900">Start New Inspection</p>
          <select value={newType} onChange={(e) => setNewType(e.target.value)}
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-base bg-white focus:border-indigo-400 focus:outline-none">
            {["general","kennel","safety","sanitation","equipment"].map((t) => (
              <option key={t} value={t}>{TYPE_ICONS[t]} {t.charAt(0).toUpperCase()+t.slice(1)}</option>
            ))}
          </select>
          <input value={newCenter} onChange={(e) => setNewCenter(e.target.value)}
            placeholder="Center code (e.g. NYC-01)"
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-base focus:border-indigo-400 focus:outline-none" />
          <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Title (optional)"
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-base focus:border-indigo-400 focus:outline-none" />
          <div className="flex gap-2">
            <button type="submit" disabled={creating}
              className="flex-1 bg-green-600 text-white py-3 rounded-xl font-semibold disabled:opacity-50">
              {creating ? "Starting…" : "Start"}
            </button>
            <button type="button" onClick={() => setShowNew(false)}
              className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-semibold">
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-center text-gray-400 text-sm py-8">Loading inspections…</p>
      ) : inspections.length === 0 ? (
        <p className="text-center text-gray-400 text-sm py-8 italic">No inspections yet. Start one above.</p>
      ) : (
        <div className="space-y-2">
          {inspections.map((insp) => (
            <button key={insp.id} onClick={() => setActiveInspection(insp)}
              className="w-full flex items-center gap-3 bg-white border-2 border-gray-200 rounded-2xl px-4 py-3 text-left active:bg-gray-50">
              <span className="text-2xl">{TYPE_ICONS[insp.inspection_type] ?? "📋"}</span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{insp.title}</p>
                <p className="text-xs text-gray-400">{insp.center_code} · {insp.inspection_type}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[insp.status] ?? ""}`}>
                  {insp.status}
                </span>
                {insp.score != null && (
                  <span className={`text-xs font-bold ${insp.score >= 80 ? "text-green-600" : "text-red-600"}`}>
                    {insp.score}/100
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
