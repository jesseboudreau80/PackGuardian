"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import axios from "axios";
import { useAuth } from "../../context/AuthContext";
import { OfflineQueue } from "../../lib/offlineQueue";
import { API_URL } from "../../lib/api";

type Severity = "low" | "medium" | "high" | "critical";
type Step = "type" | "questions" | "details" | "success";

interface IncidentType {
  key: string; label: string; icon: string;
  defaultSeverity: Severity; hint: string;
}

interface ExtractResult {
  incident_type: string;
  severity: string;
  confidence: number;
  extracted_fields: Record<string, string>;
  missing_fields: string[];
  follow_up_prompts: string[];
  osha_flag: boolean;
  osha_reason: string | null;
  summary: string;
  engine: string;
}

// ── Incident type catalogue ───────────────────────────────────────────────────

const INCIDENT_TYPES: IncidentType[] = [
  { key: "dog_bite",            label: "Dog Bite",           icon: "🐕", defaultSeverity: "high",   hint: "A dog bit a person or another animal" },
  { key: "dog_fight",           label: "Dog Fight",          icon: "🐾", defaultSeverity: "high",   hint: "Dogs involved in an altercation" },
  { key: "employee_injury",     label: "Team Member Injury", icon: "🧑‍⚕️", defaultSeverity: "high",   hint: "A staff member was hurt on the job" },
  { key: "slip_fall",           label: "Slip / Fall",        icon: "🌊", defaultSeverity: "medium", hint: "Person slipped, tripped, or fell" },
  { key: "chemical",            label: "Chemical Exposure",  icon: "🧪", defaultSeverity: "high",   hint: "Contact with cleaning products or chemicals" },
  { key: "grooming",            label: "Grooming Incident",  icon: "✂️",  defaultSeverity: "medium", hint: "Injury or issue during grooming services" },
  { key: "escape",              label: "Animal Escape",      icon: "🚪", defaultSeverity: "high",   hint: "Animal got loose or escaped the facility" },
  { key: "aggressive_behavior", label: "Aggressive Behavior",icon: "⚠️", defaultSeverity: "medium", hint: "Lunging, snapping, or growling — no bite" },
  { key: "near_miss",           label: "Near Miss",          icon: "⚡",  defaultSeverity: "medium", hint: "A close call — no injury, but could have been" },
  { key: "facility_damage",     label: "Facility Damage",    icon: "🏚️",  defaultSeverity: "medium", hint: "Structural, flooding, equipment, or property damage" },
  { key: "guest_injury",        label: "Guest Injury",       icon: "👤", defaultSeverity: "medium", hint: "A client or visitor was hurt" },
  { key: "hr_issue",            label: "HR / Conduct",       icon: "📋", defaultSeverity: "medium", hint: "Workplace conduct or policy concern" },
];

const SEVERITY_STYLES: Record<Severity, string> = {
  low:      "bg-green-100 border-green-400 text-green-800",
  medium:   "bg-yellow-100 border-yellow-400 text-yellow-800",
  high:     "bg-orange-100 border-orange-400 text-orange-800",
  critical: "bg-red-100 border-red-500 text-red-900",
};

// ── Follow-up question catalogue ──────────────────────────────────────────────

interface QuestionOption { value: string; label: string; icon?: string }
interface FollowUpQuestion {
  id: string;
  prompt: string;
  subtext?: string;
  type: "bool" | "choice";
  options?: QuestionOption[];
  apiField?: string;
}

type Answers = Record<string, string>;

const QUESTIONS: Record<string, FollowUpQuestion[]> = {
  dog_bite: [
    { id: "skin_broken",   prompt: "Was the skin broken?",             subtext: "Puncture, laceration, or bleeding",  type: "bool" },
    { id: "who_injured",   prompt: "Who was injured?",                 type: "choice", options: [
        { value: "employee", label: "Team member", icon: "🧑‍⚕️" },
        { value: "guest",    label: "Guest / visitor", icon: "👤" },
        { value: "dog_only", label: "Dog only", icon: "🐕" },
    ]},
    { id: "treatment_type", prompt: "Medical treatment needed?",       type: "choice", apiField: "treatment_type", options: [
        { value: "none",           label: "No treatment", icon: "✓" },
        { value: "first_aid",      label: "First aid only", icon: "🩹" },
        { value: "medical",        label: "Clinic / urgent care", icon: "🏥" },
        { value: "emergency_room", label: "Emergency room", icon: "🚑" },
    ]},
    { id: "dog_separated", prompt: "Was the dog separated and secured?",                                             type: "bool" },
    { id: "witnesses",     prompt: "Were witnesses present?",                                                         type: "bool" },
    { id: "trigger_known", prompt: "Is the trigger for the bite known?", subtext: "e.g. resource guarding, fear, pain", type: "bool" },
  ],

  dog_fight: [
    { id: "injuries_to_people", prompt: "Were any people injured while intervening?",                                 type: "bool" },
    { id: "dogs_separated",     prompt: "Were both dogs separated and secured?",                                      type: "bool" },
    { id: "vet_needed",         prompt: "Does any animal require veterinary care?",                                   type: "bool" },
    { id: "prior_history",      prompt: "Is there a known history of aggression with either dog?",                    type: "bool" },
    { id: "punctures_present",  prompt: "Were puncture wounds found on either dog?",                                  type: "bool" },
    { id: "redirected_aggression", prompt: "Did either dog redirect aggression toward a person?",                     type: "bool" },
  ],

  employee_injury: [
    { id: "body_part",      prompt: "Which body part was affected?",    type: "choice", apiField: "body_part", options: [
        { value: "back",         label: "Back / spine", icon: "🔙" },
        { value: "hand_finger",  label: "Hand / finger", icon: "✋" },
        { value: "arm_shoulder", label: "Arm / shoulder", icon: "💪" },
        { value: "leg_knee",     label: "Leg / knee", icon: "🦵" },
        { value: "head_neck",    label: "Head / neck", icon: "🧠" },
        { value: "other",        label: "Other area", icon: "•" },
    ]},
    { id: "treatment_type", prompt: "What treatment was needed?",       type: "choice", apiField: "treatment_type", options: [
        { value: "first_aid",      label: "First aid only", icon: "🩹" },
        { value: "medical",        label: "Clinic / urgent care", icon: "🏥" },
        { value: "emergency_room", label: "Emergency room", icon: "🚑" },
        { value: "hospitalization",label: "Hospital admission", icon: "🏨" },
    ]},
    { id: "restricted_duty", prompt: "Will this result in restricted or lost work time?",                             type: "bool" },
    { id: "supervisor_notified", prompt: "Has a supervisor been notified?",                                           type: "bool" },
    { id: "ems_involved",   prompt: "Was EMS (ambulance) called?",                                                    type: "bool" },
    { id: "witnesses",      prompt: "Were coworkers present who witnessed this?",                                      type: "bool" },
  ],

  slip_fall: [
    { id: "surface",        prompt: "What caused the fall?",            type: "choice", options: [
        { value: "wet_floor",      label: "Wet / slippery floor", icon: "💧" },
        { value: "obstacle",       label: "Object / obstacle", icon: "📦" },
        { value: "uneven_surface", label: "Uneven or damaged surface", icon: "⚠️" },
        { value: "other",          label: "Other cause", icon: "•" },
    ]},
    { id: "body_part",      prompt: "Where is the injury?",             type: "choice", apiField: "body_part", options: [
        { value: "back",         label: "Back / spine", icon: "🔙" },
        { value: "hand_finger",  label: "Hand / wrist", icon: "✋" },
        { value: "leg_knee",     label: "Leg / knee", icon: "🦵" },
        { value: "head_neck",    label: "Head / neck", icon: "🧠" },
        { value: "other",        label: "Other", icon: "•" },
    ]},
    { id: "treatment_type", prompt: "Medical attention needed?",        type: "choice", apiField: "treatment_type", options: [
        { value: "none",           label: "No treatment", icon: "✓" },
        { value: "first_aid",      label: "First aid only", icon: "🩹" },
        { value: "medical",        label: "Clinic / urgent care", icon: "🏥" },
        { value: "emergency_room", label: "Emergency room", icon: "🚑" },
    ]},
    { id: "restricted_duty", prompt: "Will this affect their work duties?",                                           type: "bool" },
  ],

  chemical: [
    { id: "sds_reviewed",   prompt: "Was the SDS (Safety Data Sheet) reviewed?", subtext: "Located at the SDS station near cleaning supplies", type: "bool" },
    { id: "ppe_worn",       prompt: "Was appropriate PPE in use?",     subtext: "Gloves, goggles, apron",             type: "bool" },
    { id: "exposure_type",  prompt: "What type of exposure occurred?", type: "choice", options: [
        { value: "skin",     label: "Skin contact", icon: "🤚" },
        { value: "eyes",     label: "Eye contact", icon: "👁️" },
        { value: "inhaled",  label: "Inhaled / vapors", icon: "💨" },
        { value: "ingested", label: "Ingested", icon: "⚠️" },
    ]},
    { id: "treatment_type", prompt: "Was any treatment needed?",       type: "choice", apiField: "treatment_type", options: [
        { value: "none",           label: "No treatment", icon: "✓" },
        { value: "first_aid",      label: "Eye / skin flush only", icon: "🚿" },
        { value: "medical",        label: "Clinic / urgent care", icon: "🏥" },
        { value: "emergency_room", label: "Emergency room", icon: "🚑" },
    ]},
  ],

  grooming: [
    { id: "injury_occurred", prompt: "Was anyone (person or pet) injured?",                                           type: "bool" },
    { id: "who_injured",     prompt: "Who was injured?",                type: "choice", options: [
        { value: "employee", label: "Groomer / team member", icon: "🧑‍⚕️" },
        { value: "pet",      label: "Pet / animal", icon: "🐾" },
        { value: "guest",    label: "Pet owner / guest", icon: "👤" },
    ]},
    { id: "treatment_type", prompt: "Medical treatment needed?",        type: "choice", apiField: "treatment_type", options: [
        { value: "none",           label: "No treatment", icon: "✓" },
        { value: "first_aid",      label: "First aid only", icon: "🩹" },
        { value: "medical",        label: "Clinic / urgent care", icon: "🏥" },
        { value: "emergency_room", label: "Emergency room", icon: "🚑" },
    ]},
    { id: "equipment_involved", prompt: "Was equipment involved in the incident?", subtext: "Dryer, table, scissors, clippers", type: "bool" },
  ],

  escape: [
    { id: "recovered",       prompt: "Has the animal been recovered?",                                                type: "bool" },
    { id: "public_area",     prompt: "Did the animal reach a public or street area?",                                 type: "bool" },
    { id: "owner_notified",  prompt: "Has the owner been contacted?",                                                 type: "bool" },
  ],

  aggressive_behavior: [
    { id: "dog_separated",     prompt: "Was the dog separated from others?",                                          type: "bool" },
    { id: "injuries_to_people", prompt: "Was anyone injured — even slightly?",                                        type: "bool" },
    { id: "prior_history",     prompt: "Is this animal known to have shown aggression before?",                       type: "bool" },
    { id: "isolation_required", prompt: "Is the animal currently in isolation?",                                      type: "bool" },
  ],

  near_miss: [
    { id: "hazard_type",     prompt: "What type of hazard caused the near miss?", type: "choice", options: [
        { value: "animal",     label: "Animal behavior", icon: "🐕" },
        { value: "surface",    label: "Floor / surface hazard", icon: "💧" },
        { value: "equipment",  label: "Equipment / tool", icon: "⚙️" },
        { value: "chemical",   label: "Chemical / substance", icon: "🧪" },
        { value: "other",      label: "Other", icon: "•" },
    ]},
    { id: "workers_exposed",   prompt: "Were other team members exposed to the same hazard?",                         type: "bool" },
    { id: "corrective_taken",  prompt: "Has corrective action been taken to eliminate the hazard?",                   type: "bool" },
  ],

  facility_damage: [
    { id: "injury_occurred",  prompt: "Was anyone injured as a result?",                                              type: "bool" },
    { id: "area_isolated",    prompt: "Has the affected area been closed off or isolated?",                           type: "bool" },
    { id: "cause_identified", prompt: "Has the cause of the damage been identified?",                                 type: "bool" },
  ],
};

// ── OSHA recordability evaluation (client-side preview) ────────────────────────

const OSHA_RECORDABLE_TREATMENTS = new Set(["medical", "emergency_room", "hospitalization"]);

function evaluateOshaFlag(incidentType: string, answers: Answers): { flag: boolean; reason: string } | null {
  const employeeTypes = new Set(["employee_injury", "slip_fall", "chemical", "dog_bite", "grooming"]);
  if (!employeeTypes.has(incidentType)) return null;

  // Only flag for employee injuries (not guest, not dog-only)
  const whoInjured = answers["who_injured"];
  if (whoInjured && whoInjured !== "employee") return null;

  const treatment = answers["treatment_type"];
  if (treatment && OSHA_RECORDABLE_TREATMENTS.has(treatment)) {
    const labels: Record<string, string> = {
      medical: "clinic/urgent care",
      emergency_room: "emergency room",
      hospitalization: "hospital admission",
    };
    return { flag: true, reason: `Medical treatment beyond first aid (${labels[treatment] ?? treatment}) is an OSHA recordability criterion.` };
  }
  if (answers["restricted_duty"] === "yes") {
    return { flag: true, reason: "Restricted work duty is an OSHA recordability criterion." };
  }
  if (answers["ems_involved"] === "yes") {
    return { flag: true, reason: "EMS involvement typically indicates recordable severity." };
  }
  return { flag: false, reason: "" };
}

// ── Intake form component ─────────────────────────────────────────────────────

function MobileIncidentForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillCenter = searchParams.get("center") ?? "";

  const LAST_CENTER_KEY = "pg_last_center";

  const [step, setStep] = useState<Step>("type");
  const [incidentType, setIncidentType] = useState<string>("");
  const [severity, setSeverity] = useState<Severity>("medium");
  const [answers, setAnswers] = useState<Answers>({});
  const [description, setDescription] = useState("");
  const [centerId, setCenterId] = useState(() => {
    if (prefillCenter) return prefillCenter;
    try { return localStorage.getItem(LAST_CENTER_KEY) ?? ""; } catch { return ""; }
  });
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedIncidentId, setSubmittedIncidentId] = useState<string | null>(null);

  // Reporting context
  const [reportingFor, setReportingFor] = useState<"self" | "other">("self");
  const [subjectName, setSubjectName] = useState("");

  // "Other" free-text for choice questions
  const [otherTexts, setOtherTexts] = useState<Record<string, string>>({});

  // Voice + AI extraction
  const [voiceSupported, setVoiceSupported] = useState(true); // optimistic; checked on mount
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const transcriptRef = useRef(""); // mirrors state — readable inside speech callbacks
  const [extracting, setExtracting] = useState(false);
  const [extraction, setExtraction] = useState<ExtractResult | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [photoUploadStatus, setPhotoUploadStatus] = useState<"idle" | "uploading" | "done" | "partial">("idle");

  // Check voice input support on mount (client-side only)
  useEffect(() => {
    const supported = typeof window !== "undefined" &&
      ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
    setVoiceSupported(supported);
  }, []);

  // GPS
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {},
        { timeout: 5000, enableHighAccuracy: false }
      );
    }
  }, []);

  // OSHA flag (computed from answers)
  const oshaEval = incidentType ? evaluateOshaFlag(incidentType, answers) : null;

  function selectType(t: IncidentType) {
    setIncidentType(t.key);
    setSeverity(t.defaultSeverity);
    setAnswers({});
    setOtherTexts({});
    setExtraction(null);
    const hasQuestions = (QUESTIONS[t.key] ?? []).length > 0;
    setStep(hasQuestions ? "questions" : "details");
  }

  function setAnswer(qId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [qId]: value }));
    // Severity auto-escalation
    if (qId === "treatment_type") {
      if (["emergency_room", "hospitalization"].includes(value)) setSeverity("critical");
      else if (value === "medical" && (severity === "low" || severity === "medium")) setSeverity("high");
    }
    if (qId === "ems_involved" && value === "yes") setSeverity("critical");
  }

  async function runAiExtraction(text: string) {
    if (!text.trim() || text.length < 15) return;
    setExtracting(true);
    try {
      const res = await axios.post<ExtractResult>(`${API_URL}/ai/extract`, {
        text,
        hint_type: incidentType || null,
      });
      const r = res.data;
      setExtraction(r);

      // Pre-fill answers from AI extraction (only if not already answered)
      setAnswers((prev) => {
        const merged = { ...prev };
        for (const [k, v] of Object.entries(r.extracted_fields)) {
          if (!merged[k] && v && v !== "null") merged[k] = v;
        }
        return merged;
      });

      // Update type and severity if AI is confident and they differ
      if (r.confidence >= 0.65 && !incidentType && r.incident_type !== "general") {
        setIncidentType(r.incident_type);
      }
      if (r.confidence >= 0.75 && r.severity) {
        setSeverity(r.severity as Severity);
      }
    } catch {
      // Non-fatal — extraction is best-effort
    } finally {
      setExtracting(false);
    }
  }

  function startVoice() {
    const SR = (window as unknown as Record<string, unknown>).SpeechRecognition
             || (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    if (!SR) { alert("Voice input not supported on this browser."); return; }
    type RecogCtor = new () => SpeechRecognition;
    const recog = new (SR as RecogCtor)();
    recog.continuous = false;
    recog.interimResults = true;
    recog.lang = "en-US";
    recog.onresult = (e: SpeechRecognitionEvent) => {
      const t = Array.from(e.results).map((r) => r[0].transcript).join(" ");
      transcriptRef.current = t;
      setTranscript(t);
      setDescription(t);
    };
    recog.onend = () => {
      setRecording(false);
      // Read from ref — React state is stale inside this callback
      const captured = transcriptRef.current;
      if (captured.length >= 15) runAiExtraction(captured);
    };
    recog.start();
    recognitionRef.current = recog;
    setRecording(true);
  }

  function stopVoice() {
    recognitionRef.current?.stop();
    setRecording(false);
  }

  function addPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setPhotos((prev) => [...prev, ...files]);
    files.forEach((f) => setPhotoUrls((prev) => [...prev, URL.createObjectURL(f)]));
  }

  async function compressImage(file: File, maxPx = 1920, quality = 0.72): Promise<Blob> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", quality);
      };
      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    });
  }

  function buildPayload() {
    const qs = QUESTIONS[incidentType] ?? [];
    const lines = qs
      .filter((q) => answers[q.id] && !q.apiField)
      .map((q) => {
        const opt = q.options?.find((o) => o.value === answers[q.id]);
        const label = opt ? opt.label : answers[q.id] === "yes" ? "Yes" : "No";
        const extra = answers[q.id] === "other" && otherTexts[q.id] ? ` — ${otherTexts[q.id]}` : "";
        return `• ${q.prompt} → ${label}${extra}`;
      });

    let desc = description;
    if (reportingFor === "other" && subjectName) {
      desc = `Reported on behalf of: ${subjectName}\n\n${desc}`;
    }
    if (lines.length > 0) desc += `\n\nQuick answers:\n${lines.join("\n")}`;
    if (extraction?.summary) desc += `\n\nAI analysis: ${extraction.summary}`;
    if (location) desc += `\n\nLocation: ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`;

    const payload: Record<string, unknown> = {
      center_id: centerId || "unknown",
      incident_type: incidentType || "general",
      description: desc,
      reported_severity: severity,
      status: "open",
    };
    if (reportingFor === "other" && subjectName) payload.employee_name = subjectName;
    const treatment = answers["treatment_type"];
    if (treatment && treatment !== "none") payload.treatment_type = treatment;
    const bodyPart = answers["body_part"];
    if (bodyPart) payload.body_part = bodyPart;

    return payload;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) { setError("Please describe what happened."); return; }
    setError(null); setSubmitting(true);

    // Save center for next session
    if (centerId.trim()) {
      try { localStorage.setItem(LAST_CENTER_KEY, centerId.trim().toUpperCase()); } catch { /* ignore */ }
    }

    const payload = buildPayload();
    try {
      if (!navigator.onLine) {
        OfflineQueue.add({ type: "create_incident", url: `${API_URL}/incidents`, method: "POST", payload });
        setStep("success"); return;
      }
      const incidentRes = await axios.post<{ id: string }>(`${API_URL}/incidents`, payload);
      const incidentId = incidentRes.data.id;

      // Upload photos to the case evidence endpoint — best-effort, non-fatal
      if (photos.length > 0) {
        setPhotoUploadStatus("uploading");
        try {
          // Find the case that was auto-created for this incident
          const casesRes = await axios.get<{ id: string }[]>(`${API_URL}/cases`, {
            params: { incident_id: incidentId, limit: 1 },
          });
          if (casesRes.data.length > 0) {
            const caseId = casesRes.data[0].id;
            let uploaded = 0;
            for (const photo of photos) {
              try {
                const blob = photo.size > 2_000_000 ? await compressImage(photo) : photo;
                const form = new FormData();
                form.append("file", blob, photo.name.replace(/\.[^.]+$/, ".jpg"));
                await axios.post(`${API_URL}/evidence/cases/${caseId}/upload`, form, {
                  headers: { "Content-Type": "multipart/form-data" },
                });
                uploaded++;
              } catch { /* skip failed photo, continue */ }
            }
            setPhotoUploadStatus(uploaded === photos.length ? "done" : "partial");
          }
        } catch { /* case lookup failed — photos not uploaded */ }
      }

      setStep("success");
    } catch (err: unknown) {
      if (!navigator.onLine) {
        OfflineQueue.add({ type: "create_incident", url: `${API_URL}/incidents`, method: "POST", payload });
        setStep("success");
      } else {
        setError(axios.isAxiosError(err) ? String(err.response?.data?.detail ?? err.message) : "Submit failed. Please try again.");
      }
    } finally { setSubmitting(false); }
  }

  // ── Success ─────────────────────────────────────────────────────────────────

  if (step === "success") return (
    <div className="max-w-2xl mx-auto p-6 flex flex-col gap-6 items-center text-center min-h-[60vh] justify-center">
      <div className="w-20 h-20 rounded-full flex items-center justify-center"
        style={{ background: "rgba(22,163,74,0.12)" }}>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
          <path d="M5 13l4 4L19 7" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--pg-navy)" }}>Report Submitted</h1>
        {reportingFor === "other" && subjectName && (
          <p className="text-sm mt-1 font-medium" style={{ color: "var(--pg-steel)" }}>Filed on behalf of {subjectName}</p>
        )}
        <p className="mt-2 max-w-sm leading-relaxed" style={{ color: "var(--pg-text-muted)" }}>
          {navigator.onLine
            ? "A case has been created and the investigation is open. Your supervisor has been notified."
            : "Saved offline — will sync automatically when your connection is restored."}
        </p>
        {photoUploadStatus === "done" && (
          <p className="text-sm mt-2 font-medium" style={{ color: "#16a34a" }}>Photos saved to the case file.</p>
        )}
        {photoUploadStatus === "partial" && (
          <p className="text-sm mt-2" style={{ color: "#d97706" }}>Some photos could not be saved — add them from the case detail.</p>
        )}
      </div>

      <div className="w-full max-w-sm rounded-2xl p-4 text-left space-y-2"
        style={{ background: "var(--pg-surface)", border: "1px solid var(--pg-border)" }}>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--pg-text-muted)" }}>What happens next</p>
        {[
          "A case is opened and assigned to a supervisor",
          "The system checks if OSHA documentation is needed",
          "You may be contacted to provide additional details",
          "A corrective action plan will be created",
        ].map((s, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <span className="text-xs font-bold flex-shrink-0 mt-0.5 w-4" style={{ color: "var(--pg-steel)" }}>{i + 1}.</span>
            <p className="text-xs" style={{ color: "var(--pg-text-sub)" }}>{s}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-3 w-full max-w-sm">
        <button
          onClick={() => {
            setStep("type");
            setDescription(""); setPhotos([]); setPhotoUrls([]);
            setTranscript(""); transcriptRef.current = "";
            setAnswers({}); setOtherTexts({}); setExtraction(null);
            setIncidentType(""); setSeverity("medium"); setError(null);
            setPhotoUploadStatus("idle"); setReportingFor("self"); setSubjectName("");
          }}
          className="flex-1 py-3 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 active:opacity-80"
          style={{ background: "var(--gradient-navy)" }}
        >
          Report Another
        </button>
        <button onClick={() => router.push("/mobile")}
          className="flex-1 py-3 rounded-xl text-sm font-medium border transition-colors hover:bg-gray-100 active:bg-gray-100"
          style={{ color: "var(--pg-text-sub)", borderColor: "var(--pg-border)" }}>
          My Dashboard
        </button>
      </div>
    </div>
  );

  // ── Type selection ───────────────────────────────────────────────────────────

  if (step === "type") return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 pt-2">
        <button onClick={() => router.push("/mobile")} className="text-gray-400 text-2xl leading-none hover:text-gray-600 transition-colors">←</button>
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--pg-navy)" }}>Report an Incident</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--pg-text-muted)" }}>Select the type that best fits</p>
        </div>
      </div>

      {/* Who is this about? */}
      <div className="rounded-2xl p-4 space-y-3" style={{ background: "var(--pg-surface)", border: "1px solid var(--pg-border)" }}>
        <p className="text-sm font-semibold" style={{ color: "var(--pg-text)" }}>Who is this report about?</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { value: "self" as const, label: "Myself", icon: "👤" },
            { value: "other" as const, label: "Someone on my team", icon: "🧑‍🤝‍🧑" },
          ].map((opt) => (
            <button key={opt.value} type="button"
              onClick={() => setReportingFor(opt.value)}
              className="flex items-center gap-2 py-3 px-4 rounded-xl border-2 text-sm font-medium transition-all hover:scale-[1.01]"
              style={{
                background: reportingFor === opt.value ? "var(--pg-navy)" : "white",
                borderColor: reportingFor === opt.value ? "var(--pg-navy)" : "var(--pg-border)",
                color: reportingFor === opt.value ? "white" : "var(--pg-text-sub)",
              }}>
              <span>{opt.icon}</span>
              <span>{opt.label}</span>
              {reportingFor === opt.value && <span className="ml-auto">✓</span>}
            </button>
          ))}
        </div>
        {reportingFor === "other" && (
          <div>
            <input
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
              placeholder="Team member's name…"
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none"
              style={{ borderColor: subjectName ? "var(--pg-steel)" : undefined }}
              autoFocus
            />
            <p className="text-xs mt-1" style={{ color: "var(--pg-text-muted)" }}>This person will be associated with the case</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {INCIDENT_TYPES.map((t) => (
          <button key={t.key} onClick={() => selectType(t)}
            className="flex flex-col items-start gap-2.5 bg-white border-2 border-gray-200 rounded-2xl py-5 px-4 hover:border-indigo-300 hover:bg-indigo-50 active:scale-[0.98] transition-all text-left min-h-[100px]">
            <span className="text-3xl">{t.icon}</span>
            <div>
              <p className="text-sm font-semibold text-gray-900 leading-tight">{t.label}</p>
              <p className="text-xs text-gray-400 mt-0.5 leading-tight">{t.hint}</p>
            </div>
          </button>
        ))}
      </div>

      <button onClick={() => { setIncidentType("general"); setStep("details"); }}
        className="w-full py-4 text-center text-sm border border-gray-200 rounded-2xl bg-white hover:bg-gray-50 transition-colors"
        style={{ color: "var(--pg-text-muted)" }}>
        Other / Not Listed
      </button>
    </div>
  );

  // ── Follow-up questions ──────────────────────────────────────────────────────

  if (step === "questions") {
    const currentQuestions = QUESTIONS[incidentType] ?? [];
    const answeredCount = currentQuestions.filter((q) => answers[q.id]).length;

    return (
      <div className="p-4 space-y-5 max-w-2xl mx-auto">
        <div className="flex items-center gap-3 pt-2">
          <button onClick={() => setStep("type")} className="text-gray-400 text-2xl leading-none hover:text-gray-600 transition-colors">←</button>
          <div className="flex-1">
            <h1 className="text-xl font-bold" style={{ color: "var(--pg-navy)" }}>Quick Check-In</h1>
            <p className="text-xs mt-0.5" style={{ color: "var(--pg-text-muted)" }}>
              {reportingFor === "other" && subjectName
                ? `Reporting for: ${subjectName}`
                : "A few questions to help route this correctly"}
            </p>
          </div>
          <span className="text-xs rounded-full px-2 py-1"
            style={{ background: "var(--pg-surface)", color: "var(--pg-text-muted)" }}>
            {answeredCount}/{currentQuestions.length}
          </span>
        </div>

        {extraction && Object.keys(extraction.extracted_fields).length > 0 && (
          <div className="rounded-xl px-4 py-2.5 flex items-start gap-2"
            style={{ background: "rgba(30,58,95,0.06)", border: "1px solid rgba(30,58,95,0.15)" }}>
            <span className="text-base">✦</span>
            <div>
              <p className="text-xs font-semibold" style={{ color: "var(--pg-navy)" }}>AI pre-filled some answers</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--pg-text-muted)" }}>Review and adjust below</p>
            </div>
          </div>
        )}

        {currentQuestions.map((q) => (
          <div key={q.id} className="bg-white border-2 border-gray-200 rounded-2xl p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">{q.prompt}</p>
              {q.subtext && <p className="text-xs text-gray-400 mt-0.5">{q.subtext}</p>}
            </div>
            {q.type === "bool" ? (
              <div className="grid grid-cols-2 gap-2">
                {[{ value: "yes", label: "✓  Yes" }, { value: "no", label: "✕  No" }].map((opt) => (
                  <button key={opt.value} type="button" onClick={() => setAnswer(q.id, opt.value)}
                    className={`py-3 rounded-xl text-sm font-semibold border-2 transition-colors ${
                      answers[q.id] === opt.value
                        ? opt.value === "yes" ? "bg-indigo-600 border-indigo-600 text-white" : "bg-gray-700 border-gray-700 text-white"
                        : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
                    }`}
                  >{opt.label}</button>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-1 gap-2">
                  {(q.options ?? []).map((opt) => (
                    <button key={opt.value} type="button" onClick={() => setAnswer(q.id, opt.value)}
                      className={`flex items-center gap-3 py-2.5 px-4 rounded-xl text-sm border-2 transition-all text-left ${
                        answers[q.id] === opt.value
                          ? "bg-indigo-50 border-indigo-400 text-indigo-900 font-medium"
                          : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      {opt.icon && <span className="text-base">{opt.icon}</span>}
                      <span>{opt.label}</span>
                      {answers[q.id] === opt.value && <span className="ml-auto text-indigo-500">✓</span>}
                    </button>
                  ))}
                </div>
                {/* Show text input when "other" is selected */}
                {answers[q.id] === "other" && (
                  <input
                    value={otherTexts[q.id] ?? ""}
                    onChange={(e) => setOtherTexts((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    placeholder="Please describe…"
                    className="w-full border-2 border-indigo-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 bg-indigo-50"
                    autoFocus
                  />
                )}
              </div>
            )}
          </div>
        ))}

        {oshaEval?.flag && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 flex items-start gap-2.5">
            <span className="text-lg">⚠️</span>
            <div>
              <p className="text-sm font-semibold text-amber-800">OSHA Review Required</p>
              <p className="text-xs text-amber-700 mt-0.5">{oshaEval.reason}</p>
              <p className="text-xs text-amber-600 mt-1">A safety coordinator will be notified to review this for OSHA recordability.</p>
            </div>
          </div>
        )}

        <button onClick={() => setStep("details")}
          className="w-full text-white py-4 rounded-2xl text-base font-bold hover:opacity-90 active:opacity-80 transition-opacity"
          style={{ background: "var(--gradient-navy)" }}>
          Continue →
        </button>
        <p className="text-xs text-center" style={{ color: "var(--pg-text-muted)" }}>
          All questions are optional — you can add details in the next step
        </p>
      </div>
    );
  }

  // ── Details + submit ─────────────────────────────────────────────────────────

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 pt-2">
        <button onClick={() => setStep((QUESTIONS[incidentType] ?? []).length > 0 ? "questions" : "type")}
          className="text-gray-400 text-2xl leading-none hover:text-gray-600 transition-colors">←</button>
        <div className="flex-1">
          <h1 className="text-xl font-bold" style={{ color: "var(--pg-navy)" }}>Add Details</h1>
          {reportingFor === "other" && subjectName && (
            <p className="text-xs mt-0.5" style={{ color: "var(--pg-steel)" }}>Reporting for: {subjectName}</p>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Severity override */}
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">Severity</p>
          <div className="grid grid-cols-4 gap-2">
            {(["low", "medium", "high", "critical"] as Severity[]).map((s) => (
              <button key={s} type="button" onClick={() => setSeverity(s)}
                className={`py-3.5 rounded-2xl border-2 text-xs font-bold capitalize transition-all active:scale-95 ${
                  severity === s ? SEVERITY_STYLES[s] : "bg-white border-gray-200 text-gray-400"
                }`}>{s}</button>
            ))}
          </div>
        </div>

        {/* Center */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-semibold text-gray-700">Center / Location</label>
            {centerId && <span className="text-xs text-indigo-500">Last used</span>}
          </div>
          <input value={centerId} onChange={(e) => setCenterId(e.target.value.toUpperCase())}
            placeholder="e.g. FL-MIA, NY-BRK"
            autoCapitalize="characters"
            className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3.5 text-base focus:border-indigo-400 focus:outline-none font-mono" />
        </div>

        {/* Description — voice-first design */}
        <div className="space-y-3">
          <p className="text-sm font-semibold text-gray-700">What happened?</p>

          {/* Push-to-talk — primary when no description yet */}
          {!description.trim() ? (
            <button
              type="button"
              onClick={recording ? stopVoice : startVoice}
              className={`w-full flex flex-col items-center gap-3 py-8 rounded-2xl border-2 transition-all active:scale-[0.98] cursor-pointer ${
                recording
                  ? "bg-red-50 border-red-400 shadow-lg shadow-red-100"
                  : "bg-indigo-50 border-indigo-300 hover:border-indigo-400 hover:bg-indigo-100"
              }`}
            >
              <div className="relative">
                {recording && (
                  <>
                    <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-40 scale-150" />
                    <span className="absolute inset-0 rounded-full bg-red-300 animate-ping opacity-20 scale-200" style={{ animationDelay: "0.3s" }} />
                  </>
                )}
                <span className="relative text-5xl">{recording ? "🔴" : "🎤"}</span>
              </div>
              <div className="text-center">
                <p className={`text-base font-bold ${recording ? "text-red-700" : "text-indigo-700"}`}>
                  {recording ? "Listening… tap to stop" : "Tap to speak"}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {recording ? "Describe what happened in your own words" : "Faster than typing — AI will analyze it"}
                </p>
              </div>
            </button>
          ) : (
            /* Compact voice toggle when description exists */
            <div className="flex items-center gap-2">
              <button type="button" onClick={recording ? stopVoice : startVoice}
                className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-full font-medium transition-colors ${
                  recording ? "bg-red-100 text-red-700 animate-pulse" : "bg-gray-100 text-gray-600"
                }`}>
                {recording ? "🔴 Stop" : "🎤 Continue speaking"}
              </button>
              {recording && <span className="text-xs text-red-500 animate-pulse">Recording…</span>}
            </div>
          )}

          {/* Live transcript preview */}
          {recording && transcript && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-xs font-medium text-red-700 mb-1">Capturing…</p>
              <p className="text-sm text-red-900 italic leading-relaxed">
                &ldquo;{transcript}&rdquo;
              </p>
            </div>
          )}

          {/* AI extraction status */}
          {extracting && (
            <div className="flex items-center gap-2 text-xs text-indigo-600 animate-pulse bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2.5">
              <span className="text-lg">✦</span>
              <span>Analyzing your description…</span>
            </div>
          )}
          {extraction && !extracting && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
              <div className="flex items-start gap-2">
                <span className="text-base flex-shrink-0">✦</span>
                <div>
                  <p className="text-xs font-semibold text-indigo-800 mb-0.5">AI analysis</p>
                  <p className="text-xs text-indigo-700 leading-relaxed">{extraction.summary}</p>
                </div>
              </div>
            </div>
          )}

          {/* Text area — always visible for editing */}
          <textarea value={description} onChange={(e) => setDescription(e.target.value)}
            onBlur={(e) => { if (e.target.value.length >= 15 && !extraction) runAiExtraction(e.target.value); }}
            placeholder={recording ? "Speaking…" : "Or type what happened here…"}
            rows={description.trim() ? 4 : 2}
            className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 text-base focus:border-indigo-400 focus:outline-none resize-none text-gray-800 placeholder-gray-400" />

          {/* Gentle quality prompt — only shown for short descriptions, no AI extraction yet */}
          {description.trim().length > 0 && description.trim().length < 50 && !extraction && (
            <div className="flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
              <span className="text-base flex-shrink-0">💡</span>
              <p className="text-xs text-gray-500 leading-relaxed">
                A little more helps: <span className="text-gray-700 font-medium">where</span> it happened and <span className="text-gray-700 font-medium">what was done right away</span>.
              </p>
            </div>
          )}

          {/* Character count — subtle, shown when description exists */}
          {description.trim().length > 0 && (
            <p className={`text-xs text-right ${description.trim().length < 50 ? "text-amber-500" : "text-gray-300"}`}>
              {description.trim().length} characters
            </p>
          )}
        </div>

        {/* OSHA flag banner */}
        {oshaEval?.flag && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 flex items-start gap-2.5">
            <span className="text-lg">⚠️</span>
            <div>
              <p className="text-sm font-semibold text-amber-800">OSHA Review Recommended</p>
              <p className="text-xs text-amber-700 mt-0.5">{oshaEval.reason}</p>
              <p className="text-xs text-amber-600 mt-1">A safety coordinator will review this for OSHA recordability after submission.</p>
            </div>
          </div>
        )}

        {/* AI follow-up prompts */}
        {extraction && extraction.follow_up_prompts.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
            <p className="text-xs font-semibold text-blue-700 mb-1.5">Consider adding:</p>
            {extraction.follow_up_prompts.map((p, i) => (
              <p key={i} className="text-xs text-blue-600 flex items-start gap-1.5">
                <span className="flex-shrink-0">→</span>{p}
              </p>
            ))}
          </div>
        )}

        {/* Photo */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">
            Photos {photos.length > 0 && <span className="text-indigo-600">({photos.length})</span>}
          </p>
          <label className="flex items-center gap-3 border-2 border-dashed border-gray-300 rounded-xl p-4 cursor-pointer active:bg-gray-50">
            <input type="file" accept="image/*" capture="environment" multiple onChange={addPhoto} className="hidden" />
            <span className="text-3xl">📷</span>
            <div>
              <p className="text-sm font-medium text-gray-700">Take or upload a photo</p>
              <p className="text-xs text-gray-400">Injury, hazard, or scene</p>
            </div>
          </label>
          {photoUrls.length > 0 && (
            <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
              {photoUrls.map((url, i) => (
                <img key={i} src={url} alt="" className="h-16 w-16 rounded-lg object-cover flex-shrink-0 border border-gray-200" />
              ))}
            </div>
          )}
        </div>

        {/* GPS — compliance messaging */}
        {location ? (
          <div className="flex items-start gap-2.5 rounded-xl px-3 py-2.5"
            style={{ background: "rgba(22,163,74,0.06)", border: "1px solid rgba(22,163,74,0.2)" }}>
            <span className="text-base flex-shrink-0">📍</span>
            <div>
              <p className="text-xs font-semibold" style={{ color: "#15803d" }}>GPS location recorded</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--pg-text-muted)" }}>
                Coordinates attached to this report for compliance and OSHA documentation requirements
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl px-3 py-2.5"
            style={{ background: "var(--pg-surface)", border: "1px solid var(--pg-border)" }}>
            <span className="text-sm" style={{ color: "var(--pg-text-muted)" }}>📍</span>
            <p className="text-xs" style={{ color: "var(--pg-text-muted)" }}>Location not detected — enter center ID above for compliance records</p>
          </div>
        )}

        {/* Answers summary */}
        {Object.keys(answers).length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
            <p className="text-xs font-semibold text-blue-700 mb-1">Captured from check-in:</p>
            {(QUESTIONS[incidentType] ?? []).filter((q) => answers[q.id]).map((q) => {
              const opt = q.options?.find((o) => o.value === answers[q.id]);
              return (
                <p key={q.id} className="text-xs text-blue-600">
                  {q.prompt} → {opt ? opt.label : answers[q.id] === "yes" ? "Yes" : "No"}
                </p>
              );
            })}
          </div>
        )}

        {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</div>}

        <button type="submit" disabled={submitting}
          className="w-full text-white py-4 rounded-2xl text-lg font-bold transition-all hover:opacity-90 active:opacity-80 disabled:opacity-50"
          style={{ background: submitting ? "#dc2626" : "var(--gradient-navy)", cursor: submitting ? "wait" : "pointer" }}>
          {submitting ? "Submitting…" : !navigator.onLine ? "Save Offline" : "Submit Report"}
        </button>

        <p className="text-xs text-center" style={{ color: "var(--pg-text-muted)" }}>
          Reports are saved immediately. Supervisors are notified automatically.
        </p>
      </form>
    </div>
  );
}

export default function MobileIncidentPage() {
  return (
    <Suspense>
      <MobileIncidentForm />
    </Suspense>
  );
}
