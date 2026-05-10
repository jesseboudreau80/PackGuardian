"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import axios from "axios";
import type { IncidentCreate, Incident, TreatmentType } from "../types/incident";
import { API_URL } from "../lib/api";

const TREATMENT_OPTIONS: { value: TreatmentType; label: string }[] = [
  { value: "first_aid",      label: "First Aid (on-site)" },
  { value: "medical",        label: "Medical Treatment" },
  { value: "emergency_room", label: "Emergency Room" },
  { value: "hospitalization",label: "Hospitalization" },
];

interface Props {
  onCreated: (incident: Incident) => void;
}

export default function IncidentForm({ onCreated }: Props) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<IncidentCreate>({
    defaultValues: { status: "open" },
  });

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showOsha, setShowOsha] = useState(false);

  async function onSubmit(data: IncidentCreate) {
    setSubmitError(null);
    try {
      const res = await axios.post<Incident>(`${API_URL}/incidents`, data);
      onCreated(res.data);
      reset();
    } catch (err: unknown) {
      const msg =
        axios.isAxiosError(err)
          ? (err.response?.data?.detail ?? err.message)
          : "Unexpected error submitting incident.";
      setSubmitError(String(msg));
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="bg-white border border-gray-200 rounded-lg p-6 space-y-4"
    >
      <h2 className="text-lg font-semibold">Report Incident</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Center ID</label>
          <input
            {...register("center_id", { required: "Required" })}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            placeholder="e.g. CENTER-001"
          />
          {errors.center_id && (
            <p className="text-red-500 text-xs mt-1">{errors.center_id.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Incident Type</label>
          <input
            {...register("incident_type", { required: "Required" })}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            placeholder="e.g. Slip and Fall"
          />
          {errors.incident_type && (
            <p className="text-red-500 text-xs mt-1">{errors.incident_type.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Severity</label>
          <select
            {...register("reported_severity", { required: "Required" })}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          >
            <option value="">Select…</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
          {errors.reported_severity && (
            <p className="text-red-500 text-xs mt-1">{errors.reported_severity.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Status</label>
          <select
            {...register("status")}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          >
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <textarea
          {...register("description", { required: "Required" })}
          rows={3}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          placeholder="Describe the incident…"
        />
        {errors.description && (
          <p className="text-red-500 text-xs mt-1">{errors.description.message}</p>
        )}
      </div>

      {/* OSHA details toggle */}
      <div className="border-t border-gray-100 pt-4">
        <button
          type="button"
          onClick={() => setShowOsha((v) => !v)}
          className="text-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
        >
          <span>{showOsha ? "▾" : "▸"}</span>
          {showOsha ? "Hide" : "Add"} OSHA Reporting Details (optional)
        </button>
      </div>

      {showOsha && (
        <div className="border border-indigo-100 rounded-lg bg-indigo-50/30 p-4 space-y-4">
          <p className="text-xs text-indigo-600 font-medium uppercase tracking-wide">
            OSHA Reporting — used for Form 300/301 log generation
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Employee Name</label>
              <input
                {...register("employee_name")}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                placeholder="Full name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Job Title</label>
              <input
                {...register("job_title")}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                placeholder="e.g. Dog Handler"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Date of Injury</label>
              <input
                type="date"
                {...register("date_of_injury")}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Time of Injury</label>
              <input
                type="time"
                {...register("time_of_injury")}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Body Part Affected</label>
              <input
                {...register("body_part")}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                placeholder="e.g. Right hand, lower back"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Treatment Type</label>
              <select
                {...register("treatment_type")}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              >
                <option value="">Select…</option>
                {TREATMENT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Days Away from Work</label>
              <input
                type="number"
                min={0}
                {...register("days_away", { valueAsNumber: true })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Restricted Work Days</label>
              <input
                type="number"
                min={0}
                {...register("restricted_days", { valueAsNumber: true })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                placeholder="0"
              />
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-blue-600 text-white text-sm font-medium px-5 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {isSubmitting ? "Submitting…" : "Submit Incident"}
        </button>
        {submitError && (
          <p className="text-red-500 text-sm">{submitError}</p>
        )}
      </div>
    </form>
  );
}
