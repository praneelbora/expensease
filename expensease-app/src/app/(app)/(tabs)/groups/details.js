// app/groups/[id].js
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
  Share,
} from "react-native";
import Header from "~/header";
import ExpenseRow from "~/expenseRow";

import * as Clipboard from "expo-clipboard";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

// ===== hook up to your app =====
import { useAuth } from "context/AuthContext";
import { getGroupDetails, getGroupExpenses } from "services/GroupService";
import { settleExpense } from "services/ExpenseService";
import { getSymbol, getDigits, formatMoney, allCurrencies } from "utils/currencies";

/** Lightweight sheet to preview + confirm settlements.
 * Replace with your RN SettleModal when ready. */
function SettleSheet({ visible, onClose, transactions = [], onSubmit, currencyOptions, defaultCurrency }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Settle Up</Text>
          {transactions.length === 0 ? (
            <Text style={{ color: "#a0a0a0" }}>All settled 🎉</Text>
          ) : (
            <View style={{ gap: 6, marginBottom: 10 }}>
              {transactions.map((t, i) => (
                <Text key={i} style={{ color: "#EBF1D5" }}>
                  {t.from === "__YOU__" ? "You" : t.fromName} owe {t.to === "__YOU__" ? "You" : t.toName}{" "}
                  {getSymbol(t.currency)} {t.amount.toFixed(2)}
                </Text>
              ))}
            </View>
          )}
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
            <TouchableOpacity style={styles.modalBtnSecondary} onPress={onClose}>
              <Text style={styles.modalBtnText}>Close</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={confirming || transactions.length === 0}
              style={[styles.modalBtnPrimary, confirming && { opacity: 0.6 }]}
              onPress={async () => {
                setConfirming(true);
                try { await onSubmit(); } finally { setConfirming(false); onClose(); }
              }}
            >
              <Text style={[styles.modalBtnText, { color: "#121212", fontWeight: "700" }]}>
                Record {transactions.length || ""} {transactions.length === 1 ? "Settlement" : "Settlements"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function GroupDetails() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { user, userToken, defaultCurrency, preferredCurrencies } = useAuth() || {};

  // UI
  const [loadingGroup, setLoadingGroup] = useState(true);
  const [loadingExpenses, setLoadingExpenses] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [copiedHeader, setCopiedHeader] = useState(false);
  const [showSettle, setShowSettle] = useState(false);

  // Data
  const [group, setGroup] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [userId, setUserId] = useState(null);
  const [privacy, setPrivacy] = useState(false);

  // currency options (used by your existing modals if you swap them in)
  const currencyOptions = useMemo(() => {
    const base = new Set([defaultCurrency, ...(preferredCurrencies || [])]);
    // ensure base ones are included + full list available
    return allCurrencies
      .filter(c => base.has(c.code))   // show preferred ones first
      .concat(allCurrencies.filter(c => !base.has(c.code))) // then rest
      .map(c => ({ value: c.code, label: `${c.name} (${c.symbol})`, code: c.code }));
  }, [defaultCurrency, preferredCurrencies]);

  // ===== helpers mirroring your web logic =====
  const currencyDigits = (code, locale = "en-IN") => {
    try {
      const fmt = new Intl.NumberFormat(locale, { style: "currency", currency: code });
      return fmt.resolvedOptions().maximumFractionDigits ?? 2;
    } catch { return 2; }
  };

  // compute per-member net map: memberId -> { [currency]: net }
  const calculateDebt = useCallback((list = [], members = []) => {
    const map = {};
    members.forEach(m => { map[m._id] = {}; });
    list.forEach(exp => {
      const code = exp.currency || "INR";
      exp.splits?.forEach(s => {
        const mid = s.friendId?._id;
        if (!mid) return;
        if (!map[mid][code]) map[mid][code] = 0;
        if (s.payAmount > 0) map[mid][code] += s.payAmount; // paid → owed to them (+)
        if (s.oweAmount > 0) map[mid][code] -= s.oweAmount; // owes → negative
      });
    });
    return map;
  }, []);

  // min-transfer simplification per currency
  const simplifyDebts = useCallback((totalDebt, members, meId, locale = "en-IN") => {
    const tx = [];
    const currencies = new Set();
    Object.values(totalDebt || {}).forEach(cur => Object.keys(cur || {}).forEach(c => currencies.add(c)));

    currencies.forEach(code => {
      let digits = 2;
      try {
        const fmt = new Intl.NumberFormat(locale, { style: "currency", currency: code });
        digits = fmt.resolvedOptions().maximumFractionDigits ?? 2;
      } catch { }
      const pow = 10 ** digits;
      const round = v => Math.round((Number(v) + Number.EPSILON) * pow) / pow;
      const minUnit = 1 / pow;

      const owe = [];
      const owed = [];
      for (const mId in totalDebt) {
        const amt = round(totalDebt[mId]?.[code] || 0);
        if (amt > 0) owed.push({ memberId: mId, amount: amt });
        else if (amt < 0) owe.push({ memberId: mId, amount: Math.abs(amt) });
      }

      let i = 0, j = 0, guard = 0, guardMax = (owe.length + owed.length + 1) * 5000;
      while (i < owe.length && j < owed.length) {
        if (guard++ > guardMax) break;
        const transfer = Math.min(owe[i].amount, owed[j].amount);
        if (transfer >= minUnit) {
          tx.push({
            from: owe[i].memberId,
            to: owed[j].memberId,
            amount: round(transfer),
            currency: code,
          });
        }
        owe[i].amount = round(owe[i].amount - transfer);
        owed[j].amount = round(owed[j].amount - transfer);
        if (Math.abs(owe[i].amount) < minUnit) owe[i].amount = 0;
        if (Math.abs(owed[j].amount) < minUnit) owed[j].amount = 0;
        if (owe[i].amount === 0) i++;
        if (owed[j].amount === 0) j++;
      }
    });

    // decorate with names + me sentinel for display
    return tx.map(t => ({
      ...t,
      fromName: t.from === meId ? "You" : (group?.members?.find(m => m._id === t.from)?.name || "Member"),
      toName: t.to === meId ? "You" : (group?.members?.find(m => m._id === t.to)?.name || "Member"),
      from: t.from === meId ? "__YOU__" : t.from,
      to: t.to === meId ? "__YOU__" : t.to,
    }));
  }, [group?.members]);

  // ===== fetchers =====
  const fetchGroup = useCallback(async () => {
    try {
      setLoadingGroup(true);
      const data = await getGroupDetails(id, userToken);
      setGroup(data);
      setPrivacy(Boolean(data?.settings?.enforcePrivacy));
    } finally {
      setLoadingGroup(false);
    }
  }, [id, userToken]);

  const fetchGroupExpenses = useCallback(async () => {
    try {
      setLoadingExpenses(true);
      const data = await getGroupExpenses(id, userToken);
      const all = data?.expenses || [];
      const me = data?.id;
      setUserId(me);

      const adminPrivacy = Boolean(data?.group?.settings?.enforcePrivacy);
      const filtered = adminPrivacy
        ? all.filter(exp => exp.splits?.some(s => s.friendId?._id === me && (s.paying || s.owing)))
        : all;

      setExpenses(filtered);
    } catch (e) {
      console.error("Group expenses error:", e);
    } finally {
      setLoadingExpenses(false);
    }
  }, [id, userToken]);

  const fetchAll = useCallback(async () => {
    await Promise.all([fetchGroup(), fetchGroupExpenses()]);
  }, [fetchGroup, fetchGroupExpenses]);

  useEffect(() => { if (id) fetchAll(); }, [id, fetchAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await fetchAll(); } finally { setRefreshing(false); }
  }, [fetchAll]);

  // ===== derived =====
  const totalDebt = useMemo(() => {
    if (!group?.members?.length || !expenses?.length) return null;
    return calculateDebt(expenses, group.members);
  }, [group?.members, expenses, calculateDebt]);

  const simplifiedTransactions = useMemo(() => {
    if (!totalDebt) return [];
    const tx = simplifyDebts(totalDebt, group?.members || [], userId);
    return privacy ? tx.filter(t => t.from === "__YOU__" || t.to === "__YOU__") : tx;
  }, [totalDebt, group?.members, userId, privacy, simplifyDebts]);

  const filteredExpenses = useMemo(() => {
    if (!selectedMember) return expenses || [];
    return (expenses || []).filter(exp =>
      exp.splits?.some(s => s.friendId?._id === selectedMember && (s.payAmount > 0 || s.oweAmount > 0))
    );
  }, [expenses, selectedMember]);

  // ===== actions =====
  const handleShareInvite = async () => {
    if (!group?.code) return;
    const url = `${process.env.EXPO_PUBLIC_WEB_URL || "https://www.expensease.in"}/groups?join=${group.code}`;
    const message =
      `Use this code: ${group.code}

Or just tap the link to join directly:
${url}`;
    try {
      await Clipboard.setStringAsync(message);
      setCopiedHeader(true);
      setTimeout(() => setCopiedHeader(false), 1500);
      await Share.share({ title: "Join my group on Expensease", message, url });
    } catch (e) {
      // clipboard is enough even if Share fails
      console.warn("Share failed", e);
    }
  };

  const recordAllSettlements = async () => {
    // record each simplified transaction as a settlement expense
    for (const t of simplifiedTransactions) {
      await settleExpense({
        payerId: t.from === "__YOU__" ? userId : t.from,
        receiverId: t.to === "__YOU__" ? userId : t.to,
        amount: t.amount,
        description: "Settlement",
        groupId: id,
        currency: t.currency,
      }, userToken);
    }
    await fetchGroupExpenses();
  };

  // ===== render helpers =====
  const renderExpense = ({ item: exp }) => {
    const isSettle = exp.typeOf === "settle";
    const title = exp.description || (isSettle ? "Settlement" : "Expense");

    const payer = exp.splits?.find(s => s.paying && s.payAmount > 0);
    const receiver = exp.splits?.find(s => s.owing && s.oweAmount > 0);
    const sub = isSettle && payer && receiver
      ? `${payer.friendId?._id === userId ? "You" : payer.friendId?.name} paid ${receiver.friendId?._id === userId ? "you" : receiver.friendId?.name}`
      : (exp.groupId?.name || "Group expense");

    return (
      <View style={styles.cardRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={styles.sub} numberOfLines={2}>
            {sub} • {new Date(exp.date).toDateString()}
          </Text>
        </View>
        <Text style={styles.amount}>
          {getSymbol(exp.currency)} {Number(exp.amount || 0).toFixed(2)}
        </Text>
      </View>
    );
  };

  const listHeader = (
    <View style={{ gap: 12 }}>
      {/* Members header */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={styles.sectionLabel}>Members</Text>
        <TouchableOpacity onPress={() => {
          // logEvent("toggle_member_list", { screen: "group_detail", action: showMembers ? "hide" : "show" });
          setShowMembers(s => !s);
        }}>
          <Feather name={showMembers ? "eye" : "eye-off"} size={18} color="#60DFC9" />
        </TouchableOpacity>
      </View>

      {showMembers && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {(group?.members || []).map(m => {
            const active = selectedMember === m._id;
            return (
              <TouchableOpacity
                key={m._id}
                onPress={() => setSelectedMember(active ? null : m._id)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                  {m.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Debt Summary */}
      {expenses.length > 0 && simplifiedTransactions.length > 0 && (
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={styles.sectionLabel}>Debt Summary</Text>
            <TouchableOpacity
              style={styles.outlineBtn}
              onPress={() => {
                // logEvent("open_settle_modal", { screen: "group_detail" }); 
                setShowSettle(true);
              }}
            >
              <Text style={styles.outlineBtnText}>Settle</Text>
            </TouchableOpacity>
          </View>

          {simplifiedTransactions.map((t, i) => {
            const amtTxt = `${getSymbol(t.currency)} ${t.amount.toFixed(2)}`;
            const youPay = t.from === "__YOU__";
            const youReceive = t.to === "__YOU__";
            return (
              <Text key={i} style={{ color: youPay || youReceive ? "#EBF1D5" : "#81827C" }}>
                {t.from === "__YOU__" ? "You" : t.fromName} {youPay ? "owe" : "owes"} {t.to === "__YOU__" ? "You" : t.toName} <Text style={{ color: youPay ? "#EA4335" : youReceive ? "#60DFC9" : "#EBF1D5" }}>{amtTxt}</Text>
              </Text>
            );
          })}
        </View>
      )}

      <Text style={styles.sectionLabel}>Expenses</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StatusBar style="light" />

      <Header showBack title={group?.name} button={<TouchableOpacity
        onPress={() => {
          // logEvent?.("navigate", { fromScreen: "friend_detail", toScreen: "friend_setting", source: "setting" });
          router.push({ pathname: "/groups/settings", params: { id: group._id } });
        }}
      >
        <Feather name="settings" size={20} color="#EBF1D5" />
      </TouchableOpacity>
      }
      />
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 8, gap: 8 }}>
        <FlatList
          data={loadingExpenses ? [] : filteredExpenses.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))}
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
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            loadingGroup || loadingExpenses ? (
              <View style={styles.emptyWrap}><Feather name="loader" size={22} color="#EBF1D5" /></View>
            ) : (
              <View style={styles.emptyWrap}>
                {group?.members?.length === 1 ? (
                  <>
                    <Text style={styles.emptyTitle}>No Members Yet</Text>
                    <Text style={styles.emptyText}>Invite friends to get started.</Text>
                    <TouchableOpacity style={styles.outlineBtn} onPress={handleShareInvite}>
                      <Text style={styles.outlineBtnText}>Share Invite</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={styles.emptyTitle}>No Expenses Yet</Text>
                    <Text style={styles.emptyText}>Add your first group expense to see it here.</Text>
                    <TouchableOpacity
                      style={styles.ctaBtn}
                      onPress={() => router.push({ pathname: "/newExpense", params: { groupId: id } })}
                    >
                      <Text style={[styles.ctaBtnText, { color: "#121212" }]}>Add Expense</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00d0b0" />}
          contentContainerStyle={{ paddingBottom: 100, flexGrow: 1, gap: 8 }}
        />

        {/* FAB */}
        {!loadingExpenses && (expenses?.length || 0) > 0 && (
          <TouchableOpacity
            style={styles.fab}
            onPress={() => router.push({ pathname: "/newExpense", params: { groupId: id } })}
          >
            <Feather name="plus" size={22} color="#121212" />
            <Text style={styles.fabText}>Add Expense</Text>
          </TouchableOpacity>
        )}

        {/* Settle Sheet */}
        <SettleSheet
          visible={showSettle}
          onClose={() => setShowSettle(false)}
          transactions={simplifiedTransactions}
          currencyOptions={currencyOptions}
          defaultCurrency={defaultCurrency}
          onSubmit={recordAllSettlements}
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
  headerTitle: { color: "#EBF1D5", fontSize: 24, fontWeight: "700", flexShrink: 1 },

  sectionLabel: { color: "#60DFC9", fontSize: 12, textTransform: "uppercase" },

  cardRow: {
    backgroundColor: "#1f1f1f",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#333",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  title: { color: "#EBF1D5", fontSize: 15, fontWeight: "700" },
  sub: { color: "#aaa", fontSize: 12 },
  amount: { color: "#EBF1D5", fontWeight: "700", marginLeft: "auto" },

  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: "#EBF1D5" },
  chipActive: { backgroundColor: "#60DFC9", borderColor: "#60DFC9" },
  chipText: { color: "#EBF1D5", fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: "#121212", fontWeight: "800" },

  emptyWrap: {
    backgroundColor: "#1f1f1f",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#333",
    padding: 16,
    marginHorizontal: 16,
    marginTop: 24,
    alignItems: "center",
    gap: 6,
  },
  emptyTitle: { color: "#EBF1D5", fontSize: 18, fontWeight: "700" },
  emptyText: { color: "#888", textAlign: "center" },

  outlineBtn: { borderWidth: 1, borderColor: "#60DFC9", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  outlineBtnText: { color: "#60DFC9", fontWeight: "700" },

  ctaBtn: { backgroundColor: "#00C49F", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  ctaBtnText: { color: "#EBF1D5", fontWeight: "700" },

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
});
