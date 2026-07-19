"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { useAuth } from "../../context/AuthContext";
import { API_URL } from "../../lib/api";

interface TenantConfig {
  id: string; name: string; primary_color: string; secondary_color: string | null;
  theme: string; support_email: string; support_phone: string | null;
}
interface TenantSettings {
  is_trial: boolean; trial_expires_at: string | null;
  onboarding_step: number; onboarding_completed: boolean;
  facility_type: string | null; osha_reminder_enabled: boolean;
  osha_reminder_lead_days: number; default_inspection_cadence_days: number;
  default_escalation_hours: number;
}
interface InviteRead {
  id: string; email: string; role: string; invite_url: string;
  is_accepted: boolean; expires_at: string; created_at: string;
}

const INPUT = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white";

type ActiveSection = "branding" | "safety" | "invites" | "demo";

export default function TenantSettingsPage() {
  const { isAuthenticated, isAdmin } = useAuth();
  const router = useRouter();
  const [section, setSection] = useState<ActiveSection>("branding");

  // Branding
  const [tenant, setTenant] = useState<TenantConfig | null>(null);
  const [brandForm, setBrandForm] = useState({
    name: "", primary_color: "#4F46E5", secondary_color: "#6366F1",
    support_email: "", support_phone: "", theme: "light",
  });
  const [brandSaving, setBrandSaving] = useState(false);
  const [brandSaved, setBrandSaved] = useState(false);

  // Safety settings
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [safetyForm, setSafetyForm] = useState({
    osha_reminder_enabled: true, osha_reminder_lead_days: 30,
    default_inspection_cadence_days: 30, default_escalation_hours: 24,
  });
  const [safetySaving, setSafetySaving] = useState(false);
  const [safetySaved, setSafetySaved] = useState(false);

  // Demo data
  const [demoResetting, setDemoResetting] = useState(false);
  const [demoResult, setDemoResult] = useState<Record<string, number> | null>(null);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [demoConfirm, setDemoConfirm] = useState(false);

  // Invites
  const [invites, setInvites] = useState<InviteRead[]>([]);
  const [newInviteEmail, setNewInviteEmail] = useState("");
  const [newInviteRole, setNewInviteRole] = useState("manager");
  const [inviting, setInviting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login?from=/settings/tenant"); return; }
    Promise.all([
      axios.get<TenantConfig>(`${API_URL}/tenant/me`).catch(() => axios.get<TenantConfig>(`${API_URL}/tenant`)),
      axios.get<TenantSettings>(`${API_URL}/provision/settings`),
      axios.get<InviteRead[]>(`${API_URL}/provision/invites`),
    ]).then(([tRes, sRes, iRes]) => {
      setTenant(tRes.data);
      setBrandForm({
        name: tRes.data.name,
        primary_color: tRes.data.primary_color,
        secondary_color: tRes.data.secondary_color ?? "#6366F1",
        support_email: tRes.data.support_email,
        support_phone: tRes.data.support_phone ?? "",
        theme: tRes.data.theme,
      });
      setSettings(sRes.data);
      setSafetyForm({
        osha_reminder_enabled: sRes.data.osha_reminder_enabled,
        osha_reminder_lead_days: sRes.data.osha_reminder_lead_days,
        default_inspection_cadence_days: sRes.data.default_inspection_cadence_days,
        default_escalation_hours: sRes.data.default_escalation_hours,
      });
      setInvites(iRes.data);
    }).catch(() => {});
  }, [isAuthenticated, router]);

  async function saveBranding(e: FormEvent) {
    e.preventDefault(); setBrandSaving(true); setBrandSaved(false);
    try {
      await axios.put(`${API_URL}/tenant`, brandForm);
      setBrandSaved(true); setTimeout(() => setBrandSaved(false), 3000);
    } catch { /* ignore */ }
    finally { setBrandSaving(false); }
  }

  async function saveSafety(e: FormEvent) {
    e.preventDefault(); setSafetySaving(true); setSafetySaved(false);
    try {
      await axios.patch(`${API_URL}/provision/settings`, safetyForm);
      setSafetySaved(true); setTimeout(() => setSafetySaved(false), 3000);
    } catch { /* ignore */ }
    finally { setSafetySaving(false); }
  }

  async function sendInvite(e: FormEvent) {
    e.preventDefault(); if (!newInviteEmail) return;
    setInviting(true);
    try {
      const res = await axios.post<InviteRead>(`${API_URL}/provision/invite`, {
        email: newInviteEmail, role: newInviteRole,
      });
      setInvites((prev) => [res.data, ...prev.filter((i) => i.id !== res.data.id)]);
      setNewInviteEmail("");
    } catch { /* ignore */ }
    finally { setInviting(false); }
  }

  async function revokeInvite(id: string) {
    setRevoking(id);
    try {
      await axios.delete(`${API_URL}/provision/invites/${id}`);
      setInvites((prev) => prev.filter((i) => i.id !== id));
    } catch { /* ignore */ }
    finally { setRevoking(null); }
  }

  async function resetDemo() {
    setDemoResetting(true); setDemoResult(null); setDemoError(null); setDemoConfirm(false);
    try {
      const res = await axios.post<Record<string, number>>(`${API_URL}/provision/reset-demo`);
      setDemoResult(res.data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setDemoError(msg ?? "Reset failed. Check server logs.");
    } finally {
      setDemoResetting(false);
    }
  }

  function copyLink(invite: InviteRead) {
    navigator.clipboard.writeText(invite.invite_url);
    setCopiedId(invite.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  if (!isAuthenticated) return null;

  const SECTIONS: { key: ActiveSection; label: string }[] = [
    { key: "branding", label: "Branding" },
    { key: "safety",   label: "Safety Defaults" },
    { key: "invites",  label: "Invitations" },
    { key: "demo",     label: "Demo Data" },
  ];

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Tenant Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage your PackGuardian workspace configuration</p>
        {settings?.is_trial && (
          <span className="mt-2 inline-block text-xs bg-amber-100 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full font-medium">
            Trial Workspace
            {settings.trial_expires_at && (
              ` · Expires ${new Date(settings.trial_expires_at).toLocaleDateString()}`
            )}
          </span>
        )}
      </div>

      {/* Section tabs */}
      <div className="flex border-b border-gray-200">
        {SECTIONS.map(({ key, label }) => (
          <button key={key} onClick={() => setSection(key)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px ${
              section === key ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-800"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Branding ── */}
      {section === "branding" && (
        <form onSubmit={saveBranding} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Workspace Name</label>
              <input value={brandForm.name} onChange={(e) => setBrandForm((f) => ({ ...f, name: e.target.value }))}
                className={INPUT} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Primary Color</label>
              <div className="flex gap-2 items-center">
                <input type="color" value={brandForm.primary_color}
                  onChange={(e) => setBrandForm((f) => ({ ...f, primary_color: e.target.value }))}
                  className="w-12 h-10 rounded-lg border border-gray-300 cursor-pointer" />
                <input value={brandForm.primary_color}
                  onChange={(e) => setBrandForm((f) => ({ ...f, primary_color: e.target.value }))}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Secondary Color</label>
              <div className="flex gap-2 items-center">
                <input type="color" value={brandForm.secondary_color}
                  onChange={(e) => setBrandForm((f) => ({ ...f, secondary_color: e.target.value }))}
                  className="w-12 h-10 rounded-lg border border-gray-300 cursor-pointer" />
                <input value={brandForm.secondary_color}
                  onChange={(e) => setBrandForm((f) => ({ ...f, secondary_color: e.target.value }))}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Support Email</label>
              <input type="email" value={brandForm.support_email}
                onChange={(e) => setBrandForm((f) => ({ ...f, support_email: e.target.value }))}
                className={INPUT} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Support Phone</label>
              <input value={brandForm.support_phone}
                onChange={(e) => setBrandForm((f) => ({ ...f, support_phone: e.target.value }))}
                placeholder="Optional" className={INPUT} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Theme</label>
              <select value={brandForm.theme}
                onChange={(e) => setBrandForm((f) => ({ ...f, theme: e.target.value }))}
                className={INPUT}>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>
          </div>
          <button type="submit" disabled={brandSaving}
            className="px-6 py-2.5 text-sm font-medium text-white rounded-lg disabled:opacity-50"
            style={{ backgroundColor: "var(--brand-primary)" }}>
            {brandSaved ? "✓ Saved" : brandSaving ? "Saving…" : "Save Branding"}
          </button>
        </form>
      )}

      {/* ── Safety defaults ── */}
      {section === "safety" && (
        <form onSubmit={saveSafety} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">OSHA Compliance</h3>
            <label className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200 cursor-pointer">
              <div>
                <p className="text-sm font-medium text-gray-800">Annual Posting Reminders</p>
                <p className="text-xs text-gray-500">Notifications to post Form 300A Feb 1 – Apr 30</p>
              </div>
              <input type="checkbox" checked={safetyForm.osha_reminder_enabled}
                onChange={(e) => setSafetyForm((f) => ({ ...f, osha_reminder_enabled: e.target.checked }))}
                className="rounded w-5 h-5" />
            </label>
            <div className="mt-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reminder Lead Time (days before Feb 1)
              </label>
              <input type="number" min={1} max={90}
                value={safetyForm.osha_reminder_lead_days}
                onChange={(e) => setSafetyForm((f) => ({ ...f, osha_reminder_lead_days: Number(e.target.value) }))}
                className={INPUT} />
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Operational Defaults</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Escalation Threshold (hours)</label>
              <input type="number" min={1} max={168}
                value={safetyForm.default_escalation_hours}
                onChange={(e) => setSafetyForm((f) => ({ ...f, default_escalation_hours: Number(e.target.value) }))}
                className={INPUT} />
              <p className="text-xs text-gray-400 mt-1">Hours before an unacknowledged case auto-escalates to the next level</p>
            </div>
          </div>
          <button type="submit" disabled={safetySaving}
            className="px-6 py-2.5 text-sm font-medium text-white rounded-lg disabled:opacity-50"
            style={{ backgroundColor: "var(--brand-primary)" }}>
            {safetySaved ? "✓ Saved" : safetySaving ? "Saving…" : "Save Safety Settings"}
          </button>
        </form>
      )}

      {/* ── Demo Data ── */}
      {section === "demo" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-800 mb-1">Happy Tails Pet Resorts Demo</h3>
            <p className="text-sm text-gray-500 mb-4">
              Populates your workspace with a realistic 20-center enterprise scenario — incidents,
              OSHA data, cases, incidents, evidence, and more. Existing data for this tenant
              will be replaced.
            </p>

            <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 mb-4 grid grid-cols-2 gap-y-1 text-sm text-gray-600">
              <span>Enterprise</span>      <span className="font-medium">Happy Tails Pet Resorts</span>
              <span>Regions</span>         <span className="font-medium">2 (Southeast, Northeast)</span>
              <span>Districts</span>       <span className="font-medium">5</span>
              <span>Centers</span>         <span className="font-medium">20 across FL, GA, NY, PA, MA/CT/RI/NH</span>
              <span>Demo users</span>      <span className="font-medium">15 (safety, HR, area/district/center managers)</span>
              <span>Incidents</span>       <span className="font-medium">31 (8 OSHA recordable)</span>
              <span>Cases</span>           <span className="font-medium">31 (with tasks, comments, escalations)</span>
              <span>OSHA Records</span>     <span className="font-medium">Recordable incidents with classification</span>
              <span>Evidence files</span>  <span className="font-medium">12 (with AI analysis)</span>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700 mb-5">
              <strong>Warning:</strong> This will delete all existing users, incidents, cases, inspections,
              and operational data for this workspace. Your admin account is preserved.
            </div>

            {demoResult && (
              <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700 mb-4">
                <p className="font-semibold mb-1">Demo data loaded successfully.</p>
                <div className="grid grid-cols-3 gap-x-6 gap-y-0.5 text-xs mt-2">
                  {Object.entries(demoResult)
                    .filter(([k]) => k !== "reset")
                    .map(([k, v]) => (
                      <span key={k}>{k.replace(/_/g, " ")}: <strong>{v}</strong></span>
                    ))}
                </div>
                <p className="text-xs mt-2 text-green-600">
                  Log in as <code className="bg-green-100 px-1 rounded">sarah.chen@happytails.com</code> /&nbsp;
                  <code className="bg-green-100 px-1 rounded">HappyTails2024!</code> to explore as Safety Director.
                </p>
              </div>
            )}

            {demoError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-4">
                {demoError}
              </div>
            )}

            {!demoConfirm ? (
              <button
                onClick={() => setDemoConfirm(true)}
                className="px-5 py-2.5 text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors"
              >
                Reset &amp; Load Demo Data
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  onClick={resetDemo}
                  disabled={demoResetting}
                  className="px-5 py-2.5 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50 transition-colors"
                >
                  {demoResetting ? "Resetting…" : "Confirm Reset"}
                </button>
                <button
                  onClick={() => setDemoConfirm(false)}
                  className="px-4 py-2.5 text-sm text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Demo User Logins</h3>
            <p className="text-xs text-gray-400 mb-3">All demo users share the same password.</p>
            <div className="space-y-1 text-sm">
              {[
                ["Sarah Chen", "sarah.chen@happytails.com",       "Safety Director"],
                ["Michael Rodriguez", "michael.rodriguez@happytails.com", "HR Manager"],
                ["Jennifer Kim", "jennifer.kim@happytails.com",   "Area VP — Southeast"],
                ["David Patel", "david.patel@happytails.com",    "Area VP — Northeast"],
                ["Marcus Johnson", "marcus.johnson@happytails.com","District Director — Florida"],
                ["Patricia Hall", "patricia.hall@happytails.com", "Center Manager — Miami / Orlando"],
              ].map(([name, email, role]) => (
                <div key={email} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                  <div>
                    <span className="font-medium text-gray-800">{name}</span>
                    <span className="text-gray-400 mx-1.5">&middot;</span>
                    <span className="text-gray-500 text-xs">{role}</span>
                  </div>
                  <code className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">{email}</code>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-3">
              Password for all demo users: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">HappyTails2024!</code>
            </p>
          </div>
        </div>
      )}

      {/* ── Invitations ── */}
      {section === "invites" && (
        <div className="space-y-4">
          <form onSubmit={sendInvite} className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Send New Invitation</h3>
            <div className="flex gap-2">
              <input type="email" required value={newInviteEmail}
                onChange={(e) => setNewInviteEmail(e.target.value)}
                placeholder="teammate@company.com"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <select value={newInviteRole} onChange={(e) => setNewInviteRole(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none">
                {["manager","safety","hr","operations","center_manager","district_manager"].map((r) => (
                  <option key={r} value={r}>{r.replace(/_/g," ")}</option>
                ))}
              </select>
              <button type="submit" disabled={inviting}
                className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
                style={{ backgroundColor: "var(--brand-primary)" }}>
                {inviting ? "…" : "Invite"}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              An invitation link will be generated. Share it directly with the recipient.
            </p>
          </form>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700">Pending Invitations ({invites.length})</h3>
            </div>
            {invites.length === 0 ? (
              <p className="px-5 py-6 text-sm text-gray-400 text-center italic">No pending invitations</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {invites.map((inv) => (
                  <li key={inv.id} className={`flex items-center gap-3 px-5 py-3 ${inv.is_accepted ? "opacity-50" : ""}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{inv.email}</p>
                      <p className="text-xs text-gray-400 capitalize">
                        {inv.role.replace(/_/g," ")} ·{" "}
                        {inv.is_accepted ? "Accepted" : `Expires ${new Date(inv.expires_at).toLocaleDateString()}`}
                      </p>
                    </div>
                    {!inv.is_accepted && (
                      <div className="flex items-center gap-2">
                        <button onClick={() => copyLink(inv)}
                          className="text-xs text-indigo-600 hover:underline">
                          {copiedId === inv.id ? "✓ Copied!" : "Copy Link"}
                        </button>
                        <button onClick={() => revokeInvite(inv.id)} disabled={revoking === inv.id}
                          className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50">
                          Revoke
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
