// A tiny fetch wrapper that injects token, handles JSON, errors, and refresh.
import { getSecureItem, setSecureItem, deleteSecureItem } from "./secureToken";

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const ACCESS_TOKEN_KEY = "userToken";
const REFRESH_TOKEN_KEY = "refreshToken"; // if you support refresh

// in-memory cache to avoid disk hit on every call
const mem = { accessToken: null, refreshToken: null, isRefreshing: false, waiters: [] };

async function getAccessToken() {
    if (mem.accessToken) return mem.accessToken;
    mem.accessToken = await getSecureItem(ACCESS_TOKEN_KEY);
    return mem.accessToken;
}
async function getRefreshToken() {
    if (mem.refreshToken) return mem.refreshToken;
    mem.refreshToken = await getSecureItem(REFRESH_TOKEN_KEY);
    return mem.refreshToken;
}

export async function setTokens({ accessToken, refreshToken }) {
    mem.accessToken = accessToken || null;
    await setSecureItem(ACCESS_TOKEN_KEY, accessToken || "");
    if (typeof refreshToken !== "undefined") {
        mem.refreshToken = refreshToken || null;
        if (refreshToken) await setSecureItem(REFRESH_TOKEN_KEY, refreshToken);
        else await deleteSecureItem(REFRESH_TOKEN_KEY);
    }
}

export async function clearTokens() {
    mem.accessToken = null;
    mem.refreshToken = null;
    await deleteSecureItem(ACCESS_TOKEN_KEY);
    await deleteSecureItem(REFRESH_TOKEN_KEY);
}

function buildHeaders(token, extra = {}) {
    const h = { "Content-Type": "application/json", ...extra };
    if (token) h["x-auth-token"] = token;
    return h;
}

async function handle(res, fallbackMsg) {
    let data = null;
    try { data = await res.json(); } catch { }
    if (!res.ok) {
        const msg = (data && (data.message || data.error)) || fallbackMsg || "Request failed";
        const err = new Error(msg);
        err.status = res.status;
        err.data = data;
        throw err;
    }
    return data;
}

function toQuery(params = {}) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") q.append(k, v);
    });
    const s = q.toString();
    return s ? `?${s}` : "";
}

// Optional: token refresh flow
async function refreshAccessTokenOnce() {
    if (mem.isRefreshing) {
        // wait for the ongoing refresh
        await new Promise((resolve, reject) => mem.waiters.push({ resolve, reject }));
        return mem.accessToken;
    }
    mem.isRefreshing = true;
    try {
        const rToken = await getRefreshToken();
        if (!rToken) throw new Error("No refresh token");

        const res = await fetch(`${BASE_URL}/v1/auth/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refreshToken: rToken }),
        });
        const data = await handle(res, "Failed to refresh session");
        const newAccess = data?.accessToken;
        const newRefresh = data?.refreshToken; // if your API rotates it
        await setTokens({ accessToken: newAccess, refreshToken: newRefresh });
        mem.isRefreshing = false;
        mem.waiters.splice(0).forEach(w => w.resolve());
        return newAccess;
    } catch (e) {
        mem.isRefreshing = false;
        mem.waiters.splice(0).forEach(w => w.reject(e));
        await clearTokens();
        throw e;
    }
}

async function doFetch(path, { method = "GET", params, body, headers, retry = true } = {}) {
    const token = await getAccessToken();
    const url = `${BASE_URL}${path}${params ? toQuery(params) : ""}`;

    const res = await fetch(url, {
        method,
        headers: buildHeaders(token, headers),
        body: body != null ? JSON.stringify(body) : undefined,
    });

    // Handle 401 -> attempt refresh once, then retry original
    if (res.status === 401 && retry) {
        try {
            await refreshAccessTokenOnce();
            // retry once with new token
            const newToken = await getAccessToken();
            const res2 = await fetch(url, {
                method,
                headers: buildHeaders(newToken, headers),
                body: body != null ? JSON.stringify(body) : undefined,
            });
            return handle(res2, "Request failed");
        } catch (e) {
            // bubble up 401 (caller can log out)
            throw e;
        }
    }

    return handle(res, "Request failed");
}

// public helpers
export const api = {
    get: (path, params, opts) => doFetch(path, { method: "GET", params, ...(opts || {}) }),
    post: (path, body, opts) => doFetch(path, { method: "POST", body, ...(opts || {}) }),
    patch: (path, body, opts) => doFetch(path, { method: "PATCH", body, ...(opts || {}) }),
    put: (path, body, opts) => doFetch(path, { method: "PUT", body, ...(opts || {}) }),   // <-- add this
    del: (path, opts) => doFetch(path, { method: "DELETE", ...(opts || {}) }),
};
