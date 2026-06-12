import { QueryClient, QueryFunction } from "@tanstack/react-query";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// ── 401 handling (Task 1.7) ──
// Tokens live in httpOnly cookies, so the client never touches them. On a
// 401 we POST /api/auth/refresh once (deduped across concurrent requests)
// and retry. If refresh also fails, we notify the AuthProvider, which flips
// the app to the login screen.
let refreshPromise: Promise<boolean> | null = null;
function tryRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE}/api/auth/refresh`, { method: "POST" })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export async function fetchWithRefresh(url: string, init?: RequestInit): Promise<Response> {
  let res = await fetch(url, init);
  // Retry-on-401 applies to everything except the refresh endpoint itself
  // (login/signup/logout use plain fetch). This covers /api/auth/me on page
  // load: an expired access token with a valid refresh cookie silently
  // renews instead of bouncing the user to the login screen.
  if (res.status === 401 && !url.includes("/api/auth/refresh")) {
    if (await tryRefresh()) res = await fetch(url, init);
    if (res.status === 401) window.dispatchEvent(new Event("sf:unauthorized"));
  }
  return res;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetchWithRefresh(`${API_BASE}${url}`, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetchWithRefresh(`${API_BASE}${queryKey.join("/")}`);

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      // Freshness over thrift: staleTime Infinity + no focus refetch meant a
      // screen (or second tab) that wasn't explicitly invalidated could show
      // stale data forever. 30s staleness + refetch on focus/mount keeps all
      // views consistent after edits without meaningful extra load.
      refetchOnWindowFocus: true,
      staleTime: 30 * 1000,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
