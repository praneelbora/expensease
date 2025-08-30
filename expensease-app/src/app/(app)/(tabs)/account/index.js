// app/account.js  (Expo Router)  -- Pure JavaScript
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  FlatList,
  Alert,
  LayoutAnimation,
  UIManager,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Clipboard from "expo-clipboard";
import { Feather } from "@expo/vector-icons";
import Header from "~/header";

// ✅ Adjust these paths to your app structure
import { useAuth } from "context/AuthContext";
import { getAllExpenses } from "services/ExpenseService";
import {
  updateUserProfile,
  deleteAccount,
  getUserCategories,
  saveUserCategories,
} from "services/UserService";
// import { logEvent } from "utils/analytics";

// If you have currency helpers, import them; else we fallback to a short list
// import { getAllCurrencyCodes, toCurrencyOptions } from "utils/currencies";

const TEST_MODE = process.env.EXPO_PUBLIC_TEST_MODE === "true";

// Enable LayoutAnimation on Android
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/* ---------------------------
   Helpers
----------------------------*/
const FALLBACK_CURRENCIES = ["INR", "USD", "EUR", "GBP", "JPY", "AUD"];

// naive UPI validator (matches your web regex)
const UPI_REGEX = /^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z0-9.\-]{2,}$/;

// Format money safely
function safeCurrencyAmount(code, val) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: code }).format(Number(val || 0));
  } catch {
    return `${Number(val || 0).toFixed(2)} ${code || ""}`;
  }
}

// Compute totals (parity with your web helper)
function calculateTotals(expenses, userId) {
  let totalOwe = 0;
  let totalPay = 0;
  (expenses || []).forEach((exp) => {
    const share = exp?.splits?.find((s) => s?.friendId?._id === userId);
    if (!share) return;
    if (share.owing) totalOwe += exp.typeOf === "expense" ? (share.oweAmount || 0) : 0;
    if (share.paying) totalPay += share.payAmount || 0;
  });
  return { balance: totalPay - totalOwe, expense: totalOwe };
}

/* ---------------------------
   Currency Modal (inline)
----------------------------*/
function CurrencyModal({ visible, value, options, onSelect, onClose }) {
  const data = options && options.length ? options : FALLBACK_CURRENCIES.map((c) => ({ code: c, label: c }));
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Choose Currency</Text>
          <FlatList
            data={data}
            keyExtractor={(item) => String(item.code || item)}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            renderItem={({ item }) => {
              const code = item.code || item;
              const label = item.label || code;
              const selected = value === code;
              return (
                <TouchableOpacity
                  onPress={() => onSelect(code)}
                  style={[styles.optionRow, selected && styles.optionRowActive]}
                  activeOpacity={0.7}
                >
                  <Text style={styles.optionText}>{label}</Text>
                  {selected ? <Feather name="check" size={18} color="#00C49F" /> : null}
                </TouchableOpacity>
              );
            }}
          />
          <TouchableOpacity style={[styles.modalBtn, { marginTop: 12 }]} onPress={onClose}>
            <Text style={styles.modalBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/* ---------------------------
   Minimal Categories Manager (RN)
----------------------------*/
function CategoriesManageRN() {
  const [loading, setLoading] = useState(true);
  const [cats, setCats] = useState([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list = await getUserCategories();
      setCats(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e?.message || "Failed to load categories");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addCat = () => {
    LayoutAnimation.easeInEaseOut();
    setCats((prev) => [...prev, { _id: String(Date.now()), name: "" }]);
  };

  const updateName = (id, name) => {
    setCats((prev) => prev.map((c) => (c._id === id ? { ...c, name } : c)));
  };

  const remove = (id) => {
    LayoutAnimation.easeInEaseOut();
    setCats((prev) => prev.filter((c) => c._id !== id));
  };

  const saveAll = async () => {
    try {
      const cleaned = cats
        .map((c) => ({ name: String(c.name || "").trim() }))
        .filter((c) => c.name.length > 0);
      await saveUserCategories(cleaned);
      Alert.alert("Saved", "Categories updated.");
    } catch (e) {
      Alert.alert("Error", e?.message || "Failed to save categories");
    }
  };

  return (
    <View style={styles.cardBox}>
      <View style={styles.rowBetween}>
        <Text style={styles.sectionLabel}>Categories</Text>
        <TouchableOpacity onPress={addCat} style={styles.chipBtn} activeOpacity={0.7}>
          <Feather name="plus" size={14} color="#EBF1D5" />
          <Text style={styles.chipBtnText}>Add</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <Text style={styles.mutedText}>Loading…</Text>
      ) : error ? (
        <Text style={[styles.mutedText, { color: "#f88" }]}>{error}</Text>
      ) : (
        <>
          {cats.length === 0 ? <Text style={styles.mutedText}>No categories yet.</Text> : null}
          {cats.map((c) => (
            <View key={c._id} style={[styles.catRow,{flex: 1, flexDirection: 'row', width: '100%', alignContent: 'center', gap: 5}]}>
              {console.log(c)}
              <TextInput
                placeholder="Category name"
                placeholderTextColor="#777"
                value={c.emoji + "  " + c.name}
                onChangeText={(t) => updateName(c._id, t)}
                style={styles.input}
              />
              <TouchableOpacity onPress={() => remove(c._id)} style={[styles.iconBtn,{flexDirection: 'column', justifyContent: 'center', paddingHorizontal: 10, backgroundColor: '#2A2A2A', borderRadius: 8}]}>
                <Feather name="trash-2" size={18} color="#f66" />
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={[styles.modalBtn, { alignSelf: "flex-start" }]} onPress={saveAll}>
            <Text style={styles.modalBtnText}>Save</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

/* ---------------------------
   Screen
----------------------------*/
export default function AccountScreen() {
  const router = useRouter();
  const { logout, user, userToken, defaultCurrency = "INR" } = useAuth() || {};

  // state
  const [dc, setDc] = useState(defaultCurrency || "");
  const [showDefaultModal, setShowDefaultModal] = useState(false);
  const [dcStatus, setDcStatus] = useState("idle"); // idle | saving | saved | error
  const [dcError, setDcError] = useState("");

  const [upiId, setUpiId] = useState(user?.upiId || "");
  const [upiStatus, setUpiStatus] = useState({ state: "idle", msg: "" }); // idle | saving | saved | error

  const [loading, setLoading] = useState(!user && !!userToken);
  const [totals, setTotals] = useState({ balance: 0, expense: 0 });

  const [banner, setBanner] = useState(null); // { type, text }

  // for section highlight + scroll
  const scrollerRef = useRef(null);
  const upiRef = useRef(null);
  const currencyRef = useRef(null);
  const paymentRef = useRef(null);
  const guideRef = useRef(null);
  const [highlighted, setHighlighted] = useState(null);

  // currency options (fallback to small list)
  const currencyOptions = useMemo(
    () => (FALLBACK_CURRENCIES || []).map((c) => ({ code: c, label: c })),
    []
  );

  useEffect(() => setDc(defaultCurrency || ""), [defaultCurrency]);

  // fetch minimal totals
  const fetchExpenses = useCallback(async () => {
    try {
      const data = await getAllExpenses();
      setTotals(calculateTotals(data?.expenses || [], data?.id));
    } catch (e) {
      // non-blocking
      console.warn("Error loading expenses:", e?.message || e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  // helpers
  const showBanner = (type, text, ms = 2000) => {
    setBanner({ type, text });
    setTimeout(() => setBanner(null), ms);
  };

  const highlightSection = (refKey) => {
    setHighlighted(refKey);
    setTimeout(() => setHighlighted(null), 1500);
  };

  const scrollTo = (ref) => {
    if (!ref?.current || !scrollerRef?.current) return;
    ref.current.measureLayout(
      scrollerRef.current.getInnerViewNode?.() || scrollerRef.current,
      (x, y) => {
        scrollerRef.current.scrollTo({ y: Math.max(0, y - 24), animated: true });
      },
      () => {}
    );
  };

  // save currency
  const saveCurrencyPrefs = async (curr) => {
    setDcStatus("saving");
    setDcError("");
    try {
      await updateUserProfile({ defaultCurrency: curr });
      // logEvent?.("update_default_currency", { defaultCurrency: curr });
      setDc(curr);
      setDcStatus("saved");
      showBanner("success", "Default currency updated.", 2500);
      setTimeout(() => setDcStatus("idle"), 2000);
    } catch (e) {
      const msg = e?.message || "Failed to save currency";
      setDcStatus("error");
      setDcError(msg);
      showBanner("error", msg, 3000);
      setTimeout(() => {
        setDcStatus("idle");
        setDcError("");
      }, 3000);
    }
  };

  // save UPI
  const saveUpi = async () => {
    const v = String(upiId || "").trim();
    if (!v) {
      setUpiStatus({ state: "error", msg: "Enter a UPI ID (e.g., name@bank)." });
      return;
    }
    if (!UPI_REGEX.test(v)) {
      setUpiStatus({ state: "error", msg: "That UPI ID doesn’t look right. Example: name@bank." });
      return;
    }
    try {
      setUpiStatus({ state: "saving", msg: "" });
      await updateUserProfile({ upiId: v });
      // logEvent?.("update_upi", { screen: "account" });
      setUpiStatus({ state: "saved", msg: "Saved ✓" });
      showBanner("success", "UPI ID saved.", 2500);
      setTimeout(() => setUpiStatus({ state: "idle", msg: "" }), 2000);
    } catch (e) {
      const msg = e?.message || "Failed to save UPI ID";
      setUpiStatus({ state: "error", msg });
      showBanner("error", msg, 3000);
    }
  };

  const onCopyEmail = async () => {
    if (!user?.email) return;
    await Clipboard.setStringAsync(user.email);
    showBanner("info", "Email copied.", 1500);
  };

  const onLogout = () => {
    Alert.alert("Logout", "Log out of Expensease?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: () => {
          // logEvent?.("logout", { fromScreen: "account" });
          logout?.();
        },
      },
    ]);
  };

  const onDeleteAccount = async () => {
    Alert.alert(
      "Delete Account",
      "Delete your account permanently? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteAccount();
              // You may navigate to login screen afterwards
              router.replace("/login");
            } catch (e) {
              showBanner("error", e?.message || "Failed to delete account.", 3000);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StatusBar style="light" />
      <Header title="Account" />
      {/* Inline banner */}
      {banner && (
        <View
          style={[
            styles.banner,
            banner.type === "success" && styles.bannerSuccess,
            banner.type === "error" && styles.bannerError,
            banner.type === "info" && styles.bannerInfo,
          ]}
        >
          <Text style={styles.bannerText}>{banner.text}</Text>
        </View>
      )}

      {/* Content */}
      <ScrollView ref={scrollerRef} style={styles.scroller} contentContainerStyle={{ paddingBottom: 24 }}>
        {loading ? (
          <View style={{ paddingTop: 16 }}>
            <View style={styles.skeletonLine} />
            <View style={[styles.skeletonLine, { width: "60%" }]} />
            <View style={[styles.skeletonLine, { width: "40%" }]} />
          </View>
        ) : user || userToken ? (
          <View style={{ paddingTop: 16, gap: 12 }}>
            {/* Account card */}
            <View style={styles.cardBox}>
              <View style={styles.rowBetween}>
                <Text style={styles.sectionLabel}>Account</Text>
                <View style={styles.dividerV} />
              </View>
              <View style={{ gap: 6 }}>
                <View>
                  <Text style={styles.hintText}>Name</Text>
                  <Text style={styles.strongText}>{user?.name || "—"}</Text>
                </View>
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={styles.hintText}>Email</Text>
                    <Text style={[styles.strongText, { textTransform: "lowercase" }]} numberOfLines={1}>
                      {user?.email || "—"}
                    </Text>
                  </View>
                  {user?.email ? (
                    <TouchableOpacity onPress={onCopyEmail} activeOpacity={0.7}>
                      <Text style={{ color: "#86e1d8" }}>Copy</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            </View>

            {/* UPI */}
            <View
              ref={upiRef}
              style={[
                styles.cardBox,
                highlighted === "upi" && styles.highlight,
              ]}
            >
              <View style={styles.rowBetween}>
                <Text style={styles.sectionLabel}>UPI for Quick Payments</Text>
                <View style={styles.dividerV} />
              </View>
              <Text style={styles.mutedText}>
                Add your UPI ID so friends can pay you instantly. If you usually pay, ask your friend to add theirs.
              </Text>

              <Text style={styles.hintText}>Your UPI ID</Text>
              <View style={styles.row}>
                <TextInput
                  value={upiId}
                  onChangeText={setUpiId}
                  placeholder="yourname@bank"
                  placeholderTextColor="#777"
                  inputMode="email"
                  autoCapitalize="none"
                  style={[styles.input, { flex: 1 }]}
                />
                <TouchableOpacity onPress={saveUpi} style={[styles.primaryBtn, { marginLeft: 8 }]} disabled={upiStatus.state === "saving"}>
                  <Text style={styles.primaryBtnText}>{upiStatus.state === "saving" ? "Saving…" : "Save"}</Text>
                </TouchableOpacity>
              </View>
              {upiStatus.state === "error" ? (
                <Text style={{ color: "#ff8a8a", marginTop: 4 }}>{upiStatus.msg}</Text>
              ) : upiStatus.state === "saved" ? (
                <Text style={{ color: "#6be7cf", marginTop: 4 }}>{upiStatus.msg}</Text>
              ) : null}
            </View>

            {/* Payment Accounts (navigate) */}
            <TouchableOpacity
              ref={paymentRef}
              activeOpacity={0.8}
              onPress={() => {
                // logEvent?.("navigate", { fromScreen: "account", toScreen: "paymentAccounts", source: "payment_method_section" });
                router.push("/paymentAccounts");
              }}
              style={[
                styles.cardBox,
                highlighted === "payment" && styles.highlight,
              ]}
            >
              <View style={styles.rowBetween}>
                <Text style={styles.sectionLabel}>Payment Accounts</Text>
                <View style={styles.dividerV} />
              </View>
              <Text style={styles.mutedText}>Manage UPI, bank accounts, and cards for better expense tracking.</Text>
            </TouchableOpacity>

            {/* Guide (navigate) */}
            <TouchableOpacity
              ref={guideRef}
              activeOpacity={0.8}
              onPress={() => {
                // logEvent?.("navigate", { fromScreen: "account", toScreen: "guide", source: "guide_section" });
                router.push("/guide");
              }}
              style={[
                styles.cardBox,
                highlighted === "guide" && styles.highlight,
              ]}
            >
              <View style={styles.rowBetween}>
                <Text style={styles.sectionLabel}>Guide</Text>
                <View style={styles.dividerV} />
              </View>
              <Text style={styles.mutedText}>Quick tour: add expenses, split fairly, create groups, and settle up.</Text>
            </TouchableOpacity>

            {/* Default Currency */}
            <View
              ref={currencyRef}
              style={[
                styles.cardBox,
                highlighted === "currency" && styles.highlight,
              ]}
            >
              <View style={styles.rowBetween}>
                <Text style={styles.sectionLabel}>Default Currency</Text>
                <View style={styles.dividerV} />
              </View>

              <TouchableOpacity
                onPress={() => setShowDefaultModal(true)}
                activeOpacity={0.7}
                style={styles.selectBtn}
              >
                <Text style={styles.selectBtnText}>{dc || "Select"}</Text>
                <Feather name="chevron-down" size={18} color="#EBF1D5" />
              </TouchableOpacity>

              {dcStatus === "saved" ? (
                <Text style={{ color: "#6be7cf", marginTop: 6 }}>Saved ✓</Text>
              ) : dcStatus === "error" ? (
                <Text style={{ color: "#ff8a8a", marginTop: 6 }}>{dcError}</Text>
              ) : null}

              <Text style={[styles.mutedText, { marginTop: 6 }]}>
                Used for summaries. New expenses default to this currency so totals align.
              </Text>
            </View>

            {/* Currency Modal */}
            <CurrencyModal
              visible={showDefaultModal}
              value={dc}
              options={currencyOptions}
              onSelect={(cur) => {
                setShowDefaultModal(false);
                saveCurrencyPrefs(cur);
              }}
              onClose={() => setShowDefaultModal(false)}
            />

            {/* Categories */}
            <CategoriesManageRN />

            {/* Support the developer */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                // logEvent?.("navigate", { fromScreen: "account", toScreen: "supportdeveloper", source: "support_developer_section" });
                router.push("/supportdeveloper");
              }}
              style={styles.cardBox}
            >
              <View style={styles.rowBetween}>
                <Text style={styles.sectionLabel}>Support the Developer ☕</Text>
                <View style={styles.dividerV} />
              </View>
              <Text style={styles.mutedText}>If you find this platform helpful, consider supporting its development!</Text>
            </TouchableOpacity>

            {/* Danger Zone */}
            <View style={styles.dangerBox}>
              <View style={styles.dangerHeader}>
                <Text style={[styles.sectionLabel, { color: "#ff6b6b" }]}>Danger Zone</Text>
              </View>
              <View style={{ padding: 12 }}>
                <TouchableOpacity onPress={onLogout} style={styles.dangerBtn} activeOpacity={0.8}>
                  <Text style={styles.dangerBtnText}>Logout</Text>
                </TouchableOpacity>
              </View>
            </View>

            {TEST_MODE ? (
              <View style={[styles.cardBox, { borderColor: "#7a1f1f", borderWidth: 1, backgroundColor: "rgba(122,31,31,0.1)" }]}>
                <View style={styles.rowBetween}>
                  <Text style={[styles.sectionLabel, { color: "#ff6b6b" }]}>Danger Zone</Text>
                  <View style={[styles.dividerV, { backgroundColor: "#3a0e0e" }]} />
                </View>
                <TouchableOpacity onPress={onDeleteAccount} style={[styles.modalBtn, { borderColor: "#ff6b6b" }]} activeOpacity={0.8}>
                  <Text style={[styles.modalBtnText, { color: "#ff6b6b" }]}>Delete Account</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        ) : (
          <Text style={[styles.mutedText, { padding: 16, color: "#ff8a8a" }]}>User not logged in.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------------------------
   Styles
----------------------------*/
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#121212" },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#2a2a2a",
  },
  headerTitle: { color: "#EBF1D5", fontSize: 24, fontWeight: "700" },

  scroller: { flex: 1, paddingHorizontal: 16 },

  banner: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  bannerSuccess: { backgroundColor: "rgba(0,150,136,0.2)", borderColor: "#009688" },
  bannerError: { backgroundColor: "rgba(244,67,54,0.2)", borderColor: "#f44336" },
  bannerInfo: { backgroundColor: "rgba(158,158,158,0.2)", borderColor: "#9e9e9e" },
  bannerText: { color: "#EBF1D5" },

  sectionLabel: { color: "#00C49F", fontSize: 12, letterSpacing: 1, textTransform: "uppercase" },
  dividerV: { width: 1, height: 18, backgroundColor: "#212121" },

  cardBox: { backgroundColor: "#1E1E1E", borderRadius: 12, padding: 12, gap: 8 },
  dangerBox: { borderColor: "#2C2C2C", borderWidth: 1, borderRadius: 12, overflow: "hidden" },
  dangerHeader: { backgroundColor: "#201f1f", paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#2C2C2C" },
  dangerBtn: { backgroundColor: "#e53935", paddingVertical: 10, borderRadius: 8, alignItems: "center" },
  dangerBtnText: { color: "#fff", fontWeight: "600" },

  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center" },

  hintText: { color: "#888", fontSize: 12 },
  strongText: { color: "#14dac1", fontSize: 15, fontWeight: "600", textTransform: "capitalize" },
  mutedText: { color: "#aaa", fontSize: 13 },

  input: {
    backgroundColor: "#2A2A2A",
    color: "#EBF1D5",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    flex: 1,
    borderColor: "transparent",
  },
  primaryBtn: { backgroundColor: "#00C49F", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
  primaryBtnText: { color: "#121212", fontWeight: "700" },

  selectBtn: {
    backgroundColor: "#2A2A2A",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectBtnText: { color: "#EBF1D5", fontSize: 15 },

  // Modal
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 16 },
  modalCard: { backgroundColor: "#1f1f1f", borderRadius: 12, padding: 16, width: "100%", maxHeight: "80%" },
  modalTitle: { color: "#EBF1D5", fontSize: 18, fontWeight: "700", marginBottom: 8 },
  modalBtn: { backgroundColor: "#2a2a2a", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, alignSelf: "flex-start" },
  modalBtnText: { color: "#EBF1D5", fontWeight: "600" },
  optionRow: { backgroundColor: "#2A2A2A", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  optionRowActive: { borderWidth: 1, borderColor: "#00C49F" },
  optionText: { color: "#EBF1D5" },

  // Skeletons
  skeletonLine: { height: 16, backgroundColor: "#2a2a2a", borderRadius: 6, marginBottom: 8, width: "80%" },

  // highlight
  highlight: { borderWidth: 2, borderColor: "#00C49F" },
});
