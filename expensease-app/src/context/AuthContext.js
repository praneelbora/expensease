// src/context/AuthContext.js
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";

import { fetchUserData, getUserCategories } from "../services/UserService";
// import { setGAUserId } from "../utils/analytics";
import { listPaymentMethods } from "../services/PaymentMethodService";

export const AuthContext = createContext();

const TOKEN_KEY = "userToken";

// --- secure token helpers (SecureStore with AsyncStorage fallback) ---
async function setSecureItem(key, value) {
    try {
        await SecureStore.setItemAsync(key, value);
    } catch {
        await AsyncStorage.setItem(key, value);
    }
}
async function getSecureItem(key) {
    try {
        const v = await SecureStore.getItemAsync(key);
        if (v != null) return v;
    } catch {
        // fallthrough
    }
    return AsyncStorage.getItem(key);
}
async function deleteSecureItem(key) {
    try {
        await SecureStore.deleteItemAsync(key);
    } catch {
        await AsyncStorage.removeItem(key);
    }
}

export const AuthProvider = ({ children }) => {
    const router = useRouter();

    // core states
    const [user, setUser] = useState(null);
    const [userToken, setUserToken] = useState(null);

    // hydrated -> true when initial token bootstrap finished (either token found or not)
    const [hydrated, setHydrated] = useState(false);

    // authLoading -> true while fetching user/payment/categories after token is present
    const [authLoading, setAuthLoading] = useState(false);

    // other app-level states
    const [categories, setCategories] = useState([]);
    const [defaultCurrency, setDefaultCurrency] = useState("");
    const [preferredCurrencies, setPreferredCurrencies] = useState([]);

    const [paymentMethods, setPaymentMethods] = useState([]);
    const [loadingPaymentMethods, setLoadingPaymentMethods] = useState(false);

    const version = "0.0.1";

    // --- public: set token + persist ---
    const setAndPersistUserToken = async (token) => {
        // set local state first so UI can react immediately
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

    // --- load user once; optionally set GA (keeps the method separate) ---
    const loadUserData = async (setGA = false) => {
        try {
            setAuthLoading(true);
            const u = await fetchUserData();
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

        // If user has defaultCurrency, use it; else first from list; else empty
        setDefaultCurrency(user?.defaultCurrency || list[0] || "");

        const sorted = [...list]
            .sort((a, b) => (usage[b] ?? 0) - (usage[a] ?? 0) || String(a).localeCompare(String(b)))
            .slice(0, 3);

        setPreferredCurrencies(sorted);
    }, [user]);

    // fetch helper: fetch user, categories, payment methods when token present
    const fetchData = async (token) => {
        setAuthLoading(true);
        try {
            // fetch user profile
            const fetchedUser = await fetchUserData(token);
            setUser(fetchedUser);

            // optionally set GA id
            // if (fetchedUser?._id) setGAUserId(fetchedUser._id);

            // fetch payment methods
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
            console.warn("fetchData failed:", e?.message || e);
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
                    // set token; the effect below will fetch data
                    setUserToken(token);
                } else {
                    // no token found -> not authenticated
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
                // convenience wrapper that uses current token
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
