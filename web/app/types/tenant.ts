export type Theme = "light" | "dark";

export interface TenantConfig {
  id: string;
  name: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string | null;
  theme: Theme;
  support_email: string;
  support_phone: string | null;
}

export const DEFAULT_TENANT: TenantConfig = {
  id: "00000000-0000-0000-0000-000000000001",
  name: "PackGuardian",
  logo_url: null,
  primary_color: "#4F46E5",
  secondary_color: "#6366F1",
  theme: "light",
  support_email: "support@packguardian.com",
  support_phone: null,
};
