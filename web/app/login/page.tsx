"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { useTenant } from "../context/TenantContext";

const DEMO_TENANT_ID = "00000000-0000-0000-0000-000000000001";
const DEMO_PASSWORD = "HappyTails2024!";

const DEMO_PERSONAS = [
  {
    label: "Field Staff",
    name: "Alex Torres",
    email: "alex.torres@happytails.com",
    description: "Report incidents, track your safety reports",
    color: "bg-green-50 border-green-200 hover:border-green-400",
    badge: "bg-green-100 text-green-700",
  },
  {
    label: "Center Manager",
    name: "Patricia Hall",
    email: "patricia.hall@happytails.com",
    description: "Daily operations, cases, corrective actions",
    color: "bg-blue-50 border-blue-200 hover:border-blue-400",
    badge: "bg-blue-100 text-blue-700",
  },
  {
    label: "District Director",
    name: "Marcus Johnson",
    email: "marcus.johnson@happytails.com",
    description: "Cross-center oversight and district risk",
    color: "bg-indigo-50 border-indigo-200 hover:border-indigo-400",
    badge: "bg-indigo-100 text-indigo-700",
  },
  {
    label: "Safety Director",
    name: "Sarah Chen",
    email: "sarah.chen@happytails.com",
    description: "OSHA automation, safety intelligence",
    color: "bg-purple-50 border-purple-200 hover:border-purple-400",
    badge: "bg-purple-100 text-purple-700",
  },
  {
    label: "HR Manager",
    name: "Michael Rodriguez",
    email: "michael.rodriguez@happytails.com",
    description: "Employee injuries, workers comp, HR workflows",
    color: "bg-orange-50 border-orange-200 hover:border-orange-400",
    badge: "bg-orange-100 text-orange-700",
  },
  {
    label: "Area VP",
    name: "Jennifer Kim",
    email: "jennifer.kim@happytails.com",
    description: "Enterprise-wide area intelligence",
    color: "bg-gray-50 border-gray-200 hover:border-gray-400",
    badge: "bg-gray-100 text-gray-700",
  },
];

function LoginForm() {
  const { login } = useAuth();
  const { tenant } = useTenant();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("from") ?? "/";
  const reason = searchParams.get("reason");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState<string | null>(null);

  const isDemo = tenant.id === DEMO_TENANT_ID;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      router.push(redirectTo);
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? (err.response?.data?.detail ?? "Login failed")
        : "Login failed";
      setError(String(msg));
    } finally {
      setLoading(false);
    }
  }

  async function loginAsPersona(personaEmail: string) {
    setError(null);
    setDemoLoading(personaEmail);
    try {
      await login(personaEmail, DEMO_PASSWORD);
      router.push("/");
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? (err.response?.data?.detail ?? "Demo login failed")
        : "Demo login failed";
      setError(String(msg));
    } finally {
      setDemoLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-8">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm w-full max-w-sm p-8">
        <div className="mb-6 text-center">
          <span
            className="text-2xl font-bold tracking-tight"
            style={{ color: "var(--brand-primary)" }}
          >
            {tenant.name}
          </span>
          <p className="mt-1 text-sm text-gray-500">Sign in to your account</p>
        </div>

        {reason === "session_expired" && (
          <div className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 flex items-center gap-2">
            <span>⚠</span>
            <span>Your session has expired. Please sign in again.</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !!demoLoading}
            className="w-full py-2 px-4 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-opacity"
            style={{ backgroundColor: "var(--brand-primary)" }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>

      {/* Demo persona tiles — only shown on the demo tenant */}
      {isDemo && (
        <div className="w-full max-w-2xl mt-8">
          <div className="text-center mb-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Try a demo role</p>
            <p className="text-xs text-gray-400 mt-1">Each role shows a different experience</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {DEMO_PERSONAS.map((persona) => (
              <button
                key={persona.email}
                onClick={() => loginAsPersona(persona.email)}
                disabled={!!demoLoading}
                className={`text-left border rounded-xl px-4 py-3.5 transition-all disabled:opacity-60 ${persona.color}`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${persona.badge}`}>
                    {persona.label}
                  </span>
                  {demoLoading === persona.email && (
                    <span className="text-xs text-gray-400">Loading…</span>
                  )}
                </div>
                <p className="text-sm font-medium text-gray-800">{persona.name}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-snug">{persona.description}</p>
              </button>
            ))}
          </div>
          <p className="text-center text-xs text-gray-300 mt-3">All demo accounts use password: HappyTails2024!</p>
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
