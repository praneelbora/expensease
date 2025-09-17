// app/payment-accounts/index.js
import React, { useCallback, useMemo, useState, useEffect, useRef } from "react";
import {
    View, Text, TouchableOpacity, FlatList, StyleSheet, RefreshControl, Modal, TextInput, Platform
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Header from "~/header";
import BottomSheetPaymentAccount from "~/btmShtPayAcc";
import BottomSheetEditBalance from "~/btmShtEditBal";

// ---- wire to your codebase ----
import { useAuth } from "context/AuthContext";
import {
    listPaymentMethods,
    createPaymentMethod,
    updatePaymentMethod,
    deletePaymentMethod,
    setDefaultSend,
    setDefaultReceive,
    getBalances,
    creditBalance,
    debitBalance,
    holdBalance,
    releaseBalance,
} from "services/PaymentMethodService";
import { getSymbol, getDigits, formatMoney, allCurrencies } from "utils/currencies";
import PaymentMethodCard from "~/paymentAccountCard";

// Optional theme hook (if you have one). If not present, the factory falls back to defaults.
import { useTheme } from "context/ThemeProvider";

/* ---------------------------
   Main Screen
----------------------------*/
export default function PaymentAccountsScreen() {
    const router = useRouter();
    const themeCtx = useTheme?.() || {};
    const styles = useMemo(() => createStyles(themeCtx?.theme), [themeCtx?.theme]);

    const {
        userToken,
        defaultCurrency,
        preferredCurrencies = [],
        paymentMethods,
        fetchPaymentMethods,
        loadingPaymentMethods,
    } = useAuth() || {};
    // UI state
    const [filter, setFilter] = useState("all");
    const [refreshing, setRefreshing] = useState(false);

    const [showEdit, setShowEdit] = useState(false);
    const [editing, setEditing] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [busyBalance, setBusyBalance] = useState(false);

    const [balancesPeek, setBalancesPeek] = useState({});
    const [showAddBalance, setShowAddBalance] = useState(false);
    const [selectedPM, setSelectedPM] = useState(null);
    const paymentSheetRef = useRef(null);
    const balanceSheetRef = useRef(null);

    const currencyOptions = useMemo(() => {
        const base = new Set([defaultCurrency, ...(preferredCurrencies || [])]);
        return allCurrencies
            .filter(c => base.has(c.code))
            .concat(allCurrencies.filter(c => !base.has(c.code)))
            .map(c => ({ value: c.code, label: `${c.name} (${c.symbol})`, code: c.code }));
    }, [defaultCurrency, preferredCurrencies]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        try { await fetchPaymentMethods(); } finally { setRefreshing(false); }
    }, [fetchPaymentMethods]);

    const filtered = useMemo(() => {
        let list = [...(paymentMethods || [])];
        if (filter === "send") list = list.filter(a => (a.capabilities || []).includes("send"));
        else if (filter === "receive") list = list.filter(a => (a.capabilities || []).includes("receive"));
        else if (["upi", "bank", "card", "cash", "wallet", "other"].includes(filter)) list = list.filter(a => a.type === filter);

        return list.sort((a, b) => {
            const aScore = (a.isDefaultSend ? 2 : 0) + (a.isDefaultReceive ? 2 : 0);
            const bScore = (b.isDefaultSend ? 2 : 0) + (b.isDefaultReceive ? 2 : 0);
            return bScore - aScore;
        });
    }, [paymentMethods, filter]);

    // actions
    const onSetDefault = async (paymentMethodId, mode) => {
        try {
            if (mode === "send") await setDefaultSend(paymentMethodId, userToken);
            else if (mode === "receive") await setDefaultReceive(paymentMethodId, userToken);
            else throw new Error("Invalid default mode");
            await fetchPaymentMethods();
        } catch (e) {
            console.error(e);
            alert(e.message || "Failed to set default");
        }
    };

    const onVerify = async (paymentMethodId) => {
        try {
            await updatePaymentMethod(paymentMethodId, { status: "verified" }, userToken);
            await fetchPaymentMethods();
        } catch (e) {
            console.error(e);
            alert(e.message || "Failed to verify payment account");
        }
    };

    const onDelete = async (paymentMethodId) => {
        if (!paymentMethodId) return;
        try {
            await deletePaymentMethod(paymentMethodId, userToken);
            await fetchPaymentMethods();
            setShowEdit(false);
            setEditing(null);
        } catch (e) {
            console.error(e);
            alert(e.message || "Failed to delete payment account");
        }
    };

    const onSave = async (payload) => {
        setSubmitting(true);
        try {
            if (editing?._id) await updatePaymentMethod(editing._id, payload, userToken);
            else await createPaymentMethod(payload, userToken);
            setShowEdit(false);
            setEditing(null);
            await fetchPaymentMethods();
        } catch (e) {
            console.error(e);
            alert(e.message || "Failed to save payment account");
        } finally {
            setSubmitting(false);
        }
    };

    const peekBalances = async (paymentMethodId) => {
        try {
            const data = await getBalances(paymentMethodId, userToken);
            setBalancesPeek(prev => ({ ...prev, [paymentMethodId]: data || {} }));
        } catch (e) {
            console.error(e);
            alert(e.message || "Failed to load balances");
        }
    };

    const onAddBalance = (pm) => {
        setSelectedPM(pm);
        setShowAddBalance(true);
    };
    const submitAddBalance = async ({ action, currency, amountMajor, bucket }) => {
        if (!selectedPM?._id) return;
        const base = { currency, amount: amountMajor };

        try {
            if (action === "credit") {
                await creditBalance(selectedPM._id, { ...base, bucket }, userToken);
            } else if (action === "debit") {
                await debitBalance(selectedPM._id, { ...base, bucket }, userToken);
            } else if (action === "hold") {
                await holdBalance(selectedPM._id, base, userToken);
            } else if (action === "release") {
                await releaseBalance(selectedPM._id, base, userToken);
            } else {
                throw new Error("Invalid action");
            }
            await peekBalances(selectedPM._id);
            await fetchPaymentMethods();
            setShowAddBalance(false);
            setSelectedPM(null);
        } catch (e) {
            console.error(e);
            alert(e.message || "Failed to update balance");
        }
    };
    // inside PaymentAccountsScreen component (add near other actions)
    const onToggleExcludeFromSummaries = async (paymentMethodId, currentValue) => {
        try {
            // optimistic UI: update local auth/paymentMethods if you want (optional)
            setSubmitting(true);
            // send update with new value (flip boolean)
            await updatePaymentMethod(paymentMethodId, { excludeFromSummaries: !currentValue }, userToken);
            await fetchPaymentMethods();
        } catch (e) {
            console.error("Failed toggling excludeFromSummaries:", e);
            alert(e.message || "Failed to update payment account");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <SafeAreaView style={styles.safe}>
            <StatusBar style="light" />
            <Header showBack title="Payment Accounts" />
            <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 8, gap: 8 }}>

                <View>
                    <TouchableOpacity
                        onPress={() => {
                            setEditing(null);
                            paymentSheetRef.current?.present();
                        }}
                        style={styles.addBtn}
                    >
                        <Feather name="plus" size={18} color={styles.colors.textFallback} />
                        <Text style={{ color: styles.colors.textFallback, fontWeight: "700" }}>Add Account</Text>
                    </TouchableOpacity>
                </View>

                <FlatList
                    data={loadingPaymentMethods ? [] : filtered}
                    contentContainerStyle={{ gap: 12 }}
                    keyExtractor={(it) => String(it._id)}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00d0b0" />}
                    renderItem={({ item }) => (
                        <PaymentMethodCard
                            method={item}
                            balancesPeek={balancesPeek}
                            onPeekBalances={peekBalances}
                            onSetDefault={onSetDefault}
                            onVerify={onVerify}
                            onEdit={(acc) => {
                                setSelectedPM(item)
                                setEditing(acc); // pass into sheet via initialValues
                                paymentSheetRef.current?.present();
                            }}
                            onAddBalance={() => {
                                setSelectedPM(item)
                                balanceSheetRef.current?.present()
                            }}
                            // NEW: toggle exclude from summaries
                            onToggleExclude={(pm) => onToggleExcludeFromSummaries(pm._id, !!pm.excludeFromSummaries)}
                            styles={styles}
                        />
                    )}

                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        loadingPaymentMethods ? (
                            <View style={styles.empty}><Feather name="loader" size={20} color={styles.colors.textFallback} /></View>
                        ) : (
                            <View style={styles.empty}><Text style={{ color: styles.colors.mutedFallback }}>No payment accounts yet.</Text></View>
                        )
                    }
                />

                <BottomSheetPaymentAccount
                    innerRef={paymentSheetRef}
                    initialValues={editing}
                    busy={submitting}
                    onSave={(payload) => {
                        paymentSheetRef.current?.dismiss()
                        onSave(payload)
                    }
                    } // your screen's onSave
                    onDelete={(id) => onDelete(id)}
                    onClose={() => {/* optional */ }}
                />

                <BottomSheetEditBalance
                    innerRef={balanceSheetRef}
                    method={selectedPM}
                    currencyOptions={currencyOptions}
                    busy={busyBalance}
                    onSubmit={submitAddBalance}
                    onClose={() => {/* optional */ }}
                />

            </View>
        </SafeAreaView>
    );
}

/* ---------------------------
   Theme-aware styles factory
----------------------------*/
const createStyles = (theme = {}) => {
    const colors = {
        background: theme?.colors?.background ?? "#121212",
        card: theme?.colors?.card ?? "#1f1f1f",
        cardAlt: theme?.colors?.cardAlt ?? "#2A2A2A",
        border: theme?.colors?.border ?? "#333",
        text: theme?.colors?.text ?? "#EBF1D5",
        muted: theme?.colors?.muted ?? "#a0a0a0",
        primary: theme?.colors?.primary ?? "#60DFC9",
        cta: theme?.colors?.cta ?? "#00C49F",
        danger: theme?.colors?.danger ?? "#ef4444",
    };

    const s = StyleSheet.create({
        safe: { flex: 1, backgroundColor: colors.background },
        header: {
            paddingHorizontal: 16,
            paddingTop: Platform.OS === "android" ? 6 : 0,
            paddingBottom: 10,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.text,
        },
        headerTitle: { color: colors.text, fontSize: 24, fontWeight: "700" },

        sectionTitle: { color: colors.primary, fontSize: 12, textTransform: "uppercase", fontWeight: "700" },
        chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: colors.text },
        chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
        chipText: { color: colors.text, fontSize: 12, fontWeight: "600" },
        chipTextActive: { color: "#999999", fontWeight: "800" },

        addBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 8 },

        card: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12 },
        cardTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
        cardSub: { color: colors.muted, fontSize: 12, marginTop: 2 },

        outlineBtn: { borderWidth: 1, borderColor: colors.primary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
        outlineBtnText: { color: colors.primary, fontWeight: "700" },
        smallPill: { borderWidth: 1, borderColor: colors.text, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
        smallPillText: { color: colors.text, fontSize: 11, fontWeight: "700" },

        iconBtn: { backgroundColor: colors.cardAlt, padding: 6, borderRadius: 8 },

        balanceTag: { backgroundColor: colors.cardAlt, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
        balanceTagText: { color: colors.text, fontSize: 12 },

        empty: { marginTop: 40, alignItems: "center" },

        // modal shared
        modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 16 },
        modalCard: { backgroundColor: colors.card, borderRadius: 12, padding: 16, width: "100%" },
        modalTitle: { color: colors.text, fontSize: 18, fontWeight: "800", marginBottom: 8 },
        modalLabel: { color: colors.muted, marginTop: 8, marginBottom: 6 },
        input: { backgroundColor: colors.cardAlt, color: colors.text, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },

        toggle: { borderWidth: 1, borderColor: colors.text, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
        toggleActive: { backgroundColor: colors.primary, borderColor: colors.primary },
        toggleText: { color: colors.text, fontWeight: "700" },
        toggleTextActive: { color: "#999999", fontWeight: "800" },

        modalBtn: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, alignItems: "center", justifyContent: "center" },
        modalBtnMuted: { backgroundColor: "#2a2a2a" },

        // palette helpers exposed on styles for inline use
        colors: {
            backgroundFallback: colors.background,
            cardFallback: colors.card,
            cardAltFallback: colors.cardAlt,
            borderFallback: colors.border,
            textFallback: colors.text,
            mutedFallback: colors.muted,
            primaryFallback: colors.primary,
            ctaFallback: colors.cta,
            dangerFallback: colors.danger,
        },
    });

    s.colors = s.colors;
    return s;
};
