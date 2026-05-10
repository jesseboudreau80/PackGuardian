"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import axios from "axios";
import { useAuth } from "./AuthContext";
import { API_URL } from "../lib/api";

export interface QuickAction {
  label: string;
  href: string;
  icon: string;
  color: string;
}

export interface WorkspaceProfile {
  role_context: string;
  primary_role: string;
  org_roles: string[];
  system_role: string;
  is_admin: boolean;
  terminology: Record<string, string>;
  nav: Record<string, boolean>;
  quick_actions: QuickAction[];
  dashboard_title: string;
  dashboard_subtitle: string;
}

interface WorkspaceContextValue {
  profile: WorkspaceProfile | null;
  loading: boolean;
  /** Translate a terminology key with tenant override + fallback. */
  t: (key: string, fallback?: string) => string;
  refresh: () => void;
}

const DEFAULT_PROFILE: WorkspaceProfile = {
  role_context: "Manager",
  primary_role: "manager",
  org_roles: [],
  system_role: "manager",
  is_admin: false,
  terminology: {},
  nav: {
    show_command: true, show_safety_intel: true, show_osha: true,
    show_cases: true, show_map: true, show_automation: false,
    show_field_ops: true, show_analytics: true, show_organizations: false,
    show_my_shift: true,
  },
  quick_actions: [],
  dashboard_title: "PackGuardian",
  dashboard_subtitle: "Operational Safety Platform",
};

const WorkspaceContext = createContext<WorkspaceContextValue>({
  profile: null,
  loading: true,
  t: (k, fb) => fb ?? k,
  refresh: () => {},
});

export function useWorkspace(): WorkspaceContextValue {
  return useContext(WorkspaceContext);
}

export default function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [profile, setProfile] = useState<WorkspaceProfile | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchProfile() {
    if (!isAuthenticated) { setLoading(false); return; }
    try {
      const r = await axios.get<WorkspaceProfile>(`${API_URL}/workspace/profile`);
      setProfile(r.data);
    } catch {
      setProfile(DEFAULT_PROFILE);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    fetchProfile();
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  function t(key: string, fallback?: string): string {
    if (profile?.terminology?.[key]) return profile.terminology[key];
    return fallback ?? key.replace(/_/g, " ");
  }

  return (
    <WorkspaceContext.Provider value={{ profile, loading, t, refresh: fetchProfile }}>
      {children}
    </WorkspaceContext.Provider>
  );
}
