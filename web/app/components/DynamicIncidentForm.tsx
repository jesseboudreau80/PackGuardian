"use client";

import { useState, type FormEvent } from "react";
import axios from "axios";
import { API_URL } from "../lib/api";

// ── Incident type definitions ─────────────────────────────────────────────────

type IncidentCategory =
  | "employee_injury"
  | "dog_fight"
  | "pet_injury"
  | "guest_injury"
  | "sanitation"
  | "equipment_failure"
  | "escape"
  | "hr_issue";

interface IncidentTypeDef {
  label: string;
  description: string;
  requiredFields: string[];
  showOsha: boolean;
  showAnimalFields: boolean;
  showHrFields: boolean;
  icon: string;
}

const INCIDENT_TYPES: Record<IncidentCategory, IncidentTypeDef> = {
  employee_injury: {
    label: "Employee Injury", description: "Work-related injury to a staff member",
    requiredFields: ["employee_name", "job_title", "body_part", "treatment_type"],
    showOsha: true, showAnimalFields: false, showHrFields: false, icon: "🧑‍⚕️",
  },
  dog_fight: {
    label: "Dog Fight", description: "Altercation between animals",
    requiredFields: ["description"],
    showOsha: false, showAnimalFields: true, showHrFields: false, icon: "🐕",
  },
  pet_injury: {
    label: "Pet Injury", description: "Injury to a pet in our care",
    requiredFields: ["description"],
    showOsha: false, showAnimalFields: true, showHrFields: false, icon: "🐾",
  },
  guest_injury: {
    label: "Guest Injury", description: "Injury to a client or visitor",
    requiredFields: ["description", "treatment_type"],
    showOsha: false, showAnimalFields: false, showHrFields: false, icon: "👤",
  },
  sanitation: {
    label: "Sanitation Issue", description: "Health, hygiene, or contamination concern",
    requiredFields: ["description"],
    showOsha: false, showAnimalFields: false, showHrFields: false, icon: "🧹",
  },
  equipment_failure: {
    label: "Equipment Failure", description: "Mechanical or equipment malfunction",
    requiredFields: ["description"],
    showOsha: false, showAnimalFields: false, showHrFields: false, icon: "⚙️",
  },
  escape: {
    label: "Animal Escape", description: "Pet escaped or attempted escape",
    requiredFields: ["description"],
    showOsha: false, showAnimalFields: true, showHrFields: false, icon: "🚪",
  },
  hr_issue: {
    label: "HR Issue", description: "Workplace conduct, harassment, or HR concern",
    requiredFields: ["description"],
    showOsha: false, showAnimalFields: false, showHrFields: true, icon: "📋",
  },
};

const SEVERITIES = ["low", "medium", "high", "critical"] as const;
const TREATMENT_TYPES = ["first_aid", "medical", "emergency_room", "hospitalization"] as const;

interface Props {
  onCreated?: () => void;
  initialCenterId?: string;
}

export default function DynamicIncidentForm({ onCreated, initialCenterId = "" }: Props) {
  const [step, setStep] = useState<"type" | "form">("type");
  const [incidentType, setIncidentType] = useState<IncidentCategory | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState({
    center_id: initialCenterId,
    description: "",
    reported_severity: "medium" as typeof SEVERITIES[number],
    status: "open",
    employee_name: "",
    job_title: "",
    date_of_injury: "",
    time_of_injury: "",
    body_part: "",
    treatment_type: "" as typeof TREATMENT_TYPES[number] | "",
    days_away: "",
    restricted_days: "",
    // Animal-specific (stored in description)
    animal_names: "",
    owner_notified: false,
    vet_consulted: false,
    // HR-specific (stored in description)
    confidential: false,
  });

  const typeDef = incidentType ? INCIDENT_TYPES[incidentType] : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!incidentType) return;
    setError(null); setSaving(true);

    const payload: Record<string, unknown> = {
      center_id: form.center_id,
      incident_type: incidentType,
      description: buildDescription(),
      reported_severity: form.reported_severity,
      status: form.status,
    };

    if (typeDef?.showOsha) {
      if (form.employee_name) payload.employee_name = form.employee_name;
      if (form.job_title) payload.job_title = form.job_title;
      if (form.date_of_injury) payload.date_of_injury = form.date_of_injury;
      if (form.time_of_injury) payload.time_of_injury = form.time_of_injury;
      if (form.body_part) payload.body_part = form.body_part;
      if (form.treatment_type) payload.treatment_type = form.treatment_type;
      if (form.days_away) payload.days_away = Number(form.days_away);
      if (form.restricted_days) payload.restricted_days = Number(form.restricted_days);
    }

    try {
      await axios.post(`${API_URL}/incidents`, payload);
      setSuccess(true);
      onCreated?.();
      setTimeout(() => { setSuccess(false); setStep("type"); setIncidentType(null); }, 2500);
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? String(err.response?.data?.detail ?? err.message) : "Failed");
    } finally { setSaving(false); }
  }

  function buildDescription(): string {
    let desc = form.description;
    if (typeDef?.showAnimalFields && form.animal_names) {
      desc += `\n\nAnimals involved: ${form.animal_names}`;
      if (form.owner_notified) desc += "\nOwner notified.";
      if (form.vet_consulted) desc += "\nVet consulted.";
    }
    if (typeDef?.showHrFields && form.confidential) {
      desc += "\n[CONFIDENTIAL HR MATTER]";
    }
    return desc.trim();
  }

  const INPUT = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";
  const f = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  if (success) {
    return (
      <div className="flex items-center justify-center py-12 text-green-700 gap-2">
        <span className="text-2xl">✓</span>
        <div>
          <p className="font-semibold">Incident submitted</p>
          <p className="text-sm text-green-600">A case has been automatically created.</p>
        </div>
      </div>
    );
  }

  // Step 1: type selection
  if (step === "type") {
    return (
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-gray-900">What type of incident occurred?</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {(Object.entries(INCIDENT_TYPES) as [IncidentCategory, IncidentTypeDef][]).map(([key, def]) => (
            <button
              key={key}
              onClick={() => { setIncidentType(key); setStep("form"); }}
              className="flex flex-col items-center gap-2 p-4 border border-gray-200 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-colors text-center"
            >
              <span className="text-2xl">{def.icon}</span>
              <span className="text-xs font-medium text-gray-800">{def.label}</span>
              <span className="text-xs text-gray-400">{def.description}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Step 2: incident form
  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Type header */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setStep("type")} className="text-sm text-gray-400 hover:text-gray-700">
          ← Back
        </button>
        <div className="flex items-center gap-2">
          <span className="text-lg">{typeDef?.icon}</span>
          <span className="font-semibold text-gray-900">{typeDef?.label}</span>
        </div>
      </div>

      {/* Core fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Center ID *</label>
          <input required value={form.center_id} onChange={f("center_id")} className={INPUT} placeholder="e.g. NYC-01" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Severity *</label>
          <select required value={form.reported_severity} onChange={f("reported_severity")} className={INPUT + " bg-white"}>
            {SEVERITIES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
        <textarea required value={form.description} onChange={f("description")} rows={4} className={INPUT + " resize-none"}
          placeholder="Describe what happened in detail…" />
      </div>

      {/* Animal-specific fields */}
      {typeDef?.showAnimalFields && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-amber-800">Animal Information</p>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Animals Involved</label>
            <input value={form.animal_names} onChange={f("animal_names")} className={INPUT}
              placeholder="Names or descriptions of animals" />
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.owner_notified}
                onChange={(e) => setForm((p) => ({ ...p, owner_notified: e.target.checked }))}
                className="rounded border-gray-300" />
              Owner notified
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.vet_consulted}
                onChange={(e) => setForm((p) => ({ ...p, vet_consulted: e.target.checked }))}
                className="rounded border-gray-300" />
              Vet consulted
            </label>
          </div>
        </div>
      )}

      {/* HR-specific fields */}
      {typeDef?.showHrFields && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-purple-800 mb-2">HR Classification</p>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.confidential}
              onChange={(e) => setForm((p) => ({ ...p, confidential: e.target.checked }))}
              className="rounded border-gray-300" />
            Mark as confidential HR matter
          </label>
        </div>
      )}

      {/* OSHA / employee fields */}
      {typeDef?.showOsha && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-blue-800">Employee & OSHA Information</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Employee Name</label>
              <input value={form.employee_name} onChange={f("employee_name")} className={INPUT} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Job Title</label>
              <input value={form.job_title} onChange={f("job_title")} className={INPUT} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Date of Injury</label>
              <input type="date" value={form.date_of_injury} onChange={f("date_of_injury")} className={INPUT} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Time of Injury</label>
              <input type="time" value={form.time_of_injury} onChange={f("time_of_injury")} className={INPUT} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Body Part Affected</label>
              <input value={form.body_part} onChange={f("body_part")} className={INPUT} placeholder="e.g. right hand" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Treatment Type</label>
              <select value={form.treatment_type} onChange={f("treatment_type")} className={INPUT + " bg-white"}>
                <option value="">Select…</option>
                {TREATMENT_TYPES.map((t) => (
                  <option key={t} value={t}>{t.replace(/_/g," ")}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Days Away from Work</label>
              <input type="number" min="0" value={form.days_away} onChange={f("days_away")} className={INPUT} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Restricted Work Days</label>
              <input type="number" min="0" value={form.restricted_days} onChange={f("restricted_days")} className={INPUT} />
            </div>
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>
      )}

      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 py-2.5 text-sm font-medium text-white rounded-lg disabled:opacity-50"
          style={{ backgroundColor: "var(--brand-primary)" }}
        >
          {saving ? "Submitting…" : "Submit Incident"}
        </button>
        <button
          type="button"
          onClick={() => setStep("type")}
          className="px-6 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
        >
          Back
        </button>
      </div>
    </form>
  );
}
