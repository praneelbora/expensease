// app/friends.js  — React Native (Expo Router) / Pure JavaScript
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TextInput,
    TouchableOpacity,
    FlatList,
    RefreshControl,
    Modal,
    Alert,
    Platform,
    Image,
} from "react-native";
import avatars from "@/avatars";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import Header from "~/header";
import SearchBar from "~/searchBar";
import BottomSheetAddFriend from "~/btmShtAddFriend";
import EmptyCTA from "~/cta";
import Plus from "@/accIcons/plus.svg";
// ==== adjust these paths for your app structure ====
import { useAuth } from "context/AuthContext";
import {
    getFriends,
    acceptLinkFriendRequest,
    fetchReceivedRequests,
    acceptFriendRequest,
    rejectFriendRequest,
    sendFriendRequest,
} from "services/FriendService";
import { getAllExpenses } from "services/ExpenseService";
import { getLoans } from "services/LoanService";
import NewExpenseBottomSheet from "~/newExpenseBottomSheet";
import FAB from "~/fab";
// import { logEvent } from "utils/analytics";
import { getAllCurrencyCodes, getSymbol, toCurrencyOptions } from "utils/currencies";
import { useTheme } from "context/ThemeProvider";
// near top of file, after imports
const DEBUG_BALANCES = false; // set to false in production

/* ----------------- small helpers ----------------- */
function currencyDigits(code, locale = "en-IN") {
    try {
        const fmt = new Intl.NumberFormat(locale, { style: "currency", currency: code });
        return fmt.resolvedOptions().maximumFractionDigits ?? 2;
    } catch {
        return 2;
    }
}
function roundCurrency(amount, code, locale = "en-IN") {
    const d = currencyDigits(code, locale);
    const f = 10 ** d;
    return Math.round((Number(amount) + Number.EPSILON) * f) / f;
}
function initials(name = "") {
    const parts = String(name).trim().split(" ").filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * simplifyDebts(totalDebt, members)
 * Greedy algorithm: matches creditors/debtors to produce a flat list of transactions:
 * [{ from, to, amount, currency }]
 *
 * totalDebt: { memberId: { code: net } }  (net > 0 => others owe them; net < 0 => they owe)
 * members: array of member objects with _id
 */
function simplifyDebts(totalDebt = {}, members = []) {
    if (DEBUG_BALANCES) {
        console.groupCollapsed && console.groupCollapsed("simplifyDebts:start");
        console.log("members:", members.map(m => String(m.name)));
        console.log("totalDebt (raw):", JSON.parse(JSON.stringify(totalDebt)));
    }

    const out = [];

    const codes = new Set();
    for (const m of members) {
        const map = totalDebt[m._id] || {};
        Object.keys(map).forEach((c) => codes.add(c));
    }

    for (const code of codes) {
        const creditors = []; // {id, amt>0}
        const debtors = [];   // {id, amt<0}
        for (const m of members) {
            const v = roundCurrency((totalDebt[m._id]?.[code] ?? 0), code);
            if (v > 0) creditors.push({ id: String(m._id), amt: v });
            else if (v < 0) debtors.push({ id: String(m._id), amt: v }); // negative
        }

        if (DEBUG_BALANCES) {
            console.log(`--- currency ${code} ---`);
            console.log("creditors (pre-sort):", JSON.parse(JSON.stringify(creditors)));
            console.log("debtors (pre-sort):", JSON.parse(JSON.stringify(debtors)));
        }

        // Greedy: largest creditors first, largest debtors by abs
        creditors.sort((a, b) => b.amt - a.amt);
        debtors.sort((a, b) => Math.abs(b.amt) - Math.abs(a.amt));

        if (DEBUG_BALANCES) {
            console.log("creditors (sorted):", JSON.parse(JSON.stringify(creditors)));
            console.log("debtors (sorted):", JSON.parse(JSON.stringify(debtors)));
        }

        let ci = 0, di = 0;
        while (ci < creditors.length && di < debtors.length) {
            const c = creditors[ci];
            const d = debtors[di];
            const pay = Math.min(c.amt, -d.amt);
            const amt = roundCurrency(pay, code);

            if (amt > 0) {
                if (DEBUG_BALANCES) {
                    console.log(`Match: debtor ${d.id} pays creditor ${c.id} -> ${amt} ${code}`);
                }
                out.push({ from: d.id, to: c.id, amount: amt, currency: code });
                c.amt = roundCurrency(c.amt - amt, code);
                d.amt = roundCurrency(d.amt + amt, code); // d.amt is negative; moves toward 0
            } else {
                if (DEBUG_BALANCES) {
                    console.log("Zero match amount, breaking.");
                }
                break;
            }

            if (c.amt <= 0) ci++;
            if (d.amt >= 0) di++;
        }

        if (DEBUG_BALANCES) {
            console.log(`--- end currency ${code} ---`);
        }
    }

    if (DEBUG_BALANCES) {
        console.log("simplified output:", JSON.parse(JSON.stringify(out)));
        console.groupEnd && console.groupEnd("simplifyDebts:end");
    }

    return out;
}


/* ----------------- screen ----------------- */
export default function FriendsScreen() {
    const router = useRouter();
    const params = useLocalSearchParams(); // read ?add=... deep link
    const { userToken } = useAuth() || {};
    const { theme } = useTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    // data
    const [friends, setFriends] = useState([]);
    const [expenses, setExpenses] = useState([]);
    const [loans, setLoans] = useState([]);
    const [receivedRequests, setReceivedRequests] = useState([]);
    const [userId, setUserId] = useState(null);

    // derived (group simplification)
    const [simplifiedTransactions, setSimplifiedTransactions] = useState([]); // NEW: flat group txns per group {from,to,amount,currency,group:{_id,name}}
    const newExpenseBottomSheetRef = useRef()
    // ui
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [banner, setBanner] = useState(null); // {type: 'success' | 'error' | 'info', text}
    const [showModal, setShowModal] = useState(false);

    // search + filters
    const [query, setQuery] = useState("");
    const [activeFilter, setActiveFilter] = useState("all"); // all | owes_me | i_owe | settled

    const hasRequestedRef = useRef(false);
    const addFriendRef = useRef(null);

    // ===== fetchers =====
    const pullReceived = useCallback(async () => {
        try {
            const data = await fetchReceivedRequests(userToken);
            setReceivedRequests((data || []).slice(0, 4));
        } catch (err) {
            console.warn("Error fetching received requests:", err?.message || err);
        }
    }, [userToken]);

    const pullFriends = useCallback(async () => {
        try {
            const data = await getFriends(userToken);
            setFriends(Array.isArray(data) ? data : []);
        } catch (e) {
            console.warn("Error loading friends:", e?.message || e);
        } finally {
            setLoading(false);
        }
    }, [userToken]);

    const pullExpenses = useCallback(async () => {
        try {
            const data = await getAllExpenses(userToken);
            // keep both group & non-group expenses; group processing will be derived
            setExpenses((data?.expenses || []).slice());
            setUserId(data?.id || null);
        } catch (e) {
            console.warn("Error loading expenses:", e?.message || e);
        }
    }, [userToken]);

    const pullLoans = useCallback(async () => {
        try {
            const data = await getLoans(userToken);
            setLoans(Array.isArray(data) ? data : []);
        } catch (e) {
            console.warn("Error loading loans:", e?.message || e);
        }
    }, [userToken]);

    const refreshAll = useCallback(async () => {
        setRefreshing(true);
        try {
            await Promise.all([pullReceived(), pullFriends(), pullExpenses(), pullLoans()]);
        } finally {
            setRefreshing(false);
        }
    }, [pullReceived, pullFriends, pullExpenses, pullLoans]);
    useFocusEffect(
        useCallback(() => {
            (async () => {
                await Promise.all([pullReceived(), pullFriends(), pullExpenses(), pullLoans()]);
            })();
            // optional cleanup when screen loses focus
            return () => {
            };
        }, [pullReceived, pullFriends, pullExpenses, pullLoans])
    );


    // handle friend link accept via ?add=
    useEffect(() => {
        const toId = params?.add;
        if (toId && !hasRequestedRef.current) {
            hasRequestedRef.current = true;
            (async () => {
                try {
                    const data = await acceptLinkFriendRequest(String(toId), userToken);
                    if (data?.error || data?.message?.toLowerCase?.().includes("error")) {
                        const errorMsg = data?.message || data?.error || "Failed to send friend request.";
                        setBanner({ type: "error", text: errorMsg });
                        return;
                    }
                    await pullReceived();
                    setBanner({
                        type: "success",
                        text: "Friend request sent. Ask them to accept it before you can add shared expenses.",
                    });
                    setTimeout(() => setBanner(null), 5000);
                } catch (e) {
                    setBanner({ type: "error", text: "Something went wrong. Please try again." });
                }
            })();
        }
    }, [params?.add, userToken, pullReceived]);

    // ===== accept / reject =====
    const handleAccept = async (id) => {
        try {
            await acceptFriendRequest(id, userToken);
            await Promise.all([pullFriends(), pullReceived()]);
            setBanner({ type: "success", text: "Friend request accepted." });
            setTimeout(() => setBanner(null), 3000);
        } catch (e) {
            setBanner({ type: "error", text: "Could not accept the request." });
            setTimeout(() => setBanner(null), 3000);
        }
    };
    const handleReject = async (id) => {
        try {
            await rejectFriendRequest(id, userToken);
            await pullReceived();
            setBanner({ type: "info", text: "Friend request declined." });
            setTimeout(() => setBanner(null), 3000);
        } catch (e) {
            setBanner({ type: "error", text: "Could not decline the request." });
            setTimeout(() => setBanner(null), 3000);
        }
    };

    /* ======================
       Group Simplification
       - compute simplifiedTransactions from group expenses
       ====================== */
    // useEffect(() => {
    //     // Filter group expenses (groupId != null)
    //     const groupExpenses = (expenses || []).filter((exp) => exp?.groupId != null);

    //     if (!groupExpenses.length) {
    //         setSimplifiedTransactions([]);
    //         return;
    //     }

    //     // Helper: calculate per-group member totals (memberId -> { currency: net })
    //     const calculateDebtForGroup = (groupExpList, members) => {
    //         if (DEBUG_BALANCES) {
    //             console.groupCollapsed && console.groupCollapsed("calculateDebtForGroup");
    //             console.log("Group members:", members.map(m => String(m._id)));
    //             console.log("Group expenses count:", groupExpList.length);
    //         }

    //         const totalDebt = {};
    //         members.forEach((m) => { totalDebt[m._id] = {}; });

    //         for (const exp of groupExpList) {
    //             const code = exp?.currency || "INR";
    //             const splits = Array.isArray(exp?.splits) ? exp.splits : [];
    //             if (DEBUG_BALANCES) {
    //                 console.log(`Expense ${exp._id || exp.id || '(no-id)'} — currency: ${code}, splits:`, JSON.parse(JSON.stringify(splits)));
    //             }

    //             for (const split of splits) {
    //                 const memberId = String(split?.friendId?._id || "");
    //                 if (!memberId) continue;
    //                 const curMap = totalDebt[memberId] || (totalDebt[memberId] = {});
    //                 if (curMap[code] == null) curMap[code] = 0;

    //                 const pay = Number(split?.payAmount) || 0;
    //                 const owe = Number(split?.oweAmount) || 0;

    //                 // convention: +ve means is owed; -ve means owes
    //                 if (pay > 0) {
    //                     curMap[code] += pay;
    //                     if (DEBUG_BALANCES) console.log(`  ${memberId} pay +${pay} ${code}`);
    //                 }
    //                 if (owe > 0) {
    //                     curMap[code] -= owe;
    //                     if (DEBUG_BALANCES) console.log(`  ${memberId} owe -${owe} ${code}`);
    //                 }
    //             }
    //         }

    //         if (DEBUG_BALANCES) {
    //             console.log("Group totalDebt result:", JSON.parse(JSON.stringify(totalDebt)));
    //             console.groupEnd && console.groupEnd("calculateDebtForGroup");
    //         }

    //         return totalDebt;
    //     };


    //     // Group by groupId
    //     const groupedByGroup = groupExpenses.reduce((acc, exp) => {
    //         const gid = String(exp?.groupId?._id || exp?.groupId || "");
    //         if (!gid) return acc;
    //         if (!acc[gid]) acc[gid] = { group: exp.groupId || exp.group, members: [], expenses: [] };
    //         acc[gid].expenses.push(exp);

    //         const splits = Array.isArray(exp?.splits) ? exp.splits : [];
    //         for (const s of splits) {
    //             const sid = String(s?.friendId?._id || "");
    //             if (!sid) continue;
    //             // keep original friend object where available
    //             const existing = acc[gid].members.find((m) => String(m._id) === sid);
    //             if (!existing) acc[gid].members.push(s.friendId || { _id: sid });
    //         }
    //         return acc;
    //     }, {});

    //     const allTx = [];

    //     for (const gid of Object.keys(groupedByGroup)) {
    //         const { group, members, expenses: gx } = groupedByGroup[gid];

    //         // skip degenerate groups
    //         if (!Array.isArray(members) || members.length === 0) continue;

    //         const totalDebt = calculateDebtForGroup(gx, members);
    //         const simplified = simplifyDebts(totalDebt, members).map((tx) => ({
    //             ...tx,
    //             group: { _id: String(group?._id || gid), name: group?.name || (group?.groupName ?? "Unnamed Group") },
    //         }));
    //         if (DEBUG_BALANCES) {
    //             console.log(`Group ${gid} simplified transactions:`, JSON.parse(JSON.stringify(simplified)));
    //         }
    //         allTx.push(...simplified);
    //     }

    //     setSimplifiedTransactions(allTx);
    //     if (DEBUG_BALANCES) {
    //         console.log("All simplifiedTransactions:", JSON.parse(JSON.stringify(allTx)));
    //     }
    // }, [expenses]);

    /* ======================
       Friend balances from non-group expenses + loans
       (keeps your original logic — non-group only)
       ====================== */
    const friendBalances = useMemo(() => {
        const map = new Map();

        // expenses impact (non-group only)
        for (const exp of (expenses || []).filter((e) => e?.groupId == null)) {
            const code = exp?.currency || "INR";
            if (DEBUG_BALANCES) console.log(`Non-group expense ${exp.description || exp.id} currency ${code}`);
            for (const split of exp?.splits || []) {
                const fId = String(split?.friendId?._id || "");
                if (!fId) continue;
                const owe = Number(split?.oweAmount) || 0;
                const pay = Number(split?.payAmount) || 0;
                const delta = (split?.owing ? owe : 0) - (split?.paying ? pay : 0);
                if (DEBUG_BALANCES) {
                    console.log(`  split for friend ${split?.friendId?.name}: owing?=${!!split?.owing}, paying?=${!!split?.paying}, owe=${owe}, pay=${pay}, delta=${delta}`);
                }
                const byCode = map.get(fId) || {};
                byCode[code] = (byCode[code] || 0) + delta;
                map.set(fId, byCode);
            }
        }

        // loans impact
        // for (const loan of loans || []) {
        //     if (loan?.status === "closed") continue;
        //     const code = loan?.currency || "INR";
        //     const principal = Number(loan?.principal) || 0;
        //     const paid = (loan?.repayments || []).reduce((n, r) => n + (Number(r?.amount) || 0), 0);
        //     const remaining = Math.max(principal - paid, 0);

        //     const borrowerId = String(loan?.borrowerId?._id || "");
        //     const lenderId = String(loan?.lenderId?._id || "");

        //     if (borrowerId) {
        //         const byCode = map.get(borrowerId) || {};
        //         byCode[code] = (byCode[code] || 0) + remaining; // borrower owes you (+)
        //         map.set(borrowerId, byCode);
        //     }
        //     if (lenderId) {
        //         const byCode = map.get(lenderId) || {};
        //         byCode[code] = (byCode[code] || 0) - remaining; // you owe lender (-)
        //         map.set(lenderId, byCode);
        //     }
        // }

        const out = {};
        for (const [friendId, byCode] of map.entries()) {
            const list = Object.entries(byCode)
                .map(([code, amt]) => {
                    const rounded = roundCurrency(amt, code);
                    const minUnit = 1 / 10 ** currencyDigits(code);
                    return Math.abs(rounded) >= minUnit ? { code, amount: rounded } : null;
                })
                .filter(Boolean)
                .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
            out[friendId] = list;
        }
        return out;
    }, [expenses, loans]);

    /* ======================
       Group-derived friend balances raw numbers
       returns map: friendId -> { code: amount } (signed)
       amount > 0 => friend owes you (they -> you)
       amount < 0 => you owe friend (you -> them)
       ====================== */
    const groupFriendBalancesRaw = useMemo(() => {
        if (!userId) return {};
        const map = {}; // friendId -> { [code]: amount }

        for (const tx of simplifiedTransactions || []) {
            const code = tx?.currency || "INR";
            const amt = Number(tx?.amount) || 0;
            const from = String(tx?.from || "");
            const to = String(tx?.to || "");

            if (!from || !to || !amt) continue;

            if (to === String(userId)) {
                // friend -> you: friend (from) is owed (positive)
                const m = map[from] || {};
                m[code] = (m[code] || 0) + amt;
                map[from] = m;
            } else if (from === String(userId)) {
                // you -> friend: negative
                const m = map[to] || {};
                m[code] = (m[code] || 0) - amt;
                map[to] = m;
            }
        }
        return map;
    }, [simplifiedTransactions, userId]);

    /* ======================
       MERGE: combine friendBalances (non-group) + groupFriendBalancesRaw
       into final shape for your UI (list per friend { code, amount })
       ====================== */
    const mergedBalances = useMemo(() => {
        // base convert friendBalances list -> numeric map
        const base = {};
        for (const friendId of Object.keys(friendBalances || {})) {
            const m = {};
            for (const item of friendBalances[friendId] || []) {
                const code = item.code;
                const amt = Number(item.amount) || 0;
                m[code] = (m[code] || 0) + amt;
            }
            base[friendId] = m;
        }

        // add group balances
        for (const [friendId, byCode] of Object.entries(groupFriendBalancesRaw || {})) {
            const m = base[friendId] || {};
            for (const [code, amt] of Object.entries(byCode || {})) {
                m[code] = (m[code] || 0) + (Number(amt) || 0);
            }
            base[friendId] = m;
        }
        if (DEBUG_BALANCES) {
            console.groupCollapsed && console.groupCollapsed("mergedBalances");
            console.log("base (from non-group friendBalances):", JSON.parse(JSON.stringify(base)));
            console.log("groupFriendBalancesRaw:", JSON.parse(JSON.stringify(groupFriendBalancesRaw)));
        }
        // convert back to UI list shape with rounding & sorting
        const out = {};
        for (const [friendId, byCode] of Object.entries(base)) {
            const list = Object.entries(byCode)
                .map(([code, amt]) => {
                    const rounded = roundCurrency(amt, code);
                    const minUnit = 1 / 10 ** currencyDigits(code);
                    return Math.abs(rounded) >= minUnit ? { code, amount: rounded } : null;
                })
                .filter(Boolean)
                .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
            out[friendId] = list;
        }
        if (DEBUG_BALANCES) {
            console.log("final merged (pre-rounding):", JSON.parse(JSON.stringify(base)));
            console.groupEnd && console.groupEnd("mergedBalances");
        }
        return out;
    }, [friendBalances, groupFriendBalancesRaw]);

    // helpers for filtering
    const friendCategory = useCallback(
        (friendId) => {
            const list = mergedBalances[friendId] || [];
            const hasPos = list.some((b) => b.amount > 0);
            const hasNeg = list.some((b) => b.amount < 0);
            if (!hasPos && !hasNeg) return "settled";
            if (hasPos && !hasNeg) return "owes_me";
            if (!hasPos && hasNeg) return "i_owe";
            return "mixed";
        },
        [mergedBalances]
    );

    const filteredFriends = useMemo(() => {
        const q = query.trim().toLowerCase();
        return (friends || [])
            .filter((f) => {
                const matchText = !q || f?.name?.toLowerCase?.().includes(q) || f?.email?.toLowerCase?.().includes(q);
                if (!matchText) return false;
                if (activeFilter === "all") return true;
                const cat = friendCategory(String(f?._id));
                if (activeFilter === "settled") return cat === "settled";
                if (activeFilter === "owes_me") return cat === "owes_me";
                if (activeFilter === "i_owe") return cat === "i_owe";
                return true;
            })
            .sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || "")))
            .sort((a, b) => {
                const catA = friendCategory(String(a?._id));
                const catB = friendCategory(String(b?._id));

                // Settled friends always at the end
                if (catA === "settled" && catB !== "settled") return 1;
                if (catB === "settled" && catA !== "settled") return -1;

                // Both unsettled → sort by last updated (use updatedAt or createdAt if available)
                const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
                const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
                return dateB - dateA;
            });
    }, [friends, mergedBalances, activeFilter, query, friendCategory]);

    // ===== UI bits =====
    const FriendRow = ({ friend }) => {
        const list = mergedBalances[String(friend?._id)] || [];
        const dominant = list[0];
        const otherCount = Math.max(list.length - 1, 0);

        return (
            <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                    router.push({ pathname: "/friends/details", params: { id: friend?._id } });
                }}
                style={styles.friendRow}
            >
                {
                    (() => {
                        // prefer explicit avatarId (predefined SVG) -> photo URL -> initials
                        const avatarId = friend?.avatarId;
                        const found = avatarId ? avatars.find((a) => a.id === avatarId) : null;
                        const AvatarComp = found?.Component || null;

                        if (AvatarComp) {
                            // predefined SVG avatar (kept inside circular mask)
                            return (
                                <View style={styles.avatarSvgWrap}>
                                    <AvatarComp width={40} height={40} />
                                </View>
                            );
                        }
                        // fallback to initials
                        return (
                            <View style={styles.avatar}>
                                <Text style={styles.avatarText}>{initials(friend?.name)}</Text>
                            </View>
                        );
                    })()
                }


                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.friendName} numberOfLines={1}>
                        {friend?.name}
                    </Text>
                    {/* <Text style={styles.friendEmail} numberOfLines={1}>
                        {friend?.email}
                    </Text> */}
                </View>

                {list.length > 0 ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        {dominant ? (
                            <View style={[styles.badge, dominant.amount > 0 ? styles.badgeOwed : styles.badgeOwe]}>
                                <Text style={dominant.amount > 0 ? styles.badgeOwedText : styles.badgeOweText}>
                                    {dominant.amount > 0 ? "you’re owed · " : "you owe · "}
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

    const RequestRow = ({ req }) => (
        <View style={styles.requestRow}>
            <View style={styles.avatarSm}>
                <Text style={styles.avatarSmText}>{initials(req?.sender?.name)}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.reqName} numberOfLines={1}>
                    {req?.sender?.name}
                </Text>
                <Text style={styles.reqEmail} numberOfLines={1}>
                    {req?.sender?.email}
                </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity onPress={() => handleAccept(req._id)} style={[styles.reqBtn, styles.reqBtnAccept]}>
                    <Text style={[styles.reqBtnText, { color: theme?.colors?.primary ?? "#00C49F" }]}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleReject(req._id)} style={[styles.reqBtn, styles.reqBtnDecline]}>
                    <Text style={[styles.reqBtnText, { color: theme?.colors?.negative ?? "#EA4335" }]}>Decline</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            <StatusBar style={theme?.statusBarStyle === "dark-content" ? "dark" : "light"} />
            <Header title="Friends" showText="Add Friend" onTextPress={() => addFriendRef.current?.present()} />
            <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 8, gap: 8 }}>
                {/* Search + Filter */}
                <View style={{ gap: 8 }}>
                    <SearchBar value={query} onChangeText={setQuery} placeholder="Search friends" />

                    <ScrollView horizontal showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                        {[
                            { k: "all", label: "All" },
                            { k: "owes_me", label: "Owes me" },
                            { k: "i_owe", label: "I owe" },
                            { k: "settled", label: "Settled" },
                        ].map(({ k, label }) => {
                            const active = activeFilter === k;
                            return (
                                <TouchableOpacity key={k} onPress={() => setActiveFilter(k)} style={[styles.filterChip, active && styles.filterChipActive]}>
                                    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>

                {/* Banner */}
                {banner ? (
                    <View style={[styles.banner, banner.type === "success" && styles.bannerSuccess, banner.type === "error" && styles.bannerError, banner.type === "info" && styles.bannerInfo]}>
                        <Text style={styles.bannerText}>{banner.text}</Text>
                        <TouchableOpacity onPress={() => setBanner(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Text style={{ color: theme?.colors?.muted ?? "#ccc" }}>✕</Text>
                        </TouchableOpacity>
                    </View>
                ) : null}

                {/* Content */}
                <ScrollView style={{ flex: 1 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} tintColor={theme?.colors?.primary ?? "#00d0b0"} />} contentContainerStyle={{ paddingTop: 8, paddingBottom: 124 }} showsVerticalScrollIndicator={false}>
                    {/* Requests */}
                    {receivedRequests.length > 0 && (
                        <View style={styles.card}>
                            <View style={styles.cardHeader}>
                                <Text style={styles.sectionLabel}>Friend Requests</Text>
                            </View>
                            <View style={{ padding: 12, paddingTop: 8 }}>{receivedRequests.map((req) => <RequestRow key={req._id} req={req} />)}</View>
                        </View>
                    )}

                    {/* Empty state */}
                    {!loading && friends.length === 0 && receivedRequests.length === 0 ? (
                        <EmptyCTA
                            visible={!loading && friends.length === 0 && receivedRequests.length === 0}
                            title="No friends yet!"
                            subtitle="To split expenses, add friends."
                            ctaLabel="Add Friend"
                            onPress={() => addFriendRef.current.present()}
                        />

                    ) : null}

                    {/* Loading skeletons */}
                    {loading ? (
                        <View style={{ gap: 10, marginTop: 12 }}>
                            {Array.from({ length: 6 }).map((_, i) => (
                                <View key={i} style={styles.skelRow}>
                                    <View style={styles.skelAvatar} />
                                    <View style={{ flex: 1, gap: 6 }}>
                                        <View style={[styles.skelLine, { width: "40%" }]} />
                                        <View style={[styles.skelLine, { width: "60%" }]} />
                                    </View>
                                    <View style={[styles.skelLine, { width: 80, height: 24, borderRadius: 8 }]} />
                                </View>
                            ))}
                        </View>
                    ) : null}

                    {/* Friends list */}
                    {!loading && friends.length > 0 && (
                        <View style={{ marginTop: receivedRequests.length > 0 ? 8 : 0 }}>
                            <View style={{ borderTopColor: theme?.colors?.border ?? "#212121", borderTopWidth: StyleSheet.hairlineWidth }}>
                                {filteredFriends.map((f) => (
                                    <View key={f?._id} style={{ borderBottomColor: theme?.colors?.border ?? "#212121", borderBottomWidth: StyleSheet.hairlineWidth }}>
                                        <FriendRow friend={f} />
                                    </View>
                                ))}
                            </View>
                            <Text style={{ color: theme?.colors?.primary ?? "#00C49F", textAlign: "center", marginTop: 10 }}>
                                {filteredFriends.length} Friend{filteredFriends.length === 1 ? "" : "s"}
                            </Text>
                        </View>
                    )}
                </ScrollView>
                <FAB onPress={() => { newExpenseBottomSheetRef?.current?.present?.(); }} />
                <NewExpenseBottomSheet innerRef={newExpenseBottomSheetRef} selctedMode={"split"} onSave={refreshAll} />

                <BottomSheetAddFriend innerRef={addFriendRef}
                    onRedirect={async () => {
                        // 1) Dismiss the bottom sheet first so it's not visible while we navigate
                        try {
                            await addFriendRef?.current?.dismiss?.();
                        } catch (e) {
                            // ignore
                        }

                        // 2) Push Settings first, then push Link. This ensures stack is:
                        //    ... -> Settings -> Settings/Link
                        // so Back from Link goes to Settings (not Friends).
                        try {
                            // push Settings root
                            await router.push('/settings');

                            // slight delay often makes UX smoother and avoids race on nested stacks –
                            // but router.push returns a promise so await above should be sufficient.
                            // Now push the link sub-screen
                            await router.push('/settings/link');
                        } catch (err) {
                            console.warn('Navigation to settings/link failed', err);
                            // fallback: replace so user still reaches link page
                            try {
                                await router.replace('/settings/link');
                            } catch (err2) {
                                console.warn('replace fallback failed', err2);
                            }
                        }
                    }}
                    onAdded={async () => { await pullReceived(); await pullFriends(); }} userToken={userToken} />
            </View>
        </SafeAreaView>
    );
}

/* ---------------------------
   Themed styles factory
----------------------------*/
const createStyles = (theme = {}) =>
    StyleSheet.create({
        safe: { flex: 1, backgroundColor: theme?.colors?.background ?? "#121212" },
        header: {
            paddingHorizontal: 16,
            paddingBottom: 10,
            paddingTop: Platform.OS === "android" ? 0 : 0,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: theme?.colors?.border ?? "#2a2a2a",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
        },
        headerTitle: { color: theme?.colors?.text ?? "#EBF1D5", fontSize: 24, fontWeight: "700" },
        addBtn: { backgroundColor: theme?.colors?.primary ?? "#00C49F", width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },

        sectionLabel: { color: theme?.colors?.text ?? "#00C49F", fontSize: 12, letterSpacing: 1, textTransform: "uppercase" },

        input: {
            backgroundColor: theme?.colors?.card ?? "#1f1f1f",
            color: theme?.colors?.text ?? "#EBF1D5",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: theme?.colors?.border ?? "#55554f",
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontSize: 15,
        },

        filterChip: { borderWidth: 1, borderColor: theme?.colors?.border ?? "#2a2a2a", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
        filterChipActive: { backgroundColor: theme?.colors?.primary ?? "#EBF1D5", borderColor: theme?.colors?.primary ?? "#EBF1D5" },
        filterChipText: { color: theme?.colors?.text ?? "#EBF1D5", fontSize: 12 },
        filterChipTextActive: { color: theme?.colors?.inverseText ?? "#121212" },

        banner: {
            margin: 12,
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderRadius: 8,
            borderWidth: 1,
            backgroundColor: theme?.colors?.card ?? "#1e1e1e",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
        },
        bannerSuccess: { backgroundColor: "rgba(0,150,136,0.12)", borderColor: theme?.colors?.positive ?? "#009688" },
        bannerError: { backgroundColor: "rgba(244,67,54,0.12)", borderColor: theme?.colors?.negative ?? "#f44336" },
        bannerInfo: { backgroundColor: "rgba(158,158,158,0.12)", borderColor: theme?.colors?.muted ?? "#9e9e9e" },
        bannerText: { color: theme?.colors?.text ?? "#EBF1D5", flex: 1 },

        card: { backgroundColor: theme?.colors?.card ?? "#1E1E1E", borderRadius: 12, overflow: "hidden" },
        cardHeader: { backgroundColor: theme?.colors?.cardAlt ?? theme?.colors?.card ?? "#212121", paddingHorizontal: 12, paddingVertical: 10 },
        emptyCard: { backgroundColor: theme?.colors?.card ?? "#1f1f1f", borderRadius: 12, padding: 16, alignItems: "center", marginTop: 16 },
        emptyTitle: { color: theme?.colors?.text ?? "#EBF1D5", fontSize: 18, fontWeight: "600" },
        emptyText: { color: theme?.colors?.muted ?? "#aaa", textAlign: "center", marginTop: 8 },
        ctaBtn: { backgroundColor: theme?.colors?.primary ?? "#00C49F", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, marginTop: 12 },
        ctaBtnText: { color: theme?.colors?.inverseText ?? "#121212", fontWeight: "700" },

        // friend row
        friendRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, gap: 12 },
        avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme?.colors?.card ?? "#1f1f1f", borderWidth: 1, borderColor: theme?.colors?.border ?? "rgba(255,255,255,.05)", alignItems: "center", justifyContent: "center" },
        avatarText: { color: theme?.colors?.text ?? "#EBF1D5", fontWeight: "700" },
        friendName: { color: theme?.colors?.text ?? "#EBF1D5", fontSize: 17, fontWeight: "700", textTransform: "capitalize" },
        friendEmail: { color: theme?.colors?.muted ?? "#888", fontSize: 12, textTransform: "lowercase" },

        chip: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, borderWidth: 1, backgroundColor: "transparent", borderColor: theme?.colors?.border ?? "rgba(255,255,255,0.05)" },
        chipText: { color: theme?.colors?.text ?? "#EBF1D5", fontSize: 12 },
        chipOwe: { borderColor: theme?.colors?.negative ?? "rgba(234,67,53,0.6)" },
        chipOwed: { borderColor: theme?.colors?.positive ?? "rgba(0,196,159,0.6)" },
        chipNeutral: { borderColor: "rgba(255,255,255,0.2)" },

        badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: "transparent", borderWidth: 1, borderColor: theme?.colors?.border ?? "rgba(255,255,255,0.06)" },
        badgeOwe: { borderColor: theme?.colors?.negativeAlpha ? theme?.colors?.negativeAlpha : "rgba(244,67,54,0.14)", backgroundColor: theme?.colors?.negativeAlpha ? theme?.colors?.negativeAlpha : "rgba(244,67,54,0.06)" },
        badgeOwed: { borderColor: theme?.colors?.positiveAlpha ? theme?.colors?.positiveAlpha : "rgba(0,196,159,0.14)", backgroundColor: theme?.colors?.positiveAlpha ? theme?.colors?.positiveAlpha : "rgba(0,196,159,0.06)" },
        badgeOweText: { color: theme?.colors?.negative ?? "#f28b82", fontSize: 12 },
        badgeOwedText: { color: theme?.colors?.positive ?? "#60DFC9", fontSize: 12 },
        badgeNeutral: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: "transparent", borderWidth: 1, borderColor: theme?.colors?.border ?? "rgba(255,255,255,0.06)" },
        badgeNeutralText: { color: theme?.colors?.muted ?? "#bbb", fontSize: 12 },

        // requests
        requestRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
        avatarSm: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme?.colors?.card ?? "#1f1f1f", borderWidth: 1, borderColor: theme?.colors?.border ?? "rgba(255,255,255,.05)", alignItems: "center", justifyContent: "center" },
        avatarSmText: { color: theme?.colors?.text ?? "#EBF1D5", fontWeight: "700", fontSize: 12 },
        reqName: { color: theme?.colors?.text ?? "#EBF1D5", fontSize: 14, fontWeight: "600" },
        reqEmail: { color: theme?.colors?.muted ?? "#888", fontSize: 12, textTransform: "lowercase" },
        reqBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 5, paddingVertical: 6, minWidth: 60, alignItems: "center" },
        reqBtnAccept: { borderColor: theme?.colors?.primary ?? "#00C49F" },
        reqBtnDecline: { borderColor: theme?.colors?.negative ?? "#EA4335" },
        reqBtnText: { color: theme?.colors?.text ?? "#EBF1D5", fontSize: 12, fontWeight: "600" },

        // Modal
        modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 16 },
        modalCard: { backgroundColor: theme?.colors?.card ?? "#1f1f1f", borderRadius: 12, padding: 16, width: "100%" },
        modalTitle: { color: theme?.colors?.text ?? "#EBF1D5", fontSize: 18, fontWeight: "700", marginBottom: 6 },
        modalBtn: { backgroundColor: theme?.colors?.card ?? "#2a2a2a", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
        modalBtnText: { color: theme?.colors?.text ?? "#EBF1D5", fontWeight: "600" },

        // skeletons
        skelRow: {
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: 12,
            gap: 12,
            paddingHorizontal: 4,
        },
        skelAvatar: {
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: theme?.colors?.card ?? "#2a2a2a",
            borderWidth: 1,
            borderColor: theme?.colors?.border ?? "rgba(255,255,255,.05)",
        },
        skelLine: {
            height: 12,
            backgroundColor: theme?.colors?.card ?? "#2a2a2a",
            borderRadius: 6,
        },

        avatarImage: {
            width: 40,
            height: 40,
            borderRadius: 20,
            marginRight: 12,
        },

        // FAB
        fab: {
            position: "absolute",
            right: 16,
            bottom: 24,
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: theme?.colors?.primary ?? "#00C49F",
            alignItems: "center",
            justifyContent: "center",
            elevation: 4,
        },
        /* ---- ADD / MERGE these style rules into createStyles ---- */
        avatarSvgWrap: {
            width: 45,
            height: 45,
            borderRadius: 24,
            overflow: "hidden",
            alignItems: "center",
            justifyContent: "flex-end",
            borderWidth: 1,
            borderColor: theme?.colors?.border ?? "rgba(255,255,255,0.05)",

        },
        /* you already have avatarImage style; if you want the remote images to fit exactly, ensure it matches avatarSvgWrap sizing */
        avatarImage: {
            width: 43,
            height: 43,
            borderRadius: 20,
            marginRight: 12,
            resizeMode: "cover",
        },

    });
