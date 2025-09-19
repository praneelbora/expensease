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
    const [category, setCategory] = useState(TEST_MODE ? "TEST_CATEGORY" : "");
    const [expenseDate, setExpenseDate] = useState(todayISO());

    const [groupSelect, setGroupSelect] = useState(null);
    const [selectedFriends, setSelectedFriends] = useState([]); // objects incl. me

    const [mode, setMode] = useState("equal"); // 'equal' | 'value' | 'percent'

    const [search, setSearch] = useState("");
    const [banner, setBanner] = useState(null); // {type, text}
const [showDatePicker, setShowDatePicker] = useState(false);

// parse YYYY-MM-DD to Date
const parseISODate = (isoStr) => {
  if (!isoStr) return new Date();
  const parts = String(isoStr).split("-");
  if (parts.length !== 3) return new Date(isoStr);
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
};

// format Date to YYYY-MM-DD
const toISODate = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

// user-friendly label for the input (e.g. "19 Sep 2025")
const formatReadable = (isoStr) => {
  if (!isoStr) return "";
  try {
    const d = parseISODate(isoStr);
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return isoStr;
  }
};


    const [paymentModalCtx, setPaymentModalCtx] = useState({ context: "personal", friendId: null });
    const [paymentMethod, setPaymentMethod] = useState(null); // personal

    const hasPreselectedGroup = useRef(false);
    const hasPreselectedFriend = useRef(false);
    const preselectedFriendId = useRef(null);
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
        if (!userToken) return;
        try {
            const data = await getFriends(userToken);
            setFriends(Array.isArray(data) ? data : []);
        } catch (e) {
            console.warn("friends:", e?.message || e);
        }
    }, [userToken]);

    const pullGroups = useCallback(async () => {
        if (!userToken) return;
        try {
            const data = await getAllGroups(userToken);
            setGroups(Array.isArray(data) ? data : []);
        } catch (e) {
            console.warn("groups:", e?.message || e);
        }
    }, [userToken]);

    const pullSuggestions = useCallback(async () => {
        if (!userToken) return;
        try {
            const data = await getSuggestions(userToken);
            setSuggestions(data || null);
        } catch (e) {
            console.warn("suggestions:", e?.message || e);
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
                selected: selectedFriends.some((s) => String(s._id) === String(f._id)),
                suggested: suggestedIds.includes(String(f._id)),
            }));

            if (!q) {
                arr = arr.filter((f) => f.suggested);
            } else {
                arr = arr.filter(
                    (f) => f.name?.toLowerCase?.().includes(lower) || f.email?.toLowerCase?.().includes(lower)
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

    // ---------- preselect via params ----------
    useEffect(() => {
        if (!groups.length && !friends.length) return;

        const gid = params?.groupId;
        const fid = params?.friendId;
        if (gid && !hasPreselectedGroup.current) {
            const g = groups.find((x) => String(x._id) === String(gid));
            if (g) {
                setExpenseMode("split");
                hasPreselectedGroup.current = true;
                toggleGroup(g);
            }
        }

        if (fid && !hasPreselectedFriend.current) {
            const f = friends.find((x) => String(x._id) === String(fid));
            if (f) {
                setExpenseMode("split");
                hasPreselectedFriend.current = true;
                preselectedFriendId.current = f._id;
                toggleFriend(f);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params?.groupId, params?.friendId, groups, friends]);

    // ---------- selection handlers ----------
    const addMeIfNeeded = (list) => {
        let updated = list.map((x) => {
            if (x._id === user._id) {
                return { ...x, name: `${user.name} (Me)` };
            }
            return x;
        });

        const hasNonMe = updated.some((x) => x._id !== user._id);
        const meExists = updated.some((x) => x._id === user._id);

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
                    const raw = map[f._id] || [];
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
        let upd = [...selectedFriends];
        const exists = upd.some((f) => f._id === friend._id);
        if (exists) {
            upd = upd.filter((f) => f._id !== friend._id);
        } else {
            upd = [...upd, { ...friend, paying: false, owing: false, payAmount: 0, oweAmount: 0, owePercent: 0 }];
        }
        upd = addMeIfNeeded(upd);
        setSelectedFriends(upd);
        updateFriendsPaymentMethods(upd.map((f) => f._id));
        friendFilter(search);
    };

    const toggleGroup = (group) => {
        if (groupSelect?._id === group._id) {
            // deselect group
            const ids = new Set(group.members.map((m) => String(m._id)));
            const upd = selectedFriends.filter((f) => !ids.has(String(f._id)));
            setSelectedFriends(upd);
            setGroupSelect(null);
        } else {
            const newMembers = (group.members || [])
                .filter((gm) => !selectedFriends.some((f) => String(f._id) === String(gm._id) && gm._id !== user._id))
                .map((gm) => ({ ...gm, paying: false, owing: false, payAmount: 0, oweAmount: 0, owePercent: 0 }));
            const upd = addMeIfNeeded([...selectedFriends, ...newMembers]);
            setSelectedFriends(upd);
            setGroupSelect(group);
            updateFriendsPaymentMethods(upd.map((f) => f._id));
        }
    };

    const removeFriend = (friend) => {
        let upd = selectedFriends.filter((f) => f._id !== friend._id);
        const onlyMeLeft = upd.length === 1 && upd[0]._id === user._id;
        if (onlyMeLeft || upd.length === 0) {
            upd = upd.filter((f) => f._id !== user._id);
        }
        setSelectedFriends(upd);
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
        let upd = selectedFriends.map((f) => (f._id === friendId ? { ...f, paying: !f.paying } : f));
        upd = distributeEqualPay(upd);
        setSelectedFriends(upd);
        updateFriendsPaymentMethods(upd.map((f) => f._id));
    };

    const toggleOwing = (friendId) => {
        let upd = selectedFriends.map((f) => (f._id === friendId ? { ...f, owing: !f.owing } : f));
        if (mode === "equal") upd = distributeEqualOwe(upd);
        setSelectedFriends(upd);
    };

    const setOwePercent = (friendId, percent) => {
        const p = num(percent);
        setSelectedFriends((prev) =>
            prev.map((f) =>
                f._id === friendId ? { ...f, owePercent: p, oweAmount: Number((num(amount) * (p / 100)).toFixed(2)) } : f
            )
        );
    };
    const setOweAmount = (friendId, v) => {
        const a = num(v);
        setSelectedFriends((prev) => prev.map((f) => (f._id === friendId ? { ...f, oweAmount: a } : f)));
    };

    const setPayAmount = (friendId, v) => {
        const a = num(v);
        setSelectedFriends((prev) => prev.map((f) => (f._id === friendId ? { ...f, payAmount: a } : f)));
    };

    // react to amount change: reset split mode-derived fields
    useEffect(() => {
        setMode("equal");
        setSelectedFriends((prev) =>
            prev.map((f) => ({ ...f, paying: false, owing: false, payAmount: 0, oweAmount: 0, owePercent: 0 }))
        );
    }, [amount]);

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
        setSelectedFriends((prev) => prev.map((f) => (f._id === paymentModalCtx.friendId ? { ...f, selectedPaymentMethodId: id } : f)));
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
        const a = categoryOptions.filter((opt) => opt.value === category)
        if (a.length == 1) return a[0].label


    }, [category])
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
        const hasAny = groupSelect || selectedFriends.some((f) => f._id !== user._id);
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

        const hasAny = groupSelect || selectedFriends.some((f) => f._id !== user._id);
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
                        friendId: f._id,
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
            setCategory("");
            setAmount("");
            setMode("equal");
            setSelectedFriends([]);
            setGroupSelect(null);
            setExpenseDate(todayISO());
            await fetchPaymentMethods();
            // go back if preselected
            if (hasPreselectedGroup.current && groupSelect?._id) return router.back();
            if (hasPreselectedFriend.current && preselectedFriendId?._id) return router.back();

            setBanner({ type: "success", text: "Expense saved." });
            setTimeout(() => setBanner(null), 2000);
        } catch (e) {
            setBanner({ type: "error", text: e?.message || "Failed to create expense." });
            setTimeout(() => setBanner(null), 3000);
        } finally {
            setLoading(false);
        }
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
                {expenseMode === "split" && !groupSelect && selectedFriends.filter((f) => f._id !== user._id).length === 0 ? (
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
                    contentContainerStyle={{ paddingBottom: 24 }}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Split: suggestions + selection chips */}
                    {expenseMode === "split" && (groups.length > 0 || friends.length > 0) ? (
                        <>
                            {/* Selected summary */}
                            {(groupSelect || selectedFriends.filter((f) => f._id !== user._id).length > 0) && (
                                <View style={{ marginTop: 8, gap: 8 }}>
                                    {!groupSelect ? (
                                        <View>
                                            <Text style={styles.sectionLabel}>Friend Selected</Text>
                                            {selectedFriends
                                                .filter((f) => f._id !== user._id)
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
                            {!(groupSelect || selectedFriends.filter((f) => f._id !== user._id).length > 0) && (
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
                    {(expenseMode === "personal" || selectedFriends.filter((f) => f._id !== user._id).length > 0) && (
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
                                        const numericValue = text.replace(/[^0-9]/g, "");
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
    // minimumDate={new Date(2000,0,1)} // optional
    // maximumDate={new Date()} // optional if you want to restrict to today/past
    onConfirm={(date) => {
      setShowDatePicker(false);
      setExpenseDate(toISODate(date));
    }}
    onCancel={() => setShowDatePicker(false)}
    // on iOS you can choose: 'spinner' | 'compact' | 'inline' via pickerStyle prop if needed
    // Android will show a calendar dialog by default
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
                                    {/* Paid by */}
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
                                                    return (
                                                        <View key={`pr-${f._id}`} style={styles.rowBetween}>
                                                            <Text style={{ color: styles.colors.textFallback, flex: 1 }} numberOfLines={1}>
                                                                {f.name}
                                                            </Text>
                                                            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                                                {many ? (
                                                                    <TouchableOpacity
                                                                        onPress={() => openPaymentSheet({ context: "split", friendId: f._id })}
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
                                                                        onChangeText={(v) => setPayAmount(f._id, v)}
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

                                    {/* Owed by */}
                                    {isPaidValid && payersNeedingPM.length === 0 ? (
                                        <>
                                            <Text style={[styles.sectionLabel, { marginTop: 10 }]}>
                                                Owed by <Text style={styles.helperSmall}> (Select the people who owe.)</Text>
                                            </Text>

                                            <View style={styles.chipsWrap}>
                                                {selectedFriends.map((f) => {
                                                    const active = !!f.owing;
                                                    return (
                                                        <TouchableOpacity key={`owe-${f._id}`} onPress={() => toggleOwing(f._id)} style={[styles.chip2, active && styles.chip2Active]}>
                                                            <Text style={[styles.chip2Text, active && styles.chip2TextActive]} numberOfLines={1}>
                                                                {f.name}
                                                            </Text>
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                            </View>

                                            {selectedFriends.filter((f) => f.owing).length > 1 ? (
                                                <View style={{ marginTop: 8 }}>
                                                    <View style={{ flexDirection: "row", gap: 8 }}>
                                                        {["equal", "value", "percent"].map((m) => {
                                                            const active = mode === m;
                                                            return (
                                                                <TouchableOpacity
                                                                    key={m}
                                                                    onPress={() => {
                                                                        setMode(m);
                                                                        if (m === "equal") {
                                                                            setSelectedFriends((prev) => distributeEqualOwe(prev));
                                                                        } else if (m === "percent") {
                                                                            setSelectedFriends((prev) => prev.map((f) => ({ ...f, owePercent: f.owePercent || 0, oweAmount: 0 })));
                                                                        } else {
                                                                            setSelectedFriends((prev) => prev.map((f) => ({ ...f, owePercent: undefined })));
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
                                                            .filter((f) => f.owing)
                                                            .map((f) => (
                                                                <View key={`ow-${f._id}`} style={styles.rowBetween}>
                                                                    <Text style={{ color: styles.colors.textFallback }} numberOfLines={1}>
                                                                        {f.name}
                                                                    </Text>
                                                                    {mode === "percent" ? (
                                                                        <TextInput
                                                                            placeholder="Percent"
                                                                            placeholderTextColor={styles.colors.mutedFallback}
                                                                            keyboardType="decimal-pad"
                                                                            value={String(f.owePercent ?? "")}
                                                                            onChangeText={(v) => setOwePercent(f._id, v)}
                                                                            style={[styles.input, { width: 100, textAlign: "right" }]}
                                                                        />
                                                                    ) : mode === "value" ? (
                                                                        <TextInput
                                                                            placeholder="Amount"
                                                                            placeholderTextColor={styles.colors.mutedFallback}
                                                                            keyboardType="decimal-pad"
                                                                            value={String(f.oweAmount || "")}
                                                                            onChangeText={(v) => setOweAmount(f._id, v)}
                                                                            style={[styles.input, { width: 100, textAlign: "right" }]}
                                                                        />
                                                                    ) : (
                                                                        <Text style={{ color: styles.colors.textFallback, marginVertical: 4 }}>{f.oweAmount || 0}</Text>
                                                                    )}
                                                                </View>
                                                            ))}
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
                {/* {showDatePicker && (
                    <DateTimePicker
                        value={parseISODate(expenseDate)}
                        mode="date"
                        display={Platform.OS === "ios" ? "spinner" : "calendar"} // choose preferred display
                        onChange={(event, selectedDate) => {
                            // Android: event.type can be 'dismissed' or 'set'
                            // iOS: selectedDate is provided and event is ignored
                            setShowDatePicker(Platform.OS === "ios"); // keep open on iOS if you want (spinner), close on Android after pick
                            if (selectedDate) {
                                setExpenseDate(toISODate(selectedDate));
                            }
                        }}
                    />
                )} */}
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
    });

    s.colors = s.colors;
    return s;
};
