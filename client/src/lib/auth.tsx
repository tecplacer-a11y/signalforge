import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { fetchWithRefresh, queryClient } from "./queryClient";

// ── Auth context (Task 1.7) ──
// Session tokens are httpOnly cookies managed entirely by the server; this
// context only tracks WHO is logged in. On mount it asks /api/auth/me:
//   - 200 with authEnabled=false → server has no Supabase config (single-
//     tenant dev/demo mode): treat as signed in, hide auth UI.
//   - 200 with authEnabled=true  → signed in.
//   - 401 → show the login screen.

export interface AuthUser {
  id: string;
  email?: string;
  name?: string;
}
export interface AuthOrg {
  id: string;
  name: string;
  slug: string;
  plan: string;
}

type AuthState =
  | { status: "loading" }
  | { status: "unauthed" }
  | { status: "authed"; user: AuthUser; org: AuthOrg | null; role: string; authEnabled: boolean };

interface AuthContextValue {
  state: AuthState;
  login: (email: string, password: string) => Promise<void>;
  signup: (input: { email: string; password: string; name: string; orgName: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body?.error || res.statusText;
  } catch {
    return res.statusText;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  const load = useCallback(async () => {
    try {
      const res = await fetchWithRefresh("/api/auth/me");
      if (!res.ok) {
        setState({ status: "unauthed" });
        return;
      }
      const me = await res.json();
      setState({
        status: "authed",
        user: me.user,
        org: me.org,
        role: me.role,
        authEnabled: !!me.authEnabled,
      });
    } catch {
      // network error — leave the app usable rather than locking it out
      setState({ status: "unauthed" });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // fetchWithRefresh dispatches this when a request 401s even after refresh
  useEffect(() => {
    const onUnauthorized = () => {
      setState((s) => (s.status === "authed" && !s.authEnabled ? s : { status: "unauthed" }));
      queryClient.clear();
    };
    window.addEventListener("sf:unauthorized", onUnauthorized);
    return () => window.removeEventListener("sf:unauthorized", onUnauthorized);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error(await readError(res));
    const body = await res.json();
    queryClient.clear();
    setState({ status: "authed", user: body.user, org: body.org, role: body.role, authEnabled: true });
  }, []);

  const signup = useCallback(
    async (input: { email: string; password: string; name: string; orgName: string }) => {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await readError(res));
      const body = await res.json();
      queryClient.clear();
      setState({ status: "authed", user: body.user, org: body.org, role: body.role, authEnabled: true });
    },
    [],
  );

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    queryClient.clear();
    setState({ status: "unauthed" });
  }, []);

  return <AuthContext.Provider value={{ state, login, signup, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
