// app/dashboard.js
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    RefreshControl,
    Dimensions,
    FlatList,
    Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { useAuth } from "context/AuthContext";
import { getAllExpenses } from "services/ExpenseService";
import { createPaymentMethod } from "services/PaymentMethodService";

import Header from "~/header";
import ExpenseRow from "~/expenseRow";
import { useTheme } from "context/ThemeProvider";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

function safeFormatMoney(ccy, value = 0) {
    try {
        return new Intl.NumberFormat(undefined, {
            style: "currency",
            currency: ccy,
        }).format(value);
    } catch {
        return `${Number(value || 0).toFixed(2)} ${ccy || ""}`;
    }
}

export default function DashboardScreen() {
    const router = useRouter();
    const { theme } = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);

    const {
        userToken,
        defaultCurrency = "INR",
        preferredCurrencies = [],
        categories = [],
        paymentMethods = [],
        fetchPaymentMethods = async () => { },
    } = useAuth() || {};

    const [expenses, setExpenses] = useState([]);
    const [userId, setUserId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [showExpenseModal, setShowExpenseModal] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [selectedPM, setSelectedPM] = useState(null);
    const [showBalances, setShowBalances] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const expenseSheetRef = useRef(null);
    const [selectedExpense, setSelectedExpense] = useState(null);

    const pmJustAddedRef = useRef(false);
    const horizRef = useRef(null);

    // Summary range selector state
    const [summaryRange, setSummaryRange] = useState("thisMonth");

    const fetchExpenses = useCallback(async () => {
        try {
            const data = await getAllExpenses(userToken);
            setExpenses(data?.expenses || []);
            setUserId(data?.id || null);
        } catch (error) {
            console.error("Failed to load expenses:", error);
        } finally {
            setLoading(false);
        }
    }, [userToken]);

    useEffect(() => {
        fetchExpenses();
    }, [fetchExpenses]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            await Promise.all([fetchExpenses(), fetchPaymentMethods()]);
        } finally {
            setRefreshing(false);
        }
    }, [fetchExpenses, fetchPaymentMethods]);

    const itemsPerPage = 2;
    const totalPages = Math.max(1, Math.ceil((paymentMethods.length + 1) / itemsPerPage));
    const [page, setPage] = useState(0);

    const onMomentumEnd = (e) => {
        const p = Math.round(e?.nativeEvent?.contentOffset?.x / SCREEN_WIDTH) || 0;
        setPage(Math.min(p, totalPages - 1));
    };

    function filterExpensesByRange(expensesList, range) {
        const now = new Date();
        const start = new Date(now);

        if (range === "thisMonth") {
            start.setDate(1); // beginning of this month
        } else if (range === "last3m") {
            start.setMonth(now.getMonth() - 2, 1); // include last 3 months
        } else if (range === "thisYear") {
            start.setMonth(0, 1); // start of this year
        } else {
            return expensesList; // fallback: all
        }

        start.setHours(0, 0, 0, 0);
        return expensesList.filter((e) => {
            if (e.typeOf !== "expense") return false;
            const d = new Date(e.date);
            return d >= start;
        });
    }

    useEffect(() => {
        if (!pmJustAddedRef.current) return;
        pmJustAddedRef.current = false;
        requestAnimationFrame(() => {
            horizRef.current?.scrollTo({ x: 0, animated: true });
            setPage(0);
        });
    }, [paymentMethods?.length]);

    const onSavePayment = async (payload) => {
        setSubmitting(true);
        try {
            await createPaymentMethod(payload, userToken);
            setShowPaymentModal(false);
            pmJustAddedRef.current = true;
            await fetchPaymentMethods();
        } catch (e) {
            console.error(e);
        } finally {
            setSubmitting(false);
        }
    };

    const currencyDigits = (code, locale = "en-IN") => {
        try {
            const fmt = new Intl.NumberFormat(locale, {
                style: "currency",
                currency: code,
            });
            return fmt.resolvedOptions().maximumFractionDigits ?? 2;
        } catch {
            return 2;
        }
    };

    const formatAmount = (amount, code) => {
        const d = currencyDigits(code);
        return Number(amount || 0).toLocaleString(undefined, {
            minimumFractionDigits: d,
            maximumFractionDigits: d,
        });
    };

    const statsByRange = useMemo(() => {
        const filtered = filterExpensesByRange(expenses || [], summaryRange);

        const acc = {
            total: {},
            personal: { amount: {}, count: 0 },
            group: { amount: {}, count: 0 },
            friend: { amount: {}, count: 0 },
            settle: { amount: {}, count: 0 },
        };

        for (const exp of filtered) {
            const code = exp?.currency || "INR";
            if (exp.typeOf === "expense") {
                const amt = Number(exp?.amount) || 0;
                const userSplit = exp.splits?.find((s) => s.friendId?._id === userId);
                const share = Number(userSplit?.oweAmount);

                if (exp.groupId) {
                    if (userSplit?.owing && Number.isFinite(share)) {
                        acc.group.amount[code] = (acc.group.amount[code] || 0) + share;
                        acc.total[code] = (acc.total[code] || 0) + share;
                    }
                    acc.group.count += 1;
                } else if (exp.splits?.length > 0) {
                    if (userSplit?.owing && Number.isFinite(share)) {
                        acc.friend.amount[code] = (acc.friend.amount[code] || 0) + share;
                        acc.total[code] = (acc.total[code] || 0) + share;
                    }
                    acc.friend.count += 1;
                } else {
                    acc.personal.amount[code] = (acc.personal.amount[code] || 0) + amt;
                    acc.total[code] = (acc.total[code] || 0) + amt;
                    acc.personal.count += 1;
                }
            } else if (exp.typeOf === "settle") {
                const sAmt = Number(exp?.amount) || 0;
                acc.settle.amount[code] = (acc.settle.amount[code] || 0) + sAmt;
                acc.settle.count += 1;
            }
        }
        return acc;
    }, [expenses, userId, summaryRange]);

    const deltas = useMemo(() => {
        if (!expenses?.length) return { total: null, personal: null, group: null, friend: null };

        const now = new Date();
        const currentYear = now.getFullYear();

        function avgForRange(range, typeKey) {
            const start = new Date(now);
            if (range === "thisMonth" || range === "last3m") {
                start.setMonth(now.getMonth() - 6, 1);
            } else if (range === "thisYear") {
                start.setFullYear(now.getFullYear() - 1, 0, 1);
            }
            start.setHours(0, 0, 0, 0);

            const data = (expenses || []).filter((exp) => {
                if (exp.typeOf !== "expense") return false;
                const d = new Date(exp.date);
                if (d < start) return false;
                if (typeKey === "group") return !!exp.groupId;
                if (typeKey === "friend") return !exp.groupId && exp.splits?.length > 0;
                if (typeKey === "personal") return !exp.groupId && (!exp.splits || exp.splits.length === 0);
                return true;
            });

            const totalsByPeriod = {};
            for (const exp of data) {
                const d = new Date(exp.date);
                const userSplit = exp.splits?.find((s) => s.friendId?._id === userId);
                let share = exp.groupId
                    ? userSplit?.owing
                        ? Number(userSplit?.oweAmount) || 0
                        : 0
                    : exp.splits?.length > 0
                        ? userSplit?.owing
                            ? Number(userSplit?.oweAmount) || 0
                            : 0
                        : Number(exp.amount) || 0;
                if (share <= 0) continue;

                let bucketKey, bucketDate;
                if (range === "thisMonth" || range === "last3m") {
                    bucketKey = `${d.getFullYear()}-${d.getMonth()}`;
                    bucketDate = new Date(d.getFullYear(), d.getMonth(), 1);
                } else {
                    bucketKey = `${d.getFullYear()}`;
                    bucketDate = new Date(d.getFullYear(), 0, 1);
                }

                if (!totalsByPeriod[bucketKey]) {
                    totalsByPeriod[bucketKey] = {
                        key: bucketKey,
                        date: bucketDate,
                        total: 0,
                        personal: 0,
                        group: 0,
                        friend: 0,
                        days: new Set(),
                    };
                }
                totalsByPeriod[bucketKey][typeKey] += share;
                totalsByPeriod[bucketKey].total += share;
                totalsByPeriod[bucketKey].days.add(d.toDateString());
            }

            const arr = Object.values(totalsByPeriod).sort((a, b) => a.date - b.date);

            if (range === "thisMonth") {
                const last = arr[arr.length - 1];
                const prev = arr[arr.length - 2];
                if (!last || !prev || prev.days.size === 0) return null;
                const lastAvg = last[typeKey] / last.days.size;
                const prevAvg = prev[typeKey] / prev.days.size;
                if (prevAvg === 0) return null;
                const pct = ((lastAvg - prevAvg) / prevAvg) * 100;
                return { text: `${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(0)}% from last month`, color: pct <= 0 ? theme.colors.positive : theme.colors.negative };
            }

            if (range === "last3m") {
                const last3 = arr.slice(-3);
                const prev2 = arr.slice(-5, -3);
                if (last3.length < 3 || prev2.length < 2) return null;
                const lastAvg = last3.reduce((s, x) => s + x[typeKey], 0) / 3;
                const prevAvg = prev2.reduce((s, x) => s + x[typeKey], 0) / 2;
                if (prevAvg === 0) return null;
                const pct = ((lastAvg - prevAvg) / prevAvg) * 100;
                return { text: `${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(0)}% from last 3 months`, color: pct >= 0 ? theme.colors.negative : theme.colors.positive };
            }

            if (range === "thisYear") {
                const thisYear = arr.filter((a) => a.date.getFullYear() === currentYear);
                const prevYear = arr.filter((a) => a.date.getFullYear() === currentYear - 1);
                if (!thisYear.length || !prevYear.length) return null;
                const thisAvg = thisYear.reduce((s, x) => s + x[typeKey], 0) / thisYear.length;
                const prevAvg = prevYear.reduce((s, x) => s + x[typeKey], 0) / prevYear.length;
                if (prevAvg === 0) return null;
                const pct = ((thisAvg - prevAvg) / prevAvg) * 100;
                return { text: `${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(0)}% vs last year`, color: pct >= 0 ? theme.colors.negative : theme.colors.positive };
            }

            return null;
        }

        return {
            total: avgForRange(summaryRange, "total"),
            personal: avgForRange(summaryRange, "personal"),
            group: avgForRange(summaryRange, "group"),
            friend: avgForRange(summaryRange, "friend"),
        };
    }, [expenses, userId, summaryRange]);

    const recentByDay = useMemo(() => {
        const bucket = {};
        (expenses || [])
            .filter((e) => e.typeOf === "expense")
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 3)
            .forEach((e) => {
                const d = new Date(e.date);
                const key = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(d);
                (bucket[key] ||= []).push(e);
            });
        return Object.entries(bucket);
    }, [expenses]);

    return (
        <SafeAreaView style={styles.safe}>
            <Header main />
            <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 8, gap: 8 }}>
                <ScrollView
                    style={styles.scroller}
                    refreshControl={<RefreshControl tintColor={theme.colors.primary} refreshing={refreshing} onRefresh={onRefresh} />}
                    contentContainerStyle={{ paddingBottom: 24 }}
                    showsVerticalScrollIndicator={false}
                >
                    {loading ? (
                        <View style={styles.centerBox}>
                            <Feather name="loader" size={24} color={theme.colors.text} />
                        </View>
                    ) : expenses.length === 0 ? (
                        <View style={styles.emptyCard}>
                            <Text style={styles.emptyTitle}>No Expenses Yet</Text>
                            <Text style={styles.emptyText}>
                                You haven’t added any expenses yet. Start by adding your first one to see stats and insights.
                            </Text>
                            <TouchableOpacity style={styles.ctaBtn} onPress={() => router.push("/newExpense")}>
                                <Text style={styles.ctaBtnText}>Add Expense</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <>
                            {/* Summary Section */}
                            <View style={{ marginBottom: 16 }}>
                                <View style={styles.rowBetween}>
                                    <Text style={styles.sectionLabel}>Summary</Text>

                                    {/* Range selector */}
                                    <View style={styles.rangeRow}>
                                        {[
                                            { key: "thisMonth", label: "This Month" },
                                            { key: "last3m", label: "Last 3M" },
                                            { key: "thisYear", label: "This Year" },
                                        ].map((opt) => (
                                            <TouchableOpacity
                                                key={opt.key}
                                                style={[styles.rangeBtn, summaryRange === opt.key && styles.rangeBtnActive]}
                                                onPress={() => setSummaryRange(opt.key)}
                                            >
                                                <Text style={[styles.rangeBtnText, summaryRange === opt.key && styles.rangeBtnTextActive]}>{opt.label}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>

                                <View style={styles.cardsGrid}>
                                    {/* Total */}
                                    <TouchableOpacity style={styles.card} onPress={() => router.push("/expenses")} activeOpacity={0.8}>
                                        <Text style={styles.cardLabel}>Total Expenses</Text>
                                        <View style={{ marginTop: 4 }}>
                                            {Object.entries(statsByRange.total).map(([code, amt]) => (
                                                <Text key={`total-${code}`} style={styles.cardValue}>
                                                    {safeFormatMoney(code, amt)}
                                                </Text>
                                            ))}
                                            {Object.keys(statsByRange.total).length === 0 && <Text style={styles.cardValue}>—</Text>}
                                        </View>
                                        {deltas.total && <Text style={[styles.cardMeta, deltas.total ? { color: deltas.total.color } : { color: theme.colors.muted }]}>{deltas.total ? `${deltas.total.text}` : ""}</Text>}
                                        {statsByRange.personal.count + statsByRange.group.count + statsByRange.friend.count > 0 && (
                                            <Text style={[styles.cardMeta, { color: theme.colors.muted }]}>
                                                {statsByRange.personal.count + statsByRange.group.count + statsByRange.friend.count} transactions
                                            </Text>
                                        )}
                                    </TouchableOpacity>

                                    {/* Personal */}
                                    {Object.keys(statsByRange.personal.amount).length > 0 && (
                                        <TouchableOpacity style={styles.card} onPress={() => router.push("/expenses?type=personal")} activeOpacity={0.8}>
                                            <Text style={styles.cardLabel}>Personal Expenses</Text>
                                            <View style={{ marginTop: 4 }}>
                                                {Object.entries(statsByRange.personal.amount).map(([code, amt]) => (
                                                    <Text key={`personal-${code}`} style={styles.cardValue}>
                                                        {safeFormatMoney(code, amt)}
                                                    </Text>
                                                ))}
                                            </View>
                                            {deltas.personal && <Text style={[styles.cardMeta, deltas.personal ? { color: deltas.personal.color } : { color: theme.colors.muted }]}>{deltas.personal ? `${deltas.personal.text}` : ""}</Text>}
                                            <Text style={[styles.cardMeta, { color: theme.colors.muted }]}>{statsByRange.personal.count} transactions</Text>
                                        </TouchableOpacity>
                                    )}

                                    {/* Group */}
                                    {Object.keys(statsByRange.group.amount).length > 0 && (
                                        <TouchableOpacity style={styles.card} onPress={() => router.push("/expenses?type=group")} activeOpacity={0.8}>
                                            <Text style={styles.cardLabel}>Group Expenses</Text>
                                            <View style={{ marginTop: 4 }}>
                                                {Object.entries(statsByRange.group.amount).map(([code, amt]) => (
                                                    <Text key={`group-${code}`} style={styles.cardValue}>
                                                        {safeFormatMoney(code, amt)}
                                                    </Text>
                                                ))}
                                            </View>
                                            {deltas.group && <Text style={[styles.cardMeta, deltas.group ? { color: deltas.group.color } : { color: theme.colors.muted }]}>{deltas.group ? `${deltas.group.text}` : ""}</Text>}
                                            <Text style={[styles.cardMeta, { color: theme.colors.muted }]}>{statsByRange.group.count} transactions</Text>
                                        </TouchableOpacity>
                                    )}

                                    {/* Friend */}
                                    {Object.keys(statsByRange.friend.amount).length > 0 && (
                                        <TouchableOpacity style={styles.card} onPress={() => router.push("/expenses?type=friend")} activeOpacity={0.8}>
                                            <Text style={styles.cardLabel}>Friend Expenses</Text>
                                            <View style={{ marginTop: 4 }}>
                                                {Object.entries(statsByRange.friend.amount).map(([code, amt]) => (
                                                    <Text key={`friend-${code}`} style={styles.cardValue}>
                                                        {safeFormatMoney(code, amt)}
                                                    </Text>
                                                ))}
                                            </View>
                                            {deltas.friend && <Text style={[styles.cardMeta, deltas.friend ? { color: deltas.friend.color } : { color: theme.colors.muted }]}>{deltas.friend ? `${deltas.friend.text}` : ""}</Text>}
                                            <Text style={[styles.cardMeta, { color: theme.colors.muted }]}>{statsByRange.friend.count} transactions</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </View>

                            {/* Recent Expenses */}
                            {expenses.length > 0 && (
                                <View style={{ marginBottom: 16 }}>
                                    <View style={styles.rowBetween}>
                                        <Text style={styles.sectionLabel}>Recent Expenses</Text>
                                        <TouchableOpacity onPress={() => router.push("/expenses")} activeOpacity={0.7}>
                                            <Text style={[styles.linkText, { color: theme.colors.primary }]}>View All</Text>
                                        </TouchableOpacity>
                                    </View>

                                    {recentByDay.map(([day, list]) => (
                                        <View key={day} style={{ gap: 8 }}>
                                            <Text style={[styles.dayHeader, { color: theme.colors.primary }]}>{day}</Text>
                                            <FlatList
                                                data={(list || []).slice(0, 3)}
                                                keyExtractor={(item) => item._id}
                                                scrollEnabled={false}
                                                renderItem={({ item }) => (
                                                    <ExpenseRow
                                                        expense={item}
                                                        userId={userId}
                                                        onPress={(exp) => {
                                                            setSelectedExpense(exp);
                                                            expenseSheetRef.current?.present();
                                                        }}
                                                    />
                                                )}
                                            />
                                        </View>
                                    ))}
                                </View>
                            )}
                        </>
                    )}
                </ScrollView>

                {/* Modals */}
                <Modal visible={!!showExpenseModal} transparent animationType="slide" onRequestClose={() => setShowExpenseModal(false)}>
                    <View style={styles.modalBackdrop}>
                        <View style={styles.modalCard}>
                            <Text style={styles.modalTitle}>Expense</Text>
                            <Text style={styles.modalBody}>{JSON.stringify(showExpenseModal, null, 2).slice(0, 300)}…</Text>
                            <TouchableOpacity style={styles.modalBtn} onPress={() => setShowExpenseModal(false)}>
                                <Text style={styles.modalBtnText}>Close</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>

                <Modal visible={showBalances} transparent animationType="fade" onRequestClose={() => setShowBalances(false)}>
                    <View style={styles.modalBackdrop}>
                        <View style={styles.modalCard}>
                            <Text style={styles.modalTitle}>Balances</Text>
                            <Text style={styles.modalBody}>{selectedPM?.label || ""}</Text>
                            <TouchableOpacity style={styles.modalBtn} onPress={() => setShowBalances(false)}>
                                <Text style={styles.modalBtnText}>Manage Accounts</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>

                <Modal visible={showPaymentModal} transparent animationType="slide" onRequestClose={() => setShowPaymentModal(false)}>
                    <View style={styles.modalBackdrop}>
                        <View style={styles.modalCard}>
                            <Text style={styles.modalTitle}>Add Payment Method</Text>
                            <Text style={styles.modalBody}>Implement your form here.</Text>
                            <View style={{ flexDirection: "row", gap: 12 }}>
                                <TouchableOpacity style={styles.modalBtn} onPress={() => setShowPaymentModal(false)}>
                                    <Text style={styles.modalBtnText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.modalBtn, { backgroundColor: theme.colors.primary }]} onPress={() => onSavePayment({ label: "My Account", type: "upi" })} disabled={submitting}>
                                    <Text style={[styles.modalBtnText, { color: theme.colors.text }]}>{submitting ? "Saving..." : "Save"}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>
            </View>
        </SafeAreaView>
    );
}

const createStyles = (theme) =>
    StyleSheet.create({
        safe: { flex: 1, backgroundColor: theme.colors.background },
        headerTitle: { color: theme.colors.text, fontSize: 24, fontWeight: "700" },
        scroller: { flex: 1 },
        centerBox: { paddingVertical: 24, alignItems: "center", justifyContent: "center" },

        emptyCard: {
            backgroundColor: theme.colors.card,
            borderRadius: 12,
            padding: 16,
            marginTop: 16,
            alignItems: "center",
            borderWidth: 1,
            borderColor: theme.colors.border,
        },
        emptyTitle: { color: theme.colors.text, fontSize: 18, fontWeight: "600" },
        emptyText: { color: theme.colors.muted, textAlign: "center", marginTop: 8 },
        ctaBtn: {
            backgroundColor: theme.colors.primary,
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: 8,
            marginTop: 12,
        },
        ctaBtnText: { color: theme.colors.text, fontWeight: "700" },

        sectionLabel: { color: theme.colors.primary, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" },

        pmCard: { backgroundColor: theme.colors.card, borderRadius: 12, padding: 16, justifyContent: "center", borderWidth: 1, borderColor: theme.colors.border },
        pmTitle: { color: theme.colors.text, fontSize: 18, fontWeight: "700" },
        pmSub: { color: theme.colors.muted, marginTop: 4 },
        pmHint: { color: theme.colors.primary, fontSize: 12, marginTop: 6 },
        pmAddText: { color: theme.colors.muted, marginTop: 6 },
        dotsRow: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 8 },
        dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.border },
        dotActive: { backgroundColor: theme.colors.primary, transform: [{ scale: 1.1 }] },

        rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 8 },
        legendRow: { flexDirection: "row", gap: 8 },
        legendChip: { borderColor: theme.colors.border, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: theme.colors.card },
        legendChipText: { color: theme.colors.text, fontSize: 11 },

        cardsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
        card: {
            backgroundColor: theme.colors.card,
            borderRadius: 12,
            padding: 12,
            width: (SCREEN_WIDTH - 16 * 2 - 12) / 2,
            borderWidth: 1,
            borderColor: theme.colors.border,
        },
        cardLabel: { color: theme.colors.muted, fontSize: 13 },
        cardValue: { color: theme.colors.text, fontSize: 18, fontWeight: "700" },
        cardMeta: { color: theme.colors.muted, fontSize: 11, marginTop: 4 },

        linkText: { color: theme.colors.primary },
        dayHeader: { color: theme.colors.primary, fontSize: 11, textTransform: "uppercase", marginTop: 4 },

        expenseRow: { backgroundColor: theme.colors.card, borderRadius: 12, padding: 12, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: theme.colors.border },
        expenseTitle: { color: theme.colors.text, fontSize: 14, fontWeight: "600" },
        expenseMeta: { color: theme.colors.muted, fontSize: 12, marginTop: 2 },
        expenseAmount: { color: theme.colors.text, fontWeight: "700", marginLeft: 12 },

        chartCard: { backgroundColor: theme.colors.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: theme.colors.border },
        chartTitle: { color: theme.colors.text, fontSize: 16, fontWeight: "700", marginBottom: 8 },
        legendRow2: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
        legendName: { color: theme.colors.text, flex: 1, marginRight: 8 },
        legendValue: { color: theme.colors.text },

        rangeRow: { flexDirection: "row", gap: 8 },
        rangeBtn: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 4, backgroundColor: theme.colors.card },
        rangeBtnActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
        rangeBtnText: { color: theme.colors.text, fontSize: 12 },
        rangeBtnTextActive: { color: theme.colors.textDark, fontWeight: "700" },

        modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 16 },
        modalCard: { backgroundColor: theme.colors.card, borderRadius: 12, padding: 16, width: "100%", borderWidth: 1, borderColor: theme.colors.border },
        modalTitle: { color: theme.colors.text, fontSize: 18, fontWeight: "700", marginBottom: 8 },
        modalBody: { color: theme.colors.muted, marginBottom: 12 },
        modalBtn: { backgroundColor: theme.colors.card, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, alignSelf: "flex-start", borderWidth: 1, borderColor: theme.colors.border },
        modalBtnText: { color: theme.colors.text, fontWeight: "600" },
    });
