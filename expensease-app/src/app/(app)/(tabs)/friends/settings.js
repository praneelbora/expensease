// app/friends/[id]/settings.js
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    View,
    Text,
    TouchableOpacity,
    FlatList,
    StyleSheet,
    RefreshControl,
    Modal,
    Platform,
    ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";

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
import Header from "~/header";

// Theme hook (optional). If you don't have a ThemeProvider, ensure this returns {}
import { useTheme } from "context/ThemeProvider";

/* --------------------------
   Small themed components
   -------------------------- */
const Section = ({ title, children, right, styles }) => (
    <View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <Text style={styles.sectionTitle}>{title}</Text>
            {right}
        </View>
        {children}
    </View>
);

const DangerConfirm = ({ visible, onClose, onConfirm, styles }) => (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
        <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>Remove Friend?</Text>
                <Text style={styles.modalMsg}>
                    This will remove this friend and related expense links. You can add them again later.
                </Text>
                <View style={styles.modalActionsRow}>
                    <TouchableOpacity onPress={onClose} style={[styles.modalBtn, styles.modalBtnSecondary]}>
                        <Text style={styles.modalBtnText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={onConfirm} style={[styles.modalBtn, styles.modalBtnDanger]}>
                        <Text style={[styles.modalBtnText, styles.modalBtnDangerText]}>Remove</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    </Modal>
);

/* --------------------------
   Main screen
   -------------------------- */
export default function FriendSettings() {
    const router = useRouter();
    const { id } = useLocalSearchParams(); // friendId
    const { user, userToken } = useAuth() || {};
    const themeCtx = useTheme?.() || {};
    const styles = useMemo(() => createStyles(themeCtx?.theme), [themeCtx?.theme]);

    const [friend, setFriend] = useState(null);
    const [expenses, setExpenses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyAction, setBusyAction] = useState(false);
    const [error, setError] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);

    const fetchFriend = useCallback(async () => {
        try {
            const data = await getFriendDetails(id, userToken);
            setFriend(data);
        } catch (err) {
            console.error("Error fetching friend:", err);
        }
    }, [id, userToken]);

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

    useEffect(() => {
        loadAll();
    }, [loadAll]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            await loadAll();
        } finally {
            setRefreshing(false);
        }
    }, [loadAll]);

    const totals = useMemo(() => {
        if (!expenses || !user?._id) return null;
        const t = { balance: {}, yourExpense: {}, friendExpense: {} };

        expenses.forEach((exp) => {
            const code = exp.currency || "INR";
            (exp.splits || []).forEach((split) => {
                if (String(split.friendId?._id) === String(user._id)) {
                    t.balance[code] = (t.balance[code] || 0) + ((split.payAmount || 0) - (split.oweAmount || 0));
                    t.yourExpense[code] = (t.yourExpense[code] || 0) + (split.oweAmount || 0);
                } else {
                    t.friendExpense[code] = (t.friendExpense[code] || 0) + (split.oweAmount || 0);
                }
            });
        });
        return t;
    }, [expenses, user?._id]);

    const status = friend?.status || friend?.friendshipStatus || friend?.friendship?.status;
    const name = friend?.friend?.name || friend?.name || "Friend";
    const friendId = friend?.friend?._id || friend?._id || id;

    // actions
    const handleRemoveFriend = async () => {
        setConfirmOpen(false);
        setBusyAction(true);
        setError(null);
        try {
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
        setError(null);
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
        setError(null);
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
        setError(null);
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
            <StatusBar style={styles.statusBar} />
            <Header showBack title="Friend settings" />
            <View style={styles.container}>
                {loading ? (
                    <View style={styles.center}><ActivityIndicator color={styles.colors.primaryFallback} /></View>
                ) : !friend ? (
                    <View style={styles.center}><Text style={styles.notFoundText}>Friend not found</Text></View>
                ) : (
                    <FlatList
                        data={[1]}
                        keyExtractor={() => "body"}
                        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={styles.colors.primaryFallback} />}
                        contentContainerStyle={{ paddingBottom: 28 }}
                        renderItem={() => (
                            <View style={{ gap: 16 }}>
                                <Text style={styles.friendName}>{name}</Text>

                                {/* {totals && Object.keys(totals.balance || {}).length > 0 && (
                                    <Section title="Summary" styles={styles}>
                                        <View style={styles.card}>
                                            {Object.keys(totals.balance).map((code) => {
                                                const bal = totals.balance[code] || 0;
                                                const sym = getSymbol(code);
                                                const pos = bal >= 0;
                                                return (
                                                    <View key={code} style={styles.summaryRow}>
                                                        <Text style={pos ? styles.summaryPosLabel : styles.summaryNegLabel}>
                                                            {pos ? "You are owed" : "You owe"}
                                                        </Text>
                                                        <Text style={styles.summaryAmount}>
                                                            {sym} {Math.abs(bal).toFixed(2)} <Text style={styles.summaryCode}>{code}</Text>
                                                        </Text>
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    </Section>
                                )} */}

                                <Section title="Danger Zone" styles={styles}>
                                    <View style={[styles.card, { borderColor: styles.colors.dangerFallback }]}>
                                        <Text style={styles.dangerTitle}>Remove Friend</Text>
                                        <Text style={styles.dangerDesc}>
                                            Removes this friend and the links to your shared expenses. You can add them again later.
                                        </Text>
                                        <View style={{ height: 10 }} />
                                        <TouchableOpacity onPress={() => setConfirmOpen(true)} style={[styles.btn, styles.btnDanger]}>
                                            {busyAction ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnDangerText}>Remove Friend</Text>}
                                        </TouchableOpacity>

                                        {!!error && (
                                            <View style={styles.errorBox}>
                                                <Text style={styles.errorText}>{error}</Text>
                                            </View>
                                        )}
                                    </View>
                                </Section>
                            </View>
                        )}
                    />
                )}

                <DangerConfirm visible={confirmOpen} onClose={() => setConfirmOpen(false)} onConfirm={handleRemoveFriend} styles={styles} />
            </View>
        </SafeAreaView>
    );
}

/* --------------------------
   Theme-aware styles factory
   -------------------------- */
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
        statusBar: theme?.statusBarStyle === "dark-content" ? "dark" : "light",
        container: { flex: 1, paddingHorizontal: 16, paddingTop: 8, gap: 8 },

        sectionTitle: { color: colors.primary, fontSize: 12, textTransform: "uppercase", fontWeight: "700" },

        card: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12 },
        friendName: { color: colors.text, fontSize: 26, fontWeight: "800" },
        friendSub: { color: colors.muted, marginTop: 2 },

        controlsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },

        btn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, alignItems: "center", justifyContent: "center" },
        btnPrimary: { backgroundColor: colors.primary },
        btnPrimaryText: { color: "#121212", fontWeight: "800" },
        btnDanger: { borderColor: colors.danger, borderWidth: 1, alignContent: 'center', justifyContent: 'center', alignItems: 'center' },
        btnDangerText: { color: "#ff7b7b", fontWeight: "800" },
        btnSecondary: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
        btnSecondaryText: { color: colors.text, fontWeight: "700" },
        btnOutline: { borderWidth: 1, borderColor: colors.text },
        btnOutlineText: { color: colors.text, fontWeight: "800" },

        center: { flex: 1, alignItems: "center", justifyContent: "center" },
        notFoundText: { color: "#B8C4A0" },

        // summary
        summaryRow: { paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#2a2a2a" },
        summaryPosLabel: { color: colors.primary, fontSize: 14, fontWeight: "700" },
        summaryNegLabel: { color: "#f87171", fontSize: 14, fontWeight: "700" },
        summaryAmount: { color: colors.text, fontSize: 20, fontWeight: "800" },
        summaryCode: { color: colors.muted, fontSize: 12 },

        // danger
        dangerTitle: { color: "#ff7b7b", fontWeight: "800", marginBottom: 6 },
        dangerDesc: { color: "#9aa08e" },

        errorBox: { marginTop: 8, padding: 8, borderRadius: 8, backgroundColor: "rgba(239,68,68,0.12)", borderWidth: 1, borderColor: "rgba(127,29,29,0.6)" },
        errorText: { color: "#ffb4b4", textAlign: "center" },

        // modal
        modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 16 },
        modalCard: { backgroundColor: colors.card, borderRadius: 12, padding: 16, width: "100%" },
        modalTitle: { color: colors.text, fontSize: 18, fontWeight: "800", marginBottom: 8 },
        modalMsg: { color: colors.muted, marginBottom: 12 },
        modalActionsRow: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },

        modalBtn: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
        modalBtnSecondary: { backgroundColor: "#2a2a2a" },
        modalBtnDanger: { backgroundColor: colors.danger },
        modalBtnText: { color: colors.text, fontWeight: "700" },
        modalBtnDangerText: { color: "#fff", fontWeight: "800" },

        // small palette helpers exported for child components
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
