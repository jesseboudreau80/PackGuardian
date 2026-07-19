"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { API_URL } from "../lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4 | 5;

interface WizardState {
  // Step 1
  company_name: string;
  admin_email: string;
  admin_password: string;
  confirm_password: string;
  facility_type: string;
  is_trial: boolean;
  // Step 2
  primary_color: string;
  secondary_color: string;
  support_email: string;
  // Step 3
  org_nodes: { name: string; org_type: string; parent_index: number | null }[];
  // Step 4
  invites: { email: string; role: string }[];
  // Step 5
  osha_reminder_enabled: boolean;
  default_inspection_cadence_days: number;
  default_escalation_hours: number;
}

const ORG_TYPES = ["enterprise", "area", "district", "center"];
const ORG_ROLES = ["manager", "safety", "hr", "operations", "center_manager", "district_manager"];
const FACILITY_TYPES = [
  { key: "kennel",      label: "Dog Boarding / Kennel",  icon: "🐕" },
  { key: "daycare",     label: "Dog Daycare",             icon: "🏃" },
  { key: "grooming",    label: "Pet Grooming",            icon: "✂️"  },
  { key: "boarding",    label: "Pet Hotel / Boarding",    icon: "🏨" },
  { key: "veterinary",  label: "Veterinary Practice",     icon: "🩺" },
  { key: "other",       label: "Other Pet Care",          icon: "🐾" },
];

const COLOR_PRESETS = [
  { primary: "#4F46E5", secondary: "#6366F1", label: "Indigo" },
  { primary: "#059669", secondary: "#10B981", label: "Green"  },
  { primary: "#DC2626", secondary: "#EF4444", label: "Red"    },
  { primary: "#D97706", secondary: "#F59E0B", label: "Amber"  },
  { primary: "#7C3AED", secondary: "#8B5CF6", label: "Purple" },
  { primary: "#0284C7", secondary: "#38BDF8", label: "Blue"   },
];

const INPUT = "w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

// ── Wizard component ──────────────────────────────────────────────────────────

export default function OnboardPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [state, setState] = useState<WizardState>({
    company_name: "", admin_email: "", admin_password: "", confirm_password: "",
    facility_type: "", is_trial: false,
    primary_color: "#4F46E5", secondary_color: "#6366F1", support_email: "",
    org_nodes: [
      { name: "", org_type: "enterprise", parent_index: null },
    ],
    invites: [{ email: "", role: "manager" }],
    osha_reminder_enabled: true,
    default_inspection_cadence_days: 30,
    default_escalation_hours: 24,
  });

  function update(fields: Partial<WizardState>) {
    setState((s) => ({ ...s, ...fields }));
    setError(null);
  }

  // ── Step 1 → provision tenant + login ───────────────────────────────────
  async function submitStep1() {
    if (state.admin_password !== state.confirm_password) {
      setError("Passwords do not match."); return;
    }
    if (state.admin_password.length < 8) {
      setError("Password must be at least 8 characters."); return;
    }
    if (!state.company_name.trim()) {
      setError("Company name is required."); return;
    }
    setSaving(true); setError(null);
    try {
      const res = await axios.post(`${API_URL}/provision/onboard`, {
        company_name: state.company_name,
        admin_email: state.admin_email,
        admin_password: state.admin_password,
        primary_color: state.primary_color,
        secondary_color: state.secondary_color,
        facility_type: state.facility_type || null,
        is_trial: state.is_trial,
      });
      // Store the token returned from provisioning
      localStorage.setItem("pg_token", res.data.access_token);
      localStorage.setItem("pg_role", "admin");
      // Also trigger the AuthContext login so hooks pick up the token
      setStep(2);
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? String(err.response?.data?.detail ?? err.message) : "Provisioning failed");
    } finally { setSaving(false); }
  }

  async function submitStep2() {
    setSaving(true);
    try {
      await axios.put(`${API_URL}/tenant`, {
        primary_color: state.primary_color,
        secondary_color: state.secondary_color,
        support_email: state.support_email || state.admin_email,
      });
      await axios.patch(`${API_URL}/provision/step/2`);
      setStep(3);
    } catch { /* non-fatal, continue */ }
    finally { setSaving(false); }
  }

  async function submitStep3() {
    setSaving(true);
    try {
      const validNodes = state.org_nodes.filter((n) => n.name.trim());
      if (validNodes.length > 0) {
        await axios.post(`${API_URL}/provision/seed-org`,
          validNodes.map((n, i) => ({
            name: n.name,
            org_type: n.org_type,
            parent_id: n.parent_index !== null ? undefined : undefined, // simplified for wizard
          }))
        );
      }
      await axios.patch(`${API_URL}/provision/step/3`);
      setStep(4);
    } catch { /* non-fatal */ }
    finally { setSaving(false); }
  }

  async function submitStep4() {
    setSaving(true);
    try {
      const validInvites = state.invites.filter((i) => i.email.trim());
      for (const inv of validInvites) {
        await axios.post(`${API_URL}/provision/invite`, {
          email: inv.email,
          role: inv.role,
        }).catch(() => {}); // non-fatal
      }
      await axios.patch(`${API_URL}/provision/step/4`);
      setStep(5);
    } finally { setSaving(false); }
  }

  async function submitStep5() {
    setSaving(true);
    try {
      await axios.patch(`${API_URL}/provision/settings`, {
        osha_reminder_enabled: state.osha_reminder_enabled,
        default_inspection_cadence_days: state.default_inspection_cadence_days,
        default_escalation_hours: state.default_escalation_hours,
      });
      await axios.patch(`${API_URL}/provision/step/5`);
      // Update AuthContext state with the token we stored earlier
      window.location.href = "/welcome";
    } catch { window.location.href = "/welcome"; }
    finally { setSaving(false); }
  }

  const STEPS = [
    "Account", "Branding", "Org Structure", "Invite Team", "Safety Setup"
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Welcome to PackGuardian</h1>
          <p className="text-gray-500 mt-1">Operational Safety & OSHA Automation Platform</p>
        </div>

        {/* Progress bar */}
        <div className="flex items-center mb-8">
          {STEPS.map((label, i) => {
            const n = (i + 1) as Step;
            const done = step > n;
            const active = step === n;
            return (
              <div key={n} className="flex items-center flex-1 last:flex-none">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  done ? "bg-green-500 text-white" : active ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-500"
                }`}>
                  {done ? "✓" : n}
                </div>
                <div className={`hidden sm:block text-xs ml-1.5 flex-shrink-0 ${active ? "text-indigo-600 font-medium" : "text-gray-400"}`}>
                  {label}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 ${done ? "bg-green-400" : "bg-gray-200"}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step cards */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          {error && (
            <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          {/* ── Step 1 ── */}
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-xl font-semibold text-gray-900">Create your account</h2>
              <p className="text-sm text-gray-500">Set up your PackGuardian workspace for your facility.</p>

              {/* Facility type */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Facility type</p>
                <div className="grid grid-cols-3 gap-2">
                  {FACILITY_TYPES.map((f) => (
                    <button key={f.key} type="button"
                      onClick={() => update({ facility_type: f.key })}
                      className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 text-xs font-medium transition-colors ${
                        state.facility_type === f.key
                          ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                          : "border-gray-200 hover:border-gray-300 text-gray-600"
                      }`}>
                      <span className="text-2xl">{f.icon}</span>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Facility / Company Name *</label>
                <input value={state.company_name} onChange={(e) => update({ company_name: e.target.value })}
                  placeholder="Happy Paws Pet Resort" className={INPUT} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Admin Email *</label>
                <input type="email" value={state.admin_email} onChange={(e) => update({ admin_email: e.target.value })}
                  placeholder="admin@happypaws.com" className={INPUT} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                  <input type="password" value={state.admin_password} onChange={(e) => update({ admin_password: e.target.value })}
                    placeholder="Min 8 characters" className={INPUT} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password *</label>
                  <input type="password" value={state.confirm_password} onChange={(e) => update({ confirm_password: e.target.value })}
                    placeholder="Repeat password" className={INPUT} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer text-gray-600">
                <input type="checkbox" checked={state.is_trial}
                  onChange={(e) => update({ is_trial: e.target.checked })} className="rounded" />
                Start with a 14-day free trial (sample data included)
              </label>

              <button onClick={submitStep1} disabled={saving}
                className="w-full py-3 text-sm font-semibold text-white rounded-xl disabled:opacity-50"
                style={{ backgroundColor: "#4F46E5" }}>
                {saving ? "Creating your workspace…" : "Create Workspace →"}
              </button>

              <p className="text-center text-xs text-gray-400">
                Already have an account?{" "}
                <a href="/login" className="text-indigo-600 hover:underline">Sign in</a>
              </p>
            </div>
          )}

          {/* ── Step 2 ── */}
          {step === 2 && (
            <div className="space-y-5">
              <h2 className="text-xl font-semibold text-gray-900">Brand your workspace</h2>
              <p className="text-sm text-gray-500">Choose colors that match your company. You can change these anytime.</p>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Color theme</p>
                <div className="grid grid-cols-3 gap-2">
                  {COLOR_PRESETS.map((c) => (
                    <button key={c.label} type="button"
                      onClick={() => update({ primary_color: c.primary, secondary_color: c.secondary })}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-sm transition-colors ${
                        state.primary_color === c.primary
                          ? "border-gray-700" : "border-gray-200 hover:border-gray-300"
                      }`}>
                      <span className="w-5 h-5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: c.primary }} />
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Support Email</label>
                <input type="email" value={state.support_email}
                  onChange={(e) => update({ support_email: e.target.value })}
                  placeholder={state.admin_email || "support@yourcompany.com"} className={INPUT} />
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep(1)}
                  className="flex-1 py-3 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium">
                  ← Back
                </button>
                <button onClick={submitStep2} disabled={saving}
                  className="flex-1 py-3 text-sm font-semibold text-white rounded-xl disabled:opacity-50"
                  style={{ backgroundColor: state.primary_color }}>
                  {saving ? "Saving…" : "Continue →"}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3 ── */}
          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-xl font-semibold text-gray-900">Set up your org structure</h2>
              <p className="text-sm text-gray-500">
                Add your enterprise, areas, districts, and centers. You can also skip this and build it later.
              </p>

              <div className="space-y-2">
                {state.org_nodes.map((node, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input value={node.name}
                      onChange={(e) => {
                        const nodes = [...state.org_nodes];
                        nodes[i] = { ...nodes[i], name: e.target.value };
                        update({ org_nodes: nodes });
                      }}
                      placeholder={`e.g. "North Region" or "NYC-01"`}
                      className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    <select value={node.org_type}
                      onChange={(e) => {
                        const nodes = [...state.org_nodes];
                        nodes[i] = { ...nodes[i], org_type: e.target.value };
                        update({ org_nodes: nodes });
                      }}
                      className="border border-gray-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none">
                      {ORG_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    {i > 0 && (
                      <button type="button"
                        onClick={() => update({ org_nodes: state.org_nodes.filter((_, j) => j !== i) })}
                        className="text-red-400 hover:text-red-600 text-sm">✕</button>
                    )}
                  </div>
                ))}
                <button type="button"
                  onClick={() => update({ org_nodes: [...state.org_nodes, { name: "", org_type: "center", parent_index: null }] })}
                  className="text-sm text-indigo-600 hover:underline">
                  + Add node
                </button>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep(2)}
                  className="flex-1 py-3 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium">
                  ← Back
                </button>
                <button onClick={submitStep3} disabled={saving}
                  className="flex-1 py-3 text-sm font-semibold text-white rounded-xl disabled:opacity-50"
                  style={{ backgroundColor: state.primary_color }}>
                  {saving ? "Saving…" : "Continue →"}
                </button>
              </div>
              <button type="button" onClick={() => setStep(4)}
                className="w-full text-sm text-gray-400 hover:text-gray-600">
                Skip for now →
              </button>
            </div>
          )}

          {/* ── Step 4 ── */}
          {step === 4 && (
            <div className="space-y-5">
              <h2 className="text-xl font-semibold text-gray-900">Invite your team</h2>
              <p className="text-sm text-gray-500">
                Add team members. They&apos;ll receive a link to create their account. You can do this later too.
              </p>

              <div className="space-y-2">
                {state.invites.map((inv, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input type="email" value={inv.email}
                      onChange={(e) => {
                        const invites = [...state.invites];
                        invites[i] = { ...invites[i], email: e.target.value };
                        update({ invites });
                      }}
                      placeholder="teammate@company.com"
                      className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    <select value={inv.role}
                      onChange={(e) => {
                        const invites = [...state.invites];
                        invites[i] = { ...invites[i], role: e.target.value };
                        update({ invites });
                      }}
                      className="border border-gray-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none">
                      {ORG_ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
                    </select>
                  </div>
                ))}
                <button type="button"
                  onClick={() => update({ invites: [...state.invites, { email: "", role: "manager" }] })}
                  className="text-sm text-indigo-600 hover:underline">
                  + Add another
                </button>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep(3)}
                  className="flex-1 py-3 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium">
                  ← Back
                </button>
                <button onClick={submitStep4} disabled={saving}
                  className="flex-1 py-3 text-sm font-semibold text-white rounded-xl disabled:opacity-50"
                  style={{ backgroundColor: state.primary_color }}>
                  {saving ? "Sending invites…" : "Send Invites →"}
                </button>
              </div>
              <button type="button" onClick={() => setStep(5)}
                className="w-full text-sm text-gray-400 hover:text-gray-600">
                Skip for now →
              </button>
            </div>
          )}

          {/* ── Step 5 ── */}
          {step === 5 && (
            <div className="space-y-5">
              <h2 className="text-xl font-semibold text-gray-900">Safety preferences</h2>
              <p className="text-sm text-gray-500">Set your default OSHA and inspection settings. These apply across your workspace.</p>

              <div className="space-y-4">
                <label className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200 cursor-pointer">
                  <div>
                    <p className="text-sm font-medium text-gray-800">OSHA Annual Posting Reminders</p>
                    <p className="text-xs text-gray-500">Receive reminders to post Form 300A (Feb 1 – Apr 30)</p>
                  </div>
                  <input type="checkbox" checked={state.osha_reminder_enabled}
                    onChange={(e) => update({ osha_reminder_enabled: e.target.checked })}
                    className="rounded w-5 h-5" />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Inspection Cadence (days)
                    </label>
                    <input type="number" min={1} max={365}
                      value={state.default_inspection_cadence_days}
                      onChange={(e) => update({ default_inspection_cadence_days: Number(e.target.value) })}
                      className={INPUT} />
                    <p className="text-xs text-gray-400 mt-0.5">How often inspections should be scheduled</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Escalation Threshold (hours)
                    </label>
                    <input type="number" min={1} max={168}
                      value={state.default_escalation_hours}
                      onChange={(e) => update({ default_escalation_hours: Number(e.target.value) })}
                      className={INPUT} />
                    <p className="text-xs text-gray-400 mt-0.5">Hours before open incidents auto-escalate</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep(4)}
                  className="flex-1 py-3 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium">
                  ← Back
                </button>
                <button onClick={submitStep5} disabled={saving}
                  className="flex-1 py-3 text-sm font-semibold text-white rounded-xl disabled:opacity-50"
                  style={{ backgroundColor: state.primary_color }}>
                  {saving ? "Finishing setup…" : "Go to Dashboard →"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
