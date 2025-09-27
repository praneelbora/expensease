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
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import Header from "~/header";
import ExpenseRow from "~/expenseRow";
import Settings from "@/accIcons/settings.svg";
import Plus from "@/accIcons/plus.svg";
// ===== adjust these to your project =====
import { useAuth } from "context/AuthContext";
import { getFriendDetails } from "services/FriendService";
import { getFriendExpense, settleExpense } from "services/ExpenseService";
import { getLoans } from "services/LoanService";
import { getSymbol, allCurrencies } from "utils/currencies";

// The bottom-sheet component you asked to wire
import BtmShtSettle from "~/btmShtSettle";

// Theming hook — uses your app ThemeProvider if available.
import { useTheme } from "context/ThemeProvider";

/* ---------------- DEBUG FLAG + helpers ---------------- */
// Toggle this to false to silence all balance logs
const DEBUG_BALANCES = false;

const _dump = (label, obj) => {
    if (!DEBUG_BALANCES) return;
    try {
        // try compact JSON first
        console.log(`[DBG] ${label}:`, JSON.stringify(obj));
    } catch (e) {
        try {
            console.log(`[DBG] ${label}:`, obj);
        } catch (e2) {
            console.log(`[DBG] ${label}: [unserializable]`);
        }
    }
};

const _group = (label) => {
    if (!DEBUG_BALANCES) return;
    try {
        console.groupCollapsed ? console.groupCollapsed(`[DBG] ${label}`) : console.log(`[DBG] ${label}`);
    } catch (e) {
        console.log(`[DBG] ${label}`);
    }
};
const _groupEnd = () => {
    if (!DEBUG_BALANCES) return;
    try {
        console.groupEnd && console.groupEnd();
    } catch (e) {
        // noop
    }
};

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
    const [simplifiedTransactions, setSimplifiedTransactions] = useState([]);
    const [loans, setLoans] = useState([]);
    const [loanLoading, setLoanLoading] = useState(true);

    // balances
    const [netExpenseBalanceMap, setNetExpenseBalanceMap] = useState({});
    const [personalExpenseBalanceMap, setPersonalExpenseBalanceMap] = useState({}); // NEW
    const [netLoanBalanceMap, setNetLoanBalanceMap] = useState({});

    // modals / sheets
    const [showSettle, setShowSettle] = useState(false);
    const settleRef = useRef();

    const currencyOptions = useMemo(() => {
        const base = new Set([defaultCurrency, ...(preferredCurrencies || [])]);
        return allCurrencies
            .filter((c) => base.has(c.code))
            .concat(allCurrencies.filter((c) => !base.has(c.code)))
            .map((c) => ({ value: c.code, label: `${c.name} (${c.symbol})`, code: c.code }));
    }, [defaultCurrency, preferredCurrencies]);

    // helpers (currency rounding etc)
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

    /* ---------------- personal & group calculation functions (with logs) ---------------- */
    const calculateFriendBalanceByCurrency = (exps, meId, frId) => {
        if (DEBUG_BALANCES) {
            _group(`calculateFriendBalanceByCurrency: me=${meId} friend=${frId}`);
            _dump("input.exps.length", Array.isArray(exps) ? exps.length : (exps?.expenses?.length ?? 0));
        }
        const totals = {};
        const meIdStr = String(meId ?? "");
        const frIdStr = String(frId ?? "");
        const list = Array.isArray(exps) ? exps : (exps && Array.isArray(exps.expenses) ? exps.expenses : []);

        for (const exp of list) {
            const splits = Array.isArray(exp?.splits) ? exp.splits : [];
            let youPay = false, frPay = false, youOwe = false, frOwe = false;
            for (const s of splits) {
                const rawSid = s?.friendId?._id ?? s?.friendId ?? "";
                const sid = rawSid !== undefined && rawSid !== null ? String(rawSid) : "";
                if (sid === meIdStr) { if (s?.paying) youPay = true; if (s?.owing) youOwe = true; }
                if (sid === frIdStr) { if (s?.paying) frPay = true; if (s?.owing) frOwe = true; }
            }
            const oneIsPaying = youPay || frPay;
            const otherIsOwing = (youPay && frOwe) || (frPay && youOwe);
            if (!oneIsPaying || !otherIsOwing) {
                if (DEBUG_BALANCES) {
                    _dump(`skip expense ${exp?._id || exp?.id || "(no-id)"} oneIsPaying=${oneIsPaying} otherIsOwing=${otherIsOwing}`, {});
                }
                continue;
            }

            const code = exp?.currency || "INR";
            if (DEBUG_BALANCES) _dump(`process expense ${exp?._id || exp?.id || "(no-id)"} currency=${code}`, {});
            for (const s of splits) {
                const rawSid = s?.friendId?._id ?? s?.friendId ?? "";
                const sid = rawSid !== undefined && rawSid !== null ? String(rawSid) : "";
                if (sid !== frIdStr) continue;
                const add = s?.owing ? Number(s?.oweAmount) || 0 : 0;
                const sub = s?.paying ? Number(s?.payAmount) || 0 : 0;
                if (DEBUG_BALANCES && (add !== 0 || sub !== 0)) {
                    _dump(`  split for friend ${sid}: add=${add} sub=${sub} (owing?=${!!s?.owing} paying?=${!!s?.paying})`, {});
                }
                totals[code] = roundCurrency((totals[code] || 0) + add - sub, code);
            }
        }
        for (const c of Object.keys(totals)) {
            const minUnit = 1 / (10 ** currencyDigits(c));
            if (Math.abs(totals[c]) < minUnit) {
                if (DEBUG_BALANCES) _dump(`dropping tiny total for ${c}: ${totals[c]}`, {});
                delete totals[c];
            }
        }
        if (DEBUG_BALANCES) {
            _dump("calculateFriendBalanceByCurrency result", totals);
            _groupEnd();
        }
        return totals;
    };

    const generateSimplifiedTransactionsByCurrency = (netByCode, meId, frId) => {
        if (DEBUG_BALANCES) {
            _group("generateSimplifiedTransactionsByCurrency");
            _dump("input.netByCode", netByCode);
        }
        const tx = [];
        for (const [code, amt] of Object.entries(netByCode || {})) {
            if (!amt) continue;
            const from = amt < 0 ? meId : frId;
            const to = amt < 0 ? frId : meId;
            tx.push({ from, to, amount: Math.abs(amt), currency: code });
            if (DEBUG_BALANCES) _dump(`tx ${code}`, { from, to, amount: Math.abs(amt) });
        }
        if (DEBUG_BALANCES) {
            _dump("generated tx", tx);
            _groupEnd();
        }
        return tx;
    };

    /* ---------- group helpers (with logs) ---------- */
    const collectGroupPartiesByCurrency = (simplifiedTxs = [], userId, friendId, roundCurrencyFn, currencyDigitsFn) => {
        if (DEBUG_BALANCES) {
            _group("collectGroupPartiesByCurrency");
            _dump("input.simplifiedTxs.length", simplifiedTxs?.length ?? 0);
            _dump("userId, friendId", { userId, friendId });
        }
        const uid = String(userId || "");
        const fid = String(friendId || "");
        const byCode = {};
        for (const tx of simplifiedTxs || []) {
            const from = String(tx?.from || "");
            const to = String(tx?.to || "");
            if (!from || !to) continue;
            const isPair = (from === uid && to === fid) || (from === fid && to === uid);
            if (!isPair) continue;
            const code = tx?.currency || "INR";
            const gid = String(tx?.groupId || tx?.group?._id || "");
            if (!gid) continue;
            const amt = Number(tx?.amount || 0);
            if (!amt) continue;
            const sign = (to === uid) ? +1 : -1;
            (byCode[code] ||= {});
            (byCode[code][gid] ||= { net: 0, name: tx?.name || tx?.group?.name || "Unnamed Group" });
            byCode[code][gid].net += sign * amt;
            if (DEBUG_BALANCES) {
                _dump(`group ${gid} (${code}) updated net`, byCode[code][gid]);
            }
        }
        const out = {};
        for (const [code, groups] of Object.entries(byCode)) {
            const resPerCode = {};
            const minUnit = 1 / (10 ** currencyDigitsFn(code));
            for (const [gid, info] of Object.entries(groups)) {
                const rounded = roundCurrencyFn(info.net, code);
                if (Math.abs(rounded) < minUnit) continue;
                const from = rounded < 0 ? uid : fid;
                const to = rounded < 0 ? fid : uid;
                resPerCode[gid] = {
                    from,
                    to,
                    amount: Math.abs(rounded),
                    currency: code,
                    groupId: gid,
                    name: info?.name
                };
            }
            if (Object.keys(resPerCode).length) out[code] = resPerCode;
        }
        if (DEBUG_BALANCES) {
            _dump("collectGroupPartiesByCurrency result", out);
            _groupEnd();
        }
        return out;
    };



    const computeGroupAggregateMap = (simplifiedTxs = [], userId, friendId) => {
        if (DEBUG_BALANCES) {
            _group("computeGroupAggregateMap");
            _dump("simplifiedTxs.length", simplifiedTxs?.length ?? 0);
            _dump("userId, friendId", { userId, friendId });
        }
        const totals = {};
        for (const tx of simplifiedTxs || []) {
            const code = tx?.currency || "INR";
            const amt = Number(tx?.amount) || 0;
            const from = String(tx?.from || "");
            const to = String(tx?.to || "");
            const uid = String(userId);
            const fid = String(friendId);
            const pair = (from === uid && to === fid) || (from === fid && to === uid);
            if (!pair || !amt) continue;
            if (to === uid) totals[code] = (totals[code] || 0) + amt;
            if (from === uid) totals[code] = (totals[code] || 0) - amt;
            if (DEBUG_BALANCES) _dump(`processed tx for ${code}`, { from, to, amt, running: totals[code] });
        }
        if (DEBUG_BALANCES) {
            _dump("computeGroupAggregateMap result", totals);
            _groupEnd();
        }
        return totals;
    };

    const signedForUser = (from, to, amount, userIdStr) => {
        return to === String(userIdStr) ? +Number(amount || 0) : -Number(amount || 0);
    };

    const minUnitFor = (code) => 1 / (10 ** currencyDigits(code));

    const buildNetWithBreakdown = (
        netByCode, groupsByCur, userIdStr, friendIdStr, roundCurrencyFn
    ) => {
        if (DEBUG_BALANCES) {
            _group("buildNetWithBreakdown");
            _dump("netByCode", netByCode);
            _dump("groupsByCur", groupsByCur);
            _dump("userIdStr, friendIdStr", { userIdStr, friendIdStr });
        }
        const out = [];
        for (const [code, netSignedRaw] of Object.entries(netByCode || {})) {
            const netSigned = roundCurrencyFn(netSignedRaw, code);
            const minUnit = minUnitFor(code);
            if (Math.abs(netSigned) < minUnit) {
                if (DEBUG_BALANCES) _dump(`skip tiny net for ${code}`, netSigned);
                continue;
            }
            const netFrom = netSigned < 0 ? userIdStr : friendIdStr;
            const netTo = netSigned < 0 ? friendIdStr : userIdStr;
            const perCodeGroups = groupsByCur?.[code] || {};
            let groupSignedSum = 0;
            for (const g of Object.values(perCodeGroups)) {
                groupSignedSum += signedForUser(String(g.from), String(g.to), Number(g.amount || 0), String(userIdStr));
            }
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
            if (DEBUG_BALANCES) {
                _dump(`code ${code}`, { netSigned, groupSignedSum, personalSigned, personal });
            }
            out.push({
                from: String(netFrom),
                to: String(netTo),
                amount: Math.abs(netSigned),
                currency: code,
                type: "net",
                groups: perCodeGroups,
                ids: Object.keys(perCodeGroups),
                personal
            });
        }
        if (DEBUG_BALANCES) {
            _dump("buildNetWithBreakdown result", out);
            _groupEnd();
        }
        return out;
    };

    const txFromCurrencyMap = (byCode = {}, meId, frId, roundCurrencyFn, currencyDigitsFn, type = "net", idsByCode = null) => {
        if (DEBUG_BALANCES) {
            _group(`txFromCurrencyMap:${type}`);
            _dump("byCode", byCode);
        }
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
        if (DEBUG_BALANCES) {
            _dump(`txFromCurrencyMap result (${type})`, out);
            _groupEnd();
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
        if (DEBUG_BALANCES) {
            _group("generateSettleAllNet");
            _dump("netExpenseBalanceMapLocal", netExpenseBalanceMapLocal);
            _dump("groupsByCur", groupsByCur);
        }
        const res = buildNetWithBreakdown(
            netExpenseBalanceMapLocal,
            groupsByCur,
            meId,
            frId,
            roundCurrency
        );
        if (DEBUG_BALANCES) {
            _dump("generateSettleAllNet result", res);
            _groupEnd();
        }
        return res;
    };

    const generateSettleGroupAggregate = (simplifiedTxsLocal, meId, frId) => {
        const totalsByCode = computeGroupAggregateMap(simplifiedTxsLocal, meId, frId);
        const groupsByCur = collectGroupPartiesByCurrency(
            simplifiedTxsLocal, meId, frId, roundCurrency, currencyDigits
        );
        if (DEBUG_BALANCES) {
            _dump("generateSettleGroupAggregate - totalsByCode", totalsByCode);
            _dump("generateSettleGroupAggregate - groupsByCur", groupsByCur);
        }
        return txFromCurrencyMap(
            totalsByCode, meId, frId, roundCurrency, currencyDigits, "all_groups", groupsByCur
        );
    };

    const generateSettlePersonal = (personalExpenseMapLocal, meId, frId) => {
        if (DEBUG_BALANCES) {
            _dump("generateSettlePersonal input", personalExpenseMapLocal);
        }
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
        if (DEBUG_BALANCES) _dump("listPerGroupSimplifiedWithFriend", out);
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
            if (DEBUG_BALANCES) {
                _dump("fetchLoansForFriend - total loans fetched", all.length);
                _dump("fetchLoansForFriend - friendLoans", friendLoans.length);
            }
            setLoans(friendLoans.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
            const netLoans = computeNetLoanBalanceByCurrency(frId, meId, friendLoans);
            setNetLoanBalanceMap(netLoans);
            if (DEBUG_BALANCES) _dump("netLoanBalanceMap", netLoans);
        } catch (e) {
            console.error("Loans fetch error:", e);
        } finally {
            setLoanLoading(false);
        }
    }, [userToken]);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const data = await getFriendDetails(id, userToken);
            setFriend(data.friend);
            setUserId(data.id);

            const expenseData = await getFriendExpense(id, userToken);
            const exps = expenseData?.expenses ?? (Array.isArray(expenseData) ? expenseData : []);
            const simplified = expenseData?.simplifiedTransactions ?? (expenseData?.simplified || []);

            setExpenses(exps);
            setSimplifiedTransactions(simplified);

            if (DEBUG_BALANCES) {
                _group("fetchData");
                _dump("friendDetails", { friend: data.friend, userId: data.id });
                _dump("expenses.length", exps?.length ?? 0);
                _dump("simplifiedTransactions.length", simplified?.length ?? 0);
            }

            const personal = calculateFriendBalanceByCurrency(exps, data.id, data.friend?._id);
            setPersonalExpenseBalanceMap(personal);
            if (DEBUG_BALANCES) _dump("personalExpenseBalanceMap", personal);

            const groupAgg = computeGroupAggregateMap(simplified, data.id, data.friend?._id);
            if (DEBUG_BALANCES) _dump("groupAgg", groupAgg);

            const merged = mergeCurrencyMaps(personal, groupAgg);
            setNetExpenseBalanceMap(merged);
            if (DEBUG_BALANCES) {
                _dump("netExpenseBalanceMap (merged)", merged);
                _groupEnd();
            }

            await fetchLoansForFriend(data.id, data.friend?._id);
        } catch (e) {
            console.error("Friend details fetch error:", e);
        } finally {
            setLoading(false);
        }
    }, [id, userToken, fetchLoansForFriend]);

    useFocusEffect(
        React.useCallback(() => {
            if (id) {
                fetchData();
            }
        }, [id])
    );


    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        try { await fetchData(); } finally { setRefreshing(false); }
    }, [fetchData]);

    // actions
    const handlePaymentConfirm = (amt) => {
        const amount = Number(amt || 0);
        if (amount <= 0 || !friend?._id || !userId) return;
        settleRef?.current?.present?.();
    };

    // NEW: Accept payload from BtmShtSettle: { payerId, receiverId, amount, description, currency, meta }
    // inside FriendDetails (already present in your file)
    const handleSettleSubmit = async (payload) => {
        if (!payload) return;
        try {
            const { payerId: payerIdPayload, receiverId: receiverIdPayload, amount: amt, description, currency, meta, groupId } = payload;

            if (!payerIdPayload || !receiverIdPayload || !(Number(amt) > 0)) return;

            if (DEBUG_BALANCES) _dump("handleSettleSubmit payload", payload);

            const response = await settleExpense(
                {
                    payerId: payerIdPayload,
                    receiverId: receiverIdPayload,
                    amount: Number(amt),
                    description: description || "Settlement",
                    currency: currency || defaultCurrency,
                    meta,
                    groupId,
                },
                userToken
            );

            if (DEBUG_BALANCES) _dump("handleSettleSubmit response", response);

            // optional: close bottom sheet (if your sheet supports dismiss)
            settleRef.current?.dismiss?.();
            setShowSettle(false);
            await fetchData();
        } catch (e) {
            console.error("Settle submit error:", e);
            // optionally show user-facing error: toast/alert
        }
    };


    // Settle All: flatten net map and call settleExpense for each currency
    const handleSettleAll = async () => {
        try {
            const tx = generateSimplifiedTransactionsByCurrency(netExpenseBalanceMap, userId, friend?._id);
            if (DEBUG_BALANCES) _dump("handleSettleAll - transactions", tx);
            for (const t of tx) {
                if (DEBUG_BALANCES) _dump("settling tx", t);
                const resp = await settleExpense(
                    {
                        payerId: t.from,
                        receiverId: t.to,
                        amount: t.amount,
                        description: "Settle All",
                        currency: t.currency,
                    },
                    userToken
                );
                if (DEBUG_BALANCES) _dump("settleExpense response", resp);
            }
            settleRef.current?.dismiss?.();
            setShowSettle(false);
            await fetchData();
        } catch (e) {
            console.error("Settle all error:", e);
        }
    };

    const expenseList = useMemo(() => {
        let arr = [];
        if (Array.isArray(expenses)) {
            arr = expenses.slice();
        } else if (expenses && Array.isArray(expenses.expenses)) {
            arr = expenses.expenses.slice();
        } else {
            return [];
        }
        return arr.sort((a, b) => (Date.parse(b?.createdAt) || 0) - (Date.parse(a?.createdAt) || 0));
    }, [expenses]);

    // settlementLists computed (NET rows with breakdown, personal, group aggregates, per-group simplified)
    const settlementLists = useMemo(() => {
        if (!userId || !friend?._id) return [];

        const net = generateSettleAllNet(netExpenseBalanceMap, userId, friend?._id, simplifiedTransactions);
        const personal = generateSettlePersonal(personalExpenseBalanceMap, userId, friend?._id);
        const allGrp = generateSettleGroupAggregate(simplifiedTransactions, userId, friend?._id);
        const perGrp = listPerGroupSimplifiedWithFriend(simplifiedTransactions, userId, friend?._id);

        const combined = [...net, ...personal, ...allGrp, ...perGrp];
        if (DEBUG_BALANCES) _dump("settlementLists", combined);
        return combined;
    }, [userId, friend?._id, netExpenseBalanceMap, personalExpenseBalanceMap, simplifiedTransactions]);

    // Build a simple friends list for sheet: include 'You' and the friend
    const friendsForSheet = useMemo(() => {
        const list = [];
        if (userId) list.push({ id: userId, name: user?.name || "You" });
        if (friend?._id) list.push({ id: friend?._id, name: friend?.name || "Friend" });
        return list;
    }, [userId, user?.name, friend]);

    const oweSummary = useMemo(() => {
        const netMap = netExpenseBalanceMap || {};
        const personalMap = personalExpenseBalanceMap || {};
        const groupMap = computeGroupAggregateMap(simplifiedTransactions || [], userId, friend?._id || "");

        const mapToList = (map) => {
            return Object.entries(map || {}).map(([code, amt]) => {
                const rounded = roundCurrency(amt, code);
                return { code, amount: rounded, signed: amt };
            }).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
        };

        const joinCurrencyList = (arr) => {
            // arr: [{code, amount, signed}, ...] -> returns { oweLine, owedLine } strings (or null)
            const owes = [];
            const owed = [];
            for (const it of arr || []) {
                if (!it || !it.code) continue;
                const d = currencyDigits(it.code);
                const formatted = `${getSymbol(it.code)} ${Math.abs(it.amount).toFixed(d)}`; // "INR 10.00"
                if (it.signed < 0) owes.push(formatted);
                else if (it.signed > 0) owed.push(formatted);
            }
            return {
                oweLine: owes.length ? `you owe ${owes.join(" + ")}` : null,
                owedLine: owed.length ? `you are owed ${owed.join(" + ")}` : null,
            };
        };

        const netList = mapToList(netMap);
        const personalList = mapToList(personalMap);
        const groupList = mapToList(groupMap);

        const result = {
            netList,
            personalList,
            groupList,
            netLines: joinCurrencyList(netList),
            personalLines: joinCurrencyList(personalList),
            groupLines: joinCurrencyList(groupList),
        };

        if (DEBUG_BALANCES) _dump("oweSummary", result);
        return result;
    }, [netExpenseBalanceMap, personalExpenseBalanceMap, simplifiedTransactions, userId, friend?._id]);

    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            <StatusBar style={styles.statusBar} />
            <Header showBack title={friend?.name} button={<TouchableOpacity
                onPress={() => router.push({ pathname: "/friends/settings", params: { id: friend?._id } })}
            >
                <Settings width={20} height={20} color={styles.colors.textFallback} />
            </TouchableOpacity>} />

            {activeTab === "expenses" ? (
                <FlatList
                    data={loading ? [] : expenseList}
                    keyExtractor={(it) => String(it._id)}
                    renderItem={({ item }) =>
                        <ExpenseRow
                            expense={item}
                            userId={userId}
                            update={fetchData}
                        />
                    }
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={styles.colors.primaryFallback} />}
                    contentContainerStyle={styles.listContent}
                    ListHeaderComponent={
                        <View style={styles.headerRow}>
                            <View style={{ flex: 1 }}>
                                {/* NET (dominant / larger) */}
                                {oweSummary.netLines && (oweSummary.netLines.oweLine || oweSummary.netLines.owedLine) ? (
                                    <View style={{ marginBottom: 8 }}>
                                        {oweSummary.netLines.oweLine ? (
                                            <Text style={[styles.balanceLine, styles.neg]}>{oweSummary.netLines.oweLine}</Text>
                                        ) : null}
                                        {oweSummary.netLines.owedLine ? (
                                            <Text style={[styles.balanceLine, styles.pos]}>{oweSummary.netLines.owedLine}</Text>
                                        ) : null}
                                    </View>
                                ) : null}

                                {/* PERSONAL (single-line, smaller) */}
                                {/* {(oweSummary.personalLines?.oweLine || oweSummary.personalLines?.owedLine) ? (
                                    <View style={{ marginBottom: 6 }}>
                                        <Text style={[styles.summaryText, styles.smallSectionTitle]}>PERSONAL SETTLEMENTS</Text>
                                        {oweSummary.personalLines.oweLine ? (
                                            <Text style={[styles.smallInfo, styles.neg]}>{oweSummary.personalLines.oweLine}</Text>
                                        ) : null}
                                        {oweSummary.personalLines.owedLine ? (
                                            <Text style={[styles.smallInfo, styles.pos]}>{oweSummary.personalLines.owedLine}</Text>
                                        ) : null}
                                    </View>
                                ) : null} */}

                                {/* GROUPS (single-line, smaller) */}
                                {/* {(oweSummary.groupLines?.oweLine || oweSummary.groupLines?.owedLine) ? (
                                    <View style={{ marginBottom: 6 }}>
                                        <Text style={[styles.summaryText, styles.smallSectionTitle]}>GROUPS SETTLEMENTS</Text>
                                        {oweSummary.groupLines.oweLine ? (
                                            <Text style={[styles.smallInfo, styles.neg]}>{oweSummary.groupLines.oweLine}</Text>
                                        ) : null}
                                        {oweSummary.groupLines.owedLine ? (
                                            <Text style={[styles.smallInfo, styles.pos]}>{oweSummary.groupLines.owedLine}</Text>
                                        ) : null}
                                    </View>
                                ) : null} */}
                            </View>
                            {settlementLists.length>0 && <TouchableOpacity style={[styles.outlineBtn2, { marginTop: 4 }]} onPress={() => settleRef.current?.present()}>
                                <Text style={styles.outlineBtnText2}>Settle</Text>
                            </TouchableOpacity>}
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

            {!loading && activeTab === "expenses" && (Array.isArray(expenses) ? expenses.length > 0 : (expenses?.expenses?.length > 0)) && (
                <TouchableOpacity
                    style={styles.fab}
                    onPress={() => router.push({ pathname: "/newExpense", params: { friendId: id } })}
                >
                    <Plus width={22} height={22} color="#121212" />
                    <Text style={styles.fabText}>Add Expense</Text>
                </TouchableOpacity>
            )}

            {/* Bottom-sheet settle wired with real data */}
            <BtmShtSettle
                innerRef={settleRef}
                transactions={settlementLists}
                onSubmit={handleSettleSubmit}
                onSubmitAll={handleSettleAll}
                onClose={() => {
                    setShowSettle(false);
                    settleRef.current?.dismiss?.();
                }}
                update={fetchData}
                userId={userId}
                friends={friendsForSheet}
                currencyOptions={currencyOptions}
                defaultCurrency={defaultCurrency}
            />

        </SafeAreaView>
    );
}

/* ---------------- theme-aware styles factory ---------------- */
const createStyles = (theme = {}) => {
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

    const s = StyleSheet.create({
        safe: { flex: 1, backgroundColor: colors.background },

        statusBar: theme?.statusBarStyle === "dark-content" ? "dark" : "light",

        listContent: { paddingHorizontal: 16, paddingBottom: 24, paddingTop: 8, flexGrow: 1 },

        headerRow: { flex: 1, flexDirection: "column", justifyContent: "space-between", paddingHorizontal: 0, paddingBottom: 12 },
        balanceColumn: { flexDirection: "column", flex: 1 },
        actionsColumn: { justifyContent: "center" },

        sectionLabel: { color: colors.muted, fontSize: 12, textTransform: "uppercase" },
        balanceList: { marginTop: 4 },
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
        headerText: { color: colors.text, fontSize: 24, fontWeight: "800" },
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

        summaryText: { color: colors.text, fontWeight: "700", marginTop: 0 },
        // small muted info lines for personal / group
        smallInfo: {
            fontSize: 15,
            color: colors.muted,
            fontWeight: "500",
        },
        smallSectionTitle: {
            fontSize: 12,
            color: colors.muted,
            marginTop: 8,
            fontWeight: "700",
        },

        // settle row — full width under the summary block
        settleRow: {
            justifyContent: "flex-end",
            alignItems: "flex-end",
        },
        settleBtnWrap: {
            borderColor: colors.text,
            borderWidth: 1,
            paddingVertical: 6,
            paddingHorizontal: 20,
            borderRadius: 6,
            alignItems: "center",
        },
        settleBtnText: {
            color: colors.text,
            fontWeight: "700",
            fontSize: 15,
        },

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
        outlineBtn2: { borderWidth: 1, borderColor: theme?.colors?.primary ?? "#60DFC9", paddingHorizontal: 20, paddingVertical: 6, borderRadius: 8, backgroundColor: "transparent", alignItems: 'center', textAlign: 'center' },
        outlineBtnText2: { color: theme?.colors?.primary ?? "#60DFC9", fontWeight: "700" },

    });

    s.colors = s.colors;
    return s;
};
