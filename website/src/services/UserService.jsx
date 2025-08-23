import Cookies from "js-cookie";

const BASE_URL = import.meta.env.VITE_BACKEND_URL;

export const fetchUserData = async () => {
    const token = Cookies.get("userToken");
    if (!token) return null;

    try {
        const response = await fetch(`${BASE_URL}/v1/users`, {
            headers: {
                "Content-Type": "application/json",
                "x-auth-token": token,
            },
        });

        if (!response.ok) {
            Cookies.remove("userToken");
            return null;
        }

        const data = await response.json();
        return data;
    } catch (err) {
        console.error("Error fetching user data:", err);
        Cookies.remove("userToken");
        return null;
    }
};


// services/UserService.js
export const getUserCategories = async (userToken) => {
    const res = await fetch(`${BASE_URL}/v1/users/categories`, {
        headers: {
            "Content-Type": "application/json",
            "x-auth-token": userToken,
        },
    });
    const responseJson = await res.json()
    return responseJson
};

export const saveUserCategories = async (categories, userToken) => {
    const res = await fetch(`${BASE_URL}/v1/users/categories`, {
        method: 'POST',
        headers: {
            "Content-Type": "application/json",
            "x-auth-token": userToken,
        },
        body: JSON.stringify({ categories }),
    });
    const responseJson = await res.json()
    return responseJson
};

// services/UserService.js
export const googleLogin = async (credential) => {
    try {
        const response = await fetch(`${BASE_URL}/v1/users/google-login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ credential }),
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || "Google login failed.");
        }

        const authToken = data.responseBody["x-auth-token"];
        Cookies.set("userToken", authToken, { expires: 100 });

        return {
            userToken: authToken,
            user: data.user,
        };
    } catch (err) {
        console.error("Google login error:", err);
        return { error: "Something went wrong. Please try again." };
    }
};

// services/UserService.js
export const updateUserProfile = async (userToken, payload) => {
    // payload can include fields like: { upiId, name, profilePic, upiids, ... }
    const res = await fetch(`${BASE_URL}/v1/users/profile`, {
        method: "PATCH", // change to "POST" if your backend expects POST
        headers: {
            "Content-Type": "application/json",
            "x-auth-token": userToken,
        },
        body: JSON.stringify(payload),
    });

    let data = {};
    try {
        data = await res.json();

    } catch (_) {
        // ignore json parse error for empty bodies
    }

    if (!res.ok) {
        throw new Error(data?.error || data?.message || "Failed to update profile");
    }
    return data; // typically returns updated user or { success: true }
};

// keep for convenience: updates ONLY the default currency
export const updatePreferredCurrency = async (currencyCode, token) => {
    return updateUserProfile(token, { defaultCurrency: currencyCode }); // maps to defaultCurrency
};

// optional helper to update both at once
export const updateCurrencyPrefs = async ({ defaultCurrency, preferredCurrencies }, token) => {
    return updateUserProfile(token, { defaultCurrency, preferredCurrencies });
};

export const deleteAccount = async () => {
    const token = Cookies.get("userToken");
    if (!token) return null;

    try {
        const response = await fetch(`${BASE_URL}/v1/users/me`, {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json",
                "x-auth-token": token,
            },
        });

        if (response.ok) {
            Cookies.remove("userToken");
            return null;
        }
        const data = await response.json();
        return data;
    } catch (err) {
        console.error("Error deleting user data:", err);
        Cookies.remove("userToken");
        return null;
    }
};


export async function fetchWhatsNew() {
    // swap to your API if you have one: /api/whats-new
    const res = await fetch('/whats-new.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load What’s New');
    const data = await res.json();
    return Array.isArray(data.entries) ? data.entries : [];
}

// services/UserService.js
export const getSuggestions = async (userToken) => {
    const res = await fetch(`${BASE_URL}/v1/users/suggestions`, {
        headers: {
            "Content-Type": "application/json",
            "x-auth-token": userToken,
        },
    });
    const responseJson = await res.json()
    return responseJson
};
