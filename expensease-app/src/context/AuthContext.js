// src/context/AuthContext.js
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
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
    const segments = useSegments();

    // core states
    const [user, setUser] = useState(null);
    const [userToken, setUserToken] = useState(null);

    // hydrated -> true when initial token bootstrap finished (either token found or not)
    const [hydrated, setHydrated] = useState(false);

    // authLoading -> true while fetching user/payment/categories after token is present
    // Start false; we'll set true only while fetchData runs
    const [authLoading, setAuthLoading] = useState(false);

    // other app-level states
    const [categories, setCategories] = useState([]);
    const [defaultCurrency, setDefaultCurrency] = useState("");
    const [preferredCurrencies, setPreferredCurrencies] = useState([]);

    const [paymentMethods, setPaymentMethods] = useState([]);
    const [loadingPaymentMethods, setLoadingPaymentMethods] = useState(false);

    const version = "0.2.2";

    // refs to track previous values so we only redirect on meaningful changes
    const prevHydrated = useRef(false);
    const prevUserToken = useRef(null);

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

        // Update state immediately so UI reacts
        setUserToken(token);

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

    // --- load user once ---
    const loadUserData = async (setGA = false) => {
        try {
            const u = await fetchUserData(userToken);
            setUser(u);
        } catch (e) {
            console.warn("loadUserData failed:", e?.message || e);
        } finally {
        }
    };

    const logout = async () => {
        setUser(null);
        await setAndPersistUserToken(null);
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

            try {
                const cats = await getUserCategories(token);
                setCategories(Array.isArray(cats) ? cats : []);
            } catch (e) {
                console.warn("getUserCategories failed:", e?.message || e);
                setCategories([]);
            }
        } catch (e) {
            console.warn("fetchData failed (maybe invalid token):", e?.message || e);
            if (e?.response?.status === 401) {
                await setAndPersistUserToken(null);
            }
        } finally {
            setAuthLoading(false);
        }
    };

    // --- initial bootstrap: read token once from secure storage ---
    useEffect(() => {
        (async () => {
            try {
                const token = await getSecureItem(TOKEN_KEY);
                if (token) {
                    setUserToken(token);
                } else {
                    setUserToken(null);
                    setAuthLoading(false);
                }
            } catch (e) {
                console.warn("Auth bootstrap read token failed:", e);
                setUserToken(null);
                setAuthLoading(false);
            } finally {
                setHydrated(true);
            }
        })();
    }, []);

    // when token present (or changes), load remote data
    useEffect(() => {
        if (!userToken) {
            setUser(null);
            setCategories([]);
            setPaymentMethods([]);
            setAuthLoading(false);
            return;
        }
        fetchData(userToken);
    }, [userToken]);

    // redirect when auth state stabilizes
    // Only run redirects when hydration just finished or token changed (so routine navigation inside app won't trigger replacement)
    useEffect(() => {
        // we need segments and router, but avoid redirect spam — only when meaningful change happens
        if (!hydrated) {
            // still bootstrapping storage — do nothing
            prevHydrated.current = hydrated;
            prevUserToken.current = userToken;
            return;
        }

        const currentRoot = (segments && segments.length > 0 && segments[0]) || "";
        const currentRootLower = String(currentRoot).toLowerCase();
        // auth entry routes where redirecting to app is appropriate
        const AUTH_ENTRY_ROUTES = ["", "index", "login", "/"];

        // detect meaningful changes
        const justHydrated = hydrated && !prevHydrated.current;
        const tokenBecameTruthy = userToken && !prevUserToken.current;
        const tokenBecameFalsy = !userToken && prevUserToken.current;
        // update prev refs at end of this effect (so checks are accurate)
        try {
            // If we now have a token and user data and we're on an auth entry route, redirect to dashboard
            if ((justHydrated || tokenBecameTruthy) && userToken && !authLoading && user && AUTH_ENTRY_ROUTES.includes(currentRootLower)) {
                try {
                    router.replace("home");
                } catch (e) {
                    console.warn("Auth -> navigation to home failed:", e);
                }
                // update prev refs after redirect attempt
                prevHydrated.current = hydrated;
                prevUserToken.current = userToken;
                return;
            }

            // If we don't have a token (logged out) and bootstrap/ token-change just happened, redirect to login (unless already on auth routes)
            if ((justHydrated || tokenBecameFalsy) && !userToken && !authLoading && !AUTH_ENTRY_ROUTES.includes(currentRootLower)) {
                try {
                    setAuthLoading(false);
                    router.replace("/");
                } catch (e) {
                    console.warn("Auth -> navigation to login failed:", e);
                }
                prevHydrated.current = hydrated;
                prevUserToken.current = userToken;
                return;
            }

            // otherwise do nothing — avoid redirecting during normal navigation inside the app
        } finally {
            prevHydrated.current = hydrated;
            prevUserToken.current = userToken;
        }
    }, [hydrated, userToken, authLoading, user, router, segments]);

    // memoize context value
    const value = useMemo(
        () => ({
            version,
            user,
            setUser,
            loadUserData,
            logout,

            userToken,
            setUserToken: setAndPersistUserToken,
            hydrated,
            authLoading,

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
