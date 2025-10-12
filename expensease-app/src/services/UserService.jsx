// src/services/UserService.js
import { api, setTokens, clearTokens } from "../utils/api";

const BASE_USERS = "/v1/users";

/**
 * AUTH / SESSION
 */
// --- add this to src/services/UserService.js (near googleLoginMobile) ---
export async function appleLoginMobile(identityToken, pushToken = null, platform = "ios", name = "") {
  // send identityToken to your /v1/users/apple-login endpoint
  const data = await api.post(`${BASE_USERS}/apple-login`, {
    identity_token: identityToken,
    fullName: name || undefined,
    pushToken,
    platform,
  });

  const authToken = data?.responseBody?.["x-auth-token"] || data?.accessToken;
  if (!authToken) {
    throw new Error(data?.error || "Apple login failed.");
  }

  await setTokens({ accessToken: authToken });

  return {
    userToken: authToken,
    user: data?.user,
    newUser: !!data?.newUser || !!data?.new,
  };
}


// Google login (server expects { id_token })
export async function googleLoginMobile(idToken, pushToken, platform) {
  const data = await api.post(`${BASE_USERS}/google-login`, {
    id_token: idToken,
    pushToken,
    platform,
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

// Dev / email-based mobile login (keeps parity with your server dev-login)
export async function mobileLogin(email, password, expoPushToken, platform) {
  const data = await api.post(`${BASE_USERS}/dev-login`, {
    email,
    password,
    pushToken: expoPushToken,
    platform,
  });

  const authToken = data?.responseBody?.["x-auth-token"] || data?.accessToken;
  const refreshToken = data?.refreshToken;

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

// Optional helper if you implement server-side logout
export async function logoutUser() {
  try {
    // if you have a server endpoint to revoke tokens, call it here
    // await api.post(`${BASE_USERS}/logout`, {});
  } finally {
    await clearTokens();
  }
}

/**
 * USER DATA
 */

export async function fetchUserData() {
  try {
    const data = await api.get(`${BASE_USERS}`);
    return data;
  } catch (err) {
    // If 401 bubbles up, your app should route to login and clear tokens
    return null;
  }
}

// PATCH /v1/users/profile
export async function updateUserProfile(payload) {
  const data = await api.patch(`${BASE_USERS}/profile`, payload);
  return data;
}

export async function updatePreferredCurrency(currencyCode) {
  return updateUserProfile({ defaultCurrency: currencyCode });
}

export async function updateCurrencyPrefs({ defaultCurrency, preferredCurrencies }) {
  return updateUserProfile({ defaultCurrency, preferredCurrencies });
}

export async function deleteAccount() {
  try {
    const data = await api.del(`${BASE_USERS}/me`);
    await clearTokens();
    return data || null;
  } catch (e) {
    await clearTokens();
    throw e;
  }
}

/**
 * CATEGORIES
 */

export async function getUserCategories() {
  const data = await api.get(`${BASE_USERS}/categories`);
  // your backend sometimes returns array directly or in { categories }
  return Array.isArray(data) ? data : data?.categories || [];
}

export async function saveUserCategories(categories) {
  const data = await api.post(`${BASE_USERS}/categories`, { categories });
  return data;
}

/**
 * SUGGESTIONS
 */

export async function getSuggestions() {
  const data = await api.get(`${BASE_USERS}/suggestions`);
  return data;
}

/**
 * WHAT'S NEW (example static JSON or endpoint)
 */
export async function fetchWhatsNew() {
  const res = await fetch("/whats-new.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load What’s New");
  const data = await res.json();
  return Array.isArray(data.entries) ? data.entries : [];
}

/**
 * VERSION HELPERS
 */

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
  return 0;
}

/**
 * checkAppVersion
 * Returns { outdated, underReview, isNewUpdateAvailable }
 */
export async function checkAppVersion(currentVersion = "0.0.0", OS = "android") {
  try {
    const res = await api.get(`${BASE_USERS}/version`);
    // some api wrappers return { data } or raw value — handle both
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
    const updateURL = OS === "ios" ? body?.iosAppStoreLink : body?.androidPlayStoreLink;

    return {
      outdated,
      underReview,
      isNewUpdateAvailable,
      minimumVersion,
      reviewVersion,
      newVersion,
      currentVersion,
      updateURL
    };
  } catch (err) {
    console.warn("Version check failed:", err?.message ?? err);
    return {
      outdated: false,
      underReview: false,
      isNewUpdateAvailable: false,
    };
  }
}

/**
 * Push tokens
 */
export async function savePublicPushToken(token, platform) {
  return api.post(`${BASE_USERS}/push-token/public`, { token, platform });
}

export async function saveUserPushToken(token, platform) {
  return api.post(`${BASE_USERS}/push-token`, { token, platform });
}

/**
 * Generic logging helper
 */
export async function logToServer(payload = {}, userToken = null) {
  try {
    const data = await api.post(`${BASE_USERS}/logging`, payload);
    return data;
  } catch (err) {
    console.error("❌ Logging failed:", err);
    throw err;
  }
}

/**
 * PHONE OTP LOGIN
 */
export async function sendOtp(phoneNumber) {
  const data = await api.post(`${BASE_USERS}/sendSMS`, { phoneNumber });
  if (data?.error) {
    throw new Error(data.error);
  }
  return data;
}

export async function verifyOtp(phoneNumber, code, pushToken = null, platform = "android") {
  const data = await api.post(`${BASE_USERS}/verifyOTP`, {
    phoneNumber,
    code,
    pushToken,
    platform,
  });

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

/**
 * Backwards-compatible aliases used in some UI files
 */
export const sendOTP = sendOtp;
export const verifyOTP = verifyOtp;

// add near other exports in src/services/UserService.js

// src/services/UserService.js
// --- add / replace this function ---

/**
 * verifyPhoneLink - client helper to call /v1/users/verify-phone-link
 * Uses the shared `api` instance so auth headers are applied consistently.
 *
 * @param {string} phoneNumber E.164 or server-expected phone string
 * @param {string} code OTP code
 * @returns {object} server body (should include { success, phone, user })
 * @throws {Error} with .status and .body fields for caller to inspect
 */
// services/UserService.js (or wherever verifyPhoneLink lives)
export async function verifyPhoneLink(phoneNumber, code, opts = {}) {
  if (!phoneNumber) throw new Error("phoneNumber required");
  if (!code) throw new Error("code required");

  const payload = {
    phoneNumber,
    code,
    // target: 'primary' | 'secondary' (defaults to 'primary')
    ...(opts?.target ? { target: String(opts.target) } : {}),
  };

  try {
    const body = await api.post(`${BASE_USERS}/verify-phone-link`, payload);

    if (body && body.error) {
      const err = new Error(body.error || "Phone verification failed");
      err.status = body.status || 400;
      err.body = body;
      throw err;
    }
    return body;
  } catch (err) {
    if (err && err.response) {
      const status = err.response.status;
      let parsed = null;
      try { parsed = err.response.data; } catch (_) { }
      const e2 = new Error(parsed?.error || parsed?.message || `Request failed (${status})`);
      e2.status = status;
      e2.body = parsed;
      throw e2;
    }
    throw err;
  }
}




export async function linkGoogle(idToken) {
  if (!idToken) throw new Error('Missing idToken');
  const data = await api.post(`${BASE_USERS}/link-google`, { id_token: idToken });
  if (data?.error) throw new Error(data.error || 'Failed to link Google account');
  return data;
}
export default {
  googleLoginMobile,
  mobileLogin,
  logoutUser,
  fetchUserData,
  updateUserProfile,
  updatePreferredCurrency,
  updateCurrencyPrefs,
  deleteAccount,
  getUserCategories,
  saveUserCategories,
  getSuggestions,
  fetchWhatsNew,
  checkAppVersion,
  savePublicPushToken,
  saveUserPushToken,
  logToServer,
  sendOtp,
  verifyOtp,
  sendOTP,
  verifyOTP,
  // add to default export object
  appleLoginMobile,
  verifyPhoneLink
};
