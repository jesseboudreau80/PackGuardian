"use client";

import { useEffect, useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { API_URL } from "../lib/api";
import type { CenterHeat, CenterRead, Timeframe } from "./types";

// Leaflet is browser-only — skip SSR entirely
const RiskMap = dynamic(() => import("./RiskMap"), { ssr: false });

const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  "7d":  "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "all": "All time",
};

const RISK_COLORS: Record<string, string> = {
  high:   "bg-red-100 text-red-700 border-red-200",
  medium: "bg-orange-100 text-orange-700 border-orange-200",
  low:    "bg-green-100 text-green-700 border-green-200",
};

const RISK_DOT: Record<string, string> = {
  high:   "bg-red-500",
  medium: "bg-orange-400",
  low:    "bg-green-500",
};

export default function MapPage() {
  const { isAuthenticated, isAdmin } = useAuth();
  const router = useRouter();

  const [centers, setCenters] = useState<CenterHeat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>("30d");
  const [recordableOnly, setRecordableOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Register center modal
  const [showRegister, setShowRegister] = useState(false);
  const [registeredCenters, setRegisteredCenters] = useState<CenterRead[]>([]);
  const [registerForm, setRegisterForm] = useState({
    center_code: "", name: "", latitude: "", longitude: "",
    address: "", city: "", state: "",
  });
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login?from=/map");
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchHeat();
  }, [isAuthenticated, timeframe, recordableOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchHeat() {
    setLoading(true);
    setError(null);
    setSelectedId(null);
    try {
      const res = await axios.get<CenterHeat[]>(`${API_URL}/map/heat`, {
        params: { timeframe, recordable_only: recordableOnly },
      });
      setCenters(res.data);
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? (err.response?.data?.detail ?? err.message)
        : "Failed to load map data";
      setError(String(msg));
    } finally {
      setLoading(false);
    }
  }

  async function openRegister() {
    try {
      const res = await axios.get<CenterRead[]>(`${API_URL}/map/centers`);
      setRegisteredCenters(res.data);
    } catch {
      setRegisteredCenters([]);
    }
    setShowRegister(true);
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setRegisterError(null);
    const lat = parseFloat(registerForm.latitude);
    const lng = parseFloat(registerForm.longitude);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      setRegisterError("Latitude must be between -90 and 90");
      return;
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      setRegisterError("Longitude must be between -180 and 180");
      return;
    }
    setRegistering(true);
    try {
      await axios.post(`${API_URL}/map/centers`, {
        center_code: registerForm.center_code,
        name: registerForm.name,
        latitude: lat,
        longitude: lng,
        address: registerForm.address || null,
        city: registerForm.city || null,
        state: registerForm.state || null,
      });
      setShowRegister(false);
      setRegisterForm({ center_code: "", name: "", latitude: "", longitude: "", address: "", city: "", state: "" });
      fetchHeat();
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? (err.response?.data?.detail ?? err.message)
        : "Failed to register center";
      setRegisterError(String(msg));
    } finally {
      setRegistering(false);
    }
  }

  const selected = centers.find((c) => c.center_id === selectedId) ?? null;

  if (!isAuthenticated) return null;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Risk Intelligence Map</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Click a center marker to inspect its hotspot profile
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Timeframe selector */}
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value as Timeframe)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {(Object.keys(TIMEFRAME_LABELS) as Timeframe[]).map((tf) => (
              <option key={tf} value={tf}>{TIMEFRAME_LABELS[tf]}</option>
            ))}
          </select>
          {/* Recordable toggle */}
          <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={recordableOnly}
              onChange={(e) => setRecordableOnly(e.target.checked)}
              className="rounded border-gray-300"
            />
            OSHA recordable only
          </label>
          {isAdmin && (
            <button
              onClick={openRegister}
              className="px-3 py-1.5 text-sm font-medium text-white rounded-lg"
              style={{ backgroundColor: "var(--brand-primary)" }}
            >
              Register Center
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* Map + hotspot panel */}
      <div className="flex gap-4" style={{ height: "calc(100vh - 220px)", minHeight: 480 }}>
        {/* Map */}
        <div className="flex-1 rounded-xl border border-gray-200 overflow-hidden bg-gray-100">
          {loading ? (
            <div className="h-full flex items-center justify-center text-sm text-gray-400">
              Loading map data…
            </div>
          ) : centers.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-gray-400">
              <p className="text-sm">No registered centers with coordinate data.</p>
              {isAdmin && (
                <button
                  onClick={openRegister}
                  className="text-sm underline"
                  style={{ color: "var(--brand-primary)" }}
                >
                  Register your first center
                </button>
              )}
            </div>
          ) : (
            <RiskMap
              centers={centers}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
        </div>

        {/* Hotspot panel */}
        {selected && (
          <div className="w-80 flex-shrink-0 bg-white rounded-xl border border-gray-200 overflow-y-auto">
            <HotspotPanel center={selected} onClose={() => setSelectedId(null)} />
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="font-medium">Risk level:</span>
        {(["high", "medium", "low"] as const).map((lvl) => (
          <span key={lvl} className="flex items-center gap-1">
            <span className={`w-2.5 h-2.5 rounded-full ${RISK_DOT[lvl]}`} />
            {lvl.charAt(0).toUpperCase() + lvl.slice(1)}
          </span>
        ))}
        <span className="ml-2 text-gray-400">Marker size = heat intensity</span>
      </div>

      {/* Register center modal */}
      {showRegister && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-lg p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Register Center</h2>
            <p className="text-xs text-gray-500 mb-4">
              The center code must match the <code>center_id</code> used on incidents.
            </p>

            {/* Existing centers list */}
            {registeredCenters.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-medium text-gray-500 mb-1.5">Already registered</p>
                <div className="flex flex-wrap gap-1.5">
                  {registeredCenters.map((c) => (
                    <span key={c.id} className="inline-block bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded">
                      {c.center_code} — {c.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handleRegister} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Center Code *</label>
                  <input
                    required
                    value={registerForm.center_code}
                    onChange={(e) => setRegisterForm((f) => ({ ...f, center_code: e.target.value }))}
                    placeholder="e.g. NYC-01"
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
                  <input
                    required
                    value={registerForm.name}
                    onChange={(e) => setRegisterForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. New York Downtown"
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Latitude *</label>
                  <input
                    required
                    type="number"
                    step="any"
                    value={registerForm.latitude}
                    onChange={(e) => setRegisterForm((f) => ({ ...f, latitude: e.target.value }))}
                    placeholder="40.7128"
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Longitude *</label>
                  <input
                    required
                    type="number"
                    step="any"
                    value={registerForm.longitude}
                    onChange={(e) => setRegisterForm((f) => ({ ...f, longitude: e.target.value }))}
                    placeholder="-74.0060"
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">City</label>
                  <input
                    value={registerForm.city}
                    onChange={(e) => setRegisterForm((f) => ({ ...f, city: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">State</label>
                  <input
                    value={registerForm.state}
                    onChange={(e) => setRegisterForm((f) => ({ ...f, state: e.target.value }))}
                    placeholder="NY"
                    maxLength={2}
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Address</label>
                <input
                  value={registerForm.address}
                  onChange={(e) => setRegisterForm((f) => ({ ...f, address: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {registerError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {registerError}
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={registering}
                  className="flex-1 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
                  style={{ backgroundColor: "var(--brand-primary)" }}
                >
                  {registering ? "Registering…" : "Register"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowRegister(false); setRegisterError(null); }}
                  className="flex-1 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function HotspotPanel({ center, onClose }: { center: CenterHeat; onClose: () => void }) {
  const riskClass = RISK_COLORS[center.emerging_risk_level] ?? "";
  const velocitySign = center.trend_velocity > 0 ? "+" : "";
  const velocityPct = Math.round(center.trend_velocity * 100);

  return (
    <div className="p-4 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">{center.name}</h2>
          <span className="text-xs text-gray-400 font-mono">{center.center_id}</span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {/* Risk level badge */}
      <div className={`inline-flex items-center gap-1.5 self-start px-2.5 py-1 rounded-full border text-xs font-medium ${riskClass}`}>
        <span className={`w-2 h-2 rounded-full ${RISK_DOT[center.emerging_risk_level]}`} />
        {center.emerging_risk_level.charAt(0).toUpperCase() + center.emerging_risk_level.slice(1)} Risk
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-2">
        <Metric label="Heat Score" value={`${center.heat_score.toFixed(0)} / 100`} />
        <Metric label="Incidents" value={String(center.incident_count)} />
        <Metric label="Avg Risk Score" value={`${center.avg_risk_score.toFixed(0)} / 100`} />
        <Metric label="OSHA Recordable" value={String(center.osha_recordable_count)} />
        <Metric
          label="Trend Velocity"
          value={`${velocitySign}${velocityPct}%`}
          valueClass={center.trend_velocity > 0.1 ? "text-red-600" : center.trend_velocity < -0.1 ? "text-green-600" : "text-gray-700"}
        />
      </div>

      {/* Top risk drivers */}
      {center.top_drivers.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1.5">Top Risk Drivers</p>
          <div className="flex flex-wrap gap-1.5">
            {center.top_drivers.map((d) => (
              <span key={d} className="bg-red-50 text-red-700 text-xs px-2 py-0.5 rounded-full border border-red-100">
                {d}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Recommended actions */}
      {center.recommended_actions.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1.5">Recommended Actions</p>
          <ul className="space-y-1.5">
            {center.recommended_actions.map((a, i) => (
              <li key={i} className="flex gap-2 text-xs text-gray-700">
                <span className="shrink-0 text-indigo-400 font-bold">{i + 1}.</span>
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}

      {center.top_drivers.length === 0 && center.recommended_actions.length === 0 && (
        <p className="text-xs text-gray-400 italic">
          No intelligence data yet — incidents need to be processed by the engine.
        </p>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  valueClass = "text-gray-900",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-sm font-semibold mt-0.5 ${valueClass}`}>{value}</p>
    </div>
  );
}
