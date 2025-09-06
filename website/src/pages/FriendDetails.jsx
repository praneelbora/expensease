// app/friends/[id].js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  RefreshControl,
  Modal,
  TextInput,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import Header from "~/header";
import ExpenseRow from "~/expenseRow";

// ===== adjust these to your project =====
import { useAuth } from "context/AuthContext";
import { getFriendDetails } from "services/FriendService";
import { getFriendExpense, settleExpense } from "services/ExpenseService";
import { getLoans } from "services/LoanService";
import { getSymbol, allCurrencies } from "utils/currencies";

// Theming hook — uses your app ThemeProvider if available.
import { useTheme } from "context/ThemeProvider";

/* ---------------- small components ---------------- */
function LineButton({ label, onPress, tone = "primary", disabled, styles: localStyles }) {
  return (
    <TouchableOpacity
      disabled={disabled}
      onPress={onPress}
      style={[
        localStyles.ctaBtn,
        tone === "secondary" && { backgroundColor: localStyles.colors.cardAltFallback },
        disabled && { opacity: 0.6 },
      ]}
    >
      <Text style={[localStyles.ctaBtnText, tone === "secondary" && { color: localStyles.colors.textFallback }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function PaymentUPIModal({ visible, onClose, friendName, friendUpi, onConfirm, styles: localStyles }) {
  const [amount, setAmount] = useState("");
  useEffect(() => {
    if (!visible) setAmount("");
  }, [visible]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={localStyles.modalBackdrop}>
        <View style={localStyles.modalCard}>
          <Text style={localStyles.modalTitle}>Make UPI Payment</Text>
          <Text style={localStyles.modalMeta}>To: {friendName || "Friend"} {friendUpi ? `• ${friendUpi}` : ""}</Text>
          <TextInput
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
            placeholder="Amount"
            placeholderTextColor={localStyles.colors.mutedFallback}
            style={localStyles.input}
          />
          <View style={localStyles.modalActionsRight}>
            <TouchableOpacity style={localStyles.modalBtnSecondary} onPress={onClose}>
              <Text style={localStyles.modalBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={localStyles.modalBtnPrimary}
              onPress={() => {
                onConfirm(Number(amount || 0));
                onClose();
              }}
            >
              <Text style={[localStyles.modalBtnText, localStyles.modalPrimaryActionText]}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/**
 * SettleSheet
 * - Accepts:
 *    tx: flat array of { from, to, amount, currency } used to call settleExpense on submit
 *    settlementLists: optional complex breakdown to show groups/personal/net rows
 */
function SettleSheet({ visible, onClose, onSubmit, tx = [], settlementLists = [], currencyOptions = [], defaultCurrency = "INR", styles: localStyles }) {
  const [curr, setCurr] = useState(defaultCurrency || "INR");
  const total = useMemo(() => (tx || []).reduce((n, t) => n + (t.amount || 0), 0), [tx]);

  useEffect(() => {
    if (visible) setCurr(defaultCurrency || "INR");
  }, [visible, defaultCurrency]);

  // Flatten settlementLists into a readable array for UI (but use `tx` for submit)
  const flattenedForUI = useMemo(() => {
    const out = [];
    for (const item of settlementLists || []) {
      if (!item) continue;
      // net rows
      if (item.type === "net") {
        out.push({
          label: `Net (${item.currency})`,
          amount: item.amount,
          currency: item.currency,
          detail: item.groups ? `Groups: ${Object.keys(item.groups || {}).length}` : undefined,
          personal: item.personal || null,
        });
        // groups
        if (item.groups) {
          for (const [gid, g] of Object.entries(item.groups || {})) {
            out.push({
              label: `Group: ${g.name || "Unnamed"}`,
              amount: g.amount,
              currency: item.currency,
              detail: `groupId:${gid}`,
            });
          }
        }
        // personal part inside net
        if (item.personal) {
          out.push({
            label: `Personal`,
            amount: item.personal.amount,
            currency: item.personal.currency,
            detail: `Personal settlement`,
          });
        }
      } else if (item.type === "all_personal" || item.type === "all_groups" || item.type === "group") {
        out.push({
          label: item.type,
          amount: item.amount,
          currency: item.currency,
          detail: item.name || undefined,
        });
      } else {
        // fallback
        out.push({ label: item.type || "item", amount: item.amount, currency: item.currency });
      }
    }
    return out;
  }, [settlementLists]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={localStyles.modalBackdrop}>
        <View style={[localStyles.modalCard, { maxHeight: "90%" }]}>
          <Text style={localStyles.modalTitle}>Settle Up</Text>
          <Text style={localStyles.modalMeta}>
            This will record a settlement across {tx?.length || 0} currency{(tx?.length || 0) === 1 ? "" : "ies"}.
          </Text>

          <Text style={localStyles.summaryText}>
            Totals: {(tx || []).map((t) => `${getSymbol(t.currency)}${t.amount}`).join(" + ")}
          </Text>

          <View style={{ maxHeight: 180 }}>
            {flattenedForUI.length === 0 ? (
              <Text style={{ color: localStyles.colors.mutedFallback }}>Nothing to settle</Text>
            ) : (
              <FlatList
                data={flattenedForUI}
                keyExtractor={(it, i) => `${it.label}-${it.currency}-${i}`}
                renderItem={({ item }) => (
                  <View style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#2a2a2a" }}>
                    <Text style={{ color: localStyles.colors.textFallback, fontWeight: "700" }}>{item.label}</Text>
                    <Text style={{ color: localStyles.colors.mutedFallback }}>{item.detail || `${getSymbol(item.currency)} ${item.amount}`}</Text>
                  </View>
                )}
              />
            )}
          </View>

          <View style={localStyles.chipsRow}>
            {(currencyOptions || [{ value: "INR", label: "₹ INR" }]).slice(0, 10).map((opt) => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setCurr(opt.value)}
                style={[localStyles.chip, curr === opt.value && localStyles.chipActive]}
              >
                <Text style={[localStyles.chipText, curr === opt.value && localStyles.chipTextActive]}>{opt.value}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={localStyles.modalActionsRight}>
            <TouchableOpacity style={localStyles.modalBtnSecondary} onPress={onClose}>
              <Text style={localStyles.modalBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={localStyles.modalBtnPrimary}
              onPress={() => onSubmit(curr)}
            >
              <Text style={[localStyles.modalBtnText, localStyles.modalPrimaryActionText]}>Record</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* ---------------- main screen ---------------- */
export default function FriendDetails() {
  const router = useRouter();
  const { id } = useLocalSearchParams(); // friendId
  const { user, userToken, defaultCurrency, preferredCurrencies } = useAuth() || {};
  const themeContext = useTheme?.() || {};
  const styles = useMemo(() => createStyles(themeContext?.theme), [themeContext?.theme]);

  // ui state
  const [activeTab] = useState("expenses"); // kept single-tab for now
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // data
  const [friend, setFriend] = useState(null);
  const [userId, setUserId] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [simplifiedTransactions, setSimplifiedTransactions] = useState([]); // NEW
  const [loans, setLoans] = useState([]);
  const [loanLoading, setLoanLoading] = useState(true);

  // balances
  const [netExpenseBalanceMap, setNetExpenseBalanceMap] = useState({});
  const [personalExpenseBalanceMap, setPersonalExpenseBalanceMap] = useState({}); // NEW
  const [netLoanBalanceMap, setNetLoanBalanceMap] = useState({});

  // modals
  const [showUPIModal, setShowUPIModal] = useState(false);
  const [showSettle, setShowSettle] = useState(false);

  const currencyOptions = useMemo(() => {
    const base = new Set([defaultCurrency, ...(preferredCurrencies || [])]);
    return allCurrencies
      .filter((c) => base.has(c.code))
      .concat(allCurrencies.filter((c) => !base.has(c.code)))
      .map((c) => ({ value: c.code, label: `${c.name} (${c.symbol})`, code: c.code }));
  }, [defaultCurrency, preferredCurrencies]);

  // helpers
  const currencyDigits = (code, locale = "en-IN") => {
    try {
      const fmt = new Intl.NumberFormat(locale, { style: "currency", currency: code });
      return fmt.resolvedOptions().maximumFractionDigits ?? 2;
    } catch {
      return 2;
    }
  };
  const roundCurrency = (amount, code) => {
    const d = currencyDigits(code);
    const f = 10 ** d;
    return Math.round((Number(amount) + Number.EPSILON) * f) / f;
  };

  const getOutstandingByCurrency = (loan) => {
    const code = loan?.currency || loan?.principalCurrency || "INR";
    const principal = Number(loan?.principal) || 0;
    let paid = 0;
    for (const r of (loan?.repayments || [])) {
      const rCode = r?.currency || code;
      if (rCode !== code) continue;
      paid += Number(r?.amount) || 0;
    }
    const outstanding = Math.max(0, roundCurrency(principal - paid, code));
    return { code, amount: outstanding };
  };

  const computeNetLoanBalanceByCurrency = (friendId, meId, friendLoans) => {
    const totals = {};
    for (const loan of friendLoans || []) {
      const { code, amount } = getOutstandingByCurrency(loan);
      if (amount === 0) continue;
      const youLender = loan.lenderId?._id === meId;
      const frBorrower = loan.borrowerId?._id === friendId;
      const youBorrower = loan.borrowerId?._id === meId;
      const frLender = loan.lenderId?._id === friendId;
      if (youLender && frBorrower) totals[code] = roundCurrency((totals[code] || 0) + amount, code);
      if (youBorrower && frLender) totals[code] = roundCurrency((totals[code] || 0) - amount, code);
    }
    for (const c of Object.keys(totals)) {
      const minUnit = 1 / (10 ** currencyDigits(c));
      if (Math.abs(totals[c]) < minUnit) delete totals[c];
    }
    return totals;
  };

  const calculateFriendBalanceByCurrency = (exps, meId, frId) => {
    const totals = {};
    const filtered = (exps || []).filter((exp) => {
      let youPay = false, frPay = false, youOwe = false, frOwe = false;
      (exp.splits || []).forEach((s) => {
        const sid = s.friendId?._id?.toString();
        if (sid === meId) { if (s.paying) youPay = true; if (s.owing) youOwe = true; }
        if (sid === frId) { if (s.paying) frPay = true; if (s.owing) frOwe = true; }
      });
      const oneIsPaying = youPay || frPay;
      const otherIsOwing = (youPay && frOwe) || (frPay && youOwe);
      return oneIsPaying && otherIsOwing;
    });

    for (const exp of filtered) {
      const code = exp?.currency || "INR";
      for (const s of exp.splits || []) {
        const sid = s?.friendId?._id?.toString();
        if (sid !== frId) continue;
        const add = s.owing ? Number(s.oweAmount) || 0 : 0;
        const sub = s.paying ? Number(s.payAmount) || 0 : 0;
        totals[code] = roundCurrency((totals[code] || 0) + add - sub, code);
      }
    }
    for (const c of Object.keys(totals)) {
      const minUnit = 1 / (10 ** currencyDigits(c));
      if (Math.abs(totals[c]) < minUnit) delete totals[c];
    }
    return totals;
  };

  const generateSimplifiedTransactionsByCurrency = (netByCode, meId, frId) => {
    const tx = [];
    for (const [code, amt] of Object.entries(netByCode || {})) {
      if (!amt) continue;
      const from = amt < 0 ? meId : frId;
      const to = amt < 0 ? frId : meId;
      tx.push({ from, to, amount: Math.abs(amt), currency: code });
    }
    return tx;
  };

  /* ------------------ group-settlement helpers (ported from web) ------------------ */

  // collect per-code, per-group net from user's perspective
  const collectGroupPartiesByCurrency = (simplifiedTxs = [], userId, friendId, roundCurrencyFn, currencyDigitsFn) => {
    const uid = String(userId || "");
    const fid = String(friendId || "");
    const byCode = {}; // { [code]: { [groupId]: { net:number, name?:string } } }

    for (const tx of simplifiedTxs || []) {
      const from = String(tx?.from || "");
      const to = String(tx?.to || "");
      if (!from || !to) continue;

      // only the selected pair
      const isPair = (from === uid && to === fid) || (from === fid && to === uid);
      if (!isPair) continue;

      const code = tx?.currency || "INR";
      const gid = String(tx?.groupId || tx?.group?._id || "");
      if (!gid) continue;

      const amt = Number(tx?.amount || 0);
      if (!amt) continue;

      // net sign from *your* perspective: + means they owe you; - means you owe them
      const sign = (to === uid) ? +1 : -1;

      (byCode[code] ||= {});
      (byCode[code][gid] ||= { net: 0, name: tx?.name || tx?.group?.name || "Unnamed Group" });
      byCode[code][gid].net += sign * amt;
    }

    // Convert to final shape with from/to and rounded amount
    const out = {}; // { [code]: { [gid]: { from,to,amount,currency,groupId,name } } }
    for (const [code, groups] of Object.entries(byCode)) {
      const resPerCode = {};
      const minUnit = 1 / (10 ** currencyDigitsFn(code));

      for (const [gid, info] of Object.entries(groups)) {
        const rounded = roundCurrencyFn(info.net, code);
        if (Math.abs(rounded) < minUnit) continue; // drop dust/settled

        const from = rounded < 0 ? uid : fid; // negative -> you owe friend
        const to = rounded < 0 ? fid : uid;

        resPerCode[gid] = {
          from,
          to,
          amount: Math.abs(rounded),
          currency: code,
          groupId: gid,
          name: info.name
        };
      }

      if (Object.keys(resPerCode).length) out[code] = resPerCode;
    }

    return out;
  };

  const collectGroupIdsByCurrency = (simplifiedTxs = [], userId, friendId) => {
    const uid = String(userId || "");
    const fid = String(friendId || "");
    const byCode = {}; // { [code]: Set<groupId> }
    for (const tx of simplifiedTxs || []) {
      const from = String(tx?.from || "");
      const to = String(tx?.to || "");
      const isPair = (from === uid && to === fid) || (from === fid && to === uid);
      if (!isPair) continue;

      const code = tx?.currency || "INR";
      const gid = tx?.group?._id;
      if (!gid) continue;

      (byCode[code] ||= new Set()).add(String(gid));
    }

    // convert Set -> Array
    const out = {};
    for (const [code, set] of Object.entries(byCode)) out[code] = Array.from(set);
    return out; // { INR: ["g1","g2"], AED: ["g3"], ... }
  };

  // compute aggregate group totals by currency (signed from user's perspective)
  const computeGroupAggregateMap = (simplifiedTxs = [], userId, friendId) => {
    const totals = {}; // { [code]: number } (+ you’re owed, - you owe)
    for (const tx of simplifiedTxs || []) {
      const code = tx?.currency || "INR";
      const amt = Number(tx?.amount) || 0;
      const from = String(tx?.from || "");
      const to = String(tx?.to || "");
      const uid = String(userId);
      const fid = String(friendId);

      // only the pair you <-> friend
      const pair = (from === uid && to === fid) || (from === fid && to === uid);
      if (!pair || !amt) continue;

      if (to === uid) totals[code] = (totals[code] || 0) + amt;      // friend -> you
      if (from === uid) totals[code] = (totals[code] || 0) - amt;    // you -> friend
    }
    return totals;
  };

  // builds the net rows with groups and personal component
  const signedForUser = (from, to, amount, userIdStr) => {
    return to === String(userIdStr) ? +Number(amount || 0) : -Number(amount || 0);
  };

  const minUnitFor = (code) => 1 / (10 ** currencyDigits(code));

  const buildNetWithBreakdown = (
    netByCode,                 // your netExpenseBalanceMap (signed, +ve => you’re owed)
    groupsByCur,               // from collectGroupPartiesByCurrency
    userIdStr,
    friendIdStr,
    roundCurrencyFn
  ) => {
    const out = [];
    for (const [code, netSignedRaw] of Object.entries(netByCode || {})) {
      const netSigned = roundCurrencyFn(netSignedRaw, code);
      const minUnit = minUnitFor(code);
      if (Math.abs(netSigned) < minUnit) continue;

      // direction for the *net* row
      const netFrom = netSigned < 0 ? userIdStr : friendIdStr;
      const netTo = netSigned < 0 ? friendIdStr : userIdStr;

      // sum groups (signed from user's perspective)
      const perCodeGroups = groupsByCur?.[code] || {};
      let groupSignedSum = 0;
      for (const g of Object.values(perCodeGroups)) {
        groupSignedSum += signedForUser(String(g.from), String(g.to), Number(g.amount || 0), String(userIdStr));
      }

      // personalSigned = netSigned - sum(groups)
      const personalSigned = roundCurrencyFn(netSigned - groupSignedSum, code);
      const hasPersonal = Math.abs(personalSigned) >= minUnit;

      const personal = hasPersonal
        ? {
            from: personalSigned < 0 ? String(userIdStr) : String(friendIdStr),
            to: personalSigned < 0 ? String(friendIdStr) : String(userIdStr),
            amount: Math.abs(personalSigned),
            currency: code
          }
        : null;

      out.push({
        from: String(netFrom),
        to: String(netTo),
        amount: Math.abs(netSigned),
        currency: code,
        type: "net",
        // detailed groups + quick ids
        groups: perCodeGroups,
        ids: Object.keys(perCodeGroups),
        // personal component inside NET
        personal
      });
    }
    return out;
  };

  const txFromCurrencyMap = (byCode = {}, meId, frId, roundCurrencyFn, currencyDigitsFn, type = "net", idsByCode = null) => {
    const out = [];
    for (const [code, amtRaw] of Object.entries(byCode)) {
      const amt = roundCurrencyFn(amtRaw, code);
      const minUnit = 1 / (10 ** currencyDigitsFn(code));
      if (Math.abs(amt) < minUnit) continue;

      const from = amt < 0 ? meId : frId;
      const to = amt < 0 ? frId : meId;

      out.push({
        from: String(from),
        to: String(to),
        amount: Math.abs(amt),
        currency: code,
        type,
        ids: idsByCode?.[code] || null
      });
    }
    return out;
  };

  const mergeCurrencyMaps = (a = {}, b = {}) => {
    const out = { ...a };
    for (const [code, amt] of Object.entries(b)) {
      out[code] = roundCurrency((out[code] || 0) + (amt || 0), code);
      const minUnit = 1 / (10 ** currencyDigits(code));
      if (Math.abs(out[code]) < minUnit) delete out[code];
    }
    return out;
  };

  const generateSettleAllNet = (netExpenseBalanceMapLocal, meId, frId, simplifiedTxsLocal) => {
    const groupsByCur = collectGroupPartiesByCurrency(
      simplifiedTxsLocal, meId, frId, roundCurrency, currencyDigits
    );

    return buildNetWithBreakdown(
      netExpenseBalanceMapLocal,
      groupsByCur,
      meId,
      frId,
      roundCurrency
    );
  };

  const generateSettleGroupAggregate = (simplifiedTxsLocal, meId, frId) => {
    const totalsByCode = computeGroupAggregateMap(simplifiedTxsLocal, meId, frId);
    const groupsByCur = collectGroupPartiesByCurrency(
      simplifiedTxsLocal, meId, frId, roundCurrency, currencyDigits
    );
    // attach groupsByCur as ids map
    return txFromCurrencyMap(
      totalsByCode, meId, frId, roundCurrency, currencyDigits, "all_groups", groupsByCur
    );
  };

  const generateSettlePersonal = (personalExpenseMapLocal, meId, frId) => {
    return txFromCurrencyMap(
      personalExpenseMapLocal, meId, frId, roundCurrency, currencyDigits, "all_personal"
    );
  };

  const listPerGroupSimplifiedWithFriend = (simplifiedTxsLocal, meId, frId) => {
    const uid = String(meId || "");
    const fid = String(frId || "");
    const out = [];

    for (const tx of simplifiedTxsLocal || []) {
      const from = String(tx?.from || "");
      const to = String(tx?.to || "");
      if (!from || !to) continue;

      const isPair =
        (from === uid && to === fid) ||
        (from === fid && to === uid);
      if (!isPair) continue;

      out.push({
        from,
        to,
        amount: Number(tx?.amount) || 0,
        currency: tx?.currency || "INR",
        type: 'group',
        groupId: tx?.group?._id,
        name: tx?.group?.name || "Unnamed Group"
      });
    }

    return out;
  };

  /* ---------------- end group helpers ---------------- */

  const fetchLoansForFriend = useCallback(async (meId, frId) => {
    setLoanLoading(true);
    try {
      const res = await getLoans(userToken, { role: "all" });
      const all = res?.loans || res || [];
      const friendLoans = all.filter((l) =>
        (l.lenderId?._id === meId && l.borrowerId?._id === frId) ||
        (l.lenderId?._id === frId && l.borrowerId?._id === meId)
      );
      setLoans(friendLoans.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
      setNetLoanBalanceMap(computeNetLoanBalanceByCurrency(frId, meId, friendLoans));
    } catch (e) {
      console.error("Loans fetch error:", e);
    } finally {
      setLoanLoading(false);
    }
  }, [userToken]);

  const fetchData = useCallback(async () => {
    try {
      const data = await getFriendDetails(id, userToken);
      setFriend(data.friend);
      setUserId(data.id);

      const expenseData = await getFriendExpense(id, userToken);

      // support both shapes: { expenses: [...], simplifiedTransactions: [...] } OR direct array
      const exps = expenseData?.expenses ?? (Array.isArray(expenseData) ? expenseData : []);
      const simplified = expenseData?.simplifiedTransactions ?? (expenseData?.simplified || []);

      setExpenses(exps);
      setSimplifiedTransactions(simplified);

      const personal = calculateFriendBalanceByCurrency(exps, data.id, data.friend._id);
      setPersonalExpenseBalanceMap(personal);

      setNetExpenseBalanceMap(mergeCurrencyMaps(personal, computeGroupAggregateMap(simplified, data.id, data.friend._id)));

      await fetchLoansForFriend(data.id, data.friend._id);
    } catch (e) {
      console.error("Friend details fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [id, userToken, fetchLoansForFriend]);

  useEffect(() => { if (id) fetchData(); }, [id, fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await fetchData(); } finally { setRefreshing(false); }
  }, [fetchData]);

  // actions
  const handlePaymentConfirm = (amt) => {
    const amount = Number(amt || 0);
    if (amount <= 0 || !friend?._id || !userId) return;
    setShowSettle(true);
  };

  const handleSettleSubmit = async (currency) => {
    try {
      // flatten net map to simple txs and call settleExpense per-currency (same as before)
      const tx = generateSimplifiedTransactionsByCurrency(netExpenseBalanceMap, userId, friend._id);
      for (const t of tx) {
        await settleExpense(
          {
            payerId: t.from,
            receiverId: t.to,
            amount: t.amount,
            description: "Settlement",
            currency: t.currency,
          },
          userToken
        );
      }
      setShowSettle(false);
      await fetchData();
    } catch (e) {
      console.error("Settle error:", e);
    }
  };

  const expenseList = useMemo(() => {
    return (expenses || []).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [expenses]);

  // settlementLists computed (NET rows with breakdown, personal, group aggregates, per-group simplified)
  const settlementLists = useMemo(() => {
    if (!userId || !friend?._id) return [];

    const net = generateSettleAllNet(netExpenseBalanceMap, userId, friend._id, simplifiedTransactions);
    const personal = generateSettlePersonal(personalExpenseBalanceMap, userId, friend._id);
    const allGrp = generateSettleGroupAggregate(simplifiedTransactions, userId, friend._id);
    const perGrp = listPerGroupSimplifiedWithFriend(simplifiedTransactions, userId, friend._id);

    // return combined list; some items are "net" objects, some are tx-like objects (all_personal/all_groups), some group items
    return [...net, ...personal, ...allGrp, ...perGrp];
  }, [userId, friend?._id, netExpenseBalanceMap, personalExpenseBalanceMap, simplifiedTransactions]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StatusBar style={styles.statusBar} />
      <Header showBack title={friend?.name} button={<TouchableOpacity
        onPress={() => router.push({ pathname: "/friends/settings", params: { id: friend?._id } })}
      >
        <Feather name="settings" size={20} color={styles.colors.textFallback} />
      </TouchableOpacity>} />

      {activeTab === "expenses" ? (
        <FlatList
          data={loading ? [] : expenseList}
          keyExtractor={(it) => String(it._id)}
          renderItem={({ item }) =>
            <ExpenseRow
              expense={item}
              userId={userId}
              onPress={(exp) => console.log("Clicked", exp._id)}
            />
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={styles.colors.primaryFallback} />}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.headerRow}>
              <View style={styles.balanceColumn}>
                <Text style={styles.sectionLabel}>Net Expenses Balance</Text>
                {Object.keys(netExpenseBalanceMap || {}).length > 0 ? (
                  <View style={styles.balanceList}>
                    {Object.entries(netExpenseBalanceMap).map(([code, amt]) => {
                      const sym = getSymbol(code);
                      const d = currencyDigits(code);
                      const cls = amt > 0 ? styles.pos : amt < 0 ? styles.neg : styles.neutral;
                      return (
                        <Text key={code} style={[styles.balanceLine, cls]}>
                          {amt > 0 ? "you are owed" : amt < 0 ? "you owe" : "All Settled"} {sym} {Math.abs(amt).toFixed(d)}
                        </Text>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={[styles.balanceLine, styles.neutral]}>All Settled</Text>
                )}
              </View>

              {Object.values(netExpenseBalanceMap || {}).some((v) => Math.abs(v) > 0) && (
                <View style={styles.actionsColumn}>
                  <LineButton label="Settle" onPress={() => setShowSettle(true)} styles={styles} />
                </View>
              )}
            </View>
          }
          ListEmptyComponent={
            loading ? (
              <View style={styles.emptyWrap}><Feather name="loader" size={22} color={styles.colors.textFallback} /></View>
            ) : (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyTitle}>No Expenses Yet</Text>
                <Text style={styles.emptyText}>Add your first shared expense to see it here.</Text>
                <LineButton
                  label="Add Expense"
                  onPress={() => router.push({ pathname: "/newExpense", params: { friendId: id } })}
                  styles={styles}
                />
              </View>
            )
          }
        />
      ) : (
        <FlatList
          data={loanLoading ? [] : loans}
          keyExtractor={(it) => String(it._id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={styles.colors.primaryFallback} />}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.loanHeader}>
              <Text style={styles.sectionLabel}>Net Loan Balance</Text>
              {Object.keys(netLoanBalanceMap || {}).length > 0 ? (
                <View style={styles.balanceList}>
                  {Object.entries(netLoanBalanceMap).map(([code, amt]) => {
                    const sym = getSymbol(code);
                    const d = currencyDigits(code);
                    const cls = amt > 0 ? styles.pos : amt < 0 ? styles.neg : styles.neutral;
                    return (
                      <Text key={code} style={[styles.balanceLine, cls]}>
                        {amt > 0 ? "they owe you" : amt < 0 ? "you owe them" : "All Settled"} {sym} {Math.abs(amt).toFixed(d)}
                      </Text>
                    );
                  })}
                </View>
              ) : (
                <Text style={[styles.balanceLine, styles.neutral]}>All Settled</Text>
              )}
            </View>
          }
          renderItem={({ item: loan }) => {
            const loanCode = loan.currency || loan.principalCurrency || "INR";
            const sym = getSymbol(loanCode);
            const d = currencyDigits(loanCode);
            const { code: outCode, amount: outstanding } = getOutstandingByCurrency(loan);
            const outSym = getSymbol(outCode);
            const outD = currencyDigits(outCode);
            const youLender = loan.lenderId?._id === userId;

            return (
              <View style={[styles.cardRow, outstanding > 0 && { borderColor: styles.colors.ctaFallback }]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.title} numberOfLines={1}>
                    {youLender ? "You lent" : "You borrowed"} {sym} {Number(loan.principal || 0).toFixed(d)} {" "}
                    {youLender ? "to" : "from"} {friend?.name}
                  </Text>
                  <Text style={styles.sub} numberOfLines={2}>
                    Outstanding: {outSym} {Number(outstanding || 0).toFixed(outD)} • Status: {loan.status}
                  </Text>
                  {loan.description ? (
                    <Text style={styles.note} numberOfLines={2}>
                      {loan.description}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            loanLoading ? (
              <View style={styles.emptyWrap}><Feather name="loader" size={22} color={styles.colors.textFallback} /></View>
            ) : (
              <View style={styles.emptyWrap} />
            )
          }
        />
      )}

      {!loading && activeTab === "expenses" && expenses.length > 0 && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => router.push({ pathname: "/newExpense", params: { friendId: id } })}
        >
          <Feather name="plus" size={22} color="#121212" />
          <Text style={styles.fabText}>Add Expense</Text>
        </TouchableOpacity>
      )}

      <PaymentUPIModal
        visible={showUPIModal}
        onClose={() => setShowUPIModal(false)}
        friendName={friend?.name}
        friendUpi={friend?.upiId}
        onConfirm={handlePaymentConfirm}
        styles={styles}
      />

      <SettleSheet
        visible={showSettle}
        onClose={() => setShowSettle(false)}
        onSubmit={handleSettleSubmit}
        // primary TXs used for submit (flat net map -> tx)
        tx={generateSimplifiedTransactionsByCurrency(netExpenseBalanceMap, userId, friend?._id)}
        // richer breakdown used for UI
        settlementLists={settlementLists}
        currencyOptions={currencyOptions}
        defaultCurrency={defaultCurrency}
        styles={styles}
      />
    </SafeAreaView>
  );
}

/* ---------------- theme-aware styles factory ---------------- */
const createStyles = (theme = {}) => {
  // define a minimal fallback palette (matches your previous dark values)
  const colors = {
    background: theme?.colors?.background ?? "#121212",
    card: theme?.colors?.card ?? "#1f1f1f",
    cardAlt: theme?.colors?.cardAlt ?? "#2A2A2A",
    border: theme?.colors?.border ?? "#333",
    text: theme?.colors?.text ?? "#EBF1D5",
    muted: theme?.colors?.muted ?? "#888",
    primary: theme?.colors?.primary ?? "#60DFC9",
    cta: theme?.colors?.cta ?? "#00C49F",
    danger: theme?.colors?.danger ?? "#ef4444",
    positive: theme?.colors?.positive ?? "#60DFC9",
    negative: theme?.colors?.negative ?? "#EA4335",
  };

  // expose a few convenient fallbacks to use inline in components above
  const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },

    statusBar: theme?.statusBarStyle === "dark-content" ? "dark" : "light",

    listContent: { paddingHorizontal: 16, paddingBottom: 24, paddingTop: 8, flexGrow: 1 },

    headerRow: { flex: 1, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 0, paddingBottom: 12 },
    balanceColumn: { flexDirection: "column", flex: 1 },
    actionsColumn: { justifyContent: "center" },

    sectionLabel: { color: colors.muted, fontSize: 12, textTransform: "uppercase" },
    balanceList: { gap: 4, marginTop: 4 },
    balanceLine: { fontSize: 18, fontWeight: "700" },

    pos: { color: colors.positive },
    neg: { color: colors.negative },
    neutral: { color: colors.text },

    cardRow: {
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 8,
    },
    title: { color: colors.text, fontSize: 15, fontWeight: "700" },
    sub: { color: "#aaa", fontSize: 12, marginTop: 2 },
    note: { color: "#a0a0a0", fontStyle: "italic" },

    emptyWrap: {
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      marginHorizontal: 16,
      marginTop: 24,
      alignItems: "center",
    },
    emptyTitle: { color: colors.text, fontSize: 18, fontWeight: "700" },
    emptyText: { color: colors.muted, textAlign: "center", marginVertical: 6 },

    ctaBtn: { backgroundColor: colors.cta, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, alignSelf: "center" },
    ctaBtnText: { color: "#121212", fontWeight: "700" },

    fab: {
      position: "absolute",
      right: 16,
      bottom: 24,
      backgroundColor: colors.cta,
      borderRadius: 999,
      paddingHorizontal: 16,
      paddingVertical: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      shadowColor: "#000",
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 4,
    },
    fabText: { color: "#121212", fontWeight: "700" },

    // modal
    modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 16 },
    modalCard: { backgroundColor: colors.card, borderRadius: 12, padding: 16, width: "100%" },
    modalTitle: { color: colors.text, fontSize: 18, fontWeight: "700", marginBottom: 8 },
    modalMeta: { color: "#a0a0a0", marginBottom: 8 },
    modalActionsRight: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 12 },

    modalBtnSecondary: { backgroundColor: "#2a2a2a", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
    modalBtnPrimary: { backgroundColor: colors.cta, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
    modalBtnText: { color: colors.text, fontWeight: "600" },
    modalPrimaryActionText: { color: "#121212", fontWeight: "700" },

    input: {
      backgroundColor: colors.card,
      color: colors.text,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: "#55554f",
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
    },

    chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
    chip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: "#2a2a2a" },
    chipActive: { backgroundColor: colors.text, borderColor: colors.text },
    chipText: { color: colors.text, fontSize: 12 },
    chipTextActive: { color: "#121212", fontWeight: "700" },

    summaryText: { color: colors.text, fontWeight: "700", marginBottom: 8 },

    // small helpers so child components can access palette
    colors: {
      backgroundFallback: colors.background,
      cardFallback: colors.card,
      cardAltFallback: colors.cardAlt,
      borderFallback: colors.border,
      textFallback: colors.text,
      mutedFallback: colors.muted,
      primaryFallback: colors.primary,
      ctaFallback: colors.cta,
    },

  });

  // attach the palette items onto the returned style object (convenience)
  s.colors = s.colors;

  return s;
};
