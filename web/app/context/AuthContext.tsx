"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import axios from "axios";
import { API_URL } from "../lib/api";

const TOKEN_KEY = "pg_token";
const ROLE_KEY = "pg_role";

// Module-level interceptors — run once on client.
if (typeof window !== "undefined") {
  // Inject JWT into every outgoing request.
  axios.interceptors.request.use((config) => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  // On 401, clear auth state and redirect to login.
  // This handles expired tokens without requiring per-component 401 handling.
  axios.interceptors.response.use(
    (response) => response,
    (error) => {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        const isLoginRequest = error.config?.url?.includes("/auth/login");
        if (!isLoginRequest) {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(ROLE_KEY);
          const from = encodeURIComponent(window.location.pathname);
          window.location.href = `/login?from=${from}&reason=session_expired`;
        }
      }
      return Promise.reject(error);
    }
  );
}

interface AuthContextValue {
  token: string | null;
  role: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  token: null,
  role: null,
  isAuthenticated: false,
  isAdmin: false,
  login: async () => {},
  logout: () => {},
});

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  // Lazy initializer reads localStorage synchronously on first render,
  // eliminating the flash where isAuthenticated is briefly false for
  // already-authenticated users (which caused Command Center to show errors).
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(TOKEN_KEY);
  });
  const [role, setRole] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(ROLE_KEY);
  });

  // Keep role in sync when token changes (e.g. tab switching)
  useEffect(() => {
    if (!token) setRole(null);
  }, [token]);

  async function login(email: string, password: string): Promise<void> {
    const res = await axios.post<{ access_token: string; role: string }>(
      `${API_URL}/auth/login`,
      { email, password }
    );
    const { access_token, role: userRole } = res.data;
    localStorage.setItem(TOKEN_KEY, access_token);
    localStorage.setItem(ROLE_KEY, userRole);
    setToken(access_token);
    setRole(userRole);
  }

  function logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ROLE_KEY);
    setToken(null);
    setRole(null);
  }

  return (
    <AuthContext.Provider
      value={{
        token,
        role,
        isAuthenticated: !!token,
        isAdmin: role === "admin",
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
