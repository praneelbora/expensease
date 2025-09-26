// app/newExpense.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    RefreshControl,
    Modal,
    Platform,
    Alert,
} from "react-native";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import { useFocusEffect } from "@react-navigation/native";

import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useRouter, useLocalSearchParams } from "expo-router";
import Header from "~/header";
import { getSymbol, getDigits, formatMoney, allCurrencies } from "utils/currencies";
import { categoryMap } from "utils/categories";
// ==== adjust these imports for your app structure ====
import { useAuth } from "/context/AuthContext";
import { getFriends } from "/services/FriendService";
import { getAllGroups } from "/services/GroupService";
import { getSuggestions } from "/services/UserService";
import { createExpense } from "/services/ExpenseService";
import { fetchFriendsPaymentMethods } from "/services/PaymentMethodService";
// import { logEvent } from "/utils/analytics";
import SheetCurrencies from "~/shtCurrencies";
import SheetCategories from "~/shtCategories";
import SheetPayments from "~/shtPayments";

// Optional theme hook (if available)
import { useTheme } from "context/ThemeProvider";

const fmtMoney = formatMoney;
const symbol = getSymbol;
const digits = getDigits;
const todayISO = () => new Date().toISOString().split("T")[0];
const initials = (name = "") => {
    const p = String(name).trim().split(" ").filter(Boolean);
    if (!p.length) return "?";
    if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
    return (p[0][0] + p[1][0]).toUpperCase();
};

const TEST_MODE = process.env.EXPO_PUBLIC_TEST_MODE;

// =================== Screen ===================
export default function NewExpenseScreen() {
    const router = useRouter();
    const params = useLocalSearchParams(); // can carry { groupId, friendId }
    const themeCtx = useTheme?.() || {};
    const styles = useMemo(() => createStyles(themeCtx?.theme), [themeCtx?.theme]);

    const {
        user,
        userToken,
        categories = [],
        defaultCurrency = "INR",
        preferredCurrencies = [],
        paymentMethods = [],
        fetchPaymentMethods = async () => { },
    } = useAuth() || {};

    // ------------ state ------------
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [friends, setFriends] = useState([]);
    const [groups, setGroups] = useState([]);
    const [suggestions, setSuggestions] = useState(null);

    const [filteredFriends, setFilteredFriends] = useState([]);
    const [filteredGroups, setFilteredGroups] = useState([]);

    const [expenseMode, setExpenseMode] = useState("personal"); // 'personal' | 'split'
    const [desc, setDesc] = useState(TEST_MODE ? "TEST_DESCRIPTION" : "");
    const [currency, setCurrency] = useState(defaultCurrency);
    const [amount, setAmount] = useState(TEST_MODE ? 99 : ""); // keep string for controlled TextInput
    const [category, setCategory] = useState(TEST_MODE ? "TEST_CATEGORY" : "default");
    const [expenseDate, setExpenseDate] = useState(todayISO());

    const [groupSelect, setGroupSelect] = useState(null);
    const [selectedFriends, setSelectedFriends] = useState([]); // objects incl. me

    const [mode, setMode] = useState("equal"); // 'equal' | 'value' | 'percent'

    const [search, setSearch] = useState("");
    const [banner, setBanner] = useState(null); // {type, text}
    const [showDatePicker, setShowDatePicker] = useState(false);

    // Tab state: 'paid' | 'owed'
    const [activeTab, setActiveTab] = useState("");

    const paymentModalCtxInitial = { context: "personal", friendId: null };
    const [paymentModalCtx, setPaymentModalCtx] = useState(paymentModalCtxInitial);
    const [paymentMethod, setPaymentMethod] = useState(null); // personal

    const hasPreselectedGroup = useRef(false);
    const hasPreselectedFriend = useRef(false);
    const preselectedFriendId = useRef(null);
    const preselectedGroupId = useRef(null); // <-- NEW

    const currencySheetRef = useRef(null);
    const categorySheetRef = useRef(null);
    const paymentSheetRef = useRef(null);

    const openCategorySheet = () => categorySheetRef.current?.present();
    const openPaymentSheet = (ctx) => {
        setPaymentModalCtx(ctx);
        paymentSheetRef.current?.present();
    };
    const openCurrencySheet = () => currencySheetRef.current?.present();

    // currency options
    const currencyOptions = useMemo(() => {
        const base = new Set([defaultCurrency, ...(preferredCurrencies || [])]);
        return allCurrencies
            .filter((c) => base.has(c.code))
            .concat(allCurrencies.filter((c) => !base.has(c.code)))
            .map((c) => ({ value: c.code, label: `${c.name} (${c.symbol})`, code: c.code }));
    }, [defaultCurrency, preferredCurrencies]);

    const categoryOptions = useMemo(
        () =>
            Object.entries(categoryMap).map(([key, cfg]) => ({
                value: key,
                label: cfg.label,
                icon: cfg.icon,
                keywords: cfg.keywords,
            })),
        []
    );

    // ---------- fetchers ----------
    const pullFriends = useCallback(async () => {
        if (!userToken) {
            console.debug("[NewExpense] pullFriends: no userToken");
            return;
        }
        try {
            console.debug("[NewExpense] pullFriends: requesting");
            const data = await getFriends(userToken);
            setFriends(Array.isArray(data) ? data : []);
            console.debug("[NewExpense] pullFriends: got", Array.isArray(data) ? data.length : 0, "friends");
        } catch (e) {
            console.warn("[NewExpense] pullFriends error:", e?.message || e);
        }
    }, [userToken]);

    const pullGroups = useCallback(async () => {
        if (!userToken) return;
        try {
            console.debug("[NewExpense] pullGroups: requesting");
            const data = await getAllGroups(userToken);
            setGroups(Array.isArray(data) ? data : []);
            console.debug("[NewExpense] pullGroups: got", Array.isArray(data) ? data.length : 0, "groups");
        } catch (e) {
            console.warn("[NewExpense] pullGroups error:", e?.message || e);
        }
    }, [userToken]);

    const pullSuggestions = useCallback(async () => {
        if (!userToken) return;
        try {
            console.debug("[NewExpense] pullSuggestions: requesting");
            const data = await getSuggestions(userToken);
            setSuggestions(data || null);
            console.debug("[NewExpense] pullSuggestions: got suggestions");
        } catch (e) {
            console.warn("[NewExpense] pullSuggestions error:", e?.message || e);
        }
    }, [userToken]);


    const refreshAll = useCallback(async () => {
        setRefreshing(true);
        try {
            await Promise.all([pullFriends(), pullGroups(), pullSuggestions()]);
        } finally {
            setRefreshing(false);
        }
    }, [pullFriends, pullGroups, pullSuggestions]);

    useEffect(() => {
        (async () => {
            await Promise.all([pullFriends(), pullGroups(), pullSuggestions()]);
            setLoading(false);
        })();
    }, [pullFriends, pullGroups, pullSuggestions]);

    // ---------- suggestions + search filters ----------
    const friendFilter = useCallback(
        (q = "") => {
            const lower = q.toLowerCase();
            const suggestedIds = suggestions?.friends?.map((f) => String(f.friendId)) || [];

            let arr = friends.map((f) => ({
                ...f,
                selected: selectedFriends.some((s) => String(s._id) === String(f?._id)),
                suggested: suggestedIds.includes(String(f?._id)),
            }));

            if (!q) {
                arr = arr.filter((f) => f.suggested);
            } else {
                arr = arr.filter(
                    (f) => f?.name?.toLowerCase?.().includes(lower) || f.email?.toLowerCase?.().includes(lower)
                );
                arr.sort((a, b) => a.name.localeCompare(b.name));
            }
            setFilteredFriends(arr);
        },
        [friends, selectedFriends, suggestions]
    );

    const groupFilter = useCallback(
        (q = "") => {
            const lower = q.toLowerCase();
            const suggestedIds = suggestions?.groups?.map((g) => String(g.groupId)) || [];

            let arr = groups.map((g) => ({
                ...g,
                suggested: suggestedIds.includes(String(g._id)),
            }));

            if (!q) {
                arr = arr.filter((g) => g.suggested);
            } else {
                arr = arr.filter((g) => {
                    const gname = g.name?.toLowerCase?.() || "";
                    const memberNames = g.members?.map((m) => m.name?.toLowerCase?.() || "") || [];
                    return gname.includes(lower) || memberNames.some((n) => n.includes(lower));
                });
                arr.sort((a, b) => a.name.localeCompare(b.name));
            }
            setFilteredGroups(arr);
        },
        [groups, suggestions]
    );

    useEffect(() => {
        friendFilter(search);
        groupFilter(search);
    }, [search, friends, groups, suggestions, friendFilter, groupFilter]);

    // ---------- preselect via params (run on each focus) ----------
    useFocusEffect(
        useCallback(() => {
            // reset preselect markers when screen gains focus to allow repeated preselects
            // (this prevents a stale "hasPreselectedFriend" from blocking re-selection)
            hasPreselectedGroup.current = false;
            hasPreselectedFriend.current = false;
            preselectedFriendId.current = null;

            if ((!groups || groups.length === 0) && (!friends || friends.length === 0)) {
                console.debug("[NewExpense][focus] preselect: no friends or groups yet");
                return;
            }

            const gid = params?.groupId;
            const fid = params?.friendId;
            console.debug("[NewExpense][focus] preselect: params:", { gid, fid, groupsLen: groups.length, friendsLen: friends.length });

            if (gid && !hasPreselectedGroup.current) {
                const g = groups.find((x) => String(x._id) === String(gid));
                if (g) {
                    setExpenseMode("split");
                    hasPreselectedGroup.current = true;
                    preselectedGroupId.current = String(g._id); // <-- store original id
                    toggleGroup(g);
                }
            }

            if (fid && !hasPreselectedFriend.current) {
                const f = friends.find((x) => String(x._id) === String(fid));
                if (f) {
                    setExpenseMode("split");
                    hasPreselectedFriend.current = true;
                    preselectedFriendId.current = String(f._id); // <-- store original id
                    toggleFriend(f);
                }
            }


            // optional cleanup when screen loses focus — we clear refs so future opens behave as new
            return () => {
                console.debug("[NewExpense][blur] clearing preselect refs on blur");
                hasPreselectedGroup.current = false;
                hasPreselectedFriend.current = false;
                preselectedFriendId.current = null;
            };
            // intentionally include friends/groups/params so focus logic has the latest lists
        }, [params?.groupId, params?.friendId, groups, friends])
    );

    // ---------- selection handlers ----------
    const addMeIfNeeded = (list) => {
        if (!user || !user._id) return list;
        let updated = list.map((x) => {
            if (String(x._id) === String(user._id)) {
                return { ...x, name: `${user.name} (Me)` };
            }
            return x;
        });

        const hasNonMe = updated.some((x) => String(x._id) !== String(user._id));
        const meExists = updated.some((x) => String(x._id) === String(user._id));

        if (hasNonMe && !meExists) {
            updated = [
                {
                    _id: user._id,
                    name: `${user.name} (Me)`,
                    paying: false,
                    owing: false,
                    payAmount: 0,
                    oweAmount: 0,
                    owePercent: 0,
                },
                ...updated,
            ];
        }

        return updated;
    };


    const updateFriendsPaymentMethods = async (ids) => {
        try {
            const map = await fetchFriendsPaymentMethods(ids, userToken);
            setSelectedFriends((prev) =>
                prev.map((f) => {
                    const raw = map[f?._id] || [];
                    let selectedPaymentMethodId = f.selectedPaymentMethodId;
                    const stillValid = raw.some((m) => m.paymentMethodId === selectedPaymentMethodId);
                    if (!stillValid) {
                        selectedPaymentMethodId = raw.length === 1 ? raw[0].paymentMethodId : null;
                    }
                    return { ...f, paymentMethods: raw, selectedPaymentMethodId };
                })
            );
        } catch {
            // ignore
        }
    };

    const toggleFriend = (friend) => {
        try {
            console.debug("[NewExpense] toggleFriend called for:", friend?._id, friend?.name);
            let upd = [...selectedFriends];
            const exists = upd.some((f) => String(f?._id) === String(friend?._id));
            if (exists) {
                upd = upd.filter((f) => String(f?._id) !== String(friend?._id));
                console.debug("[NewExpense] toggleFriend: removed", friend._id);
                if (String(preselectedFriendId.current) === String(friend._id)) {
                    console.debug("[NewExpense] toggleFriend: user removed preselected friend -> cancelling preselect nav");
                    hasPreselectedFriend.current = false;
                    preselectedFriendId.current = null;
                }
            } else {
                upd = [...upd, { ...friend, paying: false, owing: false, payAmount: 0, oweAmount: 0, owePercent: 0 }];
                console.debug("[NewExpense] toggleFriend: added", friend._id);
            }
            upd = addMeIfNeeded(upd);
            setSelectedFriends(upd);
            // schedule payment methods update for the changed list
            updateFriendsPaymentMethods(upd.map((f) => f?._id));
            // re-run local friend filter so suggested UI is updated
            friendFilter(search);
        } catch (e) {
            console.warn("[NewExpense] toggleFriend error:", e?.message || e);
        }
    };


    const toggleGroup = (group) => {
        try {
            console.debug("[NewExpense] toggleGroup called for:", group?._id, group?.name, "currentGroupSelect:", groupSelect?._id);
            if (groupSelect?._id === group._id) {
                // deselect group: remove group members from selectedFriends (but keep any other non-group selections)
                const ids = new Set((group.members || []).map((m) => String(m._id)));
                const upd = selectedFriends.filter((f) => !ids.has(String(f?._id)));
                setSelectedFriends(upd);
                setGroupSelect(null);
                console.debug("[NewExpense] toggleGroup: group deselected, updated selectedFriends count:", upd.length);
                if (String(preselectedGroupId.current) === String(group._id)) {
                    console.debug("[NewExpense] toggleGroup: user removed preselected group -> cancelling preselect nav");
                    hasPreselectedGroup.current = false;
                    preselectedGroupId.current = null;
                }
            } else {
                // add group's members who are not already in selectedFriends
                const existingIds = new Set((selectedFriends || []).map((f) => String(f?._id)));
                const newMembers = (group.members || [])
                    .filter((gm) => !existingIds.has(String(gm._id)) && String(gm._id) !== String(user?._id))
                    .map((gm) => ({ ...gm, paying: false, owing: false, payAmount: 0, oweAmount: 0, owePercent: 0 }));
                const upd = addMeIfNeeded([...selectedFriends, ...newMembers]);
                setSelectedFriends(upd);
                setGroupSelect(group);
                updateFriendsPaymentMethods(upd.map((f) => f?._id));
                console.debug("[NewExpense] toggleGroup: group selected, added members:", newMembers.map(m => m._id));
            }
        } catch (e) {
            console.warn("[NewExpense] toggleGroup error:", e?.message || e);
        }
    };


    const removeFriend = (friend) => {
        let upd = selectedFriends.filter((f) => f?._id !== friend?._id);
        const onlyMeLeft = upd.length === 1 && upd[0]._id === user._id;
        if (onlyMeLeft || upd.length === 0) {
            upd = upd.filter((f) => f?._id !== user._id);
        }
        setSelectedFriends(upd);
        if (String(preselectedFriendId.current) === String(friend?._id)) {
            hasPreselectedFriend.current = false;
            preselectedFriendId.current = null;
            console.debug("[NewExpense] removeFriend: cancelled preselect navigation for friend", friend?._id);
        }
    };

    // ---------- distributions ----------
    const num = (x) => (isNaN(Number(x)) ? 0 : Number(x));

    const distributeEqualPay = (upd) => {
        const payers = upd.filter((f) => f.paying);
        const N = payers.length;
        if (N === 0) return upd.map((f) => ({ ...f, payAmount: 0 }));
        const total = num(amount);
        const base = Math.floor((total / N) * 100) / 100;
        const totalBase = base * N;
        const leftover = Number((total - totalBase).toFixed(2));
        let count = 0;
        return upd.map((f) => {
            if (!f.paying) return { ...f, payAmount: 0 };
            count += 1;
            const val = count === N ? Number((base + leftover).toFixed(2)) : base;
            return { ...f, payAmount: val };
        });
    };

    const distributeEqualOwe = (upd) => {
        const owing = upd.filter((f) => f.owing);
        const N = owing.length;
        if (N === 0) return upd.map((f) => ({ ...f, oweAmount: 0, owePercent: undefined }));
        const total = num(amount);
        const base = Math.floor((total / N) * 100) / 100;
        const totalBase = base * N;
        const leftover = Number((total - totalBase).toFixed(2));
        let count = 0;
        return upd.map((f) => {
            if (!f.owing) return { ...f, oweAmount: 0, owePercent: undefined };
            count += 1;
            const val = count === N ? Number((base + leftover).toFixed(2)) : base;
            return { ...f, oweAmount: val, owePercent: undefined };
        });
    };

    const togglePaying = (friendId) => {
        let upd = selectedFriends.map((f) => (f?._id === friendId ? { ...f, paying: !f.paying } : f));
        upd = distributeEqualPay(upd);
        setSelectedFriends(upd);
        updateFriendsPaymentMethods(upd.map((f) => f?._id));
    };

    const toggleOwing = (friendId) => {
        let upd = selectedFriends.map((f) => (f?._id === friendId ? { ...f, owing: !f.owing } : f));
        if (mode === "equal") upd = distributeEqualOwe(upd);
        setSelectedFriends(upd);
    };

    const setOwePercent = (friendId, percent) => {
        const p = num(percent);
        setSelectedFriends((prev) =>
            prev.map((f) =>
                f?._id === friendId ? { ...f, owePercent: p, oweAmount: Number((num(amount) * (p / 100)).toFixed(2)) } : f
            )
        );
    };
    const setOweAmount = (friendId, v) => {
        const a = num(v);
        setSelectedFriends((prev) => prev.map((f) => (f?._id === friendId ? { ...f, oweAmount: a } : f)));
    };

    const setPayAmount = (friendId, v) => {
        const a = num(v);
        setSelectedFriends((prev) => prev.map((f) => (f?._id === friendId ? { ...f, payAmount: a } : f)));
    };

    // react to amount change: reset split mode-derived fields (but set sensible defaults when needed)
    // replace the previous "reset on amount change" effect with this smarter one
    // update on amount change: recompute equal splits when appropriate, but do not
    // override user choices when mode !== "equal".
    useEffect(() => {
        setSelectedFriends((prev = []) => {
            const total = num(amount);

            if (!Array.isArray(prev) || prev.length === 0) return prev;

            // copy to avoid mutating state objects
            const current = prev.map((f) => ({ ...f }));

            // who are explicitly paying / owing
            const payers = current.filter((f) => f.paying);
            const owers = current.filter((f) => f.owing);

            // If UI is in equal mode, recompute equal distributions for both sides
            // (payers -> payAmount, owers -> oweAmount). If mode !== 'equal', leave
            // existing numerical values untouched.
            if (mode === "equal") {
                // Recompute payAmounts if there are payers
                if (payers.length > 0) {
                    const Np = payers.length;
                    const baseP = Math.floor((total / Np) * 100) / 100;
                    const leftoverP = Number((total - baseP * Np).toFixed(2));
                    let idxP = 0;
                    return current.map((f) => {
                        if (!f.paying) return { ...f, payAmount: 0 };
                        idxP += 1;
                        const val = idxP === Np ? Number((baseP + leftoverP).toFixed(2)) : baseP;
                        return { ...f, payAmount: val };
                    });
                }

                // If no payers but there are owers -> recompute equal owe amounts
                if (owers.length > 0) {
                    const No = owers.length;
                    const baseO = Math.floor((total / No) * 100) / 100;
                    const leftoverO = Number((total - baseO * No).toFixed(2));
                    let idxO = 0;
                    return current.map((f) => {
                        if (!f.owing) return { ...f, oweAmount: 0, owePercent: undefined };
                        idxO += 1;
                        const val = idxO === No ? Number((baseO + leftoverO).toFixed(2)) : baseO;
                        return { ...f, oweAmount: val, owePercent: undefined };
                    });
                }

                // neither payers nor owers: nothing to recompute, keep previous
                return current.map((f) => ({ ...f, payAmount: f.payAmount || 0, oweAmount: f.oweAmount || 0 }));
            }

            // mode !== 'equal' -> preserve existing numeric values (don't overwrite manual edits)
            // BUT if there are no payers/owers and user hasn't interacted, optionally keep neutral defaults:
            const hasAnyPayers = payers.length > 0;
            const hasAnyOwers = owers.length > 0;

            if (!hasAnyPayers && !hasAnyOwers) {
                // keep neutral default: no auto-assign here to avoid surprising the user
                // (other existing code already sets sensible defaults when selection changes)
                return current;
            }

            // if there are payers but mode !== 'equal' we leave payAmount as-is (user likely edited them)
            // if there are owers but mode !== 'equal' we leave oweAmount as-is
            return current;
        });
        // note: include mode in deps so equal recompute runs when mode flips to 'equal' too
    }, [amount, mode]);



    // If split and friends + amount present and no one has been marked paying/owing yet, set default:
    // Paid by me, split owed equally among everyone (including me? usually owed by everyone equally - we'll set owes true for everyone except maybe me)
    // auto-open "Paid" tab when only me is paying and I have >1 payment accounts
    // auto-open "Paid" tab when only me is paying, I have >1 payment accounts,
    // and required fields are filled (desc, category, currency, amount), and there are other friends selected
    useEffect(() => {
        if (expenseMode !== "split") return;

        // required fields
        if (!desc?.trim()) return;
        if (!category) return;
        if (!currency) return;
        if (!(num(amount) > 0)) return;

        // must have at least one other friend selected (besides me)
        const others = selectedFriends.filter((f) => String(f?._id) !== String(user?._id));
        if (others.length === 0) return;

        const payers = selectedFriends.filter((f) => f.paying);
        if (payers.length !== 1) return;

        const onlyPayer = payers[0];
        if (String(onlyPayer._id) !== String(user?._id)) return;

        // check if this payer (me) has multiple payment methods:
        const fromSelected = Array.isArray(onlyPayer.paymentMethods) && onlyPayer.paymentMethods.length > 1;
        // fallback to global paymentMethods available to the current user
        const fromAuth = Array.isArray(paymentMethods) && paymentMethods.length > 1;

        if (fromSelected || fromAuth) {
            // setActiveTab("paid");
        }
    }, [selectedFriends, paymentMethods, expenseMode, user, desc, category, currency, amount]);

    useEffect(() => {
        if (expenseMode !== "split") return;

        // Always have numeric total available
        const total = num(amount);

        // if no participants, nothing to do
        if (!Array.isArray(selectedFriends) || selectedFriends.length === 0) return;

        // If amount is zero or not positive -> clear numeric fields so stale values don't remain.
        if (!(total > 0)) {
            setSelectedFriends((prev = []) =>
                prev.map((f) => ({
                    ...f,
                    payAmount: 0,
                    oweAmount: 0,
                    owePercent: 0,
                }))
            );
            return;
        }

        const hasAnyPayers = selectedFriends.some((f) => f.paying);
        const hasAnyOwers = selectedFriends.some((f) => f.owing);

        // only run when user hasn't interacted (no explicit payers and no explicit owers)

        const participantsExcludingMe = selectedFriends.filter((f) => String(f?._id) !== String(user?._id));

        // baseline: clear flags/numbers
        let neutral = selectedFriends.map((f) => ({
            ...f,
            paying: false,
            owing: false,
            payAmount: 0,
            oweAmount: 0,
            owePercent: 0,
        }));

        if (participantsExcludingMe.length === 0) {
            // Only me is present — make me payer and owe = 0
            neutral = neutral.map((f) =>
                String(f?._id) === String(user?._id)
                    ? { ...f, paying: true, payAmount: total, owing: false, oweAmount: 0, owePercent: 0 }
                    : f
            );
        } else {
            // There are others:
            // Default: you paid (paying: true, payAmount = total),
            // and everyone (including you) owes equally.

            neutral = neutral.map((f) => {
                if (String(f?._id) === String(user?._id)) {
                    return {
                        ...f,
                        paying: true,
                        payAmount: total,
                        owing: true, // include me in owe split
                        owePercent: undefined,
                    };
                }
                return {
                    ...f,
                    paying: false,
                    payAmount: 0,
                    owing: true,
                    owePercent: undefined,
                };
            });

            // distribute equal owe among everyone who is owing (now includes me)
            neutral = distributeEqualOwe(neutral);
        }

        setSelectedFriends(neutral);
    }, [selectedFriends.length, amount, expenseMode, user?._id]);

    const paidTotal = useMemo(
        () => selectedFriends.filter((f) => f.paying).reduce((n, f) => n + num(f.payAmount), 0),
        [selectedFriends]
    );
    const oweTotal = useMemo(
        () => selectedFriends.filter((f) => f.owing).reduce((n, f) => n + num(f.oweAmount), 0),
        [selectedFriends]
    );
    const pctTotal = useMemo(
        () => selectedFriends.filter((f) => f.owing).reduce((n, f) => n + num(f.owePercent || 0), 0),
        [selectedFriends]
    );

    const isPaidValid = useMemo(() => num(amount) === Number(paidTotal.toFixed(2)), [amount, paidTotal]);

    // personal: choose default method automatically if not set
    useEffect(() => {
        if (expenseMode !== "personal") return;
        if (paymentMethod) return;
        const list = Array.isArray(paymentMethods) ? paymentMethods : [];
        if (!list.length) return;
        const preferred =
            list.find((pm) => pm.isDefaultSend) ||
            list.find((pm) => pm.isDefaultReceive) ||
            (list.length === 1 ? list[0] : null);
        if (preferred?._id) setPaymentMethod(preferred._id);
    }, [expenseMode, paymentMethods, paymentMethod]);

    // ----- payment modal data -----
    const paymentOptions = useMemo(() => {
        if (paymentModalCtx.context === "personal") return paymentMethods || [];
        const f = selectedFriends.find((x) => x._id === paymentModalCtx.friendId);
        return (f?.paymentMethods || []).map((m) => ({ _id: m.paymentMethodId, ...m }));
    }, [paymentModalCtx, paymentMethods, selectedFriends]);

    const paymentValue = useMemo(() => {
        if (paymentModalCtx.context === "personal") return paymentMethod || null;
        const f = selectedFriends.find((x) => x._id === paymentModalCtx.friendId);
        return f?.selectedPaymentMethodId ?? null;
    }, [paymentModalCtx, paymentMethod, selectedFriends]);

    const handleSelectPayment = (id) => {
        if (paymentModalCtx.context === "personal") {
            setPaymentMethod(id);
            return;
        }
        setSelectedFriends((prev) => prev.map((f) => (f?._id === paymentModalCtx.friendId ? { ...f, selectedPaymentMethodId: id } : f)));
    };

    const requirePersonalPick =
        expenseMode === "personal" && (Array.isArray(paymentMethods) ? paymentMethods.length > 1 : false) && !paymentMethod;

    const payersNeedingPM = useMemo(() => {
        return (selectedFriends || [])
            .filter((f) => f.paying)
            .filter((f) => Array.isArray(f.paymentMethods) && f.paymentMethods.length > 1)
            .filter((f) => !f.selectedPaymentMethodId);
    }, [selectedFriends]);
    const selectedCategory = useMemo(() => {
        const a = categoryOptions.filter((opt) => opt.value === category);
        if (a.length === 1) return a[0].label;
        // fallback when category is 'default' or not found
        if (!category || category === "default") return "Category";
        return category;
    }, [category, categoryOptions]);

    // ---------- validation + hint message ----------
    const [hint, setHint] = useState("");
    useEffect(() => {
        const amt = num(amount);
        const cur = currency;
        const moneyLeft = (x) => `${symbol(cur)} ${Number(x).toFixed(digits(cur))}`;

        setHint("");
        if (expenseMode === "personal") {
            if (!desc.trim()) return setHint("Add a short description for this expense.");
            if (!cur) return setHint("Pick a currency.");
            if (!(amt > 0)) return setHint("Enter an amount greater than 0.");
            if (!category) return setHint("Choose a category.");
            if (!(paymentMethods?.length > 0)) return setHint("Add a payment account to continue.");
            if (requirePersonalPick) return setHint("You have multiple payment accounts. Pick one to proceed.");
            return setHint("Looks good! Tap Save Expense.");
        }

        // split:
        const hasAny = groupSelect || selectedFriends.some((f) => f?._id !== user._id);
        if (!hasAny) return setHint("Select a friend or a group to split with.");
        if (!desc.trim()) return setHint("Add a short description for this expense.");
        if (!cur) return setHint("Pick a currency.");
        if (!(amt > 0)) return setHint("Enter an amount greater than 0.");
        if (!category) return setHint("Choose a category.");

        const payers = selectedFriends.filter((f) => f.paying);
        const owrs = selectedFriends.filter((f) => f.owing);
        if (payers.length === 0) return setHint("Tap the names of those who paid.");
        if (!isPaidValid) return setHint(`${fmtMoney(cur, paidTotal)} / ${fmtMoney(cur, amt)} collected. ${moneyLeft(amt - paidTotal)} left.`);
        if (payersNeedingPM.length > 0) return setHint(`Select a payment account for: ${payersNeedingPM.map((x) => x.name).join(", ")}.`);
        if (owrs.length === 0) return setHint("Now select who owes.");

        if (mode === "percent") {
            if (pctTotal !== 100) return setHint(`You've assigned ${pctTotal.toFixed(2)}%. Add ${(100 - pctTotal).toFixed(2)}% more.`);
            return setHint("Great! Percentages add up to 100%. You can Save now.");
        }
        if (mode === "value") {
            if (Number(oweTotal.toFixed(2)) !== amt) return setHint(`${fmtMoney(cur, oweTotal)} / ${fmtMoney(cur, amt)} assigned. ${moneyLeft(amt - oweTotal)} left.`);
            return setHint("All owed amounts add up correctly. You can Save now.");
        }
        return setHint("Looks good! Review the shares and hit Save.");
    }, [
        expenseMode,
        desc,
        currency,
        amount,
        category,
        paymentMethods?.length,
        requirePersonalPick,
        groupSelect,
        selectedFriends,
        isPaidValid,
        paidTotal,
        oweTotal,
        pctTotal,
        mode,
        payersNeedingPM.length,
    ]);

    const canSubmit = useMemo(() => {
        if (!desc?.trim() || !currency || !(num(amount) > 0) || !category) return false;

        if (expenseMode === "personal") {
            if (!(paymentMethods?.length > 0)) return false;
            if (requirePersonalPick) return false;
            return true;
        }

        const hasAny = groupSelect || selectedFriends.some((f) => f?._id !== user._id);
        if (!hasAny) return false;

        if (!isPaidValid) return false;
        if (payersNeedingPM.length > 0) return false;

        if (mode === "percent") return pctTotal === 100;
        if (mode === "value") return Number(oweTotal.toFixed(2)) === num(amount);
        const owing = selectedFriends.filter((f) => f.owing).length > 0;
        const paying = selectedFriends.filter((f) => f.paying).length > 0;
        return owing && paying;
    }, [
        desc,
        currency,
        amount,
        category,
        expenseMode,
        paymentMethods?.length,
        requirePersonalPick,
        groupSelect,
        selectedFriends,
        isPaidValid,
        pctTotal,
        oweTotal,
        mode,
        payersNeedingPM.length,
    ]);
    // show error outlines only when user has filled required fields for split flow
    // show error outlines only once the split-required fields are filled
    const splitFieldsFilled = useMemo(() => {
        return (
            expenseMode === "split" &&
            desc?.trim() &&
            category &&
            currency &&
            num(amount) > 0 &&
            // at least one other friend selected besides me
            selectedFriends.filter((f) => String(f?._id) !== String(user?._id)).length > 0
        );
    }, [expenseMode, desc, category, currency, amount, selectedFriends, user]);

    // Paid-by side issues: missing payers OR paid total mismatch OR payers missing PM
    const paidHasIssue = useMemo(() => {
        if (!splitFieldsFilled) return false;
        const payers = selectedFriends.filter((f) => f.paying);
        if (payers.length === 0) return true;                     // nobody marked as paying
        if (!isPaidValid) return true;                             // collected != amount
        if ((payersNeedingPM || []).length > 0) return true;       // a payer has multiple PMs but did not pick one
        return false;
    }, [splitFieldsFilled, selectedFriends, isPaidValid, payersNeedingPM]);

    // Split/owed side issues: no owers OR mode-specific mismatch
    const splitHasIssue = useMemo(() => {
        if (!splitFieldsFilled) return false;
        const owrs = selectedFriends.filter((f) => f.owing);
        if (owrs.length === 0) return true;                       // nobody owes
        if (mode === "percent" && Number(pctTotal.toFixed(2)) !== 100) return true;
        if (mode === "value" && Number(oweTotal.toFixed(2)) !== num(amount)) return true;
        // equal mode: computed owe total must equal amount
        if (mode === "equal" && Number(oweTotal.toFixed(2)) !== num(amount)) return true;
        return false;
    }, [splitFieldsFilled, selectedFriends, mode, oweTotal, pctTotal, amount]);


    // final: if either side has an issue, mark the summary buttons
    const summaryHasIssue = useMemo(() => {
        return paidHasIssue || splitHasIssue;
    }, [paidHasIssue, splitHasIssue]);

    // ---------- submit ----------
    const handleSubmit = async () => {
        const amt = num(amount);
        try {
            setLoading(true);
            const payload = {
                description: desc,
                amount: amt,
                category,
                mode: expenseMode,
                splitMode: expenseMode === "split" ? mode : "equal",
                typeOf: "expense",
                date: expenseDate,
                currency,
            };

            if (expenseMode === "personal" && paymentMethod) {
                payload.paymentMethodId = paymentMethod;
            }
            if (expenseMode === "split") {
                payload.splits = selectedFriends
                    .filter((f) => f.owing || f.paying)
                    .map((f) => ({
                        friendId: f?._id,
                        owing: !!f.owing,
                        paying: !!f.paying,
                        oweAmount: num(f.oweAmount),
                        owePercent: f.owePercent,
                        payAmount: num(f.payAmount),
                        paymentMethodId: f.selectedPaymentMethodId,
                    }));
                if (groupSelect?._id) payload.groupId = groupSelect._id;
            }

            await createExpense(payload, userToken);
            // logEvent?.("newExpense", { currency, amount: payload.amount, category: payload.category, type: payload.mode, splitMode: payload.splitMode });

            // reset
            setDesc("");
            setCategory("default");
            setAmount("");
            setMode("equal");
            setSelectedFriends([]);
            setGroupSelect(null);
            setExpenseDate(todayISO());
            await fetchPaymentMethods();
            // go back if preselected
            // go back if preselected (fixed ref usage)
            console.debug("[NewExpense] submit: hasPreselectedGroup:", hasPreselectedGroup.current, "groupSelectId:", groupSelect?._id);
            console.debug("[NewExpense] submit: hasPreselectedFriend:", hasPreselectedFriend.current, "preselectedFriendId.current:", preselectedFriendId.current);

            if (hasPreselectedGroup.current && groupSelect?._id) {
                console.debug("[NewExpense] preselected group -> navigating back");
                hasPreselectedGroup.current = false;
                hasPreselectedFriend.current = false;
                preselectedFriendId.current = null;
                return router.back();
            }
            if (hasPreselectedFriend.current && preselectedFriendId.current) {
                console.debug("[NewExpense] preselected friend -> navigating back");
                hasPreselectedGroup.current = false;
                hasPreselectedFriend.current = false;
                preselectedFriendId.current = null;
                return router.back();
            }


            setBanner({ type: "success", text: "Expense saved." });
            setTimeout(() => setBanner(null), 2000);
        } catch (e) {
            setBanner({ type: "error", text: e?.message || "Failed to create expense." });
            setTimeout(() => setBanner(null), 3000);
        } finally {
            setLoading(false);
        }
    };

    // ---------- small helpers for UI summary ----------
    const defaultSummaryText = useMemo(() => {
        // default: "Paid by me — split by everyone equally"
        const me = selectedFriends.find((f) => String(f?._id) === String(user?._id));
        const others = selectedFriends.filter((f) => String(f?._id) !== String(user?._id));
        if (!me || others.length === 0) return "";
        return `Paid by you, split by ${others.length + 1} ${others.length + 1 === 1 ? "person" : "people"} equally`;
    }, [selectedFriends, user]);

    const editSummary = (which) => {
        // switch to corresponding tab and let user edit
        setActiveTab(which === "paid" ? "paid" : "owed");
    };

    // ---------- UI ----------
    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            <StatusBar style="light" />
            <Header title="New Expense" />
            <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 8, gap: 8 }}>
                <View style={styles.modeToggle}>
                    <TouchableOpacity
                        onPress={() => setExpenseMode("personal")}
                        style={[styles.modeBtn, expenseMode === "personal" && styles.modeBtnActive]}
                    >
                        <Text style={[styles.modeText, expenseMode === "personal" && styles.modeTextActive]}>Personal Expense</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => setExpenseMode("split")}
                        style={[styles.modeBtn, expenseMode === "split" && styles.modeBtnActive]}
                    >
                        <Text style={[styles.modeText, expenseMode === "split" && styles.modeTextActive]}>Split Expense</Text>
                    </TouchableOpacity>
                </View>

                {/* Search (split, when nothing selected) */}
                {expenseMode === "split" && !groupSelect && selectedFriends.filter((f) => f?._id !== user._id).length === 0 ? (
                    <View style={{ width: "100%", paddingTop: 10, flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 4 }}>
                        <TextInput
                            placeholder="Search friends or groups"
                            placeholderTextColor={styles.colors.mutedFallback}
                            value={search}
                            onChangeText={setSearch}
                            autoCapitalize="none"
                            autoCorrect={false}
                            style={styles.input}
                        />
                        <Text style={styles.helperSmall}>Select a group or a friend you want to split with.</Text>
                    </View>
                ) : null}

                {/* Banner */}
                {banner ? (
                    <View
                        style={[
                            styles.banner,
                            banner?.type === "success" && styles.bannerSuccess,
                            banner?.type === "error" && styles.bannerError,
                            banner?.type === "info" && styles.bannerInfo,
                        ]}
                    >
                        <Text style={styles.bannerText}>{banner?.text || "Banner Texxt"}</Text>
                        <TouchableOpacity onPress={() => setBanner(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Text style={{ color: styles.colors.mutedFallback }}>✕</Text>
                        </TouchableOpacity>
                    </View>
                ) : null}

                <ScrollView
                    style={{ flex: 1 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} tintColor={styles.colors.ctaFallback} />}
                    contentContainerStyle={{ paddingBottom: 150 }}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Split: suggestions + selection chips */}
                    {expenseMode === "split" && (groups.length > 0 || friends.length > 0) ? (
                        <>
                            {/* Selected summary */}
                            {(groupSelect || selectedFriends.filter((f) => f?._id !== user._id).length > 0) && (
                                <View style={{ marginTop: 8, gap: 8 }}>
                                    {!groupSelect ? (
                                        <View>
                                            <Text style={styles.sectionLabel}>Friend Selected</Text>
                                            {selectedFriends
                                                .filter((f) => f?._id !== user._id)
                                                .map((fr) => (
                                                    <View key={`sel-${fr._id}`} style={styles.selRow}>
                                                        <Text style={styles.selText}>{fr.name}</Text>
                                                        <TouchableOpacity onPress={() => removeFriend(fr)}>
                                                            <Text style={{ color: styles.colors.dangerFallback }}>Remove</Text>
                                                        </TouchableOpacity>
                                                    </View>
                                                ))}
                                        </View>
                                    ) : (
                                        <View>
                                            <Text style={styles.sectionLabel}>Group Selected</Text>
                                            <View style={styles.selRow}>
                                                <Text style={styles.selText}>{groupSelect.name}</Text>
                                                <TouchableOpacity onPress={() => toggleGroup(groupSelect)}>
                                                    <Text style={{ color: styles.colors.dangerFallback }}>Remove</Text>
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    )}
                                </View>
                            )}

                            {/* Suggestions / search results */}
                            {!(groupSelect || selectedFriends.filter((f) => f?._id !== user._id).length > 0) && (
                                <View style={{ marginTop: 12, gap: 12 }}>
                                    {filteredGroups.length > 0 && (
                                        <View>
                                            <Text style={styles.suggestHeader}>{search.length === 0 ? "SUGGESTED " : ""}GROUPS</Text>
                                            <View style={styles.chipsWrap}>
                                                {filteredGroups.map((g) => {
                                                    const active = groupSelect?._id === g._id;
                                                    return (
                                                        <TouchableOpacity key={g._id} onPress={() => toggleGroup(g)} style={[styles.chip, active && styles.chipActive]}>
                                                            <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                                                                {g.name}
                                                            </Text>
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                            </View>
                                        </View>
                                    )}
                                    {filteredFriends.length > 0 && (
                                        <View>
                                            <Text style={styles.suggestHeader}>{search.length === 0 ? "SUGGESTED " : ""}FRIENDS</Text>
                                            <View style={styles.chipsWrap}>
                                                {filteredFriends.map((fr) => {
                                                    const active = selectedFriends.some((s) => s._id === fr._id);
                                                    return (
                                                        <TouchableOpacity key={fr._id} onPress={() => toggleFriend(fr)} style={[styles.chip, active && styles.chipActive]}>
                                                            <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                                                                {fr.name}
                                                            </Text>
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                            </View>
                                        </View>
                                    )}
                                </View>
                            )}
                        </>
                    ) : null}

                    {/* Create expense */}
                    {(expenseMode === "personal" || selectedFriends.filter((f) => f?._id !== user._id).length > 0) && (
                        <View style={{ marginTop: 10, gap: 10 }}>
                            <Text style={styles.sectionLabel}>Create Expense</Text>

                            {/* Description */}
                            <TextInput placeholder="Description" placeholderTextColor={styles.colors.mutedFallback} value={desc} onChangeText={setDesc} style={styles.input} />

                            {/* Currency + Amount */}
                            <View style={{ flexDirection: "row", gap: 8 }}>
                                <TouchableOpacity onPress={openCurrencySheet} style={[styles.input, styles.btnLike, { flex: 1 }]}>
                                    <Text style={[styles.btnLikeText, currency ? { color: styles.colors.textFallback } : { color: styles.colors.mutedFallback }]}>
                                        {currency || "Currency"}
                                    </Text>
                                </TouchableOpacity>
                                <TextInput
                                    placeholder="Amount"
                                    placeholderTextColor={styles.colors.mutedFallback}
                                    keyboardType="number-pad"
                                    value={String(amount)}
                                    onChangeText={(text) => {
                                        // allow digits and a single decimal point
                                        const cleaned = text.replace(/[^0-9.]/g, "");
                                        // prevent multiple dots
                                        const parts = cleaned.split(".");
                                        const numericValue = parts.length > 1 ? `${parts[0]}.${parts.slice(1).join("")}` : cleaned;
                                        setAmount(numericValue);
                                    }}

                                    style={[styles.input, { flex: 2 }]}
                                />
                            </View>

                            {/* Category + Date */}
                            <View style={{ flexDirection: "row", gap: 8 }}>
                                <TouchableOpacity onPress={openCategorySheet} style={[styles.input, styles.btnLike, { flex: 1 }]}>
                                    <Text style={[styles.btnLikeText, category ? { color: styles.colors.textFallback } : { color: styles.colors.mutedFallback }]}>{selectedCategory || category || "Category"}</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={() => setShowDatePicker(true)}
                                    style={[styles.input, { flex: 1, justifyContent: "center" }]}
                                    activeOpacity={0.7}
                                >
                                    <Text style={expenseDate ? { color: styles.colors.textFallback } : { color: styles.colors.mutedFallback }}>
                                        {expenseDate ? formatReadable(expenseDate) : "Select date"}
                                    </Text>
                                </TouchableOpacity>

                                <DateTimePickerModal
                                    isVisible={showDatePicker}
                                    mode="date"
                                    date={parseISODate(expenseDate)}
                                    onConfirm={(date) => {
                                        setShowDatePicker(false);
                                        setExpenseDate(toISODate(date));
                                    }}
                                    onCancel={() => setShowDatePicker(false)}
                                />
                            </View>

                            {/* Personal: pick account */}
                            {expenseMode === "personal" && (
                                <TouchableOpacity onPress={() => openPaymentSheet({ context: "personal" })} style={[styles.input, styles.btnLike]}>
                                    <Text style={[styles.btnLikeText, paymentMethod ? { color: styles.colors.textFallback } : { color: styles.colors.mutedFallback }]}>
                                        {paymentMethod ? (paymentMethods.find((a) => a._id === paymentMethod)?.label || "Payment Account") : "Payment Account"}
                                    </Text>
                                </TouchableOpacity>
                            )}

                            {/* Split flow */}
                            {expenseMode === "split" && desc && num(amount) > 0 && category ? (
                                <>


                                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                                        {/* Paid by button */}
                                        <TouchableOpacity
                                            onPress={() => setActiveTab("paid")}
                                            style={[
                                                styles.summaryBtn,
                                                activeTab === "paid" && styles.summaryBtnActive,
                                                paidHasIssue && styles.summaryBtnError, // <-- add this
                                            ]}
                                        >
                                            <Text style={[styles.summaryLabel, paidHasIssue && styles.summaryLabelError]}>Paid by</Text>
                                            <Text style={styles.summaryValue}>
                                                {(() => {
                                                    const payers = selectedFriends.filter((f) => f.paying);
                                                    if (payers.length === 0) return "—";
                                                    if (payers.length === 1) {
                                                        const p = payers[0];
                                                        return p._id === user._id ? "You" : p.name;
                                                    }
                                                    return `${payers.length} people`;
                                                })()}
                                            </Text>
                                        </TouchableOpacity>

                                        {/* Split by button */}
                                        <TouchableOpacity
                                            onPress={() => setActiveTab("owed")}
                                            style={[
                                                styles.summaryBtn,
                                                activeTab === "owed" && styles.summaryBtnActive,
                                                splitHasIssue && styles.summaryBtnError, // <-- add this
                                            ]}
                                        >
                                            <Text style={[styles.summaryLabel, splitHasIssue && styles.summaryLabelError]}>Split by</Text>
                                            <Text style={styles.summaryValue}>
                                                {mode === "equal"
                                                    ? "equally"
                                                    : mode === "value"
                                                        ? "amounts"
                                                        : "percentages"}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>





                                    {/* Paid by tab */}
                                    {activeTab === "paid" ? (
                                        <>
                                            <Text style={[styles.sectionLabel, { marginTop: 8 }]}>
                                                Paid by <Text style={styles.helperSmall}> (Select the people who paid.)</Text>
                                            </Text>

                                            <View style={styles.chipsWrap}>
                                                {selectedFriends.map((f) => {
                                                    const active = !!f.paying;
                                                    return (
                                                        <TouchableOpacity key={`pay-${f?._id}`} onPress={() => togglePaying(f?._id)} style={[styles.chip2, active && styles.chip2Active]}>
                                                            <Text style={[styles.chip2Text, active && styles.chip2TextActive]} numberOfLines={1}>
                                                                {f?.name}
                                                            </Text>
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                            </View>

                                            {/* Per-payer inputs / PM pick */}
                                            {selectedFriends.filter((f) => f.paying).length > 0 && (
                                                <View style={{ gap: 8 }}>
                                                    {selectedFriends
                                                        .filter((f) => f.paying)
                                                        .map((f) => {
                                                            const many = Array.isArray(f.paymentMethods) && f.paymentMethods.length > 1;
                                                            const sel = f.paymentMethods?.find((m) => m.paymentMethodId === f.selectedPaymentMethodId);
                                                            if (selectedFriends.filter((f) => f.paying).length == 1 && !many) {
                                                                return null
                                                            }
                                                            return (
                                                                <View key={`pr-${f?._id}`} style={styles.rowBetween}>
                                                                    <Text style={{ color: styles.colors.textFallback, flex: 1 }} numberOfLines={1}>
                                                                        {f?.name}
                                                                    </Text>
                                                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                                                        {many ? (
                                                                            <TouchableOpacity
                                                                                onPress={() => openPaymentSheet({ context: "split", friendId: f?._id })}
                                                                                style={[
                                                                                    styles.pmBtn,
                                                                                    sel ? { borderColor: styles.colors.borderFallback, backgroundColor: "transparent" } : { borderColor: styles.colors.dangerFallback, backgroundColor: "rgba(244,67,54,0.08)" },
                                                                                ]}
                                                                            >
                                                                                <Text style={[styles.pmBtnText, { color: sel ? styles.colors.textFallback : styles.colors.dangerFallback }]} numberOfLines={1}>
                                                                                    {sel ? sel.label || sel.type || "Payment Method" : "Select"}
                                                                                </Text>
                                                                            </TouchableOpacity>
                                                                        ) : null}
                                                                        {selectedFriends.filter((x) => x.paying).length > 1 ? (
                                                                            <TextInput
                                                                                placeholder="Amount"
                                                                                placeholderTextColor={styles.colors.mutedFallback}
                                                                                keyboardType="decimal-pad"
                                                                                value={String(f.payAmount || "")}
                                                                                onChangeText={(v) => setPayAmount(f?._id, v)}
                                                                                style={[styles.input, { width: 100, textAlign: "right" }]}
                                                                            />
                                                                        ) : null}
                                                                    </View>
                                                                </View>
                                                            );
                                                        })}
                                                    {selectedFriends.filter((f) => f.paying).length > 1 && !isPaidValid ? (
                                                        <View style={{ alignItems: "center", marginTop: 4 }}>
                                                            <Text style={styles.helperMono}>{fmtMoney(currency, paidTotal)} / {fmtMoney(currency, num(amount))}</Text>
                                                            <Text style={[styles.helperMono, { color: styles.colors.mutedFallback }]}>{fmtMoney(currency, num(amount) - paidTotal)} left</Text>
                                                        </View>
                                                    ) : null}
                                                </View>
                                            )}
                                        </>
                                    ) : null}

                                    {/* Owed by tab */}
                                    {activeTab === "owed" ? (

                                        <>
                                            <Text style={[styles.sectionLabel, { marginTop: 10 }]}>
                                                Owed by <Text style={styles.helperSmall}> (Select the people who owe.)</Text>
                                            </Text>

                                            {selectedFriends.length > 1 ? (
                                                <View style={{ marginTop: 8 }}>
                                                    <View style={{ flexDirection: "row", gap: 8 }}>
                                                        {["equal", "value", "percent"].map((m) => {
                                                            const active = mode === m;
                                                            return (
                                                                <TouchableOpacity
                                                                    key={m}
                                                                    onPress={() => {
                                                                        // switch mode and apply the requested behavior
                                                                        setMode(m);

                                                                        if (m === "equal") {
                                                                            // mark everyone who is eligible as owing and distribute equal owe amounts
                                                                            setSelectedFriends((prev) => {
                                                                                const marked = prev.map((f) => ({ ...f, owing: !!f.owing || true, owePercent: undefined }));
                                                                                return distributeEqualOwe(marked);
                                                                            });
                                                                        } else if (m === "value") {
                                                                            // set each owing person's oweAmount to 0 so user enters values
                                                                            setSelectedFriends((prev) =>
                                                                                prev.map((f) => (f.owing ? { ...f, oweAmount: 0, owePercent: undefined } : { ...f, oweAmount: 0 }))
                                                                            );
                                                                        } else if (m === "percent") {
                                                                            // prepare percent inputs starting from 0%
                                                                            setSelectedFriends((prev) => prev.map((f) => (f.owing ? { ...f, owePercent: f.owePercent ?? 0, oweAmount: 0 } : f)));
                                                                        }
                                                                    }}
                                                                    style={[styles.modeMini, active && styles.modeMiniActive]}
                                                                >
                                                                    <Text style={[styles.modeMiniText, active && styles.modeMiniTextActive]}>
                                                                        {m === "equal" ? "=" : m === "value" ? "1.23" : "%"}
                                                                    </Text>
                                                                </TouchableOpacity>
                                                            );
                                                        })}

                                                    </View>

                                                    {/* Per-ower inputs based on mode */}
                                                    <View style={{ marginTop: 6, gap: 8 }}>
                                                        {selectedFriends
                                                            .filter((f) => f.owing || mode === "equal") // show rows when equal mode too
                                                            .map((f) => {
                                                                const isOwing = !!f.owing;
                                                                return (
                                                                    <TouchableOpacity
                                                                        key={`ow-${f?._id}`}
                                                                        onPress={() => {
                                                                            // toggle owing flag for this friend (works in all modes)
                                                                            setSelectedFriends((prev) => {
                                                                                const updated = prev.map((x) => (x._id === f?._id ? { ...x, owing: !x.owing } : x));
                                                                                // re-run equal distribution if we're in equal mode
                                                                                if (mode === "equal") return distributeEqualOwe(updated);
                                                                                return updated;
                                                                            });
                                                                        }}
                                                                        activeOpacity={0.8}
                                                                        style={[styles.rowBetween, { paddingVertical: mode === "equal" ? 8 : 0 }]}
                                                                    >
                                                                        <View style={{ flexDirection: "row", alignItems: "center", flex: 1, gap: 4 }}>
                                                                            {/* Radio (equal mode) or simple bullet */}
                                                                            {mode === "equal" ? (
                                                                                <View style={styles.radioWrap}>
                                                                                    <View style={[styles.radioOuter, isOwing && styles.radioOuterActive]}>
                                                                                        {isOwing ? <View style={styles.radioInner} /> : null}
                                                                                    </View>
                                                                                </View>
                                                                            ) : null}

                                                                            <Text style={{ color: styles.colors.textFallback, flex: 1 }} numberOfLines={1}>
                                                                                {f?.name}
                                                                            </Text>
                                                                        </View>

                                                                        {/* Right side: input or computed value depending on mode */}
                                                                        {mode === "percent" ? (
                                                                            <TextInput
                                                                                placeholder="Percent"
                                                                                placeholderTextColor={styles.colors.mutedFallback}
                                                                                keyboardType="decimal-pad"
                                                                                value={String(f.owePercent ?? "")}
                                                                                onChangeText={(v) => setOwePercent(f?._id, v)}
                                                                                style={[styles.input, { width: 100, textAlign: "right" }]}
                                                                            />
                                                                        ) : mode === "value" ? (
                                                                            <TextInput
                                                                                placeholder="Amount"
                                                                                placeholderTextColor={styles.colors.mutedFallback}
                                                                                keyboardType="decimal-pad"
                                                                                value={String(f.oweAmount || "")}
                                                                                onChangeText={(v) => setOweAmount(f?._id, v)}
                                                                                style={[styles.input, { width: 100, textAlign: "right" }]}
                                                                            />
                                                                        ) : (
                                                                            // equal mode: display computed oweAmount
                                                                            <Text style={{ color: styles.colors.textFallback, marginVertical: 4 }}>
                                                                                {fmtMoney(currency, f.oweAmount || 0)}
                                                                            </Text>
                                                                        )}
                                                                    </TouchableOpacity>
                                                                );
                                                            })}

                                                    </View>
                                                </View>
                                            ) : null}
                                        </>
                                    ) : null}
                                </>
                            ) : null}
                        </View>
                    )}

                    {/* Loan CTA */}
                </ScrollView>
                <SheetCurrencies innerRef={currencySheetRef} value={currency} options={currencyOptions} onSelect={setCurrency} onClose={() => { }} />
                <SheetCategories innerRef={categorySheetRef} value={category} options={categoryOptions} onSelect={setCategory} onClose={() => { }} />
                <SheetPayments innerRef={paymentSheetRef} value={paymentValue} options={paymentOptions} onSelect={(id) => handleSelectPayment(id)} onClose={() => { }} />

                <View style={styles.footer}>
                    <Text style={styles.hint} numberOfLines={2}>
                        {hint}
                    </Text>
                    <TouchableOpacity onPress={handleSubmit} disabled={!canSubmit || loading} style={[styles.submitBtn, (!canSubmit || loading) ? styles.submitDisabled : null]}>
                        <Text style={[styles.submitText, (!canSubmit || loading) && { opacity: 0.9 }]}>{loading ? "Saving…" : "Save Expense"}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </SafeAreaView>
    );
}

// ---------------- Theme-aware styles ----------------
const createStyles = (theme = {}) => {
    const palette = {
        background: theme?.colors?.background ?? "#121212",
        card: theme?.colors?.card ?? "#1f1f1f",
        cardAlt: theme?.colors?.cardAlt ?? "#181818",
        border: theme?.colors?.border ?? "#333",
        text: theme?.colors?.text ?? "#EBF1D5",
        muted: theme?.colors?.muted ?? "#81827C",
        helperMuted: theme?.colors?.helperMuted ?? "#a0a0a0",
        primary: theme?.colors?.primary ?? "#60DFC9",
        cta: theme?.colors?.cta ?? "#00C49F",
        danger: theme?.colors?.danger ?? "#ef4444",
    };

    const s = StyleSheet.create({
        safe: { flex: 1, backgroundColor: palette.background },
        header: {
            paddingHorizontal: 16,
            paddingTop: Platform.OS === "android" ? 6 : 0,
            paddingBottom: 10,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: palette.text,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
        },
        headerTitle: { color: palette.text, fontSize: 24, fontWeight: "700" },

        input: {
            backgroundColor: palette.card,
            color: palette.text,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: palette.border,
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontSize: 16,
            width: "100%",
        },
        btnLike: { justifyContent: "center" },
        btnLikeText: { fontSize: 16, color: palette.text },

        modeToggle: {
            flexDirection: "row",
            alignSelf: "center",
            backgroundColor: palette.card,
            borderRadius: 999,
            padding: 4,
            borderWidth: 1,
            borderColor: palette.border,
        },
        modeBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999 },
        modeBtnActive: { backgroundColor: palette.text },
        modeText: { color: palette.text, fontSize: 13, fontWeight: "600" },
        modeTextActive: { color: palette.background },

        sectionLabel: { color: palette.cta, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" },
        helperSmall: { color: palette.muted, fontSize: 12 },
        helperMono: { color: palette.text, fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }) },

        chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
        chip: { paddingHorizontal: 12, height: 40, borderRadius: 12, borderWidth: 1, borderColor: palette.border, justifyContent: "center", backgroundColor: palette.card },
        chipActive: { backgroundColor: "#DFF3E8", borderColor: "#DFF3E8" },
        chipText: { color: palette.text },
        chipTextActive: { color: palette.text, fontWeight: "700" },

        chip2: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, borderWidth: 2, borderColor: palette.muted, backgroundColor: "transparent" },
        chip2Active: { backgroundColor: `${palette.cta}33`, borderColor: `${palette.cta}33` },
        chip2Text: { color: palette.text },
        chip2TextActive: { color: palette.text, fontWeight: "700" },

        suggestHeader: { color: palette.primary, fontSize: 12, letterSpacing: 1, marginBottom: 5 },

        selRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", height: 30 },
        selText: { color: palette.text, fontSize: 16, textTransform: "capitalize" },

        rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },

        pmBtn: {
            borderWidth: 1,
            borderColor: palette.border,
            paddingHorizontal: 10,
            paddingVertical: 8,
            borderRadius: 10,
            maxWidth: 180,
            alignItems: "center",
            justifyContent: "center",
        },
        pmBtnText: { fontSize: 14, color: palette.text },

        banner: {
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderRadius: 8,
            borderWidth: 1,
            backgroundColor: palette.card,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
        },
        bannerSuccess: { backgroundColor: "rgba(0,150,136,0.16)", borderColor: "#009688" },
        bannerError: { backgroundColor: "rgba(244,67,54,0.12)", borderColor: "#f44336" },
        bannerInfo: { backgroundColor: "rgba(158,158,158,0.12)", borderColor: "#9e9e9e" },
        bannerText: { color: palette.text, flex: 1 },

        footer: {
            paddingTop: 6,
            paddingBottom: 12,
            paddingHorizontal: 16,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: palette.border,
            backgroundColor: palette.background,
        },
        hint: { color: palette.helperMuted, textAlign: "center", fontSize: 12, minHeight: 16, marginBottom: 6 },
        submitBtn: { height: 48, borderRadius: 12, backgroundColor: palette.cta, alignItems: "center", justifyContent: "center" },
        submitText: { color: palette.background, fontWeight: "700", fontSize: 16 },
        submitDisabled: { backgroundColor: palette.muted },

        // Modals
        modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 16 },
        modalCard: { backgroundColor: palette.card, borderRadius: 12, padding: 16, width: "100%" },
        modalTitle: { color: palette.text, fontSize: 18, fontWeight: "700", marginBottom: 8 },
        modalBtn: { backgroundColor: palette.card, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
        modalBtnText: { color: palette.text, fontWeight: "600" },

        pickerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, paddingHorizontal: 10, borderRadius: 8, marginBottom: 6, backgroundColor: "rgba(255,255,255,0.02)" },

        // mini mode toggle buttons (=, %, 1.23)
        modeMini: {
            flex: 1,
            paddingVertical: 6,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: palette.border,
            alignItems: "center",
            justifyContent: "center",
            marginRight: 6,
            backgroundColor: palette.card,
        },
        modeMiniActive: {
            backgroundColor: `${palette.cta}33`,
            borderColor: palette.cta,
        },
        modeMiniText: {
            color: palette.text,
            fontSize: 14,
            fontWeight: "600",
        },
        modeMiniTextActive: {
            color: palette.cta,
            fontWeight: "700",
        },

        // tabs
        tabBtn: {
            flex: 1,
            paddingVertical: 10,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: palette.card,
        },
        tabBtnActive: {
            backgroundColor: `${palette.cta}22`,
        },
        tabText: {
            color: palette.text,
            fontWeight: "600",
        },
        tabTextActive: {
            color: palette.cta,
        },

        // color tokens available for inline use
        colors: {
            backgroundFallback: palette.background,
            cardFallback: palette.card,
            cardAltFallback: palette.cardAlt,
            borderFallback: palette.border,
            textFallback: palette.text,
            mutedFallback: palette.muted,
            helperMutedFallback: palette.helperMuted,
            primaryFallback: palette.primary,
            ctaFallback: palette.cta,
            dangerFallback: palette.danger,
        },
        summaryBtn: {
            flex: 1,
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: palette.border,
            backgroundColor: palette.card,
        },
        summaryBtnActive: {
            borderColor: palette.cta,
        },
        summaryLabel: {
            fontSize: 12,
            color: palette.muted,
            marginBottom: 2,
        },
        summaryValue: {
            fontSize: 14,
            color: palette.text,
            fontWeight: "600",
        },
        radioWrap: { width: 28, alignItems: "center", justifyContent: "center" },
        radioOuter: {
            width: 18,
            height: 18,
            borderRadius: 18,
            borderWidth: 2,
            borderColor: "rgba(255,255,255,0.15)",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "transparent",
        },
        radioOuterActive: {
            borderColor: palette.cta,
            backgroundColor: `${palette.cta}22`,
        },
        radioInner: {
            width: 10,
            height: 10,
            borderRadius: 10,
            backgroundColor: palette.cta,
        },

        summaryBtnError: {

            backgroundColor: "rgba(244,67,54,0.06)",
        },
        summaryLabelError: {
            color: palette.danger,
        },
        summaryValueError: {
            color: palette.danger,
        },



    });

    s.colors = s.colors;
    return s;
};

// ---------- small date helpers (moved after styles for clarity) ----------
const parseISODate = (isoStr) => {
    if (!isoStr) return new Date();
    const parts = String(isoStr).split("-");
    if (parts.length !== 3) return new Date(isoStr);
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
};
const toISODate = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
};
const formatReadable = (isoStr) => {
    if (!isoStr) return "";
    try {
        const d = parseISODate(isoStr);
        return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
    } catch {
        return isoStr;
    }
};
