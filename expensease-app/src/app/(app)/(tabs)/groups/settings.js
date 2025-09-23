// app/groups/settings.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ScrollView,
    RefreshControl,
    ActivityIndicator,
    Modal,
    Pressable,
    Alert,
    Switch,
    StyleSheet,
    Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Header from "~/header";

import { useAuth } from "context/AuthContext";
import {
    getGroupDetails,
    updateGroupName,
    leaveGroup,
    deleteGroup,
    getGroupExpenses,
    updateGroupPrivacySetting,
    updateGroupSimplifySetting,
} from "services/GroupService";

import {
    getFriends,
    sendFriendRequest,
    fetchReceivedRequests,
    fetchSentRequests,
    acceptFriendRequest,
    rejectFriendRequest,
} from "services/FriendService";

import { getSymbol } from "utils/currencies";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import BottomSheetAddFriendsToGroup from "~/btmShtAddfriendsToGroup";
import { useTheme } from "context/ThemeProvider";

/**
 * GroupSettingsScreen (themed)
 *
 * Converts earlier inline-styled screen into a themed version using useTheme()
 * and createStyles(theme). All colors and key layout values come from the theme
 * when available and gracefully fallback to the original dark palette.
 */

export default function GroupSettingsScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams(); // group id
    const { user, userToken } = useAuth() || {};
    const { theme } = useTheme() || {};
    const styles = React.useMemo(() => createStyles(theme), [theme]);

    // data
    const [group, setGroup] = useState(null);
    const [groupExpenses, setGroupExpenses] = useState([]);
    const [friends, setFriends] = useState([]);
    const [receivedRequests, setReceivedRequests] = useState(new Map());
    const [sentRequests, setSentRequests] = useState(new Map());

    // ui/state
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [newGroupName, setNewGroupName] = useState("");
    const [adminEnforcedPrivacy, setAdminEnforcedPrivacy] = useState(false);
    const [confirmAction, setConfirmAction] = useState(null); // 'leave' | 'delete' | null
    const [busyAction, setBusyAction] = useState(false);
    const addFriendsRef = useRef(null);

    // new: simplifyDebts flag in UI
    const [showSimplified, setShowSimplified] = useState(true);

    // ===== helpers =====
    const currencyDigits = (code) => {
        try {
            const fmt = new Intl.NumberFormat("en-IN", {
                style: "currency",
                currency: code,
            });
            return fmt.resolvedOptions().maximumFractionDigits ?? 2;
        } catch {
            return 2;
        }
    };

    const isOwner = useMemo(() => {
        const gId = group?.createdBy?._id ?? group?.createdBy;
        const uId = user?._id ?? user?.id;
        if (!gId || !uId) return false;
        return String(gId) === String(uId);
    }, [group?.createdBy, user?._id, user?.id]);

    // ===== fetchers =====
    const fetchGroup = useCallback(async () => {
        const data = await getGroupDetails(id, userToken);
        setGroup(data);
        setNewGroupName(data?.name || "");
        setAdminEnforcedPrivacy(Boolean(data?.settings?.enforcePrivacy));
        // load simplify option from backend settings (default to true for legacy)
        setShowSimplified(Boolean(data?.settings?.simplifyDebts ?? true));
    }, [id, userToken]);

    const fetchExpenses = useCallback(async () => {
        const data = await getGroupExpenses(id, userToken);
        setGroupExpenses(data?.expenses || []);
    }, [id, userToken]);

    const fetchFriendsList = useCallback(async () => {
        const data = await getFriends(userToken);
        setFriends(data || []);
    }, [userToken]);

    const fetchReqs = useCallback(async () => {
        const recv = await fetchReceivedRequests(userToken);
        const recvMap = new Map();
        (recv || []).forEach((r) => {
            if (r?.sender?._id && r?._id) recvMap.set(r.sender._id, r._id);
        });
        setReceivedRequests(recvMap);

        const sent = await fetchSentRequests(userToken);
        const sentMap = new Map();
        (sent || []).forEach((r) => {
            if (r?.receiver?._id && r?._id) sentMap.set(r.receiver._id, r._id);
        });
        setSentRequests(sentMap);
    }, [userToken]);

    const loadAll = useCallback(async () => {
        setLoading(true);
        try {
            await Promise.all([fetchGroup(), fetchExpenses(), fetchFriendsList(), fetchReqs()]);
        } finally {
            setLoading(false);
        }
    }, [fetchGroup, fetchExpenses, fetchFriendsList, fetchReqs]);

    useEffect(() => {
        if (!id || !userToken) return;
        loadAll();
    }, [id, userToken, loadAll]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            await loadAll();
        } finally {
            setRefreshing(false);
        }
    }, [loadAll]);

    // ===== totals (summary) =====
    const totals = useMemo(() => {
        if (!group || !user?._id) return null;
        const t = {
            balance: {}, // paid - owed (you are owed if positive)
            yourExpense: {},
            groupExpense: {},
        };
        (groupExpenses || []).forEach((exp) => {
            const code = exp?.currency || "INR";
            (exp?.splits || []).forEach((split) => {
                if (exp?.typeOf === "expense") {
                    t.groupExpense[code] = (t.groupExpense[code] || 0) + (split?.oweAmount || 0);
                }
                if (String(split?.friendId?._id) === String(user._id)) {
                    t.balance[code] =
                        (t.balance[code] || 0) + ((split?.payAmount || 0) - (split?.oweAmount || 0));
                    if (exp?.typeOf === "expense") {
                        t.yourExpense[code] = (t.yourExpense[code] || 0) + (split?.oweAmount || 0);
                    }
                }
            });
        });
        return t;
    }, [groupExpenses, group, user?._id]);

    // ===== actions =====
    const handleGroupRename = async () => {
        try {
            if (!newGroupName?.trim()) return;
            await updateGroupName(id, newGroupName.trim(), userToken);
            await fetchGroup();
        } catch (e) {
            Alert.alert("Rename failed", e?.message || "Please try again.");
        }
    };

    // Simplify toggle handler (optimistic + persist)
    const onToggleSimplified = async (next) => {
        // optimistic UI
        setShowSimplified(next);

        try {
            // persist to server; service currently expects (groupId, simplifyDebts)
            await updateGroupSimplifySetting(id, next, userToken);
            // refresh group to pick up authoritative settings
            await fetchGroup();
        } catch (err) {
            console.warn("Could not persist simplifyDebts:", err?.message || err);
            // rollback on error
            setShowSimplified((prev) => !prev);
            Alert.alert("Update failed", "Could not update simplify transactions setting. Please try again.");
        }
    };

    const addFriend = async (email) => {
        try {
            const res = await sendFriendRequest(email, userToken);
            await fetchFriendsList();
            await fetchReqs();
            if (res?.message) Alert.alert("Success", res.message);
        } catch (e) {
            Alert.alert("Error", e?.message || "Could not send request.");
        }
    };

    const togglePrivacy = async () => {
        try {
            const next = !adminEnforcedPrivacy;
            setAdminEnforcedPrivacy(next);
            await updateGroupPrivacySetting(id, next, userToken);
            await fetchExpenses();
        } catch (e) {
            setAdminEnforcedPrivacy((p) => !p);
            Alert.alert("Update failed", e?.message || "Please try again.");
        }
    };

    // ===== UI helpers =====
    const isFriend = (memberId) => friends?.some((f) => String(f?._id) === String(memberId));
    const isMe = (memberId) => String(memberId) === String(user?._id);

    // ===== confirm modal (themed via styles) =====
    const ConfirmModal = ({ visible, mode, onCancel, onConfirm, busy }) => {
        const title = mode === "delete" ? "Delete Group" : "Leave Group";
        const primary = mode === "delete" ? "Delete Group" : "Leave Group";
        const desc =
            mode === "delete"
                ? `This will permanently delete "${group?.name}" for all members. This action cannot be undone.`
                : `Are you sure you want to leave "${group?.name}"? You’ll lose access to its expenses.`;
        return (
            <Modal transparent visible={visible} animationType="fade">
                <Pressable onPress={!busy ? onCancel : undefined} style={styles.modalBackdrop}>
                    <Pressable style={styles.modalCard}>
                        <Text style={styles.modalTitle}>{title}</Text>
                        <Text style={styles.modalDesc}>{desc}</Text>
                        <View style={styles.modalActions}>
                            <TouchableOpacity disabled={busy} onPress={onCancel} style={styles.modalBtnSecondary}>
                                <Text style={styles.modalBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                disabled={busy}
                                onPress={onConfirm}
                                style={[styles.modalBtnPrimary, busy ? styles.btnDisabled : null]}
                            >
                                <Text style={[styles.modalBtnText, styles.modalPrimaryText]}>
                                    {busy ? (mode === "delete" ? "Deleting..." : "Leaving...") : primary}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>
        );
    };

    // ===== render =====
    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            <StatusBar style={theme?.statusBarStyle === "dark-content" ? "dark" : "light"} />
            <Header showBack title="Group Settings" />
            <View style={styles.container}>
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={theme?.colors?.primary ?? "#60DFC9"} />}>
                    {loading ? (
                        <View style={styles.loadingWrap}>
                            <ActivityIndicator color={theme?.colors?.primary ?? "#60DFC9"} />
                        </View>
                    ) : !group ? (
                        <Text style={styles.notFoundText}>Group not found</Text>
                    ) : (
                        <>
                            {/* Group name */}
                            <View style={styles.section}>
                                <Text style={styles.sectionLabel}>Group Name</Text>
                                <TextInput
                                    value={newGroupName}
                                    onChangeText={setNewGroupName}
                                    placeholder="Enter group name"
                                    placeholderTextColor={theme?.colors?.muted ?? "#81827C"}
                                    style={styles.input}
                                />
                                {newGroupName !== group?.name && (
                                    <TouchableOpacity onPress={handleGroupRename} style={styles.saveBtn}>
                                        <Text style={styles.saveBtnText}>Save</Text>
                                    </TouchableOpacity>
                                )}
                            </View>

                            {/* Summary */}
                            {totals && Object.keys(totals?.balance || {}).length > 0 && (
                                <View style={styles.section}>
                                    <View style={styles.summaryCard}>
                                        <Text style={styles.summaryTitle}>Summary</Text>
                                        {Object.keys(totals.balance).map((code) => {
                                            const bal = totals.balance[code] || 0;
                                            const yourExp = totals.yourExpense?.[code] || 0;
                                            const groupExp = totals.groupExpense?.[code] || 0;
                                            const sym = getSymbol(code);
                                            const d = currencyDigits(code);
                                            return (
                                                <View key={code} style={styles.summaryRow}>
                                                    <Text style={[styles.summaryStatus, bal < 0 ? styles.negativeText : styles.positiveText]}>
                                                        {bal < 0 ? "You owe" : "You are owed"}
                                                    </Text>
                                                    <Text style={styles.summaryAmount}>
                                                        {sym} {Math.abs(bal).toFixed(d)}
                                                    </Text>

                                                    <View style={styles.summaryStatsRow}>
                                                        <View style={styles.statBox}>
                                                            <Text style={styles.statLabel}>Your Expenses</Text>
                                                            <Text style={styles.statValue}>
                                                                {sym} {yourExp.toFixed(d)}
                                                            </Text>
                                                        </View>
                                                        <View style={styles.statBox}>
                                                            <Text style={styles.statLabel}>Group Expenses</Text>
                                                            <Text style={styles.statValue}>
                                                                {sym} {groupExp.toFixed(d)}
                                                            </Text>
                                                        </View>
                                                    </View>
                                                </View>
                                            );
                                        })}
                                    </View>
                                </View>
                            )}

                            {/* Members */}
                            <View style={styles.section}>
                                <View style={styles.membersHeader}>
                                    <Text style={styles.sectionLabel}>Members</Text>
                                    <TouchableOpacity onPress={() => addFriendsRef.current?.present()} style={styles.addMemberBtn}>
                                        <Text style={styles.addMemberBtnText}>+ Add Members</Text>
                                    </TouchableOpacity>
                                </View>

                                {(group?.members || []).map((m) => {
                                    const me = isMe(m._id);
                                    const friend = isFriend(m._id);
                                    const hasSent = sentRequests?.has(m._id);
                                    const hasRecv = receivedRequests?.has(m._id);

                                    return (
                                        <View key={m._id} style={styles.memberRow}>
                                            <View>
                                                <Text style={styles.memberName}>
                                                    {m.name} {me ? "(You)" : ""}
                                                </Text>
                                                {m.email ? <Text style={styles.memberEmail}>{m.email}</Text> : null}
                                            </View>

                                            <View style={styles.memberActions}>
                                                {!me && !friend ? (
                                                    <>
                                                        {!hasSent && !hasRecv ? (
                                                            <TouchableOpacity onPress={() => addFriend(m.email)} style={styles.addFriendBtn}>
                                                                <Text style={styles.addFriendBtnText}>Add Friend</Text>
                                                            </TouchableOpacity>
                                                        ) : hasSent ? (
                                                            <View style={styles.requestSentBox}>
                                                                <Text style={styles.requestSentText}>Request Sent</Text>
                                                            </View>
                                                        ) : (
                                                            <View style={styles.requestRowInline}>
                                                                <TouchableOpacity
                                                                    onPress={async () => {
                                                                        const reqId = receivedRequests.get(m._id);
                                                                        await acceptFriendRequest(reqId, userToken);
                                                                        await fetchFriendsList();
                                                                        await fetchReqs();
                                                                    }}
                                                                >
                                                                    <Text style={styles.requestAcceptText}>Accept</Text>
                                                                </TouchableOpacity>
                                                                <TouchableOpacity
                                                                    onPress={async () => {
                                                                        const reqId = receivedRequests.get(m._id);
                                                                        await rejectFriendRequest(reqId, userToken);
                                                                        await fetchReqs();
                                                                    }}
                                                                >
                                                                    <Text style={styles.requestRejectText}>Reject</Text>
                                                                </TouchableOpacity>
                                                            </View>
                                                        )}
                                                    </>
                                                ) : null}
                                            </View>
                                        </View>
                                    );
                                })}
                            </View>

                            {/* Privacy toggle */}
                            {isOwner ? (
                                <View style={styles.section}>
                                    <View style={styles.privacyBox}>
                                        <Text style={styles.privacyTitle}>Enforce privacy mode</Text>
                                        <Switch
                                            value={adminEnforcedPrivacy}
                                            onValueChange={togglePrivacy}
                                            trackColor={{ true: theme?.colors?.primary ?? "#60DFC9" }}
                                            thumbColor={theme?.colors?.text ?? "#60DFC9"}
                                        />
                                    </View>
                                    <Text style={styles.privacyDesc}>When enabled, members only see expenses they’re involved in.</Text>
                                </View>
                            ) : adminEnforcedPrivacy ? (
                                <View style={styles.privacyNotice}>
                                    <Text style={styles.privacyNoticeText}>🔒 Privacy is enforced by the admin. You’ll only see expenses that involve you.</Text>
                                </View>
                            ) : null}

                            {/* Simplify transactions toggle */}
                            {isOwner ? (
                                <View style={styles.section}>
                                    <View style={styles.privacyBox}>
                                        <Text style={styles.privacyTitle}>Simplify transactions</Text>
                                        <Switch
                                            value={showSimplified}
                                            onValueChange={onToggleSimplified}
                                            trackColor={{ true: theme?.colors?.primary ?? "#60DFC9" }}
                                            thumbColor={theme?.colors?.text ?? "#60DFC9"}
                                        />
                                    </View>
                                    <Text style={styles.privacyDesc}>
                                        When enabled, the app will minimize the number of transfers between members (transitive netting).
                                    </Text>
                                </View>
                            ) : (
                                <View style={styles.section}>
                                    <View style={styles.privacyBox}>
                                        <Text style={styles.privacyTitle}>Simplify transactions</Text>
                                        <Text style={{ color: theme?.colors?.muted ?? "#9aa08e" }}>
                                            {showSimplified ? "Enabled" : "Disabled"}
                                        </Text>
                                    </View>
                                    <Text style={styles.privacyDesc}>
                                        This setting is controlled by the group admin.
                                    </Text>
                                </View>
                            )}

                            {/* Danger Zone */}
                            <View style={styles.dangerZone}>
                                <View style={styles.dangerHeader}>
                                    <Text style={styles.dangerHeaderText}>Danger Zone</Text>
                                </View>

                                {!isOwner ? (
                                    <View style={styles.dangerRow}>
                                        <View style={{ flex: 1, paddingRight: 12 }}>
                                            <Text style={styles.dangerTitle}>Leave Group</Text>
                                            <Text style={styles.dangerText}>You’ll lose access to this group and its expenses.</Text>
                                        </View>
                                        <TouchableOpacity
                                            onPress={() => setConfirmAction("leave")}
                                            style={styles.leaveBtn}
                                        >
                                            <Text style={styles.leaveBtnText}>Leave Group</Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <View style={styles.dangerRow}>
                                        <View style={{ flex: 1, paddingRight: 12 }}>
                                            <Text style={styles.dangerTitle}>Delete Group</Text>
                                            <Text style={styles.dangerText}>Permanently removes the group and its expenses for all members.</Text>
                                        </View>
                                        <TouchableOpacity
                                            onPress={() => setConfirmAction("delete")}
                                            style={styles.deleteBtn}
                                        >
                                            <Text style={styles.deleteBtnText}>Delete Group</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>
                        </>
                    )}
                </ScrollView>

                {/* Confirm */}
                <ConfirmModal
                    visible={!!confirmAction}
                    mode={confirmAction}
                    busy={busyAction}
                    onCancel={() => !busyAction && setConfirmAction(null)}
                    onConfirm={async () => {
                        if (!confirmAction) return;
                        try {
                            setBusyAction(true);
                            if (confirmAction === "leave") {
                                await leaveGroup(id, userToken);
                            } else {
                                await deleteGroup(id, userToken);
                            }
                            setConfirmAction(null);
                            router.replace("/groups");
                        } catch (e) {
                            Alert.alert("Action failed", e?.message || "Please try again.");
                        } finally {
                            setBusyAction(false);
                        }
                    }}
                />
            </View>

            <BottomSheetAddFriendsToGroup
                innerRef={addFriendsRef}
                groupId={id}
                onClose={() => addFriendsRef.current?.dismiss()}
                onAdded={fetchGroup}
            />
        </SafeAreaView>
    );
}

/* ---------------------------
   Themed styles factory
----------------------------*/
const createStyles = (theme = {}) =>
    StyleSheet.create({
        safe: { flex: 1, backgroundColor: theme?.colors?.background ?? "#121212" },
        container: { flex: 1, paddingHorizontal: 16, paddingTop: 8, gap: 8 },

        loadingWrap: { paddingVertical: 48, alignItems: "center" },
        notFoundText: { color: theme?.colors?.muted ?? "#B8C4A0" },

        section: { marginBottom: 16 },

        sectionLabel: {
            color: theme?.colors?.primary ?? "#60DFC9",
            textTransform: "uppercase",
            fontSize: 12,
            marginBottom: 6,
        },

        input: {
            height: 44,
            borderWidth: 1,
            borderColor: theme?.colors?.border ?? "#55554f",
            borderRadius: 12,
            backgroundColor: theme?.colors?.card ?? "#1f1f1f",
            color: theme?.colors?.text ?? "#EBF1D5",
            paddingHorizontal: 12,
        },

        saveBtn: {
            marginTop: 10,
            backgroundColor: theme?.colors?.primary ?? "#60DFC9",
            borderRadius: 10,
            paddingVertical: 10,
            alignItems: "center",
        },
        saveBtnText: { color: theme?.colors?.inverseText ?? "#121212", fontWeight: "700" },

        summaryCard: {
            backgroundColor: theme?.colors?.card ?? "#1E1E1E",
            borderRadius: 14,
            padding: 16,
            marginBottom: 12,
        },
        summaryTitle: { color: theme?.colors?.text ?? "#EBF1D5", fontSize: 18, fontWeight: "700", marginBottom: 8 },
        summaryRow: { borderTopColor: theme?.colors?.border ?? "#2A2A2A", borderTopWidth: 1, paddingTop: 12, marginTop: 12 },
        summaryStatus: { fontSize: 16 },
        positiveText: { color: theme?.colors?.positive ?? "#60DFC9" },
        negativeText: { color: theme?.colors?.negative ?? "#f87171" },
        summaryAmount: { color: theme?.colors?.text ?? "#EBF1D5", fontSize: 22, fontWeight: "800", marginTop: 6 },

        summaryStatsRow: { flexDirection: "row", gap: 12, marginTop: 12 },
        statBox: { flex: 1, backgroundColor: theme?.colors?.background ?? "#2A2A2A", borderRadius: 10, padding: 10 },
        statLabel: { color: theme?.colors?.muted ?? "#9aa08e", fontSize: 12 },
        statValue: { color: theme?.colors?.primary ?? "#60DFC9", fontSize: 18, fontWeight: "700" },

        membersHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
        addMemberBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: theme?.colors?.cta ?? "#00C49F", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
        addMemberBtnText: { color: theme?.colors?.inverseText ?? "#121212", fontWeight: "700", fontSize: 12 },

        memberRow: { paddingVertical: 10, borderBottomColor: theme?.colors?.border ?? "#212121", borderBottomWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
        memberName: { color: theme?.colors?.text ?? "#EBF1D5", fontWeight: "600" },
        memberEmail: { color: theme?.colors?.muted ?? "#888", fontSize: 12 },

        memberActions: { flexDirection: "row", gap: 12 },

        addFriendBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: theme?.colors?.primary ?? "#60DFC9" },
        addFriendBtnText: { color: theme?.colors?.primary ?? "#60DFC9", fontWeight: "600", fontSize: 12 },

        requestSentBox: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: theme?.colors?.border ?? "#2a2a2a" },
        requestSentText: { color: theme?.colors?.muted ?? "#888", fontSize: 12 },

        requestRowInline: { flexDirection: "row", gap: 10 },
        requestAcceptText: { color: theme?.colors?.primary ?? "#60DFC9", fontSize: 12 },
        requestRejectText: { color: theme?.colors?.negative ?? "#f87171", fontSize: 12 },

        privacyBox: { backgroundColor: theme?.colors?.card ?? "#212121", borderColor: theme?.colors?.border ?? "#333", borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
        privacyTitle: { color: theme?.colors?.primary ?? "#60DFC9", fontWeight: "700" },
        privacyDesc: { color: theme?.colors?.muted ?? "#9aa08e", marginTop: 8, fontSize: 12 },

        privacyNotice: { backgroundColor: theme?.colors?.cardAlt ?? "#212121", borderLeftColor: theme?.colors?.primary ?? "#60DFC9", borderLeftWidth: 4, borderRadius: 8, padding: 12, marginBottom: 20 },
        privacyNoticeText: { color: theme?.colors?.primary ?? "#60DFC9", fontSize: 12 },

        dangerZone: { borderColor: theme?.colors?.border ?? "#2C2C2C", borderWidth: 1, borderRadius: 12, marginBottom: 40 },
        dangerHeader: { backgroundColor: theme?.colors?.cardHeader ?? "#201f1f", paddingHorizontal: 12, paddingVertical: 10, borderBottomColor: theme?.colors?.border ?? "#2C2C2C", borderBottomWidth: 1 },
        dangerHeaderText: { color: theme?.colors?.danger ?? "#f87171", textTransform: "uppercase", fontSize: 12, fontWeight: "700" },
        dangerRow: { padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
        dangerTitle: { color: theme?.colors?.text ?? "#EBF1D5", fontWeight: "600" },
        dangerText: { color: theme?.colors?.muted ?? "#9aa08e", fontSize: 12 },

        leaveBtn: { backgroundColor: theme?.colors?.danger ?? "#ef4444", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
        leaveBtnText: { color: "#fff", fontWeight: "700", fontSize: 12 },

        deleteBtn: { backgroundColor: theme?.colors?.danger ?? "#ef4444", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
        deleteBtnText: { color: "#fff", fontWeight: "700", fontSize: 12 },

        // modal
        modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 },
        modalCard: { backgroundColor: theme?.colors?.card ?? "#1f1f1f", borderRadius: 14, padding: 16 },
        modalTitle: { color: theme?.colors?.text ?? "#EBF1D5", fontSize: 18, fontWeight: "700", marginBottom: 8 },
        modalDesc: { color: theme?.colors?.muted ?? "#9aa08e", marginBottom: 16 },
        modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
        modalBtnSecondary: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: theme?.colors?.border ?? "#55554f" },
        modalBtnPrimary: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: theme?.colors?.danger ?? "#ef4444" },
        modalBtnText: { color: theme?.colors?.text ?? "#EBF1D5" },
        modalPrimaryText: { color: theme?.colors?.primaryInverse ?? "#fff", fontWeight: "700" },
        btnDisabled: { opacity: 0.6 },
    });
