"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import axios from "axios";
import type { TenantConfig } from "../types/tenant";
import { DEFAULT_TENANT } from "../types/tenant";
import { API_URL } from "../lib/api";

interface TenantContextValue {
  tenant: TenantConfig;
  loading: boolean;
}

const TenantContext = createContext<TenantContextValue>({
  tenant: DEFAULT_TENANT,
  loading: true,
});

export function useTenant(): TenantContextValue {
  return useContext(TenantContext);
}

function applyBranding(tenant: TenantConfig): void {
  const root = document.documentElement;
  root.style.setProperty("--brand-primary", tenant.primary_color);
  root.style.setProperty(
    "--brand-secondary",
    tenant.secondary_color ?? tenant.primary_color
  );
  if (tenant.theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export default function TenantProvider({ children }: { children: ReactNode }) {
  const [tenant, setTenant] = useState<TenantConfig>(DEFAULT_TENANT);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios
      .get<TenantConfig>(`${API_URL}/tenant`)
      .then((res) => {
        setTenant(res.data);
        applyBranding(res.data);
      })
      .catch(() => {
        // API unreachable at startup — apply PackGuardian defaults so the UI
        // still renders correctly without a blank or unstyled shell.
        applyBranding(DEFAULT_TENANT);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <TenantContext.Provider value={{ tenant, loading }}>
      {children}
    </TenantContext.Provider>
  );
}
