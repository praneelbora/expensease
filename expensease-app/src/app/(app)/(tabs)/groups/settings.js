import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { ChevronLeft } from "lucide-react-native";
import Header from "~/header";

import { useAuth } from "context/AuthContext";
import {
  getGroupDetails,
  updateGroupName,
  leaveGroup,
  deleteGroup,
  removeMember,
  promoteMember,
  demoteMember,
  getGroupExpenses,
  updateGroupPrivacySetting,
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
// import { logEvent } from "utils/analytics";

export default function GroupSettingsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams(); // group id
  const { user, userToken } = useAuth() || {};

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
      balance: {},      // paid - owed (you are owed if positive)
      yourExpense: {},  // your share
      groupExpense: {}, // total group expense (sum of oweAmount)
    };
    (groupExpenses || []).forEach((exp) => {
      const code = exp?.currency || "INR";
      (exp?.splits || []).forEach((split) => {
        if (exp?.typeOf === "expense") {
          t.groupExpense[code] = (t.groupExpense[code] || 0) + (split?.oweAmount || 0);
        }
        if (String(split?.friendId?._id) === String(user._id)) {
          t.balance[code] =
            (t.balance[code] || 0) +
            ((split?.payAmount || 0) - (split?.oweAmount || 0));
          if (exp?.typeOf === "expense") {
            t.yourExpense[code] =
              (t.yourExpense[code] || 0) + (split?.oweAmount || 0);
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
      // logEvent("group_rename");
      await updateGroupName(id, newGroupName.trim(), userToken);
      await fetchGroup();
    } catch (e) {
      Alert.alert("Rename failed", e?.message || "Please try again.");
    }
  };

  const addFriend = async (email) => {
    try {
      const res = await sendFriendRequest(email, userToken);
      // logEvent("friend_request_sent", { screen: "group_settings" });
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
      // refetch expenses since privacy impacts list filtering on server in your web flow
      await fetchExpenses();
    } catch (e) {
      setAdminEnforcedPrivacy((p) => !p);
      Alert.alert("Update failed", e?.message || "Please try again.");
    }
  };

  // ===== UI helpers =====
  const isFriend = (memberId) => friends?.some((f) => String(f?._id) === String(memberId));
  const isMe = (memberId) => String(memberId) === String(user?._id);

  // ===== confirm modal =====
  const ConfirmModal = ({ visible, mode, onCancel, onConfirm, busy }) => {
    const title = mode === "delete" ? "Delete Group" : "Leave Group";
    const primary = mode === "delete" ? "Delete Group" : "Leave Group";
    const desc =
      mode === "delete"
        ? `This will permanently delete "${group?.name}" for all members. This action cannot be undone.`
        : `Are you sure you want to leave "${group?.name}"? You’ll lose access to its expenses.`;
    return (
      <Modal transparent visible={visible} animationType="fade">
        <Pressable
          onPress={!busy ? onCancel : undefined}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 }}
        >
          <Pressable style={{ backgroundColor: "#1f1f1f", borderRadius: 14, padding: 16 }}>
            <Text style={{ color: "#EBF1D5", fontSize: 18, fontWeight: "700", marginBottom: 8 }}>
              {title}
            </Text>
            <Text style={{ color: "#9aa08e", marginBottom: 16 }}>{desc}</Text>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
              <TouchableOpacity
                disabled={busy}
                onPress={onCancel}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: "#55554f",
                }}
              >
                <Text style={{ color: "#EBF1D5" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={busy}
                onPress={onConfirm}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: 10,
                  backgroundColor: "#ef4444",
                }}
              >
                <Text style={{ color: "white", fontWeight: "700" }}>
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
      <StatusBar style="light" />

      {/* Header */}
      <Header showBack title="Group Settings" />
      {/* <View style={{ padding: 16, borderBottomColor: "#EBF1D5", borderBottomWidth: 0.5, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TouchableOpacity
            onPress={() => {
              // logEvent("navigate", { fromScreen: "group_settings", toScreen: "group_detail", source: "back" });
              router.push(`/groups/${id}`);
            }}
          >
            <ChevronLeft color="#EBF1D5" size={24} />
          </TouchableOpacity>
          <Text style={{ color: "#EBF1D5", fontSize: 24, fontWeight: "800" }}>Group Settings</Text>
        </View>
      </View> */}

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#60DFC9" />}
        contentContainerStyle={{ padding: 16 }}
      >
        {loading ? (
          <View style={{ paddingVertical: 48, alignItems: "center" }}>
            <ActivityIndicator color="#60DFC9" />
          </View>
        ) : !group ? (
          <Text style={{ color: "#B8C4A0" }}>Group not found</Text>
        ) : (
          <>
            {/* Group name */}
            <View style={{ marginBottom: 16 }}>
              <Text style={{ color: "#60DFC9", textTransform: "uppercase", fontSize: 12, marginBottom: 6 }}>
                Group Name
              </Text>
              <TextInput
                value={newGroupName}
                onChangeText={setNewGroupName}
                placeholder="Enter group name"
                placeholderTextColor="#81827C"
                style={{
                  height: 44,
                  borderWidth: 1,
                  borderColor: "#55554f",
                  borderRadius: 12,
                  backgroundColor: "#1f1f1f",
                  color: "#EBF1D5",
                  paddingHorizontal: 12,
                }}
              />
              {newGroupName !== group?.name && (
                <TouchableOpacity
                  onPress={handleGroupRename}
                  style={{
                    marginTop: 10,
                    backgroundColor: "#60DFC9",
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: "#121212", fontWeight: "700" }}>Save</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Summary */}
            {totals && Object.keys(totals?.balance || {}).length > 0 && (
              <View style={{ backgroundColor: "#1E1E1E", borderRadius: 14, padding: 16, marginBottom: 20 }}>
                <Text style={{ color: "#EBF1D5", fontSize: 18, fontWeight: "700", marginBottom: 8 }}>
                  Summary
                </Text>
                {Object.keys(totals.balance).map((code) => {
                  const bal = totals.balance[code] || 0;
                  const yourExp = totals.yourExpense?.[code] || 0;
                  const groupExp = totals.groupExpense?.[code] || 0;
                  const sym = getSymbol("en-IN", code);
                  const d = currencyDigits(code);
                  return (
                    <View key={code} style={{ borderTopColor: "#2A2A2A", borderTopWidth: 1, paddingTop: 12, marginTop: 12 }}>
                      <Text style={{ color: bal < 0 ? "#f87171" : "#60DFC9", fontSize: 16 }}>
                        {bal < 0 ? "You owe" : "You are owed"}
                      </Text>
                      <Text style={{ color: "#EBF1D5", fontSize: 22, fontWeight: "800" }}>
                        {sym} {Math.abs(bal).toFixed(d)}
                      </Text>

                      <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
                        <View style={{ flex: 1, backgroundColor: "#2A2A2A", borderRadius: 10, padding: 10 }}>
                          <Text style={{ color: "#9aa08e", fontSize: 12 }}>Your Expenses</Text>
                          <Text style={{ color: "#60DFC9", fontSize: 18, fontWeight: "700" }}>
                            {sym} {yourExp.toFixed(d)}
                          </Text>
                        </View>
                        <View style={{ flex: 1, backgroundColor: "#2A2A2A", borderRadius: 10, padding: 10 }}>
                          <Text style={{ color: "#9aa08e", fontSize: 12 }}>Group Expenses</Text>
                          <Text style={{ color: "#60DFC9", fontSize: 18, fontWeight: "700" }}>
                            {sym} {groupExp.toFixed(d)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Members */}
            <View style={{ marginBottom: 20 }}>
              <Text style={{ color: "#60DFC9", textTransform: "uppercase", fontSize: 12, marginBottom: 8 }}>
                Members
              </Text>
              {(group?.members || []).map((m) => {
                const me = isMe(m._id);
                const friend = isFriend(m._id);
                const hasSent = sentRequests?.has(m._id);
                const hasRecv = receivedRequests?.has(m._id);

                return (
                  <View
                    key={m._id}
                    style={{
                      paddingVertical: 10,
                      borderBottomColor: "#212121",
                      borderBottomWidth: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <View>
                      <Text style={{ color: "#EBF1D5", fontWeight: "600" }}>
                        {m.name} {me ? "(You)" : ""}
                      </Text>
                      {m.email ? (
                        <Text style={{ color: "#888", fontSize: 12 }}>{m.email}</Text>
                      ) : null}
                    </View>

                    <View style={{ flexDirection: "row", gap: 12 }}>
                      {!me && !friend && (
                        <>
                          {!hasSent && !hasRecv ? (
                            <TouchableOpacity
                              onPress={() => addFriend(m.email)}
                              style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: "#60DFC9" }}
                            >
                              <Text style={{ color: "#60DFC9", fontWeight: "600", fontSize: 12 }}>
                                Add Friend
                              </Text>
                            </TouchableOpacity>
                          ) : hasSent ? (
                            <View style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: "#2a2a2a" }}>
                              <Text style={{ color: "#888", fontSize: 12 }}>Request Sent</Text>
                            </View>
                          ) : (
                            <View style={{ flexDirection: "row", gap: 10 }}>
                              <TouchableOpacity
                                onPress={async () => {
                                  const reqId = receivedRequests.get(m._id);
                                  await acceptFriendRequest(reqId, userToken);
                                  // logEvent("friend_request_accepted", { screen: "group_settings" });
                                  await fetchFriendsList();
                                  await fetchReqs();
                                }}
                              >
                                <Text style={{ color: "#60DFC9", fontSize: 12 }}>Accept</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={async () => {
                                  const reqId = receivedRequests.get(m._id);
                                  await rejectFriendRequest(reqId, userToken);
                                  // logEvent("friend_request_rejected", { screen: "group_settings" });
                                  await fetchReqs();
                                }}
                              >
                                <Text style={{ color: "#f87171", fontSize: 12 }}>Reject</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </>
                      )}

                      {/* Optional admin actions (promote/demote/remove) if you re-enable these */}
                      {/* {isOwner && !me && (
                        <>
                          <TouchableOpacity onPress={() => promoteMember(id, m._id, userToken)}>
                            <Text style={{ color: "#60DFC9", fontSize: 12 }}>Promote</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => demoteMember(id, m._id, userToken)}>
                            <Text style={{ color: "#f59e0b", fontSize: 12 }}>Demote</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => removeMember(id, m._id, userToken)}>
                            <Text style={{ color: "#f87171", fontSize: 12 }}>Remove</Text>
                          </TouchableOpacity>
                        </>
                      )} */}
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Privacy toggle */}
            {isOwner ? (
              <View style={{ backgroundColor: "#1A1A1A", borderColor: "#2C2C2C", borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 20 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ color: "#60DFC9", fontWeight: "700" }}>Enforce privacy mode</Text>
                  <Switch value={adminEnforcedPrivacy} onValueChange={togglePrivacy} thumbColor="#60DFC9" />
                </View>
                <Text style={{ color: "#9aa08e", marginTop: 8, fontSize: 12 }}>
                  When enabled, members only see expenses they’re involved in.
                </Text>
              </View>
            ) : adminEnforcedPrivacy ? (
              <View style={{ backgroundColor: "#222", borderLeftColor: "#60DFC9", borderLeftWidth: 4, borderRadius: 8, padding: 12, marginBottom: 20 }}>
                <Text style={{ color: "#60DFC9", fontSize: 12 }}>
                  🔒 Privacy is enforced by the admin. You’ll only see expenses that involve you.
                </Text>
              </View>
            ) : null}

            {/* Danger Zone */}
            <View style={{ borderColor: "#2C2C2C", borderWidth: 1, borderRadius: 12, marginBottom: 40 }}>
              <View style={{ backgroundColor: "#201f1f", paddingHorizontal: 12, paddingVertical: 10, borderBottomColor: "#2C2C2C", borderBottomWidth: 1 }}>
                <Text style={{ color: "#f87171", textTransform: "uppercase", fontSize: 12, fontWeight: "700" }}>
                  Danger Zone
                </Text>
              </View>

              {!isOwner ? (
                <View style={{ padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={{ color: "#EBF1D5", fontWeight: "600" }}>Leave Group</Text>
                    <Text style={{ color: "#9aa08e", fontSize: 12 }}>
                      You’ll lose access to this group and its expenses.
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      // logEvent("group_leave");
                      setConfirmAction("leave");
                    }}
                    style={{ backgroundColor: "#ef4444", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 }}
                  >
                    <Text style={{ color: "white", fontWeight: "700", fontSize: 12 }}>Leave Group</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={{ color: "#EBF1D5", fontWeight: "600" }}>Delete Group</Text>
                    <Text style={{ color: "#9aa08e", fontSize: 12 }}>
                      Permanently removes the group and its expenses for all members.
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      // logEvent("group_delete");
                      setConfirmAction("delete");
                    }}
                    style={{ backgroundColor: "#ef4444", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 }}
                  >
                    <Text style={{ color: "white", fontWeight: "700", fontSize: 12 }}>Delete Group</Text>
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
  headerTitle: { color: "#EBF1D5", fontSize: 24, fontWeight: "700", flexShrink: 1 },

})