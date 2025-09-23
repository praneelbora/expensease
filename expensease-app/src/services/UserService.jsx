// src/services/UserService.js
import { api, setTokens, clearTokens } from "../utils/api";

const BASE_USERS = "/v1/users";

// ------------------------
// Auth / Session
// ------------------------

// Google login (server expects { id_token })
export async function googleLoginMobile(idToken, pushToken, platform) {
    const data = await api.post(`${BASE_USERS}/google-login`, {
        id_token: idToken,
        pushToken,
        platform
    });
    const authToken = data?.responseBody?.["x-auth-token"] || data?.accessToken;
    if (!authToken) {
        throw new Error(data?.error || "Google login failed.");
    }

    await setTokens({ accessToken: authToken });

    return {
        userToken: authToken,
        user: data?.user,
        newUser: !!data?.newUser,
    };
}

// Email-based mobile login (OTP / magic link style on your backend)
export async function mobileLogin(email, password, expoPushToken, platform) {
    const data = await api.post(`${BASE_USERS}/dev-login`, { email, password, pushToken: expoPushToken, platform });

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


function isVersionOutdated(current, minimum) {
    const c = current.split(".").map(Number);
    const m = minimum.split(".").map(Number);

    for (let i = 0; i < Math.max(c.length, m.length); i++) {
        const cVal = c[i] || 0;
        const mVal = m[i] || 0;
        if (cVal < mVal) return true;   // current is lower → outdated
        if (cVal > mVal) return false;  // current is higher → fine
    }
    return false; // equal
}


// Updated checkAppVersion in src/services/UserService.js
import * as Application from "expo-application";

// helper: compare semver-like strings
function compareVersions(a = "0.0.0", b = "0.0.0") {
    const ap = String(a).split(".").map((n) => Number(n) || 0);
    const bp = String(b).split(".").map((n) => Number(n) || 0);
    const len = Math.max(ap.length, bp.length);
    for (let i = 0; i < len; i++) {
        const av = ap[i] || 0;
        const bv = bp[i] || 0;
        if (av < bv) return -1;
        if (av > bv) return 1;
    }
    return 0; // equal
}

/**
 * Enhanced version check that fetches admin payload and returns:
 * {
 *   outdated: boolean,
 *   underReview: boolean,
 *   forceUpdate: boolean,
 *   releaseNotes: string|null,
 *   iosStoreUrl: string|null,
 *   androidStoreUrl: string|null,
 *   otaUrl: string|null,
 *   otaMandatory: boolean,
 *   minimumVersion: string,
 *   reviewVersion: string|null,
 *   currentVersion: string
 * }
 *
 * @param {string} currentVersion - current app semantic version (e.g. "1.2.3")
 * @param {"ios"|"android"} OS - platform
 */

// put near your other helpers in src/services/UserService.js

// parse booleans coming from server (true/false, "true"/"false", 1/0)
function parseBool(val) {
    if (typeof val === "boolean") return val;
    if (typeof val === "number") return val !== 0;
    if (typeof val === "string") {
        const s = val.trim().toLowerCase();
        if (s === "true" || s === "1" || s === "yes") return true;
        if (s === "false" || s === "0" || s === "no") return false;
    }
    return false;
}

/**
 * Uses module-scoped `api` and `BASE_USERS` (no need to pass them).
 * Re-uses your existing compareVersions helper.
 *
 * @param {string} currentVersion
 * @param {"ios"|"android"} OS
 */
export async function checkAppVersion(currentVersion = "0.0.0", OS = "android") {
    try {
        const res = await api.get(`${BASE_USERS}/version`);
        const body = res?.data ?? res;

        const minimumIOSVersion = body?.minimumIOSVersion ?? body?.minimumVersion ?? "0.0.0";
        const minimumAndroidVersion = body?.minimumAndroidVersion ?? body?.minimumVersion ?? "0.0.0";

        const reviewIOS = body?.iosVersionReview ?? body?.iosVersionUnderReview ?? null;
        const reviewAndroid = body?.androidVersionReview ?? body?.androidVersionUnderReview ?? null;

        const newIOSVersion = body?.newIOSVersion ?? body?.newIosVersion ?? null;
        const newAndroidVersion = body?.newAndroidVersion ?? body?.newAndroidVersion ?? null;

        const minimumVersion = OS === "ios" ? minimumIOSVersion : minimumAndroidVersion;
        const reviewVersion = OS === "ios" ? reviewIOS : reviewAndroid;
        const newVersion = OS === "ios" ? newIOSVersion : newAndroidVersion;

        const cmpToMin = compareVersions(currentVersion, minimumVersion); // -1,0,1
        const outdated = cmpToMin === -1;

        const underReview = reviewVersion ? compareVersions(currentVersion, reviewVersion) === 0 : false;

        const isNewUpdateAvailable = newVersion ? compareVersions(currentVersion, newVersion) === -1 : false;        
        return {
            outdated,
            underReview,
            isNewUpdateAvailable,
        };
    } catch (err) {
        console.warn("Version check failed:", err?.message ?? err);
        // fail-safe: don't mark outdated or new update available on error
        return {
            outdated: false,
            underReview: false,
            isNewUpdateAvailable: false,
        };
    }
}



export async function savePublicPushToken(token, platform) {
    return api.post(`${BASE_USERS}/push-token/public`, { token, platform });
}

// Save token with auth (saves to User + Admin)
export async function saveUserPushToken(token, platform) {
    return api.post(`${BASE_USERS}/push-token`, { token, platform });
}


// Save Expo push token with platform
// src/services/UserService.js
export async function logToServer(payload = {}, userToken = null) {
    try {
        const data = await api.post(`${BASE_USERS}/logging`, payload);
        return data;
    } catch (err) {
        console.error("❌ Logging failed:", err);
        throw err;
    }
}



// ------------------------
// Phone OTP Login
// ------------------------

export async function sendOtp(phoneNumber) {
    const data = await api.post(`${BASE_USERS}/sendSMS`, { phoneNumber });
    if (data?.error) {
        throw new Error(data.error);
    }
    return data; // e.g. { type: "success" }
}

export async function verifyOtp(phoneNumber, code, pushToken = null, platform = "android") {
    const data = await api.post(`${BASE_USERS}/verifyOTP`, { phoneNumber, code, pushToken, platform });

    const authToken = data?.responseBody?.["x-auth-token"] || data?.accessToken;
    if (!authToken) {
        throw new Error(data?.error || "OTP verification failed.");
    }

    await setTokens({ accessToken: authToken });

    return {
        userToken: authToken,
        newUser: !!data?.new,
        userId: data?.id,
    };
}
