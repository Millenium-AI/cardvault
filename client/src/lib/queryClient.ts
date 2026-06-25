import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { supabase } from "./supabase";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// Use getSession() first (fast, from storage), fall back to refreshSession() if
// the access_token is missing or expired so we always get a valid Bearer token.
async function getAuthHeader(): Promise<Record<string, string>> {
  let { data } = await supabase.auth.getSession();
  let token = data.session?.access_token;

  // If no token in storage, try a live refresh from Supabase
  if (!token) {
    const refreshed = await supabase.auth.refreshSession();
    token = refreshed.data.session?.access_token;
  }

  return token ? { Authorization: `Bearer ${token}` } : {};
}

export { getAuthHeader };

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown,
): Promise<Response> {
  const authHeader = await getAuthHeader();
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...authHeader,
    },
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
    const authHeader = await getAuthHeader();
    const res = await fetch(`${API_BASE}${queryKey[0]}`, {
      headers: authHeader,
    });
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
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
