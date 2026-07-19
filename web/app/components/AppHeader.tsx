"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { useTenant } from "../context/TenantContext";
import { useAuth } from "../context/AuthContext";
import { useWorkspace } from "../context/WorkspaceContext";
import NotificationBell from "./NotificationBell";
import SearchModal from "./SearchModal";
import { API_URL } from "../lib/api";

export default function AppHeader() {
  const { tenant } = useTenant();
  const { isAuthenticated, isAdmin, logout } = useAuth();
  const { profile } = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [apiStatus, setApiStatus] = useState<"ok" | "error" | "checking">("checking");
  const settingsRef = useRef<HTMLDivElement>(null);
  const nav = profile?.nav ?? {};

  useEffect(() => {
    if (!isAuthenticated) return;
    async function checkHealth() {
      try {
        const r = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(4000) });
        setApiStatus(r.ok ? "ok" : "error");
      } catch {
        setApiStatus("error");
      }
    }
    checkHealth();
    const t = setInterval(checkHealth, 60_000);
    return () => clearInterval(t);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!settingsOpen) return;
    function onOutside(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [settingsOpen]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (isAuthenticated) setSearchOpen(true);
      }
      if (e.key === "Escape") setSettingsOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isAuthenticated]);

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname?.startsWith(href) ?? false;
  }

  return (
    <>
      <header
        className="bg-white border-b px-4 py-0 flex items-center gap-3 h-12"
        style={{
          borderBottomColor: "rgba(30, 58, 95, 0.12)",
          boxShadow: "0 1px 3px rgba(30, 58, 95, 0.06), 0 1px 2px rgba(30, 58, 95, 0.04)",
        }}
      >
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
          {tenant.logo_url ? (
            <img src={tenant.logo_url} alt={tenant.name} className="h-6 w-auto object-contain" />
          ) : (
            <span className="flex items-center gap-2">
              {/* Shield mark */}
              <svg width="20" height="22" viewBox="0 0 20 22" fill="none" xmlns="http://www.w3.org/2000/svg"
                className="shrink-0" aria-hidden="true">
                <path
                  d="M10 1L18 4.5V10.5C18 15.2 14.4 19.3 10 21C5.6 19.3 2 15.2 2 10.5V4.5L10 1Z"
                  fill="var(--brand-primary)"
                  fillOpacity="0.15"
                  stroke="var(--brand-primary)"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
                <path
                  d="M7 11L9.5 13.5L13.5 8.5"
                  stroke="var(--brand-primary)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span
                className="text-sm font-semibold tracking-tight leading-none"
                style={{ color: "var(--brand-primary)", letterSpacing: "-0.01em" }}
              >
                {tenant.name}
              </span>
            </span>
          )}
        </Link>

        {/* Divider */}
        {isAuthenticated && (
          <div className="w-px h-4 bg-gray-200 shrink-0 ml-1" />
        )}

        {/* Navigation */}
        {isAuthenticated && (
          <nav className="flex items-center gap-0.5 flex-1 overflow-x-auto min-w-0 scrollbar-none">
            {nav.show_command    !== false && <NavLink href="/command"   active={isActive("/command")}>Command</NavLink>}
            {nav.show_executive  !== false && isAdmin && <NavLink href="/executive" active={isActive("/executive")}>Executive</NavLink>}
            {nav.show_my_shift   !== false && (
              profile?.primary_role === "field_staff"
                ? <NavLink href="/mobile" active={isActive("/mobile")}>Safety Hub</NavLink>
                : <NavLink href="/work" active={isActive("/work")}>My Shift</NavLink>
            )}
            {nav.show_safety_intel !== false && <NavLink href="/safety" active={isActive("/safety")}>Safety Intel</NavLink>}
            {nav.show_cases      !== false && <NavLink href="/cases"   active={isActive("/cases")}>Cases</NavLink>}
            {nav.show_osha       !== false && <NavLink href="/osha"    active={isActive("/osha")}>OSHA</NavLink>}
            {nav.show_map        !== false && <NavLink href="/map"     active={isActive("/map")}>Field Map</NavLink>}
            {nav.show_field_ops  !== false && <NavLink href="/mobile"  active={isActive("/mobile")}>Safety Hub</NavLink>}
            {nav.show_automation           && <NavLink href="/automation" active={isActive("/automation")}>Automation</NavLink>}
          </nav>
        )}

        {/* Right controls */}
        <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
          {/* API status */}
          {isAuthenticated && apiStatus !== "checking" && (
            <div
              title={apiStatus === "ok"
                ? "PackGuardian server is reachable"
                : "Unable to reach the PackGuardian server. Reports submitted on mobile are saved locally and will sync when reconnected."}
              className={`hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full cursor-default font-medium ${
                apiStatus === "ok"
                  ? "text-emerald-700 bg-emerald-50 border border-emerald-200"
                  : "text-red-600 bg-red-50 border border-red-200 animate-pulse"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                apiStatus === "ok" ? "bg-emerald-500" : "bg-red-500"
              }`} />
              {apiStatus === "ok" ? "Connected" : "Offline"}
            </div>
          )}

          {/* Search */}
          {isAuthenticated && (
            <button
              onClick={() => setSearchOpen(true)}
              className="hidden sm:flex items-center gap-1.5 text-xs text-gray-400 border rounded-lg px-2.5 py-1.5 hover:text-gray-600 bg-white transition-all"
              style={{ borderColor: "var(--pg-border)", boxShadow: "var(--shadow-xs)" }}
            >
              <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
              <span className="hidden md:inline text-gray-400">Search</span>
              <kbd className="hidden md:inline border rounded text-xs leading-none px-1 py-0.5 text-gray-300 font-mono"
                style={{ borderColor: "var(--pg-border)" }}>⌘K</kbd>
            </button>
          )}

          {/* Notifications */}
          <NotificationBell />

          {/* Settings (admin only) */}
          {isAdmin && (
            <div className="relative" ref={settingsRef}>
              <button
                onClick={() => setSettingsOpen((o) => !o)}
                className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-all"
                style={{
                  color: settingsOpen ? "var(--pg-navy)" : "#4a5568",
                  background: settingsOpen ? "rgba(30,58,95,0.07)" : "transparent",
                }}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Settings
              </button>

              {settingsOpen && (
                <div
                  className="absolute right-0 top-full mt-1.5 w-52 bg-white rounded-xl py-1.5 z-50"
                  style={{
                    border: "1px solid var(--pg-border)",
                    boxShadow: "var(--shadow-overlay)",
                  }}
                >
                  <SettingsGroup label="Safety & OSHA">
                    <SettingsItem href="/osha/postings" onClick={() => setSettingsOpen(false)}>Annual Postings</SettingsItem>
                    <SettingsItem href="/osha/search" onClick={() => setSettingsOpen(false)}>Audit Search</SettingsItem>
                    <SettingsItem href="/safety" onClick={() => setSettingsOpen(false)}>Safety Intelligence</SettingsItem>
                  </SettingsGroup>

                  <div className="my-1 mx-3" style={{ borderTop: "1px solid var(--pg-border-soft)" }} />

                  <SettingsGroup label="Workspace">
                    <SettingsItem href="/settings/users" onClick={() => setSettingsOpen(false)}>Users</SettingsItem>
                    <SettingsItem href="/organizations" onClick={() => setSettingsOpen(false)}>Organizations</SettingsItem>
                    <SettingsItem href="/settings/tenant" onClick={() => setSettingsOpen(false)}>Workspace Settings</SettingsItem>
                    <SettingsItem href="/welcome" onClick={() => setSettingsOpen(false)}>Setup Checklist</SettingsItem>
                  </SettingsGroup>
                </div>
              )}
            </div>
          )}

          {/* Sign in / out */}
          {isAuthenticated ? (
            <button
              onClick={() => { logout(); router.push("/login"); }}
              className="text-xs text-gray-400 hover:text-gray-700 transition-colors px-1"
            >
              Sign out
            </button>
          ) : (
            <Link href="/login" className="text-xs text-gray-400 hover:text-gray-700 transition-colors">
              Sign in
            </Link>
          )}
        </div>
      </header>

      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
    </>
  );
}

function NavLink({ href, children, active }: { href: string; children: React.ReactNode; active?: boolean }) {
  return (
    <Link
      href={href}
      className="text-xs font-medium px-2.5 py-1.5 rounded-md whitespace-nowrap transition-all"
      style={{
        color: active ? "var(--pg-navy)" : "#5a6a7a",
        background: active ? "rgba(30, 58, 95, 0.08)" : "transparent",
        fontWeight: active ? "600" : "500",
      }}
    >
      {children}
    </Link>
  );
}

function SettingsGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="px-4 pt-2 pb-1 text-xs font-semibold uppercase tracking-widest"
        style={{ color: "var(--pg-text-muted)", letterSpacing: "0.06em" }}>
        {label}
      </p>
      {children}
    </div>
  );
}

function SettingsItem({ href, onClick, children }: { href: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="block px-4 py-2 text-sm rounded-lg mx-1 transition-colors"
      style={{ color: "var(--pg-text-sub)" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(30,58,95,0.05)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      {children}
    </Link>
  );
}
