"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import axios from "axios";
import { API_URL } from "../../lib/api";

interface QRTarget {
  id: string;
  code: string;
  target_type: string;
  target_name: string;
  center_code: string | null;
  target_metadata: Record<string, unknown> | null;
  scan_url: string;
}

const TYPE_ACTIONS: Record<string, { label: string; icon: string; href: (code: QRTarget) => string }[]> = {
  center: [
    { label: "Report Incident", icon: "⚠️", href: (q) => `/mobile/incident?center=${q.center_code ?? q.target_name}` },
    { label: "Start Inspection", icon: "✅", href: (q) => `/mobile/inspect?center=${q.center_code ?? ""}` },
    { label: "View Risk Map",    icon: "🗺️", href: () => "/map" },
  ],
  room: [
    { label: "Report Issue",    icon: "⚠️", href: (q) => `/mobile/incident?center=${q.center_code ?? ""}` },
    { label: "Inspect Room",    icon: "✅", href: (q) => `/mobile/inspect?center=${q.center_code ?? ""}` },
  ],
  kennel: [
    { label: "Animal Incident", icon: "🐕", href: (q) => `/mobile/incident?center=${q.center_code ?? ""}` },
    { label: "Kennel Inspection", icon: "✅", href: (q) => `/mobile/inspect?center=${q.center_code ?? ""}` },
  ],
  equipment: [
    { label: "Equipment Issue", icon: "⚙️",  href: (q) => `/mobile/incident?center=${q.center_code ?? ""}` },
    { label: "Equipment Inspection", icon: "✅", href: (q) => `/mobile/inspect?center=${q.center_code ?? ""}` },
  ],
  inspection_zone: [
    { label: "Start Inspection", icon: "✅", href: (q) => `/mobile/inspect?center=${q.center_code ?? ""}` },
    { label: "Report Hazard", icon: "⚠️", href: (q) => `/mobile/incident?center=${q.center_code ?? ""}` },
  ],
  general: [
    { label: "Report Incident", icon: "⚠️", href: (q) => `/mobile/incident?center=${q.center_code ?? ""}` },
    { label: "Start Inspection", icon: "✅", href: (q) => `/mobile/inspect?center=${q.center_code ?? ""}` },
  ],
};

export default function ScanPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preCode = searchParams.get("code");

  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState(preCode ?? "");
  const [result, setResult] = useState<QRTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Auto-lookup if code is in URL (from QR scan that navigated here)
  useEffect(() => {
    if (preCode) lookupCode(preCode);
  }, [preCode]); // eslint-disable-line react-hooks/exhaustive-deps

  async function lookupCode(code: string) {
    if (!code.trim()) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await axios.get<QRTarget>(`${API_URL}/qr/lookup/${code.trim().toUpperCase()}`);
      setResult(r.data);
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) && err.response?.status === 404
        ? "QR code not found. It may belong to a different tenant."
        : "Lookup failed. Please try again.");
    } finally { setLoading(false); }
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
            const det = new (window as unknown as Record<string, unknown>)
              .BarcodeDetector({ formats: ["qr_code"] }) as { detect: (el: HTMLImageElement) => Promise<{ rawValue: string }[]> };
            const codes = await det.detect(img);
            if (codes.length > 0) {
              const raw = codes[0].rawValue;
              // Extract code from URL or use directly
              const match = raw.match(/[?&]code=([A-Z0-9-]+)/i);
              const code = match ? match[1] : raw;
              setManualCode(code);
              await lookupCode(code);
              return;
            }
          } catch { /* fall through to jsQR */ }
        }

        // jsQR fallback
        try {
          const { default: jsQR } = await import("jsqr");
          const qr = jsQR(imageData.data, imageData.width, imageData.height);
          if (qr) {
            const match = qr.data.match(/[?&]code=([A-Z0-9-]+)/i);
            const code = match ? match[1] : qr.data;
            setManualCode(code);
            await lookupCode(code);
          } else {
            setError("No QR code found in image. Try a clearer photo.");
          }
        } catch {
          setError("QR decode failed. Enter the code manually.");
        }
      };
      img.src = URL.createObjectURL(file);
    } finally {
      setScanning(false);
      e.target.value = "";
    }
  }

  const actions = result ? (TYPE_ACTIONS[result.target_type] ?? TYPE_ACTIONS.general) : [];

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3 pt-2">
        <button onClick={() => router.push("/mobile")} className="text-gray-400 text-2xl">←</button>
        <h1 className="text-xl font-bold text-gray-900">Scan QR Code</h1>
      </div>

      {/* Camera scan button */}
      <label className="flex flex-col items-center gap-3 bg-indigo-600 text-white rounded-3xl py-8 cursor-pointer active:opacity-80">
        <input type="file" accept="image/*" capture="environment" onChange={handleImageScan} className="hidden" />
        <span className="text-5xl">{scanning ? "⏳" : "📷"}</span>
        <span className="text-lg font-semibold">{scanning ? "Scanning…" : "Open Camera to Scan"}</span>
        <span className="text-sm opacity-75">Point camera at QR code</span>
      </label>

      {/* Hidden canvas for jsQR */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Manual code entry */}
      <div className="bg-white border-2 border-gray-200 rounded-2xl p-4 space-y-3">
        <p className="text-sm font-medium text-gray-700">Or enter code manually</p>
        <div className="flex gap-2">
          <input value={manualCode} onChange={(e) => setManualCode(e.target.value.toUpperCase())}
            placeholder="e.g. PG-A1B2C3"
            className="flex-1 border-2 border-gray-200 rounded-xl px-4 py-2.5 text-base font-mono focus:border-indigo-400 focus:outline-none" />
          <button onClick={() => lookupCode(manualCode)} disabled={loading}
            className="bg-indigo-600 text-white px-4 py-2.5 rounded-xl font-semibold disabled:opacity-50">
            {loading ? "…" : "Go"}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl px-4 py-3 text-sm">{error}</div>
      )}

      {/* QR result + actions */}
      {result && (
        <div className="space-y-3">
          <div className="bg-white border-2 border-indigo-200 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <span className="text-3xl">📍</span>
              <div>
                <p className="font-bold text-gray-900 text-lg">{result.target_name}</p>
                <p className="text-sm text-gray-500 capitalize">{result.target_type.replace(/_/g," ")}</p>
                {result.center_code && (
                  <p className="text-xs text-gray-400 mt-0.5">Center: {result.center_code}</p>
                )}
                {result.target_metadata && Object.keys(result.target_metadata).length > 0 && (
                  <p className="text-xs text-gray-400">
                    {Object.entries(result.target_metadata).map(([k,v]) => `${k}: ${v}`).join(" · ")}
                  </p>
                )}
              </div>
            </div>
          </div>

          <p className="text-sm font-semibold text-gray-600">What would you like to do?</p>
          <div className="space-y-2">
            {actions.map((action) => (
              <button key={action.label}
                onClick={() => router.push(action.href(result))}
                className="w-full flex items-center gap-4 bg-white border-2 border-gray-200 rounded-2xl px-5 py-4 text-left active:bg-gray-50 active:border-indigo-300">
                <span className="text-3xl">{action.icon}</span>
                <span className="text-base font-semibold text-gray-800">{action.label}</span>
                <span className="ml-auto text-gray-400 text-lg">›</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
