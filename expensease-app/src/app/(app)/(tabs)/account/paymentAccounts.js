// app/payment-accounts/index.js
import React, { useCallback, useMemo, useState, useEffect } from "react";
import {
    View, Text, TouchableOpacity, FlatList, StyleSheet, RefreshControl, Modal, TextInput, Platform
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Header from "~/header";

// ---- wire to your codebase ----
import { useAuth } from "context/AuthContext";
import {
    listPaymentMethods, // unused if you rely on useAuth().paymentMethods
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

function SectionHeader({ title, right }) {
    return (
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <Text style={styles.sectionTitle}>{title}</Text>
            {right}
        </View>
    );
}

// ------- Inline: Edit/Create Payment Method Modal -------
function EditPaymentMethodModal({ visible, onClose, submitting, initialValues, onSave, onDelete }) {
    const [label, setLabel] = useState(initialValues?.label || "");
    const [type, setType] = useState(initialValues?.type || "upi");
    const [capSend, setCapSend] = useState(Boolean(initialValues?.capabilities?.includes("send")));
    const [capReceive, setCapReceive] = useState(Boolean(initialValues?.capabilities?.includes("receive")));
    const editing = Boolean(initialValues?._id);

    useEffect(() => {
        setLabel(initialValues?.label || "");
        setType(initialValues?.type || "upi");
        setCapSend(Boolean(initialValues?.capabilities?.includes("send")));
        setCapReceive(Boolean(initialValues?.capabilities?.includes("receive")));
    }, [initialValues]);

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={styles.modalBackdrop}>
                <View style={styles.modalCard}>
                    <Text style={styles.modalTitle}>{editing ? "Edit" : "Add"} Payment Account</Text>

                    <Text style={styles.modalLabel}>Label</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="e.g. HDFC UPI, Cash"
                        placeholderTextColor="#888"
                        value={label}
                        onChangeText={setLabel}
                    />

                    <Text style={styles.modalLabel}>Type</Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                        {["upi", "bank", "card", "cash", "wallet", "other"].map(t => {
                            const active = type === t;
                            return (
                                <TouchableOpacity key={t} onPress={() => setType(t)}
                                    style={[styles.chip, active && styles.chipActive]}>
                                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{t.toUpperCase()}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <Text style={styles.modalLabel}>Capabilities</Text>
                    <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                        <TouchableOpacity onPress={() => setCapSend(s => !s)} style={[styles.toggle, capSend && styles.toggleActive]}>
                            <Text style={[styles.toggleText, capSend && styles.toggleTextActive]}>SEND</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setCapReceive(s => !s)} style={[styles.toggle, capReceive && styles.toggleActive]}>
                            <Text style={[styles.toggleText, capReceive && styles.toggleTextActive]}>RECEIVE</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                        {editing ? (
                            <TouchableOpacity
                                onPress={() => onDelete(initialValues._id)}
                                style={[styles.modalBtn, { backgroundColor: "#2a2a2a" }]}
                            >
                                <Text style={{ color: "#ff6b6b", fontWeight: "700" }}>Delete</Text>
                            </TouchableOpacity>
                        ) : <View />}

                        <View style={{ flexDirection: "row", gap: 8 }}>
                            <TouchableOpacity onPress={onClose} style={[styles.modalBtn, { backgroundColor: "#2a2a2a" }]}>
                                <Text style={{ color: "#EBF1D5" }}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                disabled={submitting || !label}
                                onPress={() => onSave({
                                    label,
                                    type,
                                    capabilities: [
                                        ...(capSend ? ["send"] : []),
                                        ...(capReceive ? ["receive"] : []),
                                    ],
                                })}
                                style={[styles.modalBtn, { backgroundColor: "#60DFC9", opacity: submitting || !label ? 0.7 : 1 }]}
                            >
                                <Text style={{ color: "#999999", fontWeight: "800" }}>{editing ? "Save" : "Add"}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

// ------- Inline: Add Balance Modal -------
function AddBalanceModal({ visible, onClose, method, currencyOptions, onSubmit }) {
    const [action, setAction] = useState("credit"); // credit | debit | hold | release
    const [currency, setCurrency] = useState(method?.defaultCurrency || "INR");
    const [amount, setAmount] = useState("");
    const [bucket, setBucket] = useState("available"); // for credit/debit
    useEffect(() => {
        setCurrency(method?.defaultCurrency || "INR");
        setAmount("");
        setBucket("available");
    }, [method]);

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={styles.modalBackdrop}>
                <View style={styles.modalCard}>
                    <Text style={styles.modalTitle}>Update Balance</Text>

                    <Text style={styles.modalLabel}>Action</Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                        {["credit", "debit", "hold", "release"].map(a => {
                            const active = action === a;
                            return (
                                <TouchableOpacity key={a} onPress={() => setAction(a)} style={[styles.chip, active && styles.chipActive]}>
                                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{a.toUpperCase()}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {(action === "credit" || action === "debit") && (
                        <>
                            <Text style={styles.modalLabel}>Bucket</Text>
                            <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
                                {["available", "pending"].map(b => {
                                    const active = bucket === b;
                                    return (
                                        <TouchableOpacity key={b} onPress={() => setBucket(b)} style={[styles.chip, active && styles.chipActive]}>
                                            <Text style={[styles.chipText, active && styles.chipTextActive]}>{b.toUpperCase()}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </>
                    )}

                    <Text style={styles.modalLabel}>Currency</Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                        {(currencyOptions || []).slice(0, 10).map(opt => { // (slice to keep UI compact)
                            const active = currency === opt.value;
                            return (
                                <TouchableOpacity key={opt.value} onPress={() => setCurrency(opt.value)} style={[styles.chip, active && styles.chipActive]}>
                                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.value}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <Text style={styles.modalLabel}>Amount</Text>
                    <TextInput
                        keyboardType="decimal-pad"
                        style={styles.input}
                        placeholder="0.00"
                        placeholderTextColor="#888"
                        value={amount}
                        onChangeText={setAmount}
                    />

                    <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                        <TouchableOpacity onPress={onClose} style={[styles.modalBtn, { backgroundColor: "#2a2a2a" }]}>
                            <Text style={{ color: "#EBF1D5" }}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => onSubmit({
                                action,
                                currency,
                                amountMajor: Number(amount || 0),
                                bucket,
                            })}
                            style={[styles.modalBtn, { backgroundColor: "#60DFC9" }]}
                        >
                            <Text style={{ color: "#999999", fontWeight: "800" }}>Update</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

// ------- Single Card -------
function PaymentMethodCard({
    method, balancesPeek, onPeekBalances, onSetDefault, onVerify, onEdit, onAddBalance
}) {
    const caps = method?.capabilities || [];
    const b = balancesPeek[method._id];

    return (
        <View style={styles.card}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                        {method.label || "Payment Account"}
                    </Text>
                    <Text style={styles.cardSub} numberOfLines={1}>
                        {method.type?.toUpperCase()} • {caps.join(" / ").toUpperCase() || "—"}
                    </Text>
                    {(method.isDefaultSend || method.isDefaultReceive) && (
                        <Text style={{ color: "#60DFC9", marginTop: 2, fontSize: 12 }}>
                            {method.isDefaultSend ? "Default SEND" : ""}{method.isDefaultSend && method.isDefaultReceive ? " • " : ""}
                            {method.isDefaultReceive ? "Default RECEIVE" : ""}
                        </Text>
                    )}
                </View>

                <View style={{ alignItems: "flex-end", gap: 8 }}>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                        <TouchableOpacity onPress={() => onEdit(method)} style={styles.iconBtn}><Feather name="edit-2" size={16} color="#EBF1D5" /></TouchableOpacity>
                        {method.status !== "verified" && (
                            <TouchableOpacity onPress={() => onVerify(method._id)} style={styles.iconBtn}><Feather name="check-circle" size={16} color="#60DFC9" /></TouchableOpacity>
                        )}
                    </View>

                    <View style={{ flexDirection: "row", gap: 8 }}>
                        {caps.includes("send") && (
                            <TouchableOpacity onPress={() => onSetDefault(method._id, "send")} style={styles.smallPill}>
                                <Text style={styles.smallPillText}>Set Default SEND</Text>
                            </TouchableOpacity>
                        )}
                        {caps.includes("receive") && (
                            <TouchableOpacity onPress={() => onSetDefault(method._id, "receive")} style={styles.smallPill}>
                                <Text style={styles.smallPillText}>Set Default RECEIVE</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </View>

            {/* balances row */}
            <View style={{ flexDirection: "row", marginTop: 12, gap: 8, flexWrap: "wrap" }}>
                <TouchableOpacity onPress={() => onPeekBalances(method._id)} style={styles.outlineBtn}>
                    <Text style={styles.outlineBtnText}>View Balances</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onAddBalance(method)} style={styles.outlineBtn}>
                    <Text style={styles.outlineBtnText}>Add / Adjust Balance</Text>
                </TouchableOpacity>
            </View>

            {/* balances peek */}
            {!!b && (
                <View style={{ marginTop: 10, gap: 4 }}>
                    {Object.entries(b || {}).map(([bucket, curMap]) => (
                        <View key={bucket} style={{ gap: 2 }}>
                            <Text style={{ color: "#a0a0a0", fontSize: 12 }}>{bucket.toUpperCase()}</Text>
                            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                                {Object.entries(curMap || {}).map(([ccy, amt]) => (
                                    <View key={ccy} style={styles.balanceTag}>
                                        <Text style={styles.balanceTagText}>
                                            {getSymbol(ccy)} {Number(amt || 0).toFixed(2)} {ccy}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        </View>
                    ))}
                </View>
            )}
        </View>
    );
}

export default function PaymentAccountsScreen() {
    const router = useRouter();
    const {
        userToken,
        defaultCurrency,
        preferredCurrencies = [],
        paymentMethods,
        fetchPaymentMethods,
        loadingPaymentMethods,
    } = useAuth() || {};

    // UI state
    const [filter, setFilter] = useState("all"); // all | send | receive | upi | bank | card | cash | wallet | other
    const [refreshing, setRefreshing] = useState(false);

    const [showEdit, setShowEdit] = useState(false);
    const [editing, setEditing] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    const [balancesPeek, setBalancesPeek] = useState({});
    const [showAddBalance, setShowAddBalance] = useState(false);
    const [selectedPM, setSelectedPM] = useState(null);

    const currencyOptions = useMemo(() => {
        const base = new Set([defaultCurrency, ...(preferredCurrencies || [])]);
        // ensure base ones are included + full list available
        return allCurrencies
            .filter(c => base.has(c.code))   // show preferred ones first
            .concat(allCurrencies.filter(c => !base.has(c.code))) // then rest
            .map(c => ({ value: c.code, label: `${c.name} (${c.symbol})`, code: c.code }));
    }, [defaultCurrency, preferredCurrencies]);

    // Pull-to-refresh
    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        try { await fetchPaymentMethods(); } finally { setRefreshing(false); }
    }, [fetchPaymentMethods]);

    const filtered = useMemo(() => {
        let list = [...(paymentMethods || [])];
        if (filter === "send") list = list.filter(a => (a.capabilities || []).includes("send"));
        else if (filter === "receive") list = list.filter(a => (a.capabilities || []).includes("receive"));
        else if (["upi", "bank", "card", "cash", "wallet", "other"].includes(filter)) list = list.filter(a => a.type === filter);

        // prioritize defaults on top
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
        // Confirm UI
        if (!globalThis.confirm) {
            // RN doesn't have confirm—quick inline fallback:
            // You may replace with a proper ActionSheet or custom confirm modal
        }
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

    return (
        <SafeAreaView style={styles.safe}>
            <StatusBar style="light" />
            {/* Header */}
            <Header showBack title="Payment Accounts" />
            <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 8, gap: 8 }}>

                <View style={{}}>

                    <TouchableOpacity
                        onPress={() => {
                            setEditing(null); setShowEdit(true);
                            // logEvent("open_add_payment_method_modal", { screen:"payment_accounts" }); 
                        }}
                        style={styles.addBtn}
                    >
                        <Feather name="plus" size={18} color="#000" />
                        <Text style={{ color: "#000", fontWeight: "700" }}>Add Account</Text>
                    </TouchableOpacity>
                    {/* <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {["all", "send", "receive", "upi", "bank", "card", "cash", "wallet", "other"].map(k => {
              const active = filter === k;
              return (
                <TouchableOpacity key={k} onPress={() => setFilter(k)} style={[styles.chip, active && styles.chipActive]}>
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{k.toUpperCase()}</Text>
                </TouchableOpacity>
              );
            })}
          </View> */}
                </View>

                {/* List */}
                <FlatList
                    data={loadingPaymentMethods ? [] : filtered}
                    contentContainerStyle={{ gap: 12 }}
                    keyExtractor={(it) => String(it._id)}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00d0b0" />}
                    renderItem={({ item, index }) => (
                        <PaymentMethodCard
                            method={item}
                            balancesPeek={balancesPeek}
                            onPeekBalances={peekBalances}
                            onSetDefault={onSetDefault}
                            onVerify={onVerify}
                            onEdit={(acc) => { setEditing(acc); setShowEdit(true); }}
                            onAddBalance={() => onAddBalance(item)}
                        />
                    )}
                    ListEmptyComponent={
                        loadingPaymentMethods ? (
                            <View style={styles.empty}><Feather name="loader" size={20} color="#EBF1D5" /></View>
                        ) : (
                            <View style={styles.empty}><Text style={{ color: "#B8C4A0" }}>No payment accounts yet.</Text></View>
                        )
                    }
                />

                {/* Modals */}
                <EditPaymentMethodModal
                    visible={showEdit}
                    onClose={() => { setShowEdit(false); setEditing(null); }}
                    submitting={submitting}
                    initialValues={editing || undefined}
                    onSave={onSave}
                    onDelete={onDelete}
                />
                <AddBalanceModal
                    visible={showAddBalance}
                    onClose={() => { setShowAddBalance(false); setSelectedPM(null); }}
                    method={selectedPM}
                    currencyOptions={currencyOptions}
                    onSubmit={submitAddBalance}
                />
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: "#121212" },
    header: {
        paddingHorizontal: 16,
        paddingTop: Platform.OS === "android" ? 6 : 0,
        paddingBottom: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: "#EBF1D5",
    },
    headerTitle: { color: "#EBF1D5", fontSize: 24, fontWeight: "700" },

    sectionTitle: { color: "#60DFC9", fontSize: 12, textTransform: "uppercase", fontWeight: "700" },
    chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: "#EBF1D5" },
    chipActive: { backgroundColor: "#60DFC9", borderColor: "#60DFC9" },
    chipText: { color: "#EBF1D5", fontSize: 12, fontWeight: "600" },
    chipTextActive: { color: "#999999", fontWeight: "800" },

    addBtn: { backgroundColor: "#60DFC9", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 8 },

    card: { backgroundColor: "#1f1f1f", borderRadius: 12, borderWidth: 1, borderColor: "#333", padding: 12 },
    cardTitle: { color: "#EBF1D5", fontSize: 16, fontWeight: "800" },
    cardSub: { color: "#aaa", fontSize: 12, marginTop: 2 },

    outlineBtn: { borderWidth: 1, borderColor: "#60DFC9", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
    outlineBtnText: { color: "#60DFC9", fontWeight: "700" },
    smallPill: { borderWidth: 1, borderColor: "#EBF1D5", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
    smallPillText: { color: "#EBF1D5", fontSize: 11, fontWeight: "700" },

    iconBtn: { backgroundColor: "#2a2a2a", padding: 6, borderRadius: 8 },

    balanceTag: { backgroundColor: "#2a2a2a", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    balanceTagText: { color: "#EBF1D5", fontSize: 12 },

    empty: { marginTop: 40, alignItems: "center" },

    // modal shared
    modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 16 },
    modalCard: { backgroundColor: "#1f1f1f", borderRadius: 12, padding: 16, width: "100%" },
    modalTitle: { color: "#EBF1D5", fontSize: 18, fontWeight: "800", marginBottom: 8 },
    modalLabel: { color: "#a0a0a0", marginTop: 8, marginBottom: 6 },
    input: { backgroundColor: "#2a2a2a", color: "#EBF1D5", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },

    toggle: { borderWidth: 1, borderColor: "#EBF1D5", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
    toggleActive: { backgroundColor: "#60DFC9", borderColor: "#60DFC9" },
    toggleText: { color: "#EBF1D5", fontWeight: "700" },
    toggleTextActive: { color: "#999999", fontWeight: "800" },

    modalBtn: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, alignItems: "center", justifyContent: "center" },
});
