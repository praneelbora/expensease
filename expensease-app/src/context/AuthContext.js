// src/context/AuthContext.js
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter, useSegments } from "expo-router";

import { fetchUserData, getUserCategories } from "../services/UserService";
// import { setGAUserId } from "../utils/analytics";
import { listPaymentMethods } from "../services/PaymentMethodService";

export const AuthContext = createContext();

const TOKEN_KEY = "userToken";

// --- secure token helpers (SecureStore with AsyncStorage fallback) ---
async function setSecureItem(key, value) {
    try {
        await SecureStore.setItemAsync(key, value);
    } catch (err) {
        try {
            await AsyncStorage.setItem(key, value);
        } catch (e) {
            console.warn("setSecureItem fallback failed:", e);
        }
    }
}
async function getSecureItem(key) {
    try {
        const v = await SecureStore.getItemAsync(key);
        if (v != null) return v;
    } catch (e) {
        // fallthrough to AsyncStorage
    }
    try {
        return await AsyncStorage.getItem(key);
    } catch (e) {
        console.warn("getSecureItem AsyncStorage fallback failed:", e);
        return null;
    }
}
async function deleteSecureItem(key) {
    try {
        await SecureStore.deleteItemAsync(key);
    } catch {
        try {
            await AsyncStorage.removeItem(key);
        } catch (e) {
            console.warn("deleteSecureItem fallback failed:", e);
        }
    }
}

export const AuthProvider = ({ children }) => {
    const router = useRouter();
    const segments = useSegments(); // array of route segments, e.g. ['dashboard', 'settings']

    // core states
    const [user, setUser] = useState(null);
    const [userToken, setUserToken] = useState(null);

    // hydrated -> true when initial token bootstrap finished (either token found or not)
    const [hydrated, setHydrated] = useState(false);

    // authLoading -> true while fetching user/payment/categories after token is present
    // start false; we'll set true only while fetchData runs
    const [authLoading, setAuthLoading] = useState(true);

    // other app-level states
    const [categories, setCategories] = useState([]);
    const [defaultCurrency, setDefaultCurrency] = useState("");
    const [preferredCurrencies, setPreferredCurrencies] = useState([]);

    const [paymentMethods, setPaymentMethods] = useState([]);
    const [loadingPaymentMethods, setLoadingPaymentMethods] = useState(false);

    const version = "0.0.1";

    // --- public: set token + persist + normalize ---
    const setAndPersistUserToken = async (rawToken) => {
        let token = rawToken;
        if (token && typeof token === "object") {
            token =
                token.token ||
                token.accessToken ||
                token.idToken ||
                token.authToken ||
                token.access_token ||
                token.id_token ||
                null;
            if (!token) {
                console.warn(
                    "setAndPersistUserToken: token object had no common token field — stringifying."
                );
                token = JSON.stringify(rawToken);
            }
        }

        // Update local state immediately so UI can react
        setUserToken(token);

        // persist or delete
        if (token) {
            try {
                await setSecureItem(TOKEN_KEY, token);
            } catch (e) {
                console.warn("Failed to persist token:", e);
            }
        } else {
            try {
                await deleteSecureItem(TOKEN_KEY);
            } catch (e) {
                console.warn("Failed to delete persisted token:", e);
            }
        }
    };

    // --- load user once; optionally set GA (keeps the method separate) ---
    const loadUserData = async (setGA = false) => {
        try {
            const u = await fetchUserData(userToken);
            setUser(u);
            // if (setGA && u?._id) setGAUserId(u._id);
        } catch (e) {
            console.warn("loadUserData failed:", e?.message || e);
        } finally {
            setAuthLoading(false);
        }
    };

    const logout = async () => {
        setUser(null);
        await setAndPersistUserToken(null);
        // optionally clear other persisted user data
        router.replace("/");
    };

    // derive currency prefs when user changes
    useEffect(() => {
        if (!user) {
            setDefaultCurrency("");
            setPreferredCurrencies([]);
            return;
        }

        const usage = user?.preferredCurrencyUsage ?? {};
        const list = Array.isArray(user?.preferredCurrencies) ? user.preferredCurrencies : [];

        setDefaultCurrency(user?.defaultCurrency || list[0] || "");

        const sorted = [...list]
            .sort((a, b) => (usage[b] ?? 0) - (usage[a] ?? 0) || String(a).localeCompare(String(b)))
            .slice(0, 3);

        setPreferredCurrencies(sorted);
    }, [user]);

    // fetch helper: fetch user, categories, payment methods when token present
    const fetchData = async (token) => {
        try {
            const fetchedUser = await fetchUserData(token);
            setUser(fetchedUser);
            try {
                setLoadingPaymentMethods(true);
                const pms = await listPaymentMethods(token);
                setPaymentMethods(Array.isArray(pms) ? pms : []);
            } catch (e) {
                console.warn("fetchPaymentMethods failed:", e?.message || e);
                setPaymentMethods([]);
            } finally {
                setLoadingPaymentMethods(false);
            }

            // fetch categories
            try {
                const cats = await getUserCategories(token);
                setCategories(Array.isArray(cats) ? cats : []);
            } catch (e) {
                console.warn("getUserCategories failed:", e?.message || e);
                setCategories([]);
            }
        } catch (e) {
            console.warn("fetchData failed (maybe invalid token):", e?.message || e);
            // If you can detect 401 from your service error, clear token & redirect to login
            if (e?.response?.status === 401) {
                await setAndPersistUserToken(null);
            }
        } finally {
            setAuthLoading(false);
        }
    };

    // --- initial bootstrap: read token once from secure storage (or AsyncStorage fallback) ---
    useEffect(() => {
        (async () => {
            try {
                const token = await getSecureItem(TOKEN_KEY);
                if (token) {
                    setUserToken(token);
                } else {
                    setUserToken(null);
                }
            } catch (e) {
                console.warn("Auth bootstrap read token failed:", e);
                setUserToken(null);
            } finally {
                // mark bootstrap finished (hydrated) regardless of token presence
                setHydrated(true);
            }
        })();
        // run only once on mount
    }, []);

    // when token present (or changes), load remote data
    useEffect(() => {
        if (!userToken) {
            // if logging out, clear user & categories & payments
            setUser(null);
            setCategories([]);
            setPaymentMethods([]);
            return;
        }
        // fetch profile + categories + payment methods
        fetchData(userToken);
    }, [userToken]);

    // redirect when auth state stabilizes (hydrated + not loading)
    useEffect(() => {
        if (!hydrated) return;

        // Determine the current top-level route segment (if any)
        const currentRoot = (segments && segments.length > 0 && segments[0]) || "";

        // Define auth entry routes where redirecting to app is appropriate
        const AUTH_ENTRY_ROUTES = ["", "index", "login", "/"];

        // When we have a token and user loaded, navigate to the app root (tabs)
        if (userToken && !authLoading && user && AUTH_ENTRY_ROUTES.includes(String(currentRoot).toLowerCase())) {
            try {
                router.replace("dashboard");
            } catch (e) {
                console.warn("Auth -> navigation failed:", e);
            }
            return;
        }

        // If there's NO token (user is not logged in) and bootstrap finished & not loading auth,
        // redirect to login (index) unless we're already on an auth entry route.
        if (!userToken && !authLoading && !AUTH_ENTRY_ROUTES.includes(String(currentRoot).toLowerCase())) {
            try {
                router.replace("/");
            } catch (e) {
                console.warn("Auth -> navigation to login failed:", e);
            }
        }
    }, [hydrated, userToken, authLoading, user, router, segments]);

    // memoize context value to avoid extra re-renders
    const value = useMemo(
        () => ({
            version,
            user,
            setUser,
            loadUserData,
            logout,

            userToken,
            setUserToken: setAndPersistUserToken, // external API to set token (persists)
            hydrated, // true when initial bootstrap (token read) finished
            authLoading, // true while fetching user/payment/categories

            categories,
            setCategories,
            defaultCurrency,
            setDefaultCurrency,
            preferredCurrencies,

            paymentMethods,
            setPaymentMethods,
            fetchPaymentMethods: async () => {
                try {
                    setLoadingPaymentMethods(true);
                    const pms = await listPaymentMethods(userToken);
                    setPaymentMethods(Array.isArray(pms) ? pms : []);
                } catch (e) {
                    console.warn("fetchPaymentMethods (wrapper) failed:", e?.message || e);
                } finally {
                    setLoadingPaymentMethods(false);
                }
            },
            loadingPaymentMethods,
        }),
        [
            user,
            userToken,
            hydrated,
            authLoading,
            categories,
            defaultCurrency,
            preferredCurrencies,
            paymentMethods,
            loadingPaymentMethods,
        ]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
