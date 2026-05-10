"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import axios from "axios";
import { API_URL } from "../lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface EvidenceNote {
  id: string; evidence_file_id: string;
  extracted_text: string | null; ai_summary: string | null;
  ai_tags: string[] | null;
  ai_risk_signals: { signal: string; severity: string; description: string }[] | null;
  created_at: string;
}

interface EvidenceFile {
  id: string; case_id: string; uploaded_by_user_id: string;
  file_name: string; file_type: string; file_size: number;
  category: string; visibility: string; ai_processed: boolean;
  uploaded_at: string; note: EvidenceNote | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = [
  "general","witness_statement","injury_photo","inspection_report",
  "corrective_action","workers_comp","osha_form","hr_document","legal_document",
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  general: "General", witness_statement: "Witness Statement",
  injury_photo: "Injury Photo", inspection_report: "Inspection Report",
  corrective_action: "Corrective Action", workers_comp: "Workers Comp",
  osha_form: "OSHA Form", hr_document: "HR Document", legal_document: "Legal Document",
};

const VISIBILITY_LABELS: Record<string, string> = {
  all: "All", hr_only: "HR Only", legal_only: "Legal Only", management_only: "Management",
};

const VISIBILITY_STYLES: Record<string, string> = {
  all: "bg-gray-100 text-gray-600",
  hr_only: "bg-blue-100 text-blue-700",
  legal_only: "bg-purple-100 text-purple-700",
  management_only: "bg-orange-100 text-orange-700",
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: "text-red-700 bg-red-50 border border-red-200",
  high:     "text-orange-700 bg-orange-50 border border-orange-200",
  medium:   "text-yellow-700 bg-yellow-50 border border-yellow-200",
  low:      "text-green-700 bg-green-50 border border-green-200",
};

function fileIcon(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "🖼";
  if (mimeType === "application/pdf") return "📄";
  if (mimeType.startsWith("video/")) return "🎥";
  if (mimeType.startsWith("audio/")) return "🎵";
  return "📎";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  caseId: string;
  onFileUploaded?: () => void;
}

export default function EvidenceTab({ caseId, onFileUploaded }: Props) {
  const [files, setFiles] = useState<EvidenceFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<EvidenceFile | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Upload state
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [category, setCategory] = useState<string>("general");
  const [visibility, setVisibility] = useState<string>("all");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = useCallback(async () => {
    try {
      const r = await axios.get<EvidenceFile[]>(`${API_URL}/evidence/cases/${caseId}/files`);
      setFiles(r.data);
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? String(err.response?.data?.detail ?? err.message) : "Failed to load");
    } finally { setLoading(false); }
  }, [caseId]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  async function uploadFile(file: File) {
    setUploadError(null); setUploading(true); setUploadProgress(0);
    const form = new FormData();
    form.append("file", file);
    form.append("category", category);
    form.append("visibility", visibility);
    try {
      await axios.post(`${API_URL}/evidence/cases/${caseId}/upload`, form, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => {
          if (e.total) setUploadProgress(Math.round((e.loaded / e.total) * 100));
        },
      });
      await fetchFiles();
      onFileUploaded?.();
    } catch (err: unknown) {
      setUploadError(axios.isAxiosError(err) ? String(err.response?.data?.detail ?? err.message) : "Upload failed");
    } finally { setUploading(false); setUploadProgress(0); }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = "";
  }

  async function deleteFile(fileId: string) {
    if (!confirm("Delete this evidence file? This cannot be undone.")) return;
    setDeletingId(fileId);
    try {
      await axios.delete(`${API_URL}/evidence/files/${fileId}`);
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? String(err.response?.data?.detail ?? err.message) : "Delete failed");
    } finally { setDeletingId(null); }
  }

  const isImage = (f: EvidenceFile) => f.file_type.startsWith("image/");
  const isPDF = (f: EvidenceFile) => f.file_type === "application/pdf";

  return (
    <div className="space-y-4">
      {/* Upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${
          dragging ? "border-indigo-400 bg-indigo-50" : "border-gray-300 hover:border-indigo-300 hover:bg-gray-50"
        } ${uploading ? "pointer-events-none opacity-70" : ""}`}
      >
        <input ref={fileInputRef} type="file" className="hidden" onChange={onFileInput}
          accept="image/*,application/pdf,video/*,audio/*,text/plain,.doc,.docx,.xls,.xlsx" />
        {uploading ? (
          <div className="space-y-2">
            <p className="text-sm text-indigo-600 font-medium">Uploading… {uploadProgress}%</p>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-indigo-500 h-2 rounded-full transition-all"
                   style={{ width: `${uploadProgress}%` }} />
            </div>
          </div>
        ) : (
          <>
            <p className="text-2xl mb-1">📎</p>
            <p className="text-sm font-medium text-gray-700">Drop file or click to upload</p>
            <p className="text-xs text-gray-400 mt-0.5">Images, PDFs, videos, audio, documents · Max 100 MB</p>
          </>
        )}
      </div>

      {/* Upload options */}
      <div className="flex gap-2 flex-wrap">
        <select value={category} onChange={(e) => setCategory(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs bg-white text-gray-600 focus:outline-none flex-1">
          {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
        </select>
        <select value={visibility} onChange={(e) => setVisibility(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs bg-white text-gray-600 focus:outline-none flex-1">
          {Object.entries(VISIBILITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {uploadError && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{uploadError}</p>
      )}
      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}

      {/* File list */}
      {loading ? (
        <p className="text-xs text-gray-400 text-center py-6">Loading evidence…</p>
      ) : files.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-6 italic">No evidence attached yet</p>
      ) : (
        <ul className="space-y-2">
          {files.map((f) => (
            <li key={f.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {/* File header */}
              <div className="flex items-center gap-2 px-4 py-3">
                <span className="text-xl flex-shrink-0">{fileIcon(f.file_type)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{f.file_name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${VISIBILITY_STYLES[f.visibility] ?? ""}`}>
                      {VISIBILITY_LABELS[f.visibility] ?? f.visibility}
                    </span>
                    <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                      {CATEGORY_LABELS[f.category] ?? f.category}
                    </span>
                    {f.ai_processed && (
                      <span className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded border border-indigo-100">
                        ✦ AI
                      </span>
                    )}
                    <span className="text-xs text-gray-400">{formatBytes(f.file_size)} · {relativeTime(f.uploaded_at)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {(isImage(f) || isPDF(f)) && (
                    <button onClick={() => setPreviewing(f)}
                      className="text-xs text-indigo-600 hover:underline">Preview</button>
                  )}
                  <a href={`${API_URL}/evidence/files/${f.id}/download`}
                    target="_blank" rel="noreferrer"
                    className="text-xs text-gray-500 hover:text-gray-800 hover:underline">Download</a>
                  {f.note && (
                    <button onClick={() => setExpandedId(expandedId === f.id ? null : f.id)}
                      className="text-xs text-gray-400 hover:text-gray-700">
                      {expandedId === f.id ? "▲" : "▼"}
                    </button>
                  )}
                  <button onClick={() => deleteFile(f.id)} disabled={deletingId === f.id}
                    className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50">
                    {deletingId === f.id ? "…" : "✕"}
                  </button>
                </div>
              </div>

              {/* AI insights accordion */}
              {expandedId === f.id && f.note && (
                <div className="border-t border-gray-100 px-4 py-3 bg-indigo-50/30 space-y-3">
                  {f.note.ai_summary && (
                    <div>
                      <p className="text-xs font-semibold text-gray-600 mb-1">AI Summary</p>
                      <p className="text-xs text-gray-700">{f.note.ai_summary}</p>
                    </div>
                  )}
                  {f.note.ai_tags && f.note.ai_tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {f.note.ai_tags.map((t, i) => (
                        <span key={i} className="text-xs bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  {f.note.ai_risk_signals && f.note.ai_risk_signals.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-600 mb-1.5">Risk Signals</p>
                      <ul className="space-y-1.5">
                        {f.note.ai_risk_signals.map((s, i) => (
                          <li key={i} className={`text-xs rounded-lg px-3 py-2 ${SEVERITY_STYLES[s.severity] ?? ""}`}>
                            <span className="font-medium capitalize">{s.severity}: </span>
                            {s.description}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {f.note.extracted_text && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-gray-500 font-medium hover:text-gray-700">
                        Extracted text ({f.note.extracted_text.length} chars)
                      </summary>
                      <pre className="mt-2 bg-white border border-gray-200 rounded p-2 text-gray-600 whitespace-pre-wrap overflow-x-auto max-h-32 text-xs">
                        {f.note.extracted_text.slice(0, 1000)}
                        {f.note.extracted_text.length > 1000 ? "…" : ""}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Preview modal */}
      {previewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
             onClick={() => setPreviewing(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col"
               onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div>
                <p className="text-sm font-semibold text-gray-900">{previewing.file_name}</p>
                <p className="text-xs text-gray-400">
                  {CATEGORY_LABELS[previewing.category] ?? previewing.category} · {formatBytes(previewing.file_size)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <a href={`${API_URL}/evidence/files/${previewing.id}/download`}
                  target="_blank" rel="noreferrer"
                  className="text-xs text-indigo-600 hover:underline">Download</a>
                <button onClick={() => setPreviewing(null)} className="text-gray-400 hover:text-gray-700 text-lg">×</button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-gray-50">
              {isImage(previewing) ? (
                <img
                  src={`${API_URL}/evidence/files/${previewing.id}/download`}
                  alt={previewing.file_name}
                  className="max-w-full max-h-[70vh] rounded object-contain"
                />
              ) : isPDF(previewing) ? (
                <iframe
                  src={`${API_URL}/evidence/files/${previewing.id}/download`}
                  title={previewing.file_name}
                  className="w-full h-[70vh] border-0 rounded"
                />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
