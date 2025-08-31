// app/friends/[id].js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    View,
    Text,
    TouchableOpacity,
    FlatList,
    StyleSheet,
    RefreshControl,
    Modal,
    TextInput,
    Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import Header from "~/header";
import ExpenseRow from "~/expenseRow";

// ===== adjust these to your project =====
import { useAuth } from "context/AuthContext";
import { getFriendDetails } from "services/FriendService";
import { getFriendExpense, settleExpense } from "services/ExpenseService";
import { getLoans, closeLoan as closeLoanApi, deleteLoan as deleteLoanApi } from "services/LoanService";
import { fetchFriendsPaymentMethods } from "services/PaymentMethodService";
import { getSymbol, getDigits, formatMoney, allCurrencies } from "utils/currencies";

// -------- Small building blocks (replace with your RN components later) --------
function LineButton({ label, onPress, tone = "primary", disabled }) {
    return (
        <TouchableOpacity
            disabled={disabled}
            onPress={onPress}
            style={[
                styles.ctaBtn,
                tone === "secondary" && { backgroundColor: "#2a2a2a" },
                disabled && { opacity: 0.6 },
            ]}
        >
            <Text style={[styles.ctaBtnText, tone === "secondary" && { color: "#EBF1D5" }]}>{label}</Text>
        </TouchableOpacity>
    );
}

// simple modal to capture manual UPI payment amount (you can swap with your PaymentModal)
function PaymentUPIModal({ visible, onClose, friendName, friendUpi, onConfirm }) {
    const [amount, setAmount] = useState("");
    useEffect(() => { if (!visible) setAmount(""); }, [visible]);
    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={styles.modalBackdrop}>
                <View style={styles.modalCard}>
                    <Text style={styles.modalTitle}>Make UPI Payment</Text>
                    <Text style={{ color: "#a0a0a0", marginBottom: 8 }}>
                        To: {friendName || "Friend"} {friendUpi ? `• ${friendUpi}` : ""}
                    </Text>
                    <TextInput
                        keyboardType="decimal-pad"
                        value={amount}
                        onChangeText={setAmount}
                        placeholder="Amount"
                        placeholderTextColor="#777"
                        style={styles.input}
                    />
                    <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                        <TouchableOpacity style={styles.modalBtnSecondary} onPress={onClose}>
                            <Text style={styles.modalBtnText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.modalBtnPrimary}
                            onPress={() => { onConfirm(Number(amount || 0)); onClose(); }}
                        >
                            <Text style={[styles.modalBtnText, { color: "#121212", fontWeight: "700" }]}>Continue</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

// extremely light “Settle” modal (replace with your SettleModal if needed)
function SettleSheet({ visible, onClose, onSubmit, tx, currencyOptions, defaultCurrency }) {
    const [curr, setCurr] = useState(defaultCurrency || "INR");
    const total = useMemo(
        () => (tx || []).reduce((n, t) => n + (t.amount || 0), 0),
        [tx]
    );

    useEffect(() => { if (visible) setCurr(defaultCurrency || "INR"); }, [visible, defaultCurrency]);

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={styles.modalBackdrop}>
                <View style={styles.modalCard}>
                    <Text style={styles.modalTitle}>Settle Up</Text>
                    <Text style={{ color: "#a0a0a0", marginVertical: 6 }}>
                        This will record a settlement across {tx?.length || 0} currency{(tx?.length || 0) === 1 ? "" : "ies"}.
                    </Text>
                    <Text style={{ color: "#EBF1D5", fontWeight: "700", marginBottom: 8 }}>
                        Total (per-currency): {tx?.map(t => `${getSymbol(t.currency)}${t.amount}`).join(" + ")}
                    </Text>

                    {/* currency picker (simple) */}
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                        {(currencyOptions || [{ value: "INR", label: "₹ INR" }]).slice(0, 10).map(opt => (
                            <TouchableOpacity
                                key={opt.value}
                                onPress={() => setCurr(opt.value)}
                                style={[styles.chip, curr === opt.value && styles.chipActive]}
                            >
                                <Text style={[styles.chipText, curr === opt.value && styles.chipTextActive]}>{opt.value}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
                        <TouchableOpacity style={styles.modalBtnSecondary} onPress={onClose}>
                            <Text style={styles.modalBtnText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.modalBtnPrimary}
                            onPress={() => onSubmit(curr)}
                        >
                            <Text style={[styles.modalBtnText, { color: "#121212", fontWeight: "700" }]}>Record</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

// ========================= Screen =========================
export default function FriendDetails() {
    const router = useRouter();
    const { id } = useLocalSearchParams(); // friendId
    const {
        user,
        userToken,
        defaultCurrency,
        categories = [],
        paymentMethods = [],
        preferredCurrencies
    } = useAuth() || {};

    // ui state
    const [activeTab, setActiveTab] = useState("expenses"); // 'expenses' | 'loans'
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // data
    const [friend, setFriend] = useState(null);
    const [userId, setUserId] = useState(null);
    const [expenses, setExpenses] = useState([]);
    const [loans, setLoans] = useState([]);
    const [loanLoading, setLoanLoading] = useState(true);

    // balances
    const [netExpenseBalanceMap, setNetExpenseBalanceMap] = useState({});
    const [netLoanBalanceMap, setNetLoanBalanceMap] = useState({});

    // modals
    const [showUPIModal, setShowUPIModal] = useState(false);
    const [showSettle, setShowSettle] = useState(false);


    const currencyOptions = useMemo(() => {
        const base = new Set([defaultCurrency, ...(preferredCurrencies || [])]);
        // ensure base ones are included + full list available
        return allCurrencies
            .filter(c => base.has(c.code))   // show preferred ones first
            .concat(allCurrencies.filter(c => !base.has(c.code))) // then rest
            .map(c => ({ value: c.code, label: `${c.name} (${c.symbol})`, code: c.code }));
    }, [defaultCurrency, preferredCurrencies]);


    // ------- helpers ported -------
    const currencyDigits = (code, locale = "en-IN") => {
        try {
            const fmt = new Intl.NumberFormat(locale, { style: "currency", currency: code });
            return fmt.resolvedOptions().maximumFractionDigits ?? 2;
        } catch {
            return 2;
        }
    };
    const roundCurrency = (amount, code) => {
        const d = currencyDigits(code);
        const f = 10 ** d;
        return Math.round((Number(amount) + Number.EPSILON) * f) / f;
    };

    const getOutstandingByCurrency = (loan) => {
        const code = loan?.currency || loan?.principalCurrency || "INR";
        const principal = Number(loan?.principal) || 0;
        let paid = 0;
        for (const r of (loan?.repayments || [])) {
            const rCode = r?.currency || code;
            if (rCode !== code) continue;
            paid += Number(r?.amount) || 0;
        }
        const outstanding = Math.max(0, roundCurrency(principal - paid, code));
        return { code, amount: outstanding };
    };

    const computeNetLoanBalanceByCurrency = (friendId, meId, friendLoans) => {
        const totals = {};
        for (const loan of friendLoans || []) {
            const { code, amount } = getOutstandingByCurrency(loan);
            if (amount === 0) continue;
            const youLender = loan.lenderId?._id === meId;
            const frBorrower = loan.borrowerId?._id === friendId;
            const youBorrower = loan.borrowerId?._id === meId;
            const frLender = loan.lenderId?._id === friendId;
            if (youLender && frBorrower) totals[code] = roundCurrency((totals[code] || 0) + amount, code);
            if (youBorrower && frLender) totals[code] = roundCurrency((totals[code] || 0) - amount, code);
        }
        for (const c of Object.keys(totals)) {
            const minUnit = 1 / (10 ** currencyDigits(c));
            if (Math.abs(totals[c]) < minUnit) delete totals[c];
        }
        return totals;
    };

    const calculateFriendBalanceByCurrency = (exps, meId, frId) => {
        const totals = {};
        const filtered = (exps || []).filter(exp => {
            let youPay = false, frPay = false, youOwe = false, frOwe = false;
            (exp.splits || []).forEach(s => {
                const sid = s.friendId?._id?.toString();
                if (sid === meId) { if (s.paying) youPay = true; if (s.owing) youOwe = true; }
                if (sid === frId) { if (s.paying) frPay = true; if (s.owing) frOwe = true; }
            });
            const oneIsPaying = youPay || frPay;
            const otherIsOwing = (youPay && frOwe) || (frPay && youOwe);
            return oneIsPaying && otherIsOwing;
        });

        for (const exp of filtered) {
            const code = exp?.currency || "INR";
            for (const s of exp.splits || []) {
                const sid = s?.friendId?._id?.toString();
                if (sid !== frId) continue;
                const add = s.owing ? Number(s.oweAmount) || 0 : 0;
                const sub = s.paying ? Number(s.payAmount) || 0 : 0;
                totals[code] = roundCurrency((totals[code] || 0) + add - sub, code);
            }
        }
        for (const c of Object.keys(totals)) {
            const minUnit = 1 / (10 ** currencyDigits(c));
            if (Math.abs(totals[c]) < minUnit) delete totals[c];
        }
        return totals;
    };

    const generateSimplifiedTransactionsByCurrency = (netByCode, meId, frId) => {
        const tx = [];
        for (const [code, amt] of Object.entries(netByCode || {})) {
            if (!amt) continue;
            const from = amt < 0 ? meId : frId;
            const to = amt < 0 ? frId : meId;
            tx.push({ from, to, amount: Math.abs(amt), currency: code });
        }
        return tx;
    };

    // ------- fetching -------
    const fetchLoansForFriend = useCallback(async (meId, frId) => {
        setLoanLoading(true);
        try {
            const res = await getLoans(userToken, { role: "all" });
            const all = res?.loans || res || [];
            const friendLoans = all.filter(l =>
                (l.lenderId?._id === meId && l.borrowerId?._id === frId) ||
                (l.lenderId?._id === frId && l.borrowerId?._id === meId)
            );
            setLoans(friendLoans.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
            setNetLoanBalanceMap(computeNetLoanBalanceByCurrency(frId, meId, friendLoans));
        } catch (e) {
            console.error("Loans fetch error:", e);
        } finally {
            setLoanLoading(false);
        }
    }, [userToken]);

    const fetchData = useCallback(async () => {
        try {
            const data = await getFriendDetails(id, userToken);
            setFriend(data.friend);
            setUserId(data.id);

            const expenseData = await getFriendExpense(id, userToken);
            setExpenses(expenseData || []);

            setNetExpenseBalanceMap(calculateFriendBalanceByCurrency(expenseData, data.id, data.friend._id));

            await fetchLoansForFriend(data.id, data.friend._id);
        } catch (e) {
            console.error("Friend details fetch error:", e);
        } finally {
            setLoading(false);
        }
    }, [id, userToken, fetchLoansForFriend]);

    useEffect(() => { if (id) fetchData(); }, [id, fetchData]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        try { await fetchData(); } finally { setRefreshing(false); }
    }, [fetchData]);

    // ------- actions -------
    const handlePaymentConfirm = (amt) => {
        const amount = Number(amt || 0);
        if (amount <= 0 || !friend?._id || !userId) return;
        // open settle sheet prefilled
        setShowSettle(true);
    };

    const handleSettleSubmit = async (currency) => {
        // naive: settle the *first* currency from netExpenseBalanceMap in that currency
        // (replace with your richer multi-currency flow if needed)
        try {
            const tx = generateSimplifiedTransactionsByCurrency(netExpenseBalanceMap, userId, friend._id);
            // record per-currency as separate settlements
            for (const t of tx) {
                await settleExpense(
                    {
                        payerId: t.from,
                        receiverId: t.to,
                        amount: t.amount,
                        description: "Settlement",
                        currency: t.currency,
                    },
                    userToken
                );
            }
            setShowSettle(false);
            await fetchData();
        } catch (e) {
            console.error("Settle error:", e);
        }
    };



    const expenseList = useMemo(() => {
        // keep recent settled only (<=3 days) unless toggled — you can add a toggle if desired
        return (expenses || []).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }, [expenses]);

    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            <StatusBar style="light" />
            <Header showBack title={friend?.name} button={<TouchableOpacity
                onPress={() => {
                    // logEvent?.("navigate", { fromScreen: "friend_detail", toScreen: "friend_setting", source: "setting" });
                    router.push({ pathname: "/friends/settings", params: { id: friend._id } });
                }}
            >
                <Feather name="settings" size={20} color="#EBF1D5" />
            </TouchableOpacity>
            } />
            {/* Header */}
            {/* <View >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
          <TouchableOpacity
            onPress={() => {
              // logEvent?.("navigate", { fromScreen: "friend_detail", toScreen: "friends", source: "back" });
              router.push("/friends");
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="chevron-left" size={24} color="#EBF1D5" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {friend?.name || "Loading"}
          </Text>
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <TouchableOpacity
              onPress={() => {
                // logEvent?.("navigate", { fromScreen: "friend_detail", toScreen: "friend_setting", source: "setting" });
                // router.push(`/friends/settings/${id}`);
                // router.push({ pathname: "settings", params: { id } });
                // router.push({ pathname: "settings", params: { id } });
                

              }}
            >
              <Feather name="settings" size={20} color="#EBF1D5" />
            </TouchableOpacity>
          </View>
        </View>
      </View> */}

            {/* Tabs */}
            {/* <View style={styles.tabsWrap}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === "expenses" && styles.tabBtnActive]}
          onPress={() => setActiveTab("expenses")}
        >
          <Text style={[styles.tabText, activeTab === "expenses" && styles.tabTextActive]}>Expenses</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === "loans" && styles.tabBtnActive]}
          onPress={() => setActiveTab("loans")}
        >
          <Text style={[styles.tabText, activeTab === "loans" && styles.tabTextActive]}>Loans</Text>
        </TouchableOpacity>
      </View> */}
            {/* Content */}
            {activeTab === "expenses" ? (
                <FlatList
                    data={loading ? [] : expenseList}
                    keyExtractor={(it) => String(it._id)}
                    renderItem={({ item }) =>
                        <ExpenseRow
                            expense={item}
                            userId={userId}
                            onPress={(exp) => {
                                // open modal / navigate
                                console.log("Clicked", exp._id);
                            }}
                        />
                    }
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00d0b0" />}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, paddingTop: 8, flexGrow: 1, }}
                    ListHeaderComponent={
                        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', }}>
                            <View style={{ paddingHorizontal: 0, paddingBottom: 12, flexDirection: 'column' }}>
                                <Text style={styles.sectionLabel}>Net Expenses Balance</Text>

                                {Object.keys(netExpenseBalanceMap || {}).length > 0 ? (
                                    <View style={{ gap: 4, marginTop: 4 }}>
                                        {Object.entries(netExpenseBalanceMap).map(([code, amt]) => {
                                            const sym = getSymbol(code);
                                            const d = currencyDigits(code);
                                            const cls = amt > 0 ? styles.pos : amt < 0 ? styles.neg : styles.neutral;
                                            return (
                                                <Text key={code} style={[styles.balanceLine, cls]}>
                                                    {amt > 0 ? "you are owed" : amt < 0 ? "you owe" : "All Settled"} {sym} {Math.abs(amt).toFixed(d)}
                                                </Text>
                                            );
                                        })}
                                    </View>
                                ) : (
                                    <Text style={[styles.balanceLine, styles.neutral]}>All Settled</Text>
                                )}
                            </View>
                            {Object.values(netExpenseBalanceMap || {}).some(v => Math.abs(v) > 0) && (
                                <View >
                                    <LineButton label="Settle" onPress={() => setShowSettle(true)} />
                                </View>
                            )}

                            {/* Actions */}
                            {/* <View style={{ marginTop: 10, gap: 8 }}>
                {(netExpenseBalanceMap?.INR || 0) < 0 && (
                  <LineButton
                    label="Make Payment"
                    onPress={() => setShowUPIModal(true)}
                    disabled={!friend?.upiId}
                  />
                )}

                {Object.values(netExpenseBalanceMap || {}).some(v => Math.abs(v) > 0) && (
                  <LineButton label="Settle" onPress={() => setShowSettle(true)} />
                )}

                {(netExpenseBalanceMap?.INR || 0) > 0 && !user?.upiId && (
                  <Text style={{ color: "#a0a0a0", fontSize: 12 }}>
                    💡 Add your UPI in{" "}
                    <Text
                      onPress={() => router.push("/account?section=upi")}
                      style={{ color: "#60DFC9", textDecorationLine: "underline" }}
                    >
                      Account
                    </Text>{" "}
                    so friends can pay you instantly.
                  </Text>
                )}

                {(netExpenseBalanceMap?.INR || 0) < 0 && !friend?.upiId && (
                  <Text style={{ color: "#a0a0a0", fontSize: 12, fontStyle: "italic" }}>
                    Ask your friend to add their UPI ID in Account.
                  </Text>
                )}
              </View> */}
                        </View>
                    }
                    ListEmptyComponent={
                        loading ? (
                            <View style={styles.emptyWrap}><Feather name="loader" size={22} color="#EBF1D5" /></View>
                        ) : (
                            <View style={styles.emptyWrap}>
                                <Text style={styles.emptyTitle}>No Expenses Yet</Text>
                                <Text style={styles.emptyText}>Add your first shared expense to see it here.</Text>
                                <LineButton
                                    label="Add Expense"
                                    onPress={() => router.push({ pathname: "/newExpense", params: { friendId: id } })}
                                />
                            </View>
                        )
                    }
                />
            ) : (
                <FlatList
                    data={loanLoading ? [] : loans}
                    keyExtractor={(it) => String(it._id)}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00d0b0" />}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, paddingTop: 8, flexGrow: 1 }}
                    ListHeaderComponent={
                        <View style={{ paddingBottom: 12 }}>
                            <Text style={styles.sectionLabel}>Net Loan Balance</Text>
                            {Object.keys(netLoanBalanceMap || {}).length > 0 ? (
                                <View style={{ gap: 4, marginTop: 4 }}>
                                    {Object.entries(netLoanBalanceMap).map(([code, amt]) => {
                                        const sym = getSymbol(code);
                                        const d = currencyDigits(code);
                                        const cls = amt > 0 ? styles.pos : amt < 0 ? styles.neg : styles.neutral;
                                        return (
                                            <Text key={code} style={[styles.balanceLine, cls]}>
                                                {amt > 0 ? "they owe you" : amt < 0 ? "you owe them" : "All Settled"} {sym} {Math.abs(amt).toFixed(d)}
                                            </Text>
                                        );
                                    })}
                                </View>
                            ) : (
                                <Text style={[styles.balanceLine, styles.neutral]}>All Settled</Text>
                            )}
                        </View>
                    }
                    renderItem={({ item: loan }) => {
                        const loanCode = loan.currency || loan.principalCurrency || "INR";
                        const sym = getSymbol(loanCode);
                        const d = currencyDigits(loanCode);
                        const { code: outCode, amount: outstanding } = getOutstandingByCurrency(loan);
                        const outSym = getSymbol(outCode);
                        const outD = currencyDigits(outCode);
                        const youLender = loan.lenderId?._id === userId;

                        return (
                            <View style={[styles.cardRow, outstanding > 0 && { borderColor: "#00C49F" }]}>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Text style={styles.title} numberOfLines={1}>
                                        {youLender ? "You lent" : "You borrowed"} {sym} {Number(loan.principal || 0).toFixed(d)}
                                        {" "}{youLender ? "to" : "from"} {friend?.name}
                                    </Text>
                                    <Text style={styles.sub} numberOfLines={2}>
                                        Outstanding: {outSym} {Number(outstanding || 0).toFixed(outD)} • Status: {loan.status}
                                    </Text>
                                    {loan.description ? (
                                        <Text style={{ color: "#a0a0a0", fontStyle: "italic" }} numberOfLines={2}>
                                            {loan.description}
                                        </Text>
                                    ) : null}
                                </View>
                            </View>
                        );
                    }}
                    ListEmptyComponent={
                        loanLoading ? (
                            <View style={styles.emptyWrap}><Feather name="loader" size={22} color="#EBF1D5" /></View>
                        ) : (
                            <View style={styles.emptyWrap}>
                                {/* <Text style={styles.emptyTitle}>No Loans Yet</Text>
                                <Text style={styles.emptyText}>Add a loan to track repayments and balances.</Text>
                                <LineButton
                                    label="Add Loan"
                                    onPress={() => router.push({ pathname: "/new-loan", params: { friendId: id } })}
                                /> */}
                            </View>
                        )
                    }
                />
            )}

            {/* Floating add buttons (match your web behavior) */}
            {!loading && activeTab === "expenses" && expenses.length > 0 && (
                <TouchableOpacity
                    style={styles.fab}
                    onPress={() => router.push({ pathname: "/newExpense", params: { friendId: id } })}
                >
                    <Feather name="plus" size={22} color="#121212" />
                    <Text style={styles.fabText}>Add Expense</Text>
                </TouchableOpacity>
            )}
            {/* {!loanLoading && activeTab === "loans" && loans.length > 0 && (
                <TouchableOpacity
                    style={styles.fab}
                    onPress={() => router.push({ pathname: "/new-loan", params: { friendId: id } })}
                >
                    <Feather name="plus" size={22} color="#121212" />
                    <Text style={styles.fabText}>New Loan</Text>
                </TouchableOpacity>
            )} */}

            {/* Modals */}
            <PaymentUPIModal
                visible={showUPIModal}
                onClose={() => setShowUPIModal(false)}
                friendName={friend?.name}
                friendUpi={friend?.upiId}
                onConfirm={handlePaymentConfirm}
            />

            <SettleSheet
                visible={showSettle}
                onClose={() => setShowSettle(false)}
                onSubmit={handleSettleSubmit}
                tx={generateSimplifiedTransactionsByCurrency(netExpenseBalanceMap, userId, friend?._id)}
                currencyOptions={currencyOptions}
                defaultCurrency={defaultCurrency}
            />
        </SafeAreaView>
    );
}

// ========================= styles =========================
const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: "#121212" },
    header: {
        paddingHorizontal: 16,
        paddingTop: Platform.OS === "android" ? 6 : 0,
        paddingBottom: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: "#EBF1D5",
    },
    headerTitle: { color: "#EBF1D5", fontSize: 24, fontWeight: "700", flexShrink: 1 },

    tabsWrap: {
        flexDirection: "row",
        alignSelf: "center",
        marginTop: 10,
        backgroundColor: "#1f1f1f",
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "rgba(235,241,213,0.5)",
        padding: 4,
        gap: 4,
    },
    tabBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999 },
    tabBtnActive: { backgroundColor: "#EBF1D5" },
    tabText: { color: "#EBF1D5", fontSize: 13, fontWeight: "600" },
    tabTextActive: { color: "#121212" },

    sectionLabel: { color: "#a0a0a0", fontSize: 12, textTransform: "uppercase" },
    balanceLine: { fontSize: 18, fontWeight: "700" },
    pos: { color: "#60DFC9" },
    neg: { color: "#EA4335" },
    neutral: { color: "#EBF1D5" },

    cardRow: {
        backgroundColor: "#1f1f1f",
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#333",
        padding: 12,
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 8,
    },
    title: { color: "#EBF1D5", fontSize: 15, fontWeight: "700" },
    sub: { color: "#aaa", fontSize: 12, marginTop: 2 },
    amount: { color: "#EBF1D5", fontWeight: "700", marginLeft: 12 },

    emptyWrap: {
        backgroundColor: "#1f1f1f",
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#333",
        padding: 16,
        marginHorizontal: 16,
        marginTop: 24,
        alignItems: "center",
    },
    emptyTitle: { color: "#EBF1D5", fontSize: 18, fontWeight: "700" },
    emptyText: { color: "#888", textAlign: "center", marginVertical: 6 },

    ctaBtn: { backgroundColor: "#00C49F", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, alignSelf: "center" },
    ctaBtnText: { color: "#121212", fontWeight: "700" },

    fab: {
        position: "absolute",
        right: 16,
        bottom: 24,
        backgroundColor: "#00C49F",
        borderRadius: 999,
        paddingHorizontal: 16,
        paddingVertical: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 6, elevation: 4,
    },
    fabText: { color: "#121212", fontWeight: "700" },

    // modal
    modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 16 },
    modalCard: { backgroundColor: "#1f1f1f", borderRadius: 12, padding: 16, width: "100%" },
    modalTitle: { color: "#EBF1D5", fontSize: 18, fontWeight: "700", marginBottom: 8 },
    modalBtnSecondary: { backgroundColor: "#2a2a2a", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
    modalBtnPrimary: { backgroundColor: "#00C49F", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
    modalBtnText: { color: "#EBF1D5", fontWeight: "600" },

    input: {
        backgroundColor: "#1f1f1f",
        color: "#EBF1D5",
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#55554f",
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 16,
    },
    chip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: "#2a2a2a" },
    chipActive: { backgroundColor: "#EBF1D5", borderColor: "#EBF1D5" },
    chipText: { color: "#EBF1D5", fontSize: 12 },
    chipTextActive: { color: "#121212", fontWeight: "700" },
});
