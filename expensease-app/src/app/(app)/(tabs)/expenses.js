// app/expenses.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    FlatList,
    StyleSheet,
    RefreshControl,
    Modal,
    Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import Header from "~/header";
import BottomSheetFilters from "~/btmShtFilters";
import ExpenseRow from "~/expenseRow";
import { categoryMap } from "utils/categories";

// ===== adjust these paths to your project =====
import { useAuth } from "context/AuthContext";
import { useTheme } from "context/ThemeProvider";
import { getAllExpenses } from "services/ExpenseService";
// import { logEvent } from "utils/analytics";

import { getSymbol, getDigits, formatMoney, allCurrencies } from "utils/currencies";
import SearchBar from "~/searchBar";

// ====== Screen ======
export default function ExpensesScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const { theme } = useTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);

    const {
        user,
        userToken,
        defaultCurrency,
        preferredCurrencies,
        categories = [],
        paymentMethods = [],
    } = useAuth() || {};

    const [loading, setLoading] = useState(true);
    const [expenses, setExpenses] = useState([]);
    const [userId, setUserId] = useState(null);

    const [query, setQuery] = useState("");
    const [showFilter, setShowFilter] = useState(false);
    const filterSheetRef = useRef(null);

    const currencyOptions = useMemo(() => {
        const base = new Set([defaultCurrency, ...(preferredCurrencies || [])]);
        return allCurrencies
            .filter((c) => base.has(c.code))
            .concat(allCurrencies.filter((c) => !base.has(c.code)))
            .map((c) => ({ value: c.code, label: `${c.name} (${c.symbol})`, code: c.code }));
    }, [defaultCurrency, preferredCurrencies]);

    // URL-style initial state (type/category/sort) via router params
    const initialType = (params?.type || params?.filter || "all").toString();
    const initialCategory = (params?.category || "all").toString();
    const initialSort = (params?.sort || "newest").toString();

    const [appliedFilter, setAppliedFilter] = useState({
        type: initialType,
        category: initialCategory,
        currency: "",
        sort: initialSort,
        mode: "split",
    });

    useEffect(() => {
        setAppliedFilter((s) => ({
            ...s,
            type: initialType,
            category: initialCategory,
            sort: initialSort,
        }));
    }, [initialType, initialCategory, initialSort]);

    const defaultFitler = {
        type: initialType,
        category: initialCategory,
        currency: "",
        sort: initialSort,
        mode: "split",
    };

    // keep route in sync when filters change
    useEffect(() => {
        const q = new URLSearchParams({
            type: appliedFilter.type,
            category: appliedFilter.category,
            sort: appliedFilter.sort,
        }).toString();
        router.replace(`/expenses?${q}`);
    }, [appliedFilter, router]);

    // fetch
    const fetchExpenses = useCallback(async () => {
        try {
            const data = await getAllExpenses(userToken);
            setUserId(data?.id);
            setExpenses(data?.expenses || []);
        } catch (e) {
            console.error("Expenses - fetch error:", e?.message || e);
        } finally {
            setLoading(false);
        }
    }, [userToken]);

    useEffect(() => {
        fetchExpenses();
    }, [fetchExpenses]);

    // pull-to-refresh
    const [refreshing, setRefreshing] = useState(false);
    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            await fetchExpenses();
        } finally {
            setRefreshing(false);
        }
    }, [fetchExpenses]);

    // helpers (ported)
    const getSettleDirectionText = (splits = []) => {
        const payer = splits.find((s) => s.paying && s.payAmount > 0);
        const receiver = splits.find((s) => s.owing && s.oweAmount > 0);
        if (!payer || !receiver) return "Invalid settlement";
        const payerName = payer.friendId?._id === userId ? "You" : payer.friendId?.name;
        const receiverName = receiver.friendId?._id === userId ? "you" : receiver.friendId?.name;
        return `${payerName} paid ${receiverName}`;
    };

    const getPayerInfo = (splits = []) => {
        const userSplit = splits.find((s) => s.friendId && s.friendId._id === userId);
        if (!userSplit || (!userSplit.payAmount && !userSplit.oweAmount)) return "You were not involved";
        const payers = splits.filter((s) => s.paying && s.payAmount > 0);
        if (payers.length === 1) return `${payers[0].friendId._id == userId ? "You" : payers[0].friendId.name} paid`;
        if (payers.length > 1) return `${payers.length} people paid`;
        return "No one paid";
    };

    const getOweInfo = (splits = []) => {
        const userSplit = splits.find((s) => s.friendId && s.friendId._id === userId);
        if (!userSplit) return null;
        const { oweAmount = 0, payAmount = 0 } = userSplit;
        const net = payAmount - oweAmount;
        if (net > 0) return { text: "you lent", amount: ` ${net.toFixed(2)}` };
        if (net < 0) return { text: "you borrowed", amount: ` ${Math.abs(net).toFixed(2)}` };
        return null;
    };

    const FILTERS = [
        { key: "all", label: "All Expenses" },
        { key: "personal", label: "Personal Expenses" },
        { key: "settle", label: "Settlements" },
        { key: "group", label: "Group Expenses" },
        { key: "friend", label: "Friend Expenses" },
    ];

    const categoryOptions = useMemo(() => {
        const s = new Set();
        (expenses || []).forEach((e) => {
            if (e?.typeOf !== "settle" && e?.category) {
                const label = categoryMap[e.category]?.label || e.category;
                s.add(label);
            }
        });
        const arr = Array.from(s).sort((a, b) => a.localeCompare(b));
        return ["all", ...arr];
    }, [expenses]);

    // main filterer
    const filteredExpenses = useMemo(() => {
        const filterExpenses = (items, { type, category, currency, sort }, q) => {
            let out = [...items];

            // type
            if (type !== "all") {
                out = out.filter((exp) => {
                    switch (type) {
                        case "settle":
                            return exp.typeOf === "settle";
                        case "personal":
                            return !exp.groupId && exp.typeOf !== "settle" && (exp.splits?.length ?? 0) === 0;
                        case "group":
                            return exp.groupId && exp.typeOf !== "settle";
                        case "friend":
                            return !exp.groupId && exp.typeOf !== "settle" && (exp.splits?.length ?? 0) > 0;
                        default:
                            return true;
                    }
                });
            }

            // category
            if (category !== "all") {
                out = out.filter((e) => {
                    const catLabel = categoryMap[e?.category]?.label || e?.category;
                    return catLabel === category;
                });
            }

            // currency
            if (currency) out = out.filter((e) => e.currency === currency);

            // query search (desc, names, amount, currency, group, date)
            const qq = (q || "").trim().toLowerCase();
            if (qq) {
                out = out.filter((exp) => {
                    const inDesc = (exp.description || "").toLowerCase().includes(qq);
                    const inNames = (exp.splits || []).some((s) => s.friendId && s.friendId.name.toLowerCase().includes(qq));
                    const inAmount = String(exp.amount ?? "").toLowerCase().includes(qq);
                    const inCurrency = (exp.currency || "").toLowerCase().includes(qq);
                    const inGroup = (exp.groupId?.name || "").toLowerCase().includes(qq);

                    const dateStr = exp.date
                        ? new Date(exp.date).toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "2-digit" }).toLowerCase()
                        : "";
                    const inDate = dateStr.includes(qq);

                    const monthStr = exp.date
                        ? new Date(exp.date).toLocaleDateString("en-GB", { year: "numeric", month: "short" }).toLowerCase()
                        : "";
                    const inMonth = monthStr.includes(qq);

                    return inDesc || inNames || inAmount || inCurrency || inGroup || inDate || inMonth;
                });
            }

            // sort
            out.sort((a, b) => (sort === "newest" ? new Date(b.date) - new Date(a.date) : new Date(a.date) - new Date(b.date)));
            return out;
        };

        return filterExpenses(expenses, appliedFilter, query);
    }, [expenses, appliedFilter, query]);



    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            {/* StatusBar uses theme.statusBarStyle if present, otherwise derive from theme.mode */}
            <StatusBar style={theme?.statusBarStyle === "dark-content" ? "dark" : "light"} />
            <Header
                title="Expenses"
                showFilter
                onFilterPress={() => filterSheetRef.current?.present()}
                filterBtnActive={JSON.stringify(appliedFilter) !== JSON.stringify(defaultFitler)}
            />

            <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 8, gap: 8 }}>
                {/* Search */}
                {expenses.length > 0 && (
                    <SearchBar value={query} onChangeText={setQuery} placeholder="Search Descriptions / Names / Amounts / Currencies" />
                )}

                {/* List */}
                <FlatList
                    data={loading ? [] : filteredExpenses}
                    keyExtractor={(item) => String(item._id)}
                    renderItem={({ item }) => (
                        <ExpenseRow
                            expense={item}
                            userId={userId}
                            showExpense={appliedFilter.mode === "expense"}
                            update={fetchExpenses}
                        />
                    )}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingVertical: 8, flexGrow: 1 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
                    ListEmptyComponent={
                        loading ? (
                            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
                                <Feather name="loader" size={22} color={theme.colors.text} />
                            </View>
                        ) : expenses.length === 0 ? (
                            <View style={styles.emptyWrap}>
                                <Text style={styles.emptyTitle}>No expenses found.</Text>
                                <Text style={styles.emptyText}>Add your first expense to see it here.</Text>
                            </View>
                        ) : (
                            <View style={styles.emptyWrap}>
                                <Text style={[styles.emptyTitle, { marginBottom: 6 }]}>No results.</Text>
                                <Text style={styles.emptyText}>Clear filters to view more.</Text>
                                <TouchableOpacity
                                    style={[styles.ctaBtn, { marginTop: 10 }]}
                                    onPress={() => setAppliedFilter({ type: "all", category: "all", currency: "", sort: "newest" })}
                                >
                                    <Text style={styles.ctaBtnText}>Clear Filters</Text>
                                </TouchableOpacity>
                            </View>
                        )
                    }
                    ListFooterComponent={
                        !loading && filteredExpenses.length > 0 && (appliedFilter.type !== "all" || appliedFilter.category !== "all") ? (
                            <Text style={styles.footerHint}>
                                End of Results.{" "}
                                <Text onPress={() => setAppliedFilter({ type: "all", category: "all", currency: "", sort: "newest" })} style={{ color: theme.colors.primary, textDecorationLine: "underline" }}>
                                    Clear Filters
                                </Text>{" "}
                                to view more.
                            </Text>
                        ) : null
                    }
                />

                {/* Filters sheet */}
                <BottomSheetFilters
                    innerRef={filterSheetRef}
                    selected={appliedFilter}
                    filters={FILTERS}
                    categories={categoryOptions}
                    onApply={(newFilters) => setAppliedFilter(newFilters)}
                    onClose={() => console.log("Filter sheet closed")}
                />
            </View>
        </SafeAreaView>
    );
}

// ============ themed styles factory ============
const createStyles = (theme) =>
    StyleSheet.create({
        safe: { flex: 1, backgroundColor: theme?.colors?.background ?? "#121212" },
        header: {
            paddingHorizontal: 16,
            paddingTop: Platform.OS === "android" ? 6 : 0,
            paddingBottom: 10,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: theme?.colors?.border ?? "#2a2a2a",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
        },
        headerTitle: { color: theme?.colors?.text ?? "#EBF1D5", fontSize: 24, fontWeight: "700" },

        filterBtn: {
            backgroundColor: theme?.colors?.card ?? "#212121",
            paddingHorizontal: 10,
            paddingVertical: 8,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: theme?.colors?.border ?? "#212121",
        },
        filterBtnActive: { borderColor: theme?.colors?.primary ?? "#00C49F" },

        input: {
            backgroundColor: theme?.colors?.card ?? "#1f1f1f",
            color: theme?.colors?.text ?? "#EBF1D5",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: theme?.colors?.border ?? "#55554f",
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontSize: 16,
        },

        expenseRow: {
            backgroundColor: theme?.colors?.card ?? "#1f1f1f",
            borderRadius: 12,
            padding: 12,
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 8,
            borderWidth: 1,
            borderColor: theme?.colors?.border ?? "#2a2a2a",
        },
        expenseTitle: { color: theme?.colors?.text ?? "#EBF1D5", fontSize: 15, fontWeight: "700" },
        expenseSub: { color: theme?.colors?.muted ?? "#aaa", fontSize: 12, marginTop: 2 },
        expenseHint: { color: theme?.colors?.primary ?? "#60DFC9", fontSize: 12, marginTop: 2 },
        expenseAmt: { color: theme?.colors?.text ?? "#EBF1D5", fontWeight: "700", marginLeft: 12 },

        emptyWrap: {
            backgroundColor: theme?.colors?.card ?? "#1f1f1f",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: theme?.colors?.border ?? "#333",
            padding: 16,
            marginHorizontal: 16,
            marginTop: 24,
            alignItems: "center",
        },
        emptyTitle: { color: theme?.colors?.text ?? "#EBF1D5", fontSize: 18, fontWeight: "700" },
        emptyText: { color: theme?.colors?.muted ?? "#888", textAlign: "center", marginTop: 6 },

        ctaBtn: { backgroundColor: theme?.colors?.primary ?? "#00C49F", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
        ctaBtnText: { color: theme?.colors?.inverseText ?? "#121212", fontWeight: "700" },

        footerHint: { color: theme?.colors?.muted ?? "#888", textAlign: "center", marginVertical: 10 },

        // modal
        modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 16 },
        modalCard: { backgroundColor: theme?.colors?.card ?? "#1f1f1f", borderRadius: 12, padding: 16, width: "100%" },
        modalTitle: { color: theme?.colors?.text ?? "#EBF1D5", fontSize: 18, fontWeight: "700", marginBottom: 8 },
        modalSection: { color: theme?.colors?.primary ?? "#60DFC9", fontSize: 12, textTransform: "uppercase", marginTop: 8, marginBottom: 6 },
        chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
        chip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: theme?.colors?.border ?? "#2a2a2a" },
        chipActive: { backgroundColor: theme?.colors?.primary ?? "#EBF1D5", borderColor: theme?.colors?.primary ?? "#EBF1D5" },
        chipText: { color: theme?.colors?.text ?? "#EBF1D5", fontSize: 12 },
        chipTextActive: { color: theme?.colors?.inverseText ?? "#121212", fontWeight: "700" },
        modalBtnSecondary: { backgroundColor: theme?.colors?.card ?? "#2a2a2a", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
        modalBtnPrimary: { backgroundColor: theme?.colors?.primary ?? "#00C49F", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
        modalBtnText: { color: theme?.colors?.text ?? "#EBF1D5", fontWeight: "600" },
    });
