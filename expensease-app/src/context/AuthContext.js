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
    } catch { }
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

    const [user, setUser] = useState(null);
    const [userToken, setUserToken] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);

    const [categories, setCategories] = useState([]);
    const [defaultCurrency, setDefaultCurrency] = useState();
    const [preferredCurrencies, setPreferredCurrencies] = useState([]);

    const [paymentMethods, setPaymentMethods] = useState([]);
    const [loadingPaymentMethods, setLoadingPaymentMethods] = useState(true);
    const version = '0.0.1'
    // --- public: set token + persist ---
    const setAndPersistUserToken = async (token) => {
        setUserToken(token);
        if (token) {
            await setSecureItem(TOKEN_KEY, token);
        } else {
            await deleteSecureItem(TOKEN_KEY);
        }
    };

    // --- load user once; optionally set GA ---
    const loadUserData = async (setGA = false) => {
        const u = await fetchUserData();
        setUser(u);
        // if (setGA && u?._id) setGAUserId(u._id);
        setAuthLoading(false);
    };

    const logout = async () => {
        setUser(null);
        await setAndPersistUserToken(null);
        router.replace("/");
    };

    // derive currency prefs when user changes
    useEffect(() => {
        if (!user) return;

        const usage = user?.preferredCurrencyUsage ?? {};
        const list = Array.isArray(user?.preferredCurrencies) ? user.preferredCurrencies : [];

        // If user has defaultCurrency, use it; else first from list; else empty
        setDefaultCurrency(user?.defaultCurrency || list[0] || "");

        const sorted = [...list]
            .sort((a, b) => (usage[b] ?? 0) - (usage[a] ?? 0) || String(a).localeCompare(String(b)))
            .slice(0, 3);

        setPreferredCurrencies(sorted);
    }, [user]);

    const fetchData = async () => {
        try {
            const fetchedUser = await fetchUserData();
            setUser(fetchedUser);

            if (fetchedUser?._id) {
                // setGAUserId(fetchedUser._id);
            } else {
                console.warn("User ID missing, GA will wait.");
            }
        } catch (e) {
            console.warn("fetchData failed:", e?.message || e);
        } finally {
            setAuthLoading(false);
        }
    };

    const fetchPaymentMethods = async () => {
        try {
            setLoadingPaymentMethods(true);
            const pms = await listPaymentMethods();
            setPaymentMethods(Array.isArray(pms) ? pms : []);
        } catch (e) {
            console.warn("fetchPaymentMethods failed:", e?.message || e);
        } finally {
            setLoadingPaymentMethods(false);
        }
    };

    const getCategories = async (token) => {
        const cats = await getUserCategories(token);
        setCategories(Array.isArray(cats) ? cats : []);
    };

    // on mount: read token once
    useEffect(() => {
        (async () => {
            try {
                const token = await getSecureItem(TOKEN_KEY);
                if (token) {
                    setUserToken(token);
                } else {
                    setAuthLoading(false); // avoid indefinite spinner when logged out
                }
            } catch {
                setAuthLoading(false);
            }
        })();
    }, []);

    // when token present, load user + categories + payment methods
    useEffect(() => {
        if (!userToken) return;
        (async () => {
            try {
                await fetchData();
                await fetchPaymentMethods();
                await getCategories(userToken);
            } catch (e) {
                console.warn("Init with token failed:", e?.message || e);
            }
        })();
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
            setUserToken: setAndPersistUserToken, // keep same API but persists
            authLoading,

            categories,
            setCategories,
            defaultCurrency,
            preferredCurrencies,

            paymentMethods,
            setPaymentMethods,
            fetchPaymentMethods,
            loadingPaymentMethods,
        }),
        [
            user,
            userToken,
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
