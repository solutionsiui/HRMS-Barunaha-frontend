// ─── API Client ────────────────────────────────────────────
const BASE = "/api/proxy";
const TOKEN_KEY = "hrms_token";
const getRequestsInFlight = new Map();
const shortGetCache = new Map();
const GET_CACHE_MS = 2000;

export function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t) {
  if (typeof window !== "undefined") localStorage.setItem(TOKEN_KEY, t);
}
export function removeToken() {
  if (typeof window !== "undefined") localStorage.removeItem(TOKEN_KEY);
}

export function backendAssetUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  return `${BASE}${url.startsWith("/") ? url : `/${url}`}`;
}

function readErrorMessage(payload, fallback = "Request failed") {
  const detail = payload?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length) {
    const joined = detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const loc = Array.isArray(item.loc) ? item.loc.join(".") : "field";
          const msg = item.msg || JSON.stringify(item);
          return `${loc}: ${msg}`;
        }
        return String(item);
      })
      .join("; ");
    if (joined.trim()) return joined;
  }
  if (detail && typeof detail === "object") {
    if (typeof detail.msg === "string" && detail.msg.trim()) return detail.msg;
    return JSON.stringify(detail);
  }
  if (typeof payload?.message === "string" && payload.message.trim()) return payload.message;
  return fallback;
}

export async function apiFetch(path, opts = {}) {
  const t = getToken();
  const isFormData = opts.body instanceof FormData;
  const headers = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
    ...(opts.headers || {}),
  };

  // Ensure trailing slash to avoid 307/404 from FastAPI redirect_slashes=False
  let finalPath = path;
  if (!finalPath.endsWith("/") && !finalPath.includes("?") && !finalPath.includes(".")) {
    finalPath += "/";
  }

  const method = String(opts.method || "GET").toUpperCase();
  const cacheKey = `${t || "anonymous"}:${finalPath}`;
  if (method === "GET") {
    const cached = shortGetCache.get(cacheKey);
    if (cached && Date.now() - cached.at < GET_CACHE_MS) return cached.data;
    if (getRequestsInFlight.has(cacheKey)) return getRequestsInFlight.get(cacheKey);
  } else {
    shortGetCache.clear();
  }

  const requestPromise = (async () => {
    const res = await fetch(`${BASE}${finalPath}`, {
      cache: "no-store",
      ...opts,
      headers,
    });

    if (res.status === 401) {
      // Parse the actual error from the backend
      const errData = await res.json().catch(() => ({}));
      const backendMsg = readErrorMessage(errData, "Authentication failed");

      // For login endpoint: don't wipe token or redirect, just throw the real error
      if (path.includes("/auth/login")) {
        throw new Error(backendMsg);
      }

      // For all other endpoints: session expired — wipe and redirect
      removeToken();
      if (typeof window !== "undefined") {
        localStorage.removeItem("hrms_user");
        const currentPath = window.location.pathname;
        if (currentPath !== "/login" && currentPath !== "/reset-password") {
          window.location.replace("/login");
        }
      }
      throw new Error("Session expired. Please log in again.");
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(readErrorMessage(data, "Request failed"));
    if (method === "GET") shortGetCache.set(cacheKey, { at: Date.now(), data });
    return data;
  })();

  if (method === "GET") getRequestsInFlight.set(cacheKey, requestPromise);
  try {
    return await requestPromise;
  } finally {
    if (method === "GET") getRequestsInFlight.delete(cacheKey);
  }
}
