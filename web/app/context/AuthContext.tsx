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

// Module-level interceptor — runs once on client, injects JWT into every request.
if (typeof window !== "undefined") {
  axios.interceptors.request.use((config) => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });
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
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    const storedRole = localStorage.getItem(ROLE_KEY);
    if (storedToken) setToken(storedToken);
    if (storedRole) setRole(storedRole);
  }, []);

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
