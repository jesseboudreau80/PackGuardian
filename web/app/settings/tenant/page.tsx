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

type ActiveSection = "branding" | "safety" | "invites";

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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Inspection Cadence (days)</label>
                <input type="number" min={1} max={365}
                  value={safetyForm.default_inspection_cadence_days}
                  onChange={(e) => setSafetyForm((f) => ({ ...f, default_inspection_cadence_days: Number(e.target.value) }))}
                  className={INPUT} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Escalation Threshold (hours)</label>
                <input type="number" min={1} max={168}
                  value={safetyForm.default_escalation_hours}
                  onChange={(e) => setSafetyForm((f) => ({ ...f, default_escalation_hours: Number(e.target.value) }))}
                  className={INPUT} />
              </div>
            </div>
          </div>
          <button type="submit" disabled={safetySaving}
            className="px-6 py-2.5 text-sm font-medium text-white rounded-lg disabled:opacity-50"
            style={{ backgroundColor: "var(--brand-primary)" }}>
            {safetySaved ? "✓ Saved" : safetySaving ? "Saving…" : "Save Safety Settings"}
          </button>
        </form>
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
