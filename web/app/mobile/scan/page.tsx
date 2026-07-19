"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { API_URL } from "../../lib/api";

interface CaseSummary {
  id: string;
  incident_id: string;
  status: string;
  priority: string;
  escalation_level: number;
  assigned_role: string | null;
  assigned_to_user_id: string | null;
  due_date: string | null;
  updated_at: string;
  created_at: string;
  incident_type: string | null;
  center_id: string | null;
}

interface IncidentSummary {
  id: string;
  incident_type: string;
  reported_severity: string;
  status: string;
  recordable: boolean | null;
  description: string | null;
  employee_name: string | null;
  created_at: string;
}

interface CaseDetail {
  case: CaseSummary;
  incident: IncidentSummary;
  task_count: number;
  open_task_count: number;
  evidence_count: number;
}

const STATUS_LABELS: Record<string, string> = {
  new: "New", assigned: "Assigned", investigating: "Investigating",
  awaiting_followup: "Awaiting Follow-up", resolved: "Resolved", closed: "Closed",
};
const STATUS_COLOR: Record<string, string> = {
  new: "#6b7280", assigned: "#2563eb", investigating: "#4f46e5",
  awaiting_followup: "#d97706", resolved: "#16a34a", closed: "#9ca3af",
};
const PRIORITY_COLOR: Record<string, string> = {
  low: "#16a34a", medium: "#d97706", high: "#ea580c", critical: "#dc2626",
};
const ESC_LABEL: Record<number, string> = { 1: "Supervisor Review", 2: "Safety Director Review", 3: "Executive Review" };

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function ScanContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preCase = searchParams.get("case");
  const preCode = searchParams.get("code");

  const [manualInput, setManualInput] = useState(preCase ?? "");
  const [caseResult, setCaseResult] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Auto-lookup from URL params
  useEffect(() => {
    if (preCase) lookupCase(preCase);
    else if (preCode) lookupByQrCode(preCode);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function lookupCase(idOrShort: string) {
    const val = idOrShort.trim();
    if (!val) return;
    setLoading(true); setError(null); setCaseResult(null);
    try {
      // Try as full case UUID first, then as short prefix search
      const r = await axios.get<CaseDetail>(`${API_URL}/cases/${encodeURIComponent(val)}`);
      setCaseResult(r.data);
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        setError("Case not found. Check the ID and try again.");
      } else {
        setError("Lookup failed. Please try again.");
      }
    } finally { setLoading(false); }
  }

  async function lookupByQrCode(code: string) {
    // QR codes from the cases page encode the case ID directly
    // Format: packguardian://case/{id} or just the UUID
    const uuidMatch = code.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    if (uuidMatch) {
      setManualInput(uuidMatch[1]);
      await lookupCase(uuidMatch[1]);
    } else {
      setError("QR code does not contain a valid case ID.");
    }
  }

  async function handleImageScan(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanning(true); setError(null);
    try {
      const img = new Image();
      img.onload = async () => {
        const canvas = canvasRef.current!;
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Try BarcodeDetector (Chrome/Android)
        if ("BarcodeDetector" in window) {
          try {
            type BDCtor = new (opts: { formats: string[] }) => { detect: (el: HTMLImageElement) => Promise<{ rawValue: string }[]> };
            const BD = (window as unknown as Record<string, BDCtor>).BarcodeDetector;
            const det = new BD({ formats: ["qr_code"] });
            const codes = await det.detect(img);
            if (codes.length > 0) {
              await lookupByQrCode(codes[0].rawValue);
              setScanning(false); e.target.value = ""; return;
            }
          } catch { /* fall through */ }
        }

        // jsQR fallback
        const { default: jsQR } = await import("jsqr");
        const qr = jsQR(imageData.data, imageData.width, imageData.height);
        if (qr) {
          await lookupByQrCode(qr.data);
        } else {
          setError("No QR code found in image. Try entering the case ID manually below.");
        }
      };
      img.src = URL.createObjectURL(file);
    } catch {
      setError("QR decode failed. Enter the case ID manually.");
    } finally {
      setScanning(false);
      e.target.value = "";
    }
  }

  function reset() {
    setCaseResult(null); setError(null); setManualInput("");
  }

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 pt-2">
        <button onClick={() => router.push("/mobile")} className="text-gray-400 text-2xl leading-none hover:text-gray-600 transition-colors">←</button>
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--pg-navy)" }}>Case Lookup</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--pg-text-muted)" }}>Scan a case QR code or enter an ID to check status</p>
        </div>
      </div>

      {/* Camera scan */}
      {!caseResult && (
        <label className="flex flex-col items-center gap-3 rounded-2xl py-8 cursor-pointer transition-opacity hover:opacity-90 active:opacity-80"
          style={{ background: "var(--gradient-navy)", color: "white" }}>
          <input type="file" accept="image/*" capture="environment" onChange={handleImageScan} className="hidden" />
          <span className="text-5xl">{scanning ? "⏳" : "📷"}</span>
          <span className="text-lg font-semibold">{scanning ? "Reading code…" : "Scan Case QR Code"}</span>
          <span className="text-sm opacity-70">Point at the QR code on a case report or case detail screen</span>
        </label>
      )}

      <canvas ref={canvasRef} className="hidden" />

      {/* Manual entry */}
      {!caseResult && (
        <div className="rounded-2xl p-4 space-y-3 bg-white" style={{ border: "1px solid var(--pg-border)", boxShadow: "var(--shadow-card)" }}>
          <p className="text-sm font-medium" style={{ color: "var(--pg-text)" }}>Or enter a case ID</p>
          <div className="flex gap-2">
            <input
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="Paste or type case ID…"
              className="flex-1 border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none"
              style={{ borderColor: manualInput ? "var(--pg-steel)" : undefined }}
              onKeyDown={(e) => e.key === "Enter" && lookupCase(manualInput)}
            />
            <button
              onClick={() => lookupCase(manualInput)}
              disabled={loading || !manualInput.trim()}
              className="text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{ background: "var(--gradient-navy)" }}
            >
              {loading ? "…" : "Look up"}
            </button>
          </div>
          <p className="text-xs" style={{ color: "var(--pg-text-muted)" }}>
            Find the case ID on your incident confirmation screen, in "My Follow-Ups," or by scanning the QR on a case detail page.
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.2)", color: "#b91c1c" }}>
          {error}
        </div>
      )}

      {/* Case result */}
      {caseResult && (
        <div className="space-y-3">
          {/* Case identity card */}
          <div className="rounded-2xl p-5 bg-white" style={{ border: "2px solid var(--pg-border)", boxShadow: "var(--shadow-raised)" }}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <p className="text-lg font-bold capitalize" style={{ color: "var(--pg-navy)" }}>
                  {caseResult.incident.incident_type?.replace(/_/g, " ") ?? "Incident Case"}
                </p>
                {caseResult.incident.employee_name && (
                  <p className="text-sm mt-0.5" style={{ color: "var(--pg-text-muted)" }}>
                    Involving: {caseResult.incident.employee_name}
                  </p>
                )}
                {caseResult.case.center_id && (
                  <p className="text-xs mt-0.5" style={{ color: "var(--pg-text-muted)" }}>
                    Center: {caseResult.case.center_id}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                  style={{
                    background: `${STATUS_COLOR[caseResult.case.status] ?? "#6b7280"}18`,
                    color: STATUS_COLOR[caseResult.case.status] ?? "#6b7280",
                  }}>
                  {STATUS_LABELS[caseResult.case.status] ?? caseResult.case.status}
                </span>
                <span className="text-xs font-semibold capitalize"
                  style={{ color: PRIORITY_COLOR[caseResult.case.priority] ?? "var(--pg-text-muted)" }}>
                  {caseResult.case.priority} priority
                </span>
              </div>
            </div>

            {/* OSHA flag */}
            {caseResult.incident.recordable && (
              <div className="flex items-center gap-2 rounded-lg px-3 py-2 mb-3"
                style={{ background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.25)" }}>
                <span className="text-sm">⚠️</span>
                <p className="text-xs font-semibold" style={{ color: "#92400e" }}>OSHA Review Required</p>
              </div>
            )}

            {/* Escalation */}
            {caseResult.case.escalation_level >= 1 && (
              <div className="flex items-center gap-2 rounded-lg px-3 py-2 mb-3"
                style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.2)" }}>
                <span className="text-sm">⬆</span>
                <p className="text-xs font-semibold" style={{ color: "#b91c1c" }}>
                  {ESC_LABEL[caseResult.case.escalation_level] ?? `Escalation Level ${caseResult.case.escalation_level}`}
                </p>
              </div>
            )}

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3 pt-3" style={{ borderTop: "1px solid var(--pg-border-soft)" }}>
              {[
                { label: "Open Tasks", value: `${caseResult.open_task_count}/${caseResult.task_count}` },
                { label: "Evidence", value: caseResult.evidence_count },
                { label: "Updated", value: relTime(caseResult.case.updated_at) },
              ].map(({ label, value }) => (
                <div key={label} className="text-center">
                  <p className="text-base font-bold tabular-nums" style={{ color: "var(--pg-navy)" }}>{value}</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--pg-text-muted)" }}>{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Incident description excerpt */}
          {caseResult.incident.description && (
            <div className="rounded-xl px-4 py-3" style={{ background: "var(--pg-surface)", border: "1px solid var(--pg-border-soft)" }}>
              <p className="text-xs font-semibold mb-1" style={{ color: "var(--pg-text-muted)" }}>Incident description</p>
              <p className="text-sm leading-relaxed italic" style={{ color: "var(--pg-text-sub)" }}>
                &ldquo;{caseResult.incident.description.slice(0, 300)}{caseResult.incident.description.length > 300 ? "…" : ""}&rdquo;
              </p>
            </div>
          )}

          {/* Actions */}
          <Link href="/cases"
            className="flex items-center justify-between w-full rounded-xl px-5 py-4 text-white font-semibold text-sm transition-opacity hover:opacity-90"
            style={{ background: "var(--gradient-navy)" }}>
            <span>View Full Case &amp; Details</span>
            <span>›</span>
          </Link>

          <button onClick={reset}
            className="w-full text-sm py-2.5 rounded-xl border transition-colors hover:bg-gray-50"
            style={{ color: "var(--pg-text-muted)", borderColor: "var(--pg-border)" }}>
            Look up a different case
          </button>
        </div>
      )}

      {/* Explainer when empty */}
      {!caseResult && !error && !loading && (
        <div className="rounded-2xl p-4 space-y-4" style={{ background: "var(--pg-surface)", border: "1px solid var(--pg-border-soft)" }}>
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--pg-text-muted)" }}>
            How case QR codes work
          </p>
          {[
            { icon: "📋", title: "Every case has a QR code", detail: "Open any case in Case Management and tap the QR icon to display it" },
            { icon: "📷", title: "Scan to instantly check status", detail: "Scan the QR with this page to see current status, priority, tasks, and OSHA flag" },
            { icon: "🔗", title: "Share with team members", detail: "Screenshot the QR code and share it — anyone with access can scan it to track the case" },
          ].map(({ icon, title, detail }) => (
            <div key={title} className="flex items-start gap-3">
              <span className="text-2xl flex-shrink-0">{icon}</span>
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--pg-text)" }}>{title}</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--pg-text-muted)" }}>{detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ScanPage() {
  return (
    <Suspense>
      <ScanContent />
    </Suspense>
  );
}
