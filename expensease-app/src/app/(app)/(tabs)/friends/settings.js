// app/friends/[id]/settings.js
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    View, Text, TouchableOpacity, FlatList, StyleSheet, RefreshControl, Modal, Platform, ActivityIndicator
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";

import { useAuth } from "context/AuthContext";
import {
    getFriendDetails,
    removeFriend,
    acceptFriendRequest,
    rejectFriendRequest,
    cancelFriendRequest,
} from "services/FriendService";
import { getFriendExpense } from "services/ExpenseService";
import { getSymbol } from "utils/currencies";
// import { logEvent } from "utils/analytics";
import Header from "~/header";

// ---------- small helpers ----------
const Section = ({ title, children, right }) => (
    <View style={{}}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <Text style={styles.sectionTitle}>{title}</Text>
            {right}
        </View>
        {children}
    </View>
);

const DangerConfirm = ({ visible, onClose, onConfirm }) => (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
        <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>Remove Friend?</Text>
                <Text style={{ color: "#bbb", marginBottom: 12 }}>
                    This will remove this friend and related expense links. You can add them again later.
                </Text>
                <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
                    <TouchableOpacity onPress={onClose} style={[styles.modalBtn, { backgroundColor: "#2a2a2a" }]}>
                        <Text style={{ color: "#EBF1D5" }}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={onConfirm} style={[styles.modalBtn, { backgroundColor: "#ef4444" }]}>
                        <Text style={{ color: "#fff", fontWeight: "800" }}>Remove</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    </Modal>
);

export default function FriendSettings() {
    const router = useRouter();
    const { id } = useLocalSearchParams(); // friendId
    const { user, userToken } = useAuth() || {};

    const [friend, setFriend] = useState(null);
    const [expenses, setExpenses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyAction, setBusyAction] = useState(false);
    const [error, setError] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);

    // fetch friend
    const fetchFriend = useCallback(async () => {
        try {
            const data = await getFriendDetails(id, userToken);
            setFriend(data);
        } catch (err) {
            console.error("Error fetching friend:", err);
        }
    }, [id, userToken]);

    // fetch expenses
    const fetchExpenses = useCallback(async () => {
        try {
            const data = await getFriendExpense(id, userToken);
            setExpenses(data?.expenses || data || []);
        } catch (err) {
            console.error("Error fetching friend expenses:", err);
        }
    }, [id, userToken]);

    const loadAll = useCallback(async () => {
        setLoading(true);
        try {
            await Promise.all([fetchFriend(), fetchExpenses()]);
        } finally {
            setLoading(false);
        }
    }, [fetchFriend, fetchExpenses]);

    useEffect(() => { loadAll(); }, [loadAll]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        try { await loadAll(); } finally { setRefreshing(false); }
    }, [loadAll]);

    // compute totals (balance / yourExpense / friendExpense) per currency
    const totals = useMemo(() => {
        if (!expenses || !user?._id) return null;
        const t = { balance: {}, yourExpense: {}, friendExpense: {} };

        expenses.forEach((exp) => {
            const code = exp.currency || "INR";
            (exp.splits || []).forEach((split) => {
                if (split.friendId?._id === user._id) {
                    t.balance[code] = (t.balance[code] || 0) + ((split.payAmount || 0) - (split.oweAmount || 0));
                    t.yourExpense[code] = (t.yourExpense[code] || 0) + (split.oweAmount || 0);
                } else {
                    t.friendExpense[code] = (t.friendExpense[code] || 0) + (split.oweAmount || 0);
                }
            });
        });
        return t;
    }, [expenses, user?._id]);

    // request status heuristics (adjust if your API shape differs)
    const status = friend?.status || friend?.friendshipStatus || friend?.friendship?.status; // 'pending_incoming' | 'pending_outgoing' | 'accepted'
    const name = friend?.friend?.name || friend?.name || "Friend";
    const friendId = friend?.friend?._id || friend?._id || id;

    // actions
    const handleRemoveFriend = async () => {
        setConfirmOpen(false);
        setBusyAction(true);
        setError(null);
        try {
            // logEvent("remove_friend", { screen: "friend_settings" });
            await removeFriend(friendId, userToken);
            router.replace("/friends");
        } catch (e) {
            setError(e?.message || "Failed to remove friend. Please try again.");
        } finally {
            setBusyAction(false);
        }
    };

    const handleAccept = async () => {
        setBusyAction(true);
        try {
            await acceptFriendRequest(friendId, userToken);
            await fetchFriend();
        } catch (e) {
            setError(e?.message || "Failed to accept request");
        } finally {
            setBusyAction(false);
        }
    };
    const handleReject = async () => {
        setBusyAction(true);
        try {
            await rejectFriendRequest(friendId, userToken);
            router.replace("/friends");
        } catch (e) {
            setError(e?.message || "Failed to reject request");
        } finally {
            setBusyAction(false);
        }
    };
    const handleCancel = async () => {
        setBusyAction(true);
        try {
            await cancelFriendRequest(friendId, userToken);
            router.replace("/friends");
        } catch (e) {
            setError(e?.message || "Failed to cancel request");
        } finally {
            setBusyAction(false);
        }
    };

    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            <StatusBar style="light" />
            {/* Header */}
            <Header showBack title="Friend settings" />
            <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 8, gap: 8 }}>

                {/* Content */}
                {loading ? (
                    <View style={styles.center}><ActivityIndicator color="#60DFC9" /></View>
                ) : !friend ? (
                    <View style={styles.center}><Text style={{ color: "#B8C4A0" }}>Friend not found</Text></View>
                ) : (
                    <FlatList
                        data={[1]} // just to enable RefreshControl + scrolling layout
                        keyExtractor={() => "body"}
                        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00d0b0" />}
                        contentContainerStyle={{ paddingBottom: 28 }}
                        renderItem={() => (
                            <View style={{ gap: 16 }}>
                                {/* Friend Banner / status */}
                                <Section title="Friend">
                                    <View style={styles.card}>
                                        <Text style={styles.friendName} numberOfLines={1}>{name}</Text>
                                        {!!status && (
                                            <Text style={styles.friendSub} numberOfLines={1}>
                                                Status: {String(status).replaceAll("_", " ")}
                                            </Text>
                                        )}

                                        {/* Request Controls */}
                                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                                            {status === "pending_incoming" && (
                                                <>
                                                    <TouchableOpacity disabled={busyAction} onPress={handleAccept} style={[styles.btn, styles.btnTeal]}>
                                                        <Text style={styles.btnTealText}>Accept</Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity disabled={busyAction} onPress={handleReject} style={[styles.btn, styles.btnOutline]}>
                                                        <Text style={styles.btnOutlineText}>Reject</Text>
                                                    </TouchableOpacity>
                                                </>
                                            )}
                                            {status === "pending_outgoing" && (
                                                <TouchableOpacity disabled={busyAction} onPress={handleCancel} style={[styles.btn, styles.btnOutline]}>
                                                    <Text style={styles.btnOutlineText}>Cancel Request</Text>
                                                </TouchableOpacity>
                                            )}

                                            <TouchableOpacity
                                                onPress={() => {
                                                    // logEvent("navigate", { fromScreen: "friend_settings", toScreen: "friend_detail", source: "cta_text" });
                                                    router.back();
                                                }}
                                                style={[styles.btn, { backgroundColor: "#2a2a2a" }]}
                                            >
                                                <Text style={{ color: "#EBF1D5", fontWeight: "700" }}>View Expenses</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                </Section>

                                {/* (Optional) Summary */}
                                {totals && Object.keys(totals.balance || {}).length > 0 && (
                                    <Section title="Summary">
                                        <View style={styles.card}>
                                            {Object.keys(totals.balance).map((code) => {
                                                const bal = totals.balance[code] || 0;
                                                const sym = getSymbol(code);
                                                const pos = bal >= 0;
                                                return (
                                                    <View key={code} style={{ paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#2a2a2a" }}>
                                                        <Text style={{ color: pos ? "#60DFC9" : "#f87171", fontSize: 14, fontWeight: "700" }}>
                                                            {pos ? "You are owed" : "You owe"}
                                                        </Text>
                                                        <Text style={{ color: "#EBF1D5", fontSize: 20, fontWeight: "800" }}>
                                                            {sym} {Math.abs(bal).toFixed(2)} <Text style={{ color: "#a0a0a0", fontSize: 12 }}>{code}</Text>
                                                        </Text>
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    </Section>
                                )}

                                {/* Danger Zone */}
                                <Section title="Danger Zone">
                                    <View style={[styles.card, { borderColor: "#7f1d1d" }]}>
                                        <Text style={{ color: "#ff7b7b", fontWeight: "800", marginBottom: 6 }}>Remove Friend</Text>
                                        <Text style={{ color: "#9aa08e" }}>
                                            Removes this friend and the links to your shared expenses. You can add them again later.
                                        </Text>
                                        <View style={{ height: 10 }} />
                                        <TouchableOpacity onPress={() => setConfirmOpen(true)} style={[styles.btn, { backgroundColor: "#ef4444" }]}>
                                            {busyAction ? (
                                                <ActivityIndicator color="#fff" />
                                            ) : (
                                                <Text style={{ color: "#fff", fontWeight: "800" }}>Remove Friend</Text>
                                            )}
                                        </TouchableOpacity>
                                        {!!error && (
                                            <View style={{ marginTop: 8, padding: 8, borderRadius: 8, backgroundColor: "rgba(239,68,68,0.15)", borderWidth: 1, borderColor: "#7f1d1d" }}>
                                                <Text style={{ color: "#ffb4b4", textAlign: "center" }}>{error}</Text>
                                            </View>
                                        )}
                                    </View>
                                </Section>
                            </View>
                        )}
                    />
                )}

                {/* Confirm Modal */}
                <DangerConfirm
                    visible={confirmOpen}
                    onClose={() => setConfirmOpen(false)}
                    onConfirm={handleRemoveFriend}
                />
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: "#121212" },
    sectionTitle: { color: "#60DFC9", fontSize: 12, textTransform: "uppercase", fontWeight: "700" },

    card: { backgroundColor: "#1f1f1f", borderRadius: 12, borderWidth: 1, borderColor: "#333", padding: 12 },
    friendName: { color: "#EBF1D5", fontSize: 18, fontWeight: "800" },
    friendSub: { color: "#a0a0a0", marginTop: 2 },

    btn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    btnTeal: { backgroundColor: "#60DFC9" },
    btnTealText: { color: "#121212", fontWeight: "800" },
    btnOutline: { borderWidth: 1, borderColor: "#EBF1D5" },
    btnOutlineText: { color: "#EBF1D5", fontWeight: "800" },

    center: { flex: 1, alignItems: "center", justifyContent: "center" },

    modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 16 },
    modalCard: { backgroundColor: "#1f1f1f", borderRadius: 12, padding: 16, width: "100%" },
    modalTitle: { color: "#EBF1D5", fontSize: 18, fontWeight: "800", marginBottom: 8 },
    modalBtn: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
});
