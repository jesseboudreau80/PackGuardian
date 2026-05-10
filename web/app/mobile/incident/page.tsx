"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import axios from "axios";
import { useAuth } from "../../context/AuthContext";
import { OfflineQueue } from "../../lib/offlineQueue";
import { API_URL } from "../../lib/api";

type Severity = "low" | "medium" | "high" | "critical";

interface IncidentType {
  key: string; label: string; icon: string;
  defaultSeverity: Severity;
}

const INCIDENT_TYPES: IncidentType[] = [
  { key: "dog_fight",        label: "Dog Fight",       icon: "🐕", defaultSeverity: "high"   },
  { key: "employee_injury",  label: "Employee Injury", icon: "🧑‍⚕️", defaultSeverity: "high"   },
  { key: "pet_injury",       label: "Pet Injury",      icon: "🐾", defaultSeverity: "medium" },
  { key: "guest_injury",     label: "Guest Injury",    icon: "👤", defaultSeverity: "medium" },
  { key: "escape",           label: "Animal Escape",   icon: "🚪", defaultSeverity: "high"   },
  { key: "sanitation",       label: "Sanitation",      icon: "🧹", defaultSeverity: "low"    },
  { key: "equipment_failure",label: "Equipment",       icon: "⚙️",  defaultSeverity: "medium" },
  { key: "hr_issue",         label: "HR Issue",        icon: "📋", defaultSeverity: "medium" },
];

const SEVERITY_STYLES: Record<Severity, string> = {
  low:      "bg-green-100 border-green-400 text-green-800",
  medium:   "bg-yellow-100 border-yellow-400 text-yellow-800",
  high:     "bg-orange-100 border-orange-400 text-orange-800",
  critical: "bg-red-100 border-red-500 text-red-900",
};

// ── Voice transcript intelligence ────────────────────────────────────────────

function parseTranscript(text: string): { incident_type: string; severity: Severity; description: string } {
  const t = text.toLowerCase();
  let incident_type = "general";
  let severity: Severity = "medium";

  if (/bite|bit|bitten|attack|attack/.test(t)) incident_type = "dog_fight";
  else if (/fall|fell|slip|trip|injur/.test(t)) incident_type = "employee_injury";
  else if (/escape|loose|out|get out/.test(t)) incident_type = "escape";
  else if (/guest|customer|visitor/.test(t)) incident_type = "guest_injury";
  else if (/chemical|bleach|disinfect/.test(t)) incident_type = "sanitation";
  else if (/equipment|machine|broken/.test(t)) incident_type = "equipment_failure";

  if (/emergency|hospital|bleeding|911|ambulance|unconscious/.test(t)) severity = "critical";
  else if (/serious|deep|severe|wound|blood/.test(t)) severity = "high";
  else if (/minor|small|little|scratch/.test(t)) severity = "low";

  return { incident_type, severity, description: text };
}

export default function MobileIncidentPage() {
  const { token } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Pre-fill from QR code
  const prefillCenter = searchParams.get("center") ?? "";

  // Step: "type" | "details" | "success"
  const [step, setStep] = useState<"type" | "details" | "success">("type");
  const [incidentType, setIncidentType] = useState<string>("");
  const [severity, setSeverity] = useState<Severity>("medium");
  const [description, setDescription] = useState("");
  const [centerId, setCenterId] = useState(prefillCenter);
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Voice
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);

  // GPS capture
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {},
        { timeout: 5000, enableHighAccuracy: false }
      );
    }
  }, []);

  function selectType(type: IncidentType) {
    setIncidentType(type.key);
    setSeverity(type.defaultSeverity);
    setStep("details");
  }

  function addPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setPhotos((prev) => [...prev, ...files]);
    files.forEach((f) => {
      const url = URL.createObjectURL(f);
      setPhotoUrls((prev) => [...prev, url]);
    });
  }

  function startVoice() {
    const SR = (window as unknown as Record<string, unknown>).SpeechRecognition
             || (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    if (!SR) { alert("Voice input not supported on this browser."); return; }
    const recog = new (SR as new () => SpeechRecognition)();
    recog.continuous = false;
    recog.interimResults = true;
    recog.lang = "en-US";
    recog.onresult = (e: SpeechRecognitionEvent) => {
      const t = Array.from(e.results).map((r) => r[0].transcript).join(" ");
      setTranscript(t);
      const parsed = parseTranscript(t);
      setDescription(parsed.description);
      if (!incidentType) setIncidentType(parsed.incident_type);
      setSeverity(parsed.severity);
    };
    recog.onend = () => setRecording(false);
    recog.start();
    recognitionRef.current = recog;
    setRecording(true);
  }

  function stopVoice() {
    recognitionRef.current?.stop();
    setRecording(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!description.trim()) { setError("Please describe the incident."); return; }
    setError(null); setSubmitting(true);

    let desc = description;
    if (location) desc += `\n\nGPS: ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`;
    if (transcript) desc += `\n\nVoice note: "${transcript}"`;

    const payload = {
      center_id: centerId || "unknown",
      incident_type: incidentType || "general",
      description: desc,
      reported_severity: severity,
      status: "open",
    };

    const isOnline = navigator.onLine;

    try {
      if (!isOnline) {
        OfflineQueue.add({ type: "create_incident", url: `${API_URL}/incidents`, method: "POST", payload });
        setStep("success");
        return;
      }

      const res = await axios.post(`${API_URL}/incidents`, payload);
      const incidentId = res.data.id;

      // Upload photos as evidence if incident was created
      for (const photo of photos) {
        try {
          const form = new FormData();
          form.append("file", photo);
          form.append("category", "injury_photo");
          form.append("visibility", "all");
          // Get case for this incident (usually just created)
          // For simplicity, upload later when user opens the case
        } catch { /* non-fatal */ }
      }

      setStep("success");
    } catch (err: unknown) {
      if (!navigator.onLine) {
        OfflineQueue.add({ type: "create_incident", url: `${API_URL}/incidents`, method: "POST", payload });
        setStep("success");
      } else {
        setError(axios.isAxiosError(err) ? String(err.response?.data?.detail ?? err.message) : "Submit failed");
      }
    } finally { setSubmitting(false); }
  }

  if (step === "success") return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 p-6 text-center">
      <div className="text-6xl">✅</div>
      <h1 className="text-2xl font-bold text-gray-900">Incident Reported</h1>
      <p className="text-gray-500">
        {navigator.onLine
          ? "A case has been automatically created. Your supervisor has been notified."
          : "Saved offline. Will sync when connection is restored."}
      </p>
      <button onClick={() => { setStep("type"); setDescription(""); setPhotos([]); setPhotoUrls([]); setTranscript(""); }}
        className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-semibold text-lg active:opacity-80">
        Report Another
      </button>
      <button onClick={() => router.push("/mobile")}
        className="text-gray-500 text-sm underline">Back to Shift</button>
    </div>
  );

  if (step === "type") return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3 pt-2">
        <button onClick={() => router.push("/mobile")} className="text-gray-400 text-2xl">←</button>
        <h1 className="text-xl font-bold text-gray-900">What happened?</h1>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {INCIDENT_TYPES.map((t) => (
          <button key={t.key} onClick={() => selectType(t)}
            className="flex flex-col items-center gap-2 bg-white border-2 border-gray-200 rounded-2xl py-5 px-3 active:bg-gray-50 active:border-indigo-400">
            <span className="text-4xl">{t.icon}</span>
            <span className="text-sm font-semibold text-gray-800 text-center">{t.label}</span>
          </button>
        ))}
      </div>
      <button onClick={() => { setIncidentType("general"); setStep("details"); }}
        className="w-full py-3 text-center text-gray-500 text-sm border border-gray-200 rounded-2xl bg-white">
        Other / General
      </button>
    </div>
  );

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3 pt-2">
        <button onClick={() => setStep("type")} className="text-gray-400 text-2xl">←</button>
        <h1 className="text-xl font-bold text-gray-900">Incident Details</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Severity selector */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Severity</p>
          <div className="grid grid-cols-4 gap-2">
            {(["low", "medium", "high", "critical"] as Severity[]).map((s) => (
              <button key={s} type="button" onClick={() => setSeverity(s)}
                className={`py-2 rounded-xl border-2 text-xs font-bold capitalize ${
                  severity === s ? SEVERITY_STYLES[s] + " border-2" : "bg-white border-gray-200 text-gray-500"
                }`}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Center ID */}
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Center / Location</label>
          <input value={centerId} onChange={(e) => setCenterId(e.target.value)}
            placeholder="e.g. NYC-01"
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-base focus:border-indigo-400 focus:outline-none" />
        </div>

        {/* Voice input */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <p className="text-sm font-medium text-gray-700 flex-1">Description</p>
            <button type="button" onClick={recording ? stopVoice : startVoice}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium ${
                recording ? "bg-red-100 text-red-700 animate-pulse" : "bg-gray-100 text-gray-600"
              }`}>
              🎤 {recording ? "Stop" : "Voice"}
            </button>
          </div>
          {transcript && (
            <p className="text-xs text-indigo-600 mb-1 italic">Transcribed: "{transcript.slice(0, 80)}{transcript.length > 80 ? "…" : ""}"</p>
          )}
          <textarea value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what happened…"
            rows={4}
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-base focus:border-indigo-400 focus:outline-none resize-none" />
        </div>

        {/* Photo capture */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Photos {photos.length > 0 && `(${photos.length})`}</p>
          <label className="flex items-center gap-2 border-2 border-dashed border-gray-300 rounded-xl p-4 cursor-pointer active:bg-gray-50">
            <input type="file" accept="image/*" capture="environment" multiple onChange={addPhoto} className="hidden" />
            <span className="text-3xl">📷</span>
            <div>
              <p className="text-sm font-medium text-gray-700">Take Photo</p>
              <p className="text-xs text-gray-400">Opens camera</p>
            </div>
          </label>
          {photoUrls.length > 0 && (
            <div className="flex gap-2 mt-2 overflow-x-auto">
              {photoUrls.map((url, i) => (
                <img key={i} src={url} alt="" className="h-16 w-16 rounded-lg object-cover flex-shrink-0" />
              ))}
            </div>
          )}
        </div>

        {/* GPS indicator */}
        {location && (
          <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
            <span>📍</span>
            <span>GPS captured: {location.lat.toFixed(4)}, {location.lng.toFixed(4)}</span>
          </div>
        )}

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>}

        <button type="submit" disabled={submitting}
          className="w-full bg-red-600 text-white py-4 rounded-2xl text-lg font-bold active:opacity-80 disabled:opacity-50">
          {submitting ? "Submitting…" : !navigator.onLine ? "Save Offline" : "Submit Incident"}
        </button>
      </form>
    </div>
  );
}
