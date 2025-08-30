// src/services/UserService.js
import { api, setTokens, clearTokens } from "../utils/api";

const BASE_USERS = "/v1/users";

// ------------------------
// Auth / Session
// ------------------------

// Google login (server expects { access_token })
export async function googleLogin(access_token) {
    const data = await api.post(`${BASE_USERS}/google-login`, { access_token });

    // If your backend returns tokens in a different shape, adapt here:
    const authToken = data?.responseBody?.["x-auth-token"] || data?.accessToken;
    const refreshToken = data?.refreshToken; // if provided

    if (!authToken) {
        throw new Error(data?.error || "Google login failed.");
    }

    // Persist tokens for the api client
    await setTokens({ accessToken: authToken, refreshToken });

    return {
        userToken: authToken,
        user: data?.user,
        newUser: !!data?.newUser,
    };
}

// Email-based mobile login (OTP / magic link style on your backend)
export async function mobileLogin(email) {
    const data = await api.post(`${BASE_USERS}/login`, { email });

    const authToken = data?.responseBody?.["x-auth-token"] || data?.accessToken;
    const refreshToken = data?.refreshToken; // if provided

    if (!authToken) {
        throw new Error(data?.error || "Login failed.");
    }

    await setTokens({ accessToken: authToken, refreshToken });

    return {
        userToken: authToken,
        user: data?.user,
        newUser: !!data?.newUser,
    };
}

// Optional helper if you implement logout server-side too
export async function logoutUser() {
    try {
        // If you have an endpoint to invalidate refresh tokens, call it here:
        // await api.post(`${BASE_USERS}/logout`, {});
    } finally {
        await clearTokens();
    }
}

// ------------------------
// User data
// ------------------------

export async function fetchUserData() {
    // GET /v1/users → returns current authed user
    // apiClient attaches x-auth-token automatically
    try {
        const data = await api.get(`${BASE_USERS}`);
        return data;
    } catch (err) {
        // If 401 bubbles up, your app should route to login and clear tokens
        return null;
    }
}

// Profile update (PATCH). payload: { name, upiId, profilePic, ... }
export async function updateUserProfile(payload) {
    const data = await api.patch(`${BASE_USERS}/profile`, payload);
    return data; // usually updated user or { success: true }
}

// Convenience: update only default currency
export async function updatePreferredCurrency(currencyCode) {
    return updateUserProfile({ defaultCurrency: currencyCode });
}

// Convenience: update default + preferred list together
export async function updateCurrencyPrefs({ defaultCurrency, preferredCurrencies }) {
    return updateUserProfile({ defaultCurrency, preferredCurrencies });
}

// Delete account (server should delete current user)
export async function deleteAccount() {
    try {
        const data = await api.del(`${BASE_USERS}/me`);
        // Clear tokens locally after deletion
        await clearTokens();
        return data || null;
    } catch (e) {
        // still clear tokens if server returns 401/403
        await clearTokens();
        throw e;
    }
}

// ------------------------
// Categories
// ------------------------

export async function getUserCategories() {
    const data = await api.get(`${BASE_USERS}/categories`);
    return Array.isArray(data) ? data : data?.categories || [];
}

export async function saveUserCategories(categories) {
    const data = await api.post(`${BASE_USERS}/categories`, { categories });
    return data;
}

// ------------------------
// Suggestions
// ------------------------

export async function getSuggestions() {
    const data = await api.get(`${BASE_USERS}/suggestions`);
    return data;
}

// ------------------------
// Optional: What's New (static JSON or your API)
// ------------------------

export async function fetchWhatsNew() {
    // If you serve a static JSON from your app domain, you can still call it:
    // Replace with your own endpoint if you prefer: `${BASE_USERS}/whats-new`
    const res = await fetch("/whats-new.json", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load What’s New");
    const data = await res.json();
    return Array.isArray(data.entries) ? data.entries : [];
}
