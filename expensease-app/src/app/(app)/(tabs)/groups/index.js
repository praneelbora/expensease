// app/groups.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  RefreshControl,
  Modal,
  Platform,
} from "react-native";
import Header from "~/header";
import SearchBar from "~/searchBar";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";

// ===== adjust these paths to your project =====
import { useAuth } from "/context/AuthContext";
import { getAllGroups, getGroupExpenses, joinGroup, createGroup } from "/services/GroupService";
// import { logEvent } from "/utils/analytics";
import { getAllCurrencyCodes, getSymbol, toCurrencyOptions } from "utils/currencies";

const currencyDigits = (code, locale = "en-IN") => {
  try {
    const fmt = new Intl.NumberFormat(locale, { style: "currency", currency: code });
    return fmt.resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
};
const roundCurrency = (amount, code, locale = "en-IN") => {
  const d = currencyDigits(code, locale);
  const f = 10 ** d;
  return Math.round((Number(amount) + Number.EPSILON) * f) / f;
};
const initials = (name = "") => {
  const parts = String(name).trim().split(" ").filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

// ===== simple banner =====
const Banner = ({ banner, onClose }) =>
  banner ? (
    <View
      style={[
        styles.banner,
        banner.type === "success" && styles.bannerSuccess,
        banner.type === "error" && styles.bannerError,
        banner.type === "info" && styles.bannerInfo,
      ]}
    >
      <Text style={styles.bannerText}>{banner.text}</Text>
      <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={{ color: "#ccc" }}>✕</Text>
      </TouchableOpacity>
    </View>
  ) : null;

// ===== Create / Join modal (minimal) =====
function GroupsMiniModal({ visible, onClose, onCreate, onJoin, busy }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => {
    if (!visible) {
      setName("");
      setCode("");
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Groups</Text>

          <Text style={styles.modalSection}>Create Group</Text>
          <TextInput
            placeholder="Group name"
            placeholderTextColor="#81827C"
            value={name}
            onChangeText={setName}
            style={styles.input}
          />
          <TouchableOpacity
            onPress={() => onCreate(name)}
            disabled={!name.trim() || busy}
            style={[styles.actionBtn, (!name.trim() || busy) && styles.btnDisabled]}
          >
            <Text style={styles.actionBtnText}>{busy ? "Working…" : "Create"}</Text>
          </TouchableOpacity>

          <View style={{ height: 16 }} />

          <Text style={styles.modalSection}>Join with Code</Text>
          <TextInput
            placeholder="Enter code"
            placeholderTextColor="#81827C"
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
            style={styles.input}
          />
          <TouchableOpacity
            onPress={() => onJoin(code)}
            disabled={!code.trim() || busy}
            style={[styles.actionBtn, (!code.trim() || busy) && styles.btnDisabled]}
          >
            <Text style={styles.actionBtnText}>{busy ? "Working…" : "Join"}</Text>
          </TouchableOpacity>

          <View style={{ alignItems: "flex-end", marginTop: 12 }}>
            <TouchableOpacity style={styles.modalBtn} onPress={onClose}>
              <Text style={styles.modalBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function GroupsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams(); // can hold { join: CODE }
  const { userToken } = useAuth() || {};

  // data
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  // ui
  const [refreshing, setRefreshing] = useState(false);
  const [banner, setBanner] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalBusy, setModalBusy] = useState(false);

  // search & filter
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all"); // all | owes_me | i_owe | settled

  const hasJoinedRef = useRef(false);

  // ===== fetch: groups + per-currency totals =====
  const hydrateGroups = useCallback(
    async (raw = []) => {
      const enhanced = await Promise.all(
        raw.map(async (group) => {
          try {
            const res = await getGroupExpenses(group._id, userToken);
            const expenses = res?.expenses || [];
            const userId = res?.id;

            const byCode = {};
            for (const exp of expenses) {
              const code = exp?.currency || "INR";
              for (const split of exp?.splits || []) {
                if (String(split?.friendId?._id) !== String(userId)) continue;
                const owe = Number(split?.oweAmount) || 0;
                const pay = Number(split?.payAmount) || 0;
                byCode[code] = (byCode[code] || 0) + owe - pay; // + => you owe, - => you're owed
              }
            }

            const list = Object.entries(byCode)
              .map(([code, amt]) => {
                const rounded = roundCurrency(amt, code);
                const minUnit = 1 / 10 ** currencyDigits(code);
                return Math.abs(rounded) >= minUnit ? { code, amount: rounded } : null;
              })
              .filter(Boolean)
              .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

            return { ...group, totalOweList: list };
          } catch {
            return { ...group, totalOweList: [] };
          }
        })
      );
      setGroups(enhanced);
    },
    [userToken]
  );

  const fetchGroups = useCallback(async () => {
    try {
      const data = (await getAllGroups(userToken)) || [];
      await hydrateGroups(data);
    } catch (e) {
      console.error("Groups - fetch error:", e?.message || e);
    } finally {
      setLoading(false);
    }
  }, [userToken, hydrateGroups]);

  // initial + refresh
  useEffect(() => {
    if (!userToken) return;
    fetchGroups();
  }, [userToken, fetchGroups]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchGroups();
    } finally {
      setRefreshing(false);
    }
  }, [fetchGroups]);

  // ===== handle ?join=CODE =====
  const handleJoinGroup = useCallback(
    async (joinCode) => {
      try {
        setModalBusy(true);
        const data = await joinGroup(joinCode, userToken);
        if (data?.error) throw new Error(data.error);
        // logEvent?.("group_join", { screen: "groups", source: "link" });

        setBanner({ type: "success", text: "Joined group successfully." });
        setTimeout(() => setBanner(null), 3000);
        await fetchGroups();

        // strip ?join= from current route
        router.replace("/groups");
      } catch (e) {
        setBanner({ type: "error", text: e?.message || "Failed to join group. Try again." });
        setTimeout(() => setBanner(null), 3000);
      } finally {
        setModalBusy(false);
      }
    },
    [userToken, fetchGroups, router]
  );

  useEffect(() => {
    const joinCode = params?.join;
    if (joinCode && !hasJoinedRef.current) {
      hasJoinedRef.current = true;
      handleJoinGroup(String(joinCode));
    }
  }, [params?.join, handleJoinGroup]);

  // ===== filters/search =====
  const groupCategory = (g) => {
    const list = g?.totalOweList || [];
    const hasPos = list.some((x) => x.amount > 0); // you owe
    const hasNeg = list.some((x) => x.amount < 0); // you are owed
    if (!hasPos && !hasNeg) return "settled";
    if (hasPos && !hasNeg) return "i_owe";
    if (!hasPos && hasNeg) return "owes_me";
    return "mixed";
  };

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (groups || [])
      .filter((g) => {
        const matchText =
          !q ||
          g.name?.toLowerCase().includes(q) ||
          (g.members || []).some(
            (m) =>
              m?.name?.toLowerCase().includes(q) ||
              m?.email?.toLowerCase().includes(q)
          );
        if (!matchText) return false;

        if (activeFilter === "all") return true;
        const cat = groupCategory(g);
        if (activeFilter === "settled") return cat === "settled";
        if (activeFilter === "owes_me") return cat === "owes_me";
        if (activeFilter === "i_owe") return cat === "i_owe";
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [groups, query, activeFilter]);

  // ===== create / join from modal (simple) =====
  const onCreateGroup = async (name) => {
    try {
      setModalBusy(true);
      await createGroup(name, [], userToken);
      // logEvent?.("group_create", { screen: "groups", source: "modal" });
      setShowModal(false);
      setBanner({ type: "success", text: "Group created." });
      setTimeout(() => setBanner(null), 2500);
      await fetchGroups();
    } catch (e) {
      setBanner({ type: "error", text: e?.message || "Failed to create group." });
      setTimeout(() => setBanner(null), 3000);
    } finally {
      setModalBusy(false);
    }
  };

  // ===== render row =====
  const renderItem = ({ item: group }) => {
    const list = group?.totalOweList || [];
    const dominant = list[0];
    const otherCount = Math.max(list.length - 1, 0);
    const membersCount = group?.members?.length || 0;

    return (
      <TouchableOpacity
        onPress={() => {
          // logEvent?.("navigate", { fromScreen: "groups", toScreen: "group_detail", source: "group_list" });
          // router.push(`/c/${group._id}`);
          router.push({ pathname: "/groups/details", params: { id: group._id } });
        }}
        activeOpacity={0.8}
        style={styles.row}
      >
        {/* avatar */}
        <View style={styles.logo}>
          <Text style={styles.logoText}>{initials(group.name)}</Text>
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.rowTitle} numberOfLines={1}>{group.name}</Text>
          <Text style={styles.rowSub}>
            {membersCount} Member{membersCount === 1 ? "" : "s"}
          </Text>
        </View>

        {list.length > 0 ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {dominant ? (
              <View
                style={[
                  styles.badge,
                  dominant.amount < 0 ? styles.badgeOwed : styles.badgeOwe,
                ]}
              >
                <Text
                  style={dominant.amount < 0 ? styles.badgeOwedText : styles.badgeOweText}
                >
                  {dominant.amount < 0 ? "you’re owed · " : "you owe · "}
                  {getSymbol(dominant.code)}
                  {Math.abs(dominant.amount).toFixed(currencyDigits(dominant.code))}
                </Text>
              </View>
            ) : (
              <View style={styles.badge}>
                <Text style={styles.badgeNeutralText}>Settled</Text>
              </View>
            )}
            {otherCount > 0 ? (
              <View style={styles.badgeNeutral}>
                <Text style={styles.badgeNeutralText}>+{otherCount}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StatusBar style="light" />
      <Header title="Groups" />
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 8, gap: 8 }}>
        <View style={{ gap: 8 }}>
          <SearchBar
            value={query}
            onChangeText={setQuery}
            placeholder="Search groups or members"
          />

          <View style={styles.filters}>
            {[
              { k: "all", label: "All" },
              { k: "owes_me", label: "Owes me" },
              { k: "i_owe", label: "I owe" },
              { k: "settled", label: "Settled" },
            ].map(({ k, label }) => {
              const active = activeFilter === k;
              return (
                <TouchableOpacity
                  key={k}
                  onPress={() => setActiveFilter(k)}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Banner */}
        <Banner banner={banner} onClose={() => setBanner(null)} />

        {/* List / Empty / Loading */}
        <FlatList
          data={loading ? [] : filteredGroups}
          keyExtractor={(item) => String(item._id)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00d0b0" />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            loading ? (
              <View style={{ gap: 10 }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <View key={i} style={styles.skelRow}>
                    <View style={styles.skelLogo} />
                    <View style={{ flex: 1, gap: 8 }}>
                      <View style={styles.skelLineShort} />
                      <View style={styles.skelLine} />
                    </View>
                    <View style={styles.skelBadge} />
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No groups yet</Text>
                <Text style={styles.emptyText}>
                  To split expenses with multiple people, create a group.
                </Text>
                <TouchableOpacity
                  style={styles.ctaBtn}
                  onPress={() => {
                    // logEvent?.("open_add_group_modal", { screen: "groups", source: "cta" });
                    setShowModal(true);
                  }}
                >
                  <Text style={styles.ctaBtnText}>Create Group</Text>
                </TouchableOpacity>
              </View>
            )
          }
          ListFooterComponent={
            !loading && filteredGroups.length > 0 ? (
              <Text style={{ color: "#00C49F", textAlign: "center", marginTop: 10 }}>
                {filteredGroups.length} Group{filteredGroups.length === 1 ? "" : "s"}
              </Text>
            ) : null
          }
        />

        {/* Floating create button (mobile) */}
        <TouchableOpacity
          accessibilityLabel="Create group"
          onPress={() => {
            // logEvent?.("open_add_group_modal", { screen: "groups", source: "fab" });
            setShowModal(true);
          }}
          style={styles.fab}
        >
          <Feather name="plus" size={22} color="#121212" />
        </TouchableOpacity>

        <GroupsMiniModal
          visible={showModal}
          onClose={() => setShowModal(false)}
          busy={modalBusy}
          onCreate={onCreateGroup}
          onJoin={handleJoinGroup}
        />
      </View>
    </SafeAreaView>
  );
}

// ============ styles ============
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#121212" },
  header: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "android" ? 6 : 0,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EBF1D5",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: { color: "#EBF1D5", fontSize: 24, fontWeight: "700" },
  headerFab: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "#00C49F", alignItems: "center", justifyContent: "center",
  },

  input: {
    backgroundColor: "#1f1f1f",
    color: "#EBF1D5",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#55554f",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  filters: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  filterChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: "#2a2a2a" },
  filterChipActive: { backgroundColor: "#EBF1D5", borderColor: "#EBF1D5" },
  filterChipText: { color: "#EBF1D5", fontSize: 12 },
  filterChipTextActive: { color: "#121212", fontWeight: "700" },

  // rows
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#212121",
  },
  logo: {
    width: 40, height: 40, borderRadius: 8,
    backgroundColor: "#1f1f1f", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center", justifyContent: "center",
  },
  logoText: { color: "#EBF1D5", fontWeight: "700" },
  rowTitle: { color: "#EBF1D5", fontSize: 15, fontWeight: "600", textTransform: "capitalize" },
  rowSub: { color: "#888", fontSize: 12 },

  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  badgeOwe: { borderColor: "rgba(244,67,54,0.4)", backgroundColor: "rgba(244,67,54,0.1)" },
  badgeOwed: { borderColor: "rgba(0,196,159,0.4)", backgroundColor: "rgba(0,196,159,0.1)" },
  badgeOweText: { color: "#f28b82", fontSize: 12 },
  badgeOwedText: { color: "#60DFC9", fontSize: 12 },
  badgeNeutral: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  badgeNeutralText: { color: "#bbb", fontSize: 12 },

  // empty
  emptyCard: { backgroundColor: "#1f1f1f", borderRadius: 12, padding: 16, marginTop: 24, alignItems: "center", borderWidth: 1, borderColor: "#333" },
  emptyTitle: { color: "#EBF1D5", fontSize: 20, fontWeight: "700" },
  emptyText: { color: "#888", textAlign: "center", marginTop: 6, marginBottom: 12 },
  ctaBtn: { backgroundColor: "#00C49F", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  ctaBtnText: { color: "#121212", fontWeight: "700" },
  countFooter: { color: "#60DFC9", textAlign: "center", marginTop: 8 },

  // banner
  banner: {
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: "#1e1e1e",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  bannerSuccess: { backgroundColor: "rgba(0,150,136,0.2)", borderColor: "#009688" },
  bannerError: { backgroundColor: "rgba(244,67,54,0.2)", borderColor: "#f44336" },
  bannerInfo: { backgroundColor: "rgba(158,158,158,0.2)", borderColor: "#9e9e9e" },
  bannerText: { color: "#EBF1D5", flex: 1 },

  // modal
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 16 },
  modalCard: { backgroundColor: "#1f1f1f", borderRadius: 12, padding: 16, width: "100%" },
  modalTitle: { color: "#EBF1D5", fontSize: 18, fontWeight: "700", marginBottom: 8 },
  modalSection: { color: "#60DFC9", fontSize: 12, textTransform: "uppercase", marginBottom: 6 },
  modalBtn: { backgroundColor: "#2a2a2a", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  modalBtnText: { color: "#EBF1D5", fontWeight: "600" },
  actionBtn: { backgroundColor: "#00C49F", borderRadius: 10, paddingVertical: 10, alignItems: "center", marginTop: 6 },
  actionBtnText: { color: "#121212", fontWeight: "700" },
  btnDisabled: { backgroundColor: "rgba(255,255,255,0.1)" },

  // skeletons
  skelRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  skelLogo: { width: 40, height: 40, borderRadius: 8, backgroundColor: "#222", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  skelLineShort: { height: 8, width: "35%", backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 4 },
  skelLine: { height: 8, width: "55%", backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 4 },
  skelBadge: { height: 22, width: 100, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 6, marginLeft: "auto" },

  // fab
  fab: {
    position: "absolute",
    right: 16,
    bottom: 20,
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: "#00C49F",
    alignItems: "center", justifyContent: "center",
    elevation: 4,
  },
});
