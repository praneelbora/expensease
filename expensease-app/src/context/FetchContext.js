// src/context/FetchContext.js
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { getAllExpenses } from "services/ExpenseService";

/**
 * FetchContext
 *
 * Provides:
 * - expenses: array
 * - userId: id returned by getAllExpenses
 * - loading / refreshing flags
 * - fetchExpenses(page?, options?) -> fetch & set expenses
 * - refreshAll() -> refresh expenses + payment methods (via AuthContext)
 *
 * Usage:
 * Wrap  screen (or parent tabs) with <FetchProvider> and call useFetch()
 */

export const FetchContext = createContext({
    expenses: [],
    userId: null,
    loading: false,
    refreshing: false,
    fetchExpenses: async () => { },
    refreshAll: async () => { },
    setExpenses: () => { },
});

export const FetchProvider = ({ children }) => {
    const { userToken, fetchPaymentMethods } = useAuth();

    const [expenses, setExpenses] = useState([]);
    const [userId, setUserId] = useState(null);

    const [loading, setLoading] = useState(true); // initial load
    const [refreshing, setRefreshing] = useState(false);

    // optional pagination state (kept simple — you can extend)
    const [page, setPage] = useState(0);
    const [limit] = useState(50);

    const fetchExpenses = useCallback(
        async ({ page: p = 0, replace = true } = {}) => {
            if (!userToken) {
                console.warn("[Fetch] fetchExpenses called with no userToken");
                return null;
            }
            try {
                const data = await getAllExpenses(userToken, { page: p, limit }); // if your service supports pagination options
                // getAllExpenses currently returns { expenses, id } in your code — keep same contract
                const received = data?.expenses ?? [];
                const uid = data?.id ?? null;

                setUserId(uid);

                if (replace || p === 0) {
                    setExpenses(received);
                } else {
                    // append for pagination
                    setExpenses((prev) => [...prev, ...received]);
                }

                setPage(p);
                return { expenses: received, userId: uid };
            } catch (err) {
                console.error("[Fetch] fetchExpenses error:", err);
                throw err;
            } finally {
                setLoading(false);
                setRefreshing(false);
            }
        },
        [userToken, limit]
    );

    const refreshAll = useCallback(async () => {
        if (!userToken) return;
        setRefreshing(true);
        try {
            // Fetch expenses + refresh payment methods in parallel (payment methods come from AuthContext)
            await Promise.all([fetchExpenses({ page: 0, replace: true }), fetchPaymentMethods()]);
        } catch (err) {
            console.warn("[Fetch] refreshAll error:", err);
        } finally {
            setRefreshing(false);
        }
    }, [userToken, fetchExpenses, fetchPaymentMethods]);

    // initial (and token-change) fetch — run once when token becomes available
    useEffect(() => {
        if (!userToken) {
            // clear data when no token
            setExpenses([]);
            setUserId(null);
            setLoading(false);
            setRefreshing(false);
            return;
        }

        // initial fetch
        (async () => {
            try {
                await fetchExpenses({ page: 0, replace: true });
            } catch (e) {
                // already logged in but fetch failed — swallow to avoid crash
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userToken]);

    const value = {
        expenses,
        setExpenses,
        userId,
        loading,
        refreshing,
        fetchExpenses,
        refreshAll,
        page,
        setPage,
    };

    return <FetchContext.Provider value={value}>{children}</FetchContext.Provider>;
};

export const useFetch = () => useContext(FetchContext);
