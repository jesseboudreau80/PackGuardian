"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTenant } from "../context/TenantContext";
import { useAuth } from "../context/AuthContext";
import { useWorkspace } from "../context/WorkspaceContext";
import NotificationBell from "./NotificationBell";
import SearchModal from "./SearchModal";

export default function AppHeader() {
  const { tenant } = useTenant();
  const { isAuthenticated, isAdmin, logout } = useAuth();
  const { profile } = useWorkspace();
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const nav = profile?.nav ?? {};
  const [searchOpen, setSearchOpen] = useState(false);

  // Global keyboard shortcut: Cmd+K or Ctrl+K opens search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (isAuthenticated) setSearchOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isAuthenticated]);

  return (
    <>
      <header
        className="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center gap-3"
        style={{ borderBottomColor: "var(--brand-primary)" }}
      >
        {/* Brand identity */}
        <div className="flex items-center gap-2 shrink-0">
          {tenant.logo_url ? (
            <img src={tenant.logo_url} alt={tenant.name} className="h-7 w-auto object-contain" />
          ) : (
            <span className="text-lg font-bold tracking-tight" style={{ color: "var(--brand-primary)" }}>
              {tenant.name}
            </span>
          )}
        </div>

        {/* Navigation — adapts per role via WorkspaceContext */}
        <nav className="flex items-center gap-0.5 ml-1 flex-1 overflow-x-auto">
          {nav.show_command    !== false && <NavLink href="/command">Command</NavLink>}
          {nav.show_my_shift   !== false && <NavLink href="/work">My Shift</NavLink>}
          {nav.show_safety_intel !== false && <NavLink href="/safety">Safety Intel</NavLink>}
          {nav.show_cases      !== false && <NavLink href="/cases">Cases</NavLink>}
          {nav.show_osha       !== false && <NavLink href="/osha">OSHA</NavLink>}
          {nav.show_map        !== false && <NavLink href="/map">Field Map</NavLink>}
          {nav.show_field_ops  !== false && <NavLink href="/mobile">Field Ops</NavLink>}
          {nav.show_automation           && <NavLink href="/automation">Automation</NavLink>}

          {/* Settings dropdown — admin only */}
          {isAdmin && (
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setSettingsOpen((o) => !o)}
                className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded hover:bg-gray-100 flex items-center gap-1"
              >
                Settings
                <svg className={`w-3 h-3 transition-transform ${settingsOpen ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {settingsOpen && (
                <div
                  className="absolute left-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-30 py-1"
                  onMouseLeave={() => setSettingsOpen(false)}
                >
                  <p className="px-4 pt-2 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">OSHA & Safety</p>
                  <Link href="/osha/postings" onClick={() => setSettingsOpen(false)}
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Annual Postings</Link>
                  <Link href="/osha/search" onClick={() => setSettingsOpen(false)}
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Audit Search</Link>
                  <Link href="/safety" onClick={() => setSettingsOpen(false)}
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Safety Intelligence</Link>
                  <div className="border-t border-gray-100 my-1" />
                  <p className="px-4 pt-1 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">Admin</p>
                  <Link href="/settings/users" onClick={() => setSettingsOpen(false)}
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Users</Link>
                  <Link href="/organizations" onClick={() => setSettingsOpen(false)}
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Organizations</Link>
                  <Link href="/settings/tenant" onClick={() => setSettingsOpen(false)}
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Workspace Settings</Link>
                  <Link href="/settings/branding" onClick={() => setSettingsOpen(false)}
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Branding</Link>
                  <Link href="/welcome" onClick={() => setSettingsOpen(false)}
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Setup Checklist</Link>
                </div>
              )}
            </div>
          )}
        </nav>

        {/* Right side: search + notifications + auth */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Search button */}
          {isAuthenticated && (
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-1.5 text-xs text-gray-400 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:border-gray-300 hover:text-gray-600 bg-white transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
              <span className="hidden sm:inline">Search</span>
              <kbd className="hidden sm:inline border border-gray-200 rounded px-1 text-xs leading-none">⌘K</kbd>
            </button>
          )}

          {/* Notification bell */}
          <NotificationBell />

          {/* Support contact (collapsed to icon on small screens) */}
          {(tenant.support_email || tenant.support_phone) && (
            <div className="hidden lg:flex items-center gap-3 text-xs text-gray-400 border-l border-gray-200 pl-3">
              {tenant.support_email && (
                <a href={`mailto:${tenant.support_email}`} className="hover:text-gray-700 hover:underline">
                  {tenant.support_email}
                </a>
              )}
            </div>
          )}

          {/* Sign in / out */}
          {isAuthenticated ? (
            <button
              onClick={() => { logout(); router.push("/login"); }}
              className="text-xs text-gray-500 hover:text-gray-800 hover:underline"
            >
              Sign out
            </button>
          ) : (
            <Link href="/login" className="text-xs text-gray-500 hover:text-gray-800 hover:underline">
              Sign in
            </Link>
          )}
        </div>
      </header>

      {/* Search modal */}
      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
    </>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-sm text-gray-600 hover:text-gray-900 px-2.5 py-1.5 rounded hover:bg-gray-100 whitespace-nowrap"
    >
      {children}
    </Link>
  );
}
