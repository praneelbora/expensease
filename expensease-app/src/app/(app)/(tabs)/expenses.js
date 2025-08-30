// app/expenses.js
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
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";

// ===== adjust these paths to your project =====
import { useAuth } from "context/AuthContext";
import { getAllExpenses } from "services/ExpenseService";
// import { logEvent } from "utils/analytics";
import { getAllCurrencyCodes, toCurrencyOptions } from "utils/currencies";

// ---- tiny symbol helper (use your own getSymbol if you prefer)
const SYMBOLS = { INR: "₹", USD: "$", EUR: "€", GBP: "£", JPY: "¥", AUD: "A$" };
const getSymbol = (code = "INR") => SYMBOLS[code] || "";

// ======= Placeholder Filter Modal (swap with your RN component later) =======
function FilterSheet({ visible, onClose, onApply, selected, filters, categories }) {
  const [local, setLocal] = useState(selected);
  useEffect(() => setLocal(selected), [selected]);

  const setKey = (k, v) => setLocal((s) => ({ ...s, [k]: v }));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Filters</Text>

          <Text style={styles.modalSection}>Type</Text>
          <View style={styles.chipsRow}>
            {filters.map((f) => (
              <TouchableOpacity
                key={f.key}
                style={[styles.chip, local.type === f.key && styles.chipActive]}
                onPress={() => setKey("type", f.key)}
              >
                <Text style={[styles.chipText, local.type === f.key && styles.chipTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.modalSection}>Category</Text>
          <View style={styles.chipsRow}>
            {categories.slice(0, 12).map((c) => (
              <TouchableOpacity
                key={String(c)}
                style={[styles.chip, local.category === c && styles.chipActive]}
                onPress={() => setKey("category", c)}
              >
                <Text style={[styles.chipText, local.category === c && styles.chipTextActive]}>
                  {c === "all" ? "All" : c}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.modalSection}>Sort</Text>
          <View style={styles.chipsRow}>
            {[
              { k: "newest", label: "Newest" },
              { k: "oldest", label: "Oldest" },
            ].map(({ k, label }) => (
              <TouchableOpacity
                key={k}
                style={[styles.chip, local.sort === k && styles.chipActive]}
                onPress={() => setKey("sort", k)}
              >
                <Text style={[styles.chipText, local.sort === k && styles.chipTextActive]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
            <TouchableOpacity style={styles.modalBtnSecondary} onPress={onClose}>
              <Text style={styles.modalBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalBtnPrimary}
              onPress={() => {
                onApply(local);
                onClose();
              }}
            >
              <Text style={[styles.modalBtnText, { color: "#121212", fontWeight: "700" }]}>Apply</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ====== Screen ======
export default function ExpensesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const {
    user,
    userToken,
    defaultCurrency,
    preferredCurrencies,
    categories = [],
    paymentMethods = [],
  } = useAuth() || {};

  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState([]);
  const [userId, setUserId] = useState(null);

  const [query, setQuery] = useState("");
  const [showFilter, setShowFilter] = useState(false);

  const currencyOptions = useMemo(
    () => toCurrencyOptions(getAllCurrencyCodes()),
    []
  );

  // URL-style initial state (type/category/sort) via router params
  const initialType = (params?.type || params?.filter || "all").toString();
  const initialCategory = (params?.category || "all").toString();
  const initialSort = (params?.sort || "newest").toString();

  const [appliedFilter, setAppliedFilter] = useState({
    type: initialType,         // 'all' | 'personal' | 'settle' | 'group' | 'friend'
    category: initialCategory, // 'all' | <categoryName>
    currency: "",              // optional
    sort: initialSort,         // 'newest' | 'oldest'
  });

  // keep route in sync when filters change
  useEffect(() => {
    // just replace current route with updated query for share-ability
    const q = new URLSearchParams({
      type: appliedFilter.type,
      category: appliedFilter.category,
      sort: appliedFilter.sort,
    }).toString();
    router.replace(`/expenses?${q}`);
  }, [appliedFilter, router]);

  // fetch
  const fetchExpenses = useCallback(async () => {
    try {
      const data = await getAllExpenses(userToken);
      setUserId(data?.id);
      setExpenses(data?.expenses || []);
    } catch (e) {
      console.error("Expenses - fetch error:", e?.message || e);
    } finally {
      setLoading(false);
    }
  }, [userToken]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  // pull-to-refresh
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchExpenses();
    } finally {
      setRefreshing(false);
    }
  }, [fetchExpenses]);

  // helpers (ported)
  const getSettleDirectionText = (splits = []) => {
    const payer = splits.find((s) => s.paying && s.payAmount > 0);
    const receiver = splits.find((s) => s.owing && s.oweAmount > 0);
    if (!payer || !receiver) return "Invalid settlement";
    const payerName = payer.friendId?._id === userId ? "You" : payer.friendId?.name;
    const receiverName = receiver.friendId?._id === userId ? "you" : receiver.friendId?.name;
    return `${payerName} paid ${receiverName}`;
  };

  const getPayerInfo = (splits = []) => {
    const userSplit = splits.find((s) => s.friendId && s.friendId._id === userId);
    if (!userSplit || (!userSplit.payAmount && !userSplit.oweAmount)) return "You were not involved";
    const payers = splits.filter((s) => s.paying && s.payAmount > 0);
    if (payers.length === 1) return `${payers[0].friendId._id == userId ? "You" : payers[0].friendId.name} paid`;
    if (payers.length > 1) return `${payers.length} people paid`;
    return "No one paid";
  };

  const getOweInfo = (splits = []) => {
    const userSplit = splits.find((s) => s.friendId && s.friendId._id === userId);
    if (!userSplit) return null;
    const { oweAmount = 0, payAmount = 0 } = userSplit;
    const net = payAmount - oweAmount;
    if (net > 0) return { text: "you lent", amount: ` ${net.toFixed(2)}` };
    if (net < 0) return { text: "you borrowed", amount: ` ${Math.abs(net).toFixed(2)}` };
    return null;
  };

  const FILTERS = [
    { key: "all", label: "All Expenses" },
    { key: "personal", label: "Personal Expenses" },
    { key: "settle", label: "Settlements" },
    { key: "group", label: "Group Expenses" },
    { key: "friend", label: "Friend Expenses" },
  ];

  // categories list from data
  const categoryOptions = useMemo(() => {
    const s = new Set();
    (expenses || []).forEach((e) => {
      if (e?.typeOf !== "settle" && e?.category) s.add(e.category);
    });
    const arr = Array.from(s).sort();
    return ["all", ...arr];
  }, [expenses]);

  // main filterer
  const filteredExpenses = useMemo(() => {
    const filterExpenses = (items, { type, category, currency, sort }, q) => {
      let out = [...items];

      // type
      if (type !== "all") {
        out = out.filter((exp) => {
          switch (type) {
            case "settle":
              return exp.typeOf === "settle";
            case "personal":
              return !exp.groupId && exp.typeOf !== "settle" && (exp.splits?.length ?? 0) === 0;
            case "group":
              return exp.groupId && exp.typeOf !== "settle";
            case "friend":
              return !exp.groupId && exp.typeOf !== "settle" && (exp.splits?.length ?? 0) > 0;
            default:
              return true;
          }
        });
      }

      // category
      if (category !== "all") out = out.filter((e) => (e?.category || "") === category);

      // currency
      if (currency) out = out.filter((e) => e.currency === currency);

      // query search (desc, names, amount, currency, group, date)
      const qq = (q || "").trim().toLowerCase();
      if (qq) {
        out = out.filter((exp) => {
          const inDesc = (exp.description || "").toLowerCase().includes(qq);
          const inNames = (exp.splits || []).some(
            (s) => s.friendId && s.friendId.name.toLowerCase().includes(qq)
          );
          const inAmount = String(exp.amount ?? "").toLowerCase().includes(qq);
          const inCurrency = (exp.currency || "").toLowerCase().includes(qq);
          const inGroup = (exp.groupId?.name || "").toLowerCase().includes(qq);

          const dateStr = exp.date
            ? new Date(exp.date).toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "2-digit" }).toLowerCase()
            : "";
          const inDate = dateStr.includes(qq);

          const monthStr = exp.date
            ? new Date(exp.date).toLocaleDateString("en-GB", { year: "numeric", month: "short" }).toLowerCase()
            : "";
          const inMonth = monthStr.includes(qq);

          return inDesc || inNames || inAmount || inCurrency || inGroup || inDate || inMonth;
        });
      }

      // sort
      out.sort((a, b) =>
        (sort === "newest")
          ? new Date(b.date) - new Date(a.date)
          : new Date(a.date) - new Date(b.date)
      );

      return out;
    };

    return filterExpenses(expenses, appliedFilter, query);
  }, [expenses, appliedFilter, query]);

  // expense row
  const renderItem = ({ item: exp }) => {
    const isSettle = exp.typeOf === "settle";
    const leftTitle = exp.description || (isSettle ? "Settlement" : "Expense");
    const sub =
      isSettle
        ? getSettleDirectionText(exp.splits)
        : exp.groupId?.name || (exp.splits?.length ? "With friends" : "Personal");

    const oweInfo = !isSettle ? getOweInfo(exp.splits) : null;

    return (
      <TouchableOpacity
        activeOpacity={0.8}
        style={styles.expenseRow}
        onPress={() => {
          // logEvent?.("open_expense_modal", { screen: "expenses" });
          // You can navigate to a detail screen or open your native modal here:
          // router.push(`/expenses/${exp._id}`);
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.expenseTitle} numberOfLines={1}>{leftTitle}</Text>
          <Text style={styles.expenseSub} numberOfLines={1}>
            {sub} • {new Date(exp.date).toDateString()}
          </Text>
          {!!oweInfo && (
            <Text style={styles.expenseHint}>
              {oweInfo.text} {getSymbol(exp.currency)}{oweInfo.amount}
            </Text>
          )}
        </View>
        <Text style={styles.expenseAmt}>
          {getSymbol(exp.currency)} {Number(exp.amount || 0).toFixed(2)}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TouchableOpacity
            onPress={() => {
              // logEvent?.("navigate", { fromScreen: "expenses", toScreen: "dashboard", source: "back" });
              router.push("/dashboard");
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="chevron-left" size={24} color="#EBF1D5" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>All Expenses</Text>
        </View>

        {/* Filter button */}
        <TouchableOpacity
          onPress={() => {
            // logEvent?.("open_filter_modal", { screen: "expenses" });
            setShowFilter(true);
          }}
          style={[
            styles.filterBtn,
            (appliedFilter.category !== "all" ||
              appliedFilter.type !== "all" ||
              appliedFilter.sort !== "newest") && styles.filterBtnActive,
          ]}
        >
          <Feather name="sliders" size={18} color="#EBF1D5" />
        </TouchableOpacity>
      </View>

      {/* Search */}
      {expenses.length > 0 && (
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <View style={{ position: "relative" }}>
            <Feather name="search" size={16} color="#888" style={{ position: "absolute", left: 12, top: 14 }} />
            <TextInput
              placeholder="Search Descriptions / Names / Amounts / Currencies"
              placeholderTextColor="#81827C"
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, { paddingLeft: 32 }]}
            />
          </View>
        </View>
      )}

      {/* List */}
      <FlatList
        data={loading ? [] : filteredExpenses}
        keyExtractor={(item) => String(item._id)}
        renderItem={renderItem}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00d0b0" />}
        ListEmptyComponent={
          loading ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
              <Feather name="loader" size={22} color="#EBF1D5" />
            </View>
          ) : expenses.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>No expenses found.</Text>
              <Text style={styles.emptyText}>Add your first expense to see it here.</Text>
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <Text style={[styles.emptyTitle, { marginBottom: 6 }]}>No results.</Text>
              <Text style={styles.emptyText}>
                Clear filters to view more.
              </Text>
              <TouchableOpacity
                style={[styles.ctaBtn, { marginTop: 10 }]}
                onPress={() =>
                  setAppliedFilter({ type: "all", category: "all", currency: "", sort: "newest" })
                }
              >
                <Text style={styles.ctaBtnText}>Clear Filters</Text>
              </TouchableOpacity>
            </View>
          )
        }
        ListFooterComponent={
          !loading && filteredExpenses.length > 0 &&
          (appliedFilter.type !== "all" || appliedFilter.category !== "all") ? (
            <Text style={styles.footerHint}>
              End of Results.{" "}
              <Text
                onPress={() =>
                  setAppliedFilter({ type: "all", category: "all", currency: "", sort: "newest" })
                }
                style={{ color: "#60DFC9", textDecorationLine: "underline" }}
              >
                Clear Filters
              </Text>{" "}
              to view more.
            </Text>
          ) : null
        }
      />

      {/* Filters sheet */}
      <FilterSheet
        visible={showFilter}
        onClose={() => setShowFilter(false)}
        onApply={(f) => setAppliedFilter(f)}
        selected={appliedFilter}
        filters={FILTERS}
        categories={categoryOptions}
      />
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

  filterBtn: {
    backgroundColor: "#212121",
    paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: 8, borderWidth: 1, borderColor: "#212121",
  },
  filterBtnActive: { borderColor: "#00C49F" },

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

  expenseRow: {
    backgroundColor: "#1f1f1f",
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  expenseTitle: { color: "#EBF1D5", fontSize: 15, fontWeight: "700" },
  expenseSub: { color: "#aaa", fontSize: 12, marginTop: 2 },
  expenseHint: { color: "#60DFC9", fontSize: 12, marginTop: 2 },
  expenseAmt: { color: "#EBF1D5", fontWeight: "700", marginLeft: 12 },

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
  emptyText: { color: "#888", textAlign: "center", marginTop: 6 },

  ctaBtn: { backgroundColor: "#00C49F", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  ctaBtnText: { color: "#121212", fontWeight: "700" },

  footerHint: { color: "#888", textAlign: "center", marginVertical: 10 },

  // modal
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 16 },
  modalCard: { backgroundColor: "#1f1f1f", borderRadius: 12, padding: 16, width: "100%" },
  modalTitle: { color: "#EBF1D5", fontSize: 18, fontWeight: "700", marginBottom: 8 },
  modalSection: { color: "#60DFC9", fontSize: 12, textTransform: "uppercase", marginTop: 8, marginBottom: 6 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: "#2a2a2a" },
  chipActive: { backgroundColor: "#EBF1D5", borderColor: "#EBF1D5" },
  chipText: { color: "#EBF1D5", fontSize: 12 },
  chipTextActive: { color: "#121212", fontWeight: "700" },
  modalBtnSecondary: { backgroundColor: "#2a2a2a", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  modalBtnPrimary: { backgroundColor: "#00C49F", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  modalBtnText: { color: "#EBF1D5", fontWeight: "600" },
});
