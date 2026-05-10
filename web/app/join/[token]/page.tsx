"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import axios from "axios";
import { useAuth } from "../../context/AuthContext";
import { API_URL } from "../../lib/api";

interface InviteInfo {
  email: string;
  role: string;
  tenant_name: string;
  tenant_primary_color: string;
  expires_at: string;
}

export default function JoinPage() {
  const params = useParams();
  const token = params?.token as string;
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    axios.get<InviteInfo>(`${API_URL}/provision/invite/${token}`)
      .then((r) => setInfo(r.data))
      .catch(() => setInvalid(true))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleAccept(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setAccepting(true); setError(null);
    try {
      const res = await axios.post(`${API_URL}/provision/invite/${token}/accept`, { password });
      localStorage.setItem("pg_token", res.data.access_token);
      localStorage.setItem("pg_role", "manager");
      // Force full reload so TenantContext and AuthContext re-initialise
      window.location.href = "/welcome";
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? String(err.response?.data?.detail ?? err.message) : "Failed to accept invitation");
    } finally { setAccepting(false); }
  }

  const brandColor = info?.tenant_primary_color ?? "#4F46E5";

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">
      Validating invitation…
    </div>
  );

  if (invalid) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-5xl">❌</p>
      <h1 className="text-xl font-semibold text-gray-900">Invalid or Expired Invitation</h1>
      <p className="text-sm text-gray-500">
        This invitation link is invalid, has already been used, or has expired.
        Please contact your administrator for a new invite.
      </p>
      <a href="/login" className="text-indigo-600 hover:underline text-sm">Go to Sign In</a>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center text-2xl font-bold text-white"
            style={{ backgroundColor: brandColor }}>
            {info?.tenant_name?.[0] ?? "P"}
          </div>
          <h1 className="text-xl font-bold text-gray-900">{info?.tenant_name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">PackGuardian — Operational Safety Platform</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">You're invited!</h2>
          <p className="text-sm text-gray-500 mb-4">
            You've been invited to join <strong>{info?.tenant_name}</strong> as{" "}
            <strong className="capitalize">{info?.role?.replace(/_/g, " ")}</strong>.
            Set your password to accept.
          </p>

          <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 mb-4">
            <p className="text-xs text-gray-500 font-medium">Account email</p>
            <p className="text-sm font-semibold text-gray-800">{info?.email}</p>
          </div>

          <form onSubmit={handleAccept} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Create Password *</label>
              <input type="password" required value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 characters"
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Confirm Password *</label>
              <input type="password" required value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat password"
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}

            <button type="submit" disabled={accepting}
              className="w-full py-3 text-sm font-semibold text-white rounded-xl disabled:opacity-50"
              style={{ backgroundColor: brandColor }}>
              {accepting ? "Activating account…" : "Accept & Sign In"}
            </button>
          </form>

          <p className="text-xs text-gray-400 text-center mt-3">
            Invitation expires {new Date(info?.expires_at ?? "").toLocaleDateString()}
          </p>
        </div>
      </div>
    </div>
  );
}
