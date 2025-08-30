// app/dashboard.js

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, Dimensions, FlatList, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
// import { VictoryPie, VictoryChart, VictoryBar, VictoryAxis, VictoryTheme, VictoryTooltip } from "victory-native";

// ✅ FIX PATHS to match your project
import { useAuth } from "context/AuthContext"; // <-- adjust
import { getAllExpenses } from "services/ExpenseService"; // <-- adjust
import { createPaymentMethod } from "services/PaymentMethodService"; // <-- adjust
import Header from "~/header";
// NOTE: currencies helpers are not used now; leave them out to avoid crashes
// import { getAllCurrencyCodes, getSymbol, toCurrencyOptions } from "utils/currencies";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

function safeFormatMoney(ccy, value = 0) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: ccy }).format(value);
  } catch {
    // fallback keeps UI alive even if Intl is missing
    return `${Number(value || 0).toFixed(2)} ${ccy || ""}`;
  }
}

export default function DashboardScreen() {
  const router = useRouter();
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

  const pmJustAddedRef = useRef(false);
  const horizRef = useRef(null);

  // ❌ removed crashing line:
  // const currencyOptions = toCurrencyOptions(getAllCurrencyCodes());

  const fetchExpenses = useCallback(async () => {
    try {
      const data = await getAllExpenses(userToken); // ok even if your service ignores the arg
      console.log(data.length);

      setExpenses(data?.expenses || []);
      setUserId(data?.id || null);
    } catch (error) {
      console.error("Failed to load expenses:", error);
    } finally {
      setLoading(false);
    }
  }, [userToken]);

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchExpenses(), fetchPaymentMethods()]);
    } finally { setRefreshing(false); }
  }, [fetchExpenses, fetchPaymentMethods]);

  const itemsPerPage = 2;
  const totalPages = Math.max(1, Math.ceil((paymentMethods.length + 1) / itemsPerPage));
  const [page, setPage] = useState(0);

  const onMomentumEnd = (e) => {
    const p = Math.round(e?.nativeEvent?.contentOffset?.x / SCREEN_WIDTH) || 0;
    setPage(Math.min(p, totalPages - 1));
  };

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
    } finally { setSubmitting(false); }
  };

  const currencyDigits = (code, locale = "en-IN") => {
    try {
      const fmt = new Intl.NumberFormat(locale, { style: "currency", currency: code });
      return fmt.resolvedOptions().maximumFractionDigits ?? 2;
    } catch { return 2; }
  };
  const formatAmount = (amount, code) => {
    const d = currencyDigits(code);
    return Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
  };

  const stats = useMemo(() => {
    const acc = { total: {}, personal: { amount: {}, count: 0 }, group: { amount: {}, count: 0 }, friend: { amount: {}, count: 0 }, settle: { amount: {}, count: 0 } };
    for (const exp of expenses || []) {
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
  }, [expenses, userId]);

  const MAX_CATS = 6;
  const categoryChart = useMemo(() => {
    const totals = {};
    (expenses || []).forEach((exp) => {
      if (exp.typeOf !== "expense") return;
      const cat = exp.category || "Uncategorized";
      const userSplit = exp.splits?.find((s) => s.friendId?._id === userId);
      if (userSplit?.owing) totals[cat] = (totals[cat] || 0) + (userSplit.oweAmount || 0);
      if (!exp.groupId && (!exp.splits || exp.splits.length === 0)) totals[cat] = (totals[cat] || 0) + (exp.amount || 0);
    });
    const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    const top = entries.slice(0, MAX_CATS);
    const rest = entries.slice(MAX_CATS);
    const other = rest.reduce((s, [, v]) => s + v, 0);
    const data = other > 0 ? [...top, ["Other", other]] : top;
    return data.map(([name, value]) => ({ x: String(name), y: Number(value) }));
  }, [expenses, userId]);

  const [trendRange, setTrendRange] = useState("90d");
  const trendChartRaw = useMemo(() => {
    const monthly = {};
    (expenses || []).forEach((exp) => {
      if (exp.typeOf !== "expense") return;
      const month = new Date(exp.createdAt).toLocaleString("default", { month: "short", year: "2-digit" });
      const split = exp.splits?.find((s) => s.friendId?._id === userId);
      if (split?.owing) monthly[month] = (monthly[month] || 0) + (split.oweAmount || 0);
      if (!exp.groupId && (!exp.splits || exp.splits.length === 0)) monthly[month] = (monthly[month] || 0) + (exp.amount || 0);
    });
    return Object.entries(monthly).map(([name, value]) => ({ x: name, y: Number(value) }));
  }, [expenses, userId]);

  const trendChart = useMemo(() => {
    const N = trendRange === "30d" ? 3 : trendRange === "90d" ? 6 : 12;
    return (trendChartRaw || []).slice(-N);
  }, [trendChartRaw, trendRange]);

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

  const totalDeltaText = useMemo(() => {
    const vals = Object.values(stats.total || {});
    if (!vals.length) return null;
    if (!trendChart || trendChart.length < 2) return null;
    const last = trendChart[trendChart.length - 1]?.y || 0;
    const prev = trendChart[trendChart.length - 2]?.y || 0;
    if (prev <= 0) return null;
    const pct = ((last - prev) / prev) * 100;
    const arrow = pct >= 0 ? "▲" : "▼";
    return `${arrow} ${Math.abs(pct).toFixed(0)}% vs previous`;
  }, [stats.total, trendChart]);

  const ExpenseRow = ({ exp, onPress }) => {
    const code = exp?.currency || defaultCurrency;
    return (
      <TouchableOpacity style={styles.expenseRow} onPress={onPress} activeOpacity={0.7}>
        <View style={{ flex: 1 }}>
          <Text style={styles.expenseTitle} numberOfLines={1}>{exp.title || exp.description || "Expense"}</Text>
          <Text style={styles.expenseMeta} numberOfLines={1}>{exp.category || "Uncategorized"} • {new Date(exp.date).toDateString()}</Text>
        </View>
        <Text style={styles.expenseAmount}>{formatAmount(Number(exp.amount || 0), code)}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Header main showBell onBellPress={() => router.push("/notifications")} />
      <ScrollView
        style={styles.scroller}
        refreshControl={<RefreshControl tintColor="#00d0b0" refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {loading ? (
          <View style={styles.centerBox}><Feather name="loader" size={24} color="#EBF1D5" /></View>
        ) : expenses.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No Expenses Yet</Text>
            <Text style={styles.emptyText}>You haven’t added any expenses yet. Start by adding your first one to see stats and insights.</Text>
            <TouchableOpacity style={styles.ctaBtn} onPress={() => router.push("/newExpense")}><Text style={styles.ctaBtnText}>Add Expense</Text></TouchableOpacity>
          </View>
        ) : (
          <>
            {paymentMethods.length >= 1 && (
              <View style={{ marginBottom: 16, paddingTop: 16 }}>
                <Text style={styles.sectionLabel}>Payment Accounts</Text>

                <ScrollView ref={horizRef} horizontal pagingEnabled onMomentumScrollEnd={onMomentumEnd} showsHorizontalScrollIndicator={false}>
                  {Array.from({ length: totalPages }).map((_, pageIndex) => {
                    const start = pageIndex * itemsPerPage;
                    const slice = [
                      ...paymentMethods.slice(start, start + itemsPerPage),
                      ...(pageIndex === totalPages - 1 ? ["__ADD__"] : []),
                    ].slice(0, itemsPerPage);

                    return (
                      <View key={`pm-page-${pageIndex}`} style={{ width: SCREEN_WIDTH, flexDirection: "row", gap: 12, paddingRight: 12 }}>
                        {slice.map((item, idx) =>
                          item === "__ADD__" ? (
                            <TouchableOpacity key={`add-${idx}`} style={[styles.pmCard, { width: '45%' }]} onPress={() => setShowPaymentModal(true)} activeOpacity={0.8}>
                              <Feather name="plus" size={28} color="#EBF1D5" />
                              <Text style={styles.pmAddText}>Add New</Text>
                            </TouchableOpacity>
                          ) : (
                            <TouchableOpacity
                              key={item._id}
                              style={[styles.pmCard, { width: '45%' }]}
                              // onPress={() => { setSelectedPM(item); setShowBalances(true); }} 
                              activeOpacity={0.8}
                            >
                              <Text style={styles.pmTitle} numberOfLines={1}>{item.label}</Text>
                              <Text style={styles.pmSub} numberOfLines={1}>{String(item.type).toUpperCase()}</Text>
                              {/* <Text style={styles.pmHint}>Tap to view balances</Text> */}
                            </TouchableOpacity>
                          )
                        )}
                      </View>
                    );
                  })}
                </ScrollView>

                {totalPages > 1 && (
                  <View style={styles.dotsRow}>
                    {Array.from({ length: totalPages }).map((_, i) => (<View key={i} style={[styles.dot, i === page && styles.dotActive]} />))}
                  </View>
                )}
              </View>
            )}

            {/* Summary */}
            <View style={{ marginBottom: 16 }}>
              <View style={styles.rowBetween}>
                <Text style={styles.sectionLabel}>Summary</Text>
                {Object.keys(stats.total || {}).length > 1 && (
                  <View style={styles.legendRow}>
                    {Object.keys(stats.total).map((code) => (
                      <View key={code} style={styles.legendChip}>
                        <Text style={styles.legendChipText}>{code}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              <View style={styles.cardsGrid}>
                <TouchableOpacity style={styles.card} onPress={() => router.push("/expenses")} activeOpacity={0.8}>
                  <Text style={styles.cardLabel}>Total Expenses</Text>
                  <View style={{ marginTop: 4 }}>
                    {Object.entries(stats.total).map(([code, amt]) => (
                      <Text key={`total-${code}`} style={styles.cardValue}>{formatAmount(Number(amt), code)}</Text>
                    ))}
                    {Object.keys(stats.total).length === 0 && <Text style={styles.cardValue}>—</Text>}
                  </View>
                  {(stats.personal.count + stats.group.count + stats.friend.count) > 0 && (
                    <Text style={styles.cardMeta}>
                      {stats.personal.count + stats.group.count + stats.friend.count} transactions
                      {totalDeltaText ? ` · ${totalDeltaText}` : ""}
                    </Text>
                  )}
                </TouchableOpacity>

                {Object.keys(stats.personal.amount).length > 0 && (
                  <TouchableOpacity style={styles.card} onPress={() => router.push("/expenses?filter=personal")} activeOpacity={0.8}>
                    <Text style={styles.cardLabel}>Personal Expenses</Text>
                    <View style={{ marginTop: 4 }}>
                      {Object.entries(stats.personal.amount).map(([code, amt]) => (
                        <Text key={`personal-${code}`} style={styles.cardValue}>{formatAmount(Number(amt), code)}</Text>
                      ))}
                    </View>
                    <Text style={styles.cardMeta}>{stats.personal.count} transactions</Text>
                  </TouchableOpacity>
                )}

                {Object.keys(stats.group.amount).length > 0 && (
                  <TouchableOpacity style={styles.card} onPress={() => router.push("/expenses?filter=group")} activeOpacity={0.8}>
                    <Text style={styles.cardLabel}>Group Expenses</Text>
                    <View style={{ marginTop: 4 }}>
                      {Object.entries(stats.group.amount).map(([code, amt]) => (
                        <Text key={`group-${code}`} style={styles.cardValue}>{formatAmount(Number(amt), code)}</Text>
                      ))}
                    </View>
                    <Text style={styles.cardMeta}>{stats.group.count} transactions</Text>
                  </TouchableOpacity>
                )}

                {Object.keys(stats.friend.amount).length > 0 && (
                  <TouchableOpacity style={styles.card} onPress={() => router.push("/expenses?filter=friend")} activeOpacity={0.8}>
                    <Text style={styles.cardLabel}>Friend Expenses</Text>
                    <View style={{ marginTop: 4 }}>
                      {Object.entries(stats.friend.amount).map(([code, amt]) => (
                        <Text key={`friend-${code}`} style={styles.cardValue}>{formatAmount(Number(amt), code)}</Text>
                      ))}
                    </View>
                    <Text style={styles.cardMeta}>{stats.friend.count} transactions</Text>
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
                    <Text style={styles.linkText}>View All</Text>
                  </TouchableOpacity>
                </View>

                {recentByDay.map(([day, list]) => (
                  <View key={day} style={{ gap: 8 }}>
                    <Text style={styles.dayHeader}>{day}</Text>
                    <FlatList
                      data={(list || []).slice(0, 3)}
                      keyExtractor={(item) => item._id}
                      scrollEnabled={false}
                      renderItem={({ item }) => <ExpenseRow exp={item} />}
                      ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                    />
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Modals (placeholders) */}
      <Modal visible={!!showExpenseModal} transparent animationType="slide" onRequestClose={() => setShowExpenseModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Expense</Text>
            <Text style={styles.modalBody}>{JSON.stringify(showExpenseModal, null, 2).slice(0, 300)}…</Text>
            <TouchableOpacity style={styles.modalBtn} onPress={() => setShowExpenseModal(false)}><Text style={styles.modalBtnText}>Close</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showBalances} transparent animationType="fade" onRequestClose={() => setShowBalances(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Balances</Text>
            <Text style={styles.modalBody}>{selectedPM?.label || ""}</Text>
            <TouchableOpacity style={styles.modalBtn} onPress={() => setShowBalances(false)}><Text style={styles.modalBtnText}>Manage Accounts</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showPaymentModal} transparent animationType="slide" onRequestClose={() => setShowPaymentModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Payment Method</Text>
            <Text style={styles.modalBody}>Implement your form here.</Text>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity style={styles.modalBtn} onPress={() => setShowPaymentModal(false)}><Text style={styles.modalBtnText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: "#00C49F" }]} onPress={() => onSavePayment({ label: "My Account", type: "upi" })} disabled={submitting}>
                <Text style={[styles.modalBtnText, { color: "#121212" }]}>{submitting ? "Saving..." : "Save"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}



const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#121212" },
  header: {
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#888",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: { color: "#EBF1D5", fontSize: 24, fontWeight: "700" },
  scroller: { flex: 1, paddingHorizontal: 16 },
  centerBox: { paddingVertical: 24, alignItems: "center", justifyContent: "center" },

  emptyCard: { backgroundColor: "#1f1f1f", borderRadius: 12, padding: 16, marginTop: 16, alignItems: "center" },
  emptyTitle: { color: "#EBF1D5", fontSize: 18, fontWeight: "600" },
  emptyText: { color: "#aaa", textAlign: "center", marginTop: 8 },
  ctaBtn: { backgroundColor: "#00C49F", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, marginTop: 12 },
  ctaBtnText: { color: "#121212", fontWeight: "700" },

  sectionLabel: { color: "#00C49F", fontSize: 12, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 },

  pmCard: { backgroundColor: "#1f1f1f", borderRadius: 12, padding: 16, justifyContent: "center" },
  pmTitle: { color: "#EBF1D5", fontSize: 18, fontWeight: "700" },
  pmSub: { color: "#aaa", marginTop: 4 },
  pmHint: { color: "#00C49F", fontSize: 12, marginTop: 6 },
  pmAddText: { color: "#aaa", marginTop: 6 },
  dotsRow: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#555" },
  dotActive: { backgroundColor: "#00C49F", transform: [{ scale: 1.1 }] },

  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  legendRow: { flexDirection: "row", gap: 8 },
  legendChip: { borderColor: "#2a2a2a", borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: "rgba(255,255,255,0.05)" },
  legendChipText: { color: "#EBF1D5", fontSize: 11 },

  cardsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  card: { backgroundColor: "#1f1f1f", borderRadius: 12, padding: 12, width: (SCREEN_WIDTH - 16 * 2 - 12) / 2 },
  cardLabel: { color: "#aaa", fontSize: 13 },
  cardValue: { color: "#EBF1D5", fontSize: 18, fontWeight: "700" },
  cardMeta: { color: "#888", fontSize: 11, marginTop: 4 },

  linkText: { color: "#00C49F" },
  dayHeader: { color: "#00C49F", fontSize: 11, textTransform: "uppercase", marginTop: 4 },

  expenseRow: { backgroundColor: "#1f1f1f", borderRadius: 12, padding: 12, flexDirection: "row", alignItems: "center" },
  expenseTitle: { color: "#EBF1D5", fontSize: 14, fontWeight: "600" },
  expenseMeta: { color: "#aaa", fontSize: 12, marginTop: 2 },
  expenseAmount: { color: "#EBF1D5", fontWeight: "700", marginLeft: 12 },

  chartCard: { backgroundColor: "#1f1f1f", borderRadius: 12, padding: 12 },
  chartTitle: { color: "#EBF1D5", fontSize: 16, fontWeight: "700", marginBottom: 8 },
  legendRow2: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  legendName: { color: "#EBF1D5", flex: 1, marginRight: 8 },
  legendValue: { color: "#ededed" },

  rangeRow: { flexDirection: "row", gap: 8 },
  rangeBtn: { borderWidth: 1, borderColor: "#2a2a2a", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  rangeBtnActive: { backgroundColor: "#EBF1D5", borderColor: "#EBF1D5" },
  rangeBtnText: { color: "#EBF1D5", fontSize: 12 },
  rangeBtnTextActive: { color: "#121212", fontWeight: "700" },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 16 },
  modalCard: { backgroundColor: "#1f1f1f", borderRadius: 12, padding: 16, width: "100%" },
  modalTitle: { color: "#EBF1D5", fontSize: 18, fontWeight: "700", marginBottom: 8 },
  modalBody: { color: "#aaa", marginBottom: 12 },
  modalBtn: { backgroundColor: "#2a2a2a", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, alignSelf: "flex-start" },
  modalBtnText: { color: "#EBF1D5", fontWeight: "600" },
});
