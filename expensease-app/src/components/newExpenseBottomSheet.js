// components/MainBottomSheet.js
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "context/ThemeProvider";
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';

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
    KeyboardAvoidingView,
    Keyboard,
    Animated
} from "react-native";
import BottomSheetPaymentAccount from "~/btmShtPayAcc";
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
import { fetchFriendsPaymentMethods, createPaymentMethod } from "/services/PaymentMethodService";
// import { logEvent } from "/utils/analytics";
import SheetCurrencies from "~/shtCurrencies";
import SheetCategories from "~/shtCategories";
import SheetPayments from "~/shtPayments";
// add near other local imports (adjust path if your file is elsewhere)
import EmptyCTA from '~/cta';
import VoiceInput from "components/voiceInput"; // new component

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

/**
 * Theme-aware wrapper for BottomSheetModal used across the app.
 * - reads colors from ThemeProvider (falls back to sensible defaults)
 * - exposes same API as before (innerRef, onDismiss, children)
 * - keeps handle hidden (handleComponent={null}) as before
 */
const MainBottomSheet = ({ children, innerRef, selctedMode = "personal", onDismiss, snapPoints = ["100%"], backgroundStyle, addView = false, onClose, preSelectedFriendId, preSelectedGroupId, onSave }) => {
    const insets = useSafeAreaInsets();
    const { theme } = useTheme?.() || {};
    const colors = theme?.colors || {};

    const backgroundColor = colors.card ?? "#212121";
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
    const sheetRef = innerRef || useRef(null);

    // helper close function used by header cancel button (keeps parity with your code)
    const handleLocalClose = () => {
        // dismiss the bottom sheet if ref exists
        try {
            sheetRef?.current?.dismiss?.();
        } catch {
            //
        }
        // also dismiss keyboard
        Keyboard.dismiss();
    };


    // ------------ state ------------
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [friends, setFriends] = useState([]);
    const [groups, setGroups] = useState([]);
    const [suggestions, setSuggestions] = useState(null);

    const [filteredFriends, setFilteredFriends] = useState([]);
    const [filteredGroups, setFilteredGroups] = useState([]);
    // guard refs for preselection application
    const hasPreselectedGroup = useRef(false);
    const hasPreselectedFriend = useRef(false);
    // mark that we applied props-based preselection so we don't reapply repeatedly
    const appliedPreselectFromProps = useRef(false);


    const [expenseMode, setExpenseMode] = useState(selctedMode); // 'personal' | 'split'
    const [desc, setDesc] = useState(TEST_MODE ? "TEST_DESCRIPTION" : "");
    const [currency, setCurrency] = useState(defaultCurrency);
    const [amount, setAmount] = useState(TEST_MODE ? 99 : ""); // keep string for controlled TextInput
    const [category, setCategory] = useState(TEST_MODE ? "TEST_CATEGORY" : "default");
    const [expenseDate, setExpenseDate] = useState(todayISO());
    const [notes, setNotes] = useState("");

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


    const currencySheetRef = useRef(null);
    const categorySheetRef = useRef(null);
    const paymentSheetRef = useRef(null);
    const newPaymentSheetRef = useRef(null);
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
            return;
        }
        try {
            const data = await getFriends(userToken);
            setFriends(Array.isArray(data) ? data : []);
        } catch (e) {
        }
    }, [userToken]);

    const pullGroups = useCallback(async () => {
        if (!userToken) return;
        try {
            const data = await getAllGroups(userToken);
            setGroups(Array.isArray(data) ? data : []);
        } catch (e) {
        }
    }, [userToken]);

    const pullSuggestions = useCallback(async () => {
        if (!userToken) return;
        try {
            const data = await getSuggestions(userToken);
            setSuggestions(data || null);
        } catch (e) {
        }
    }, [userToken]);
    // reset guards whenever props or the sheet ref change so reopen can re-apply preselection
    useEffect(() => {
        appliedPreselectFromProps.current = false;
        hasPreselectedFriend.current = false;
        hasPreselectedGroup.current = false;
    }, [preSelectedFriendId, preSelectedGroupId, innerRef]);

    // Replace the existing handleVoiceParsed with this function (inside NewExpenseScreen)
    const mapParsedParticipantsToSelectedFriends = (participants = [], friendsList = [], userObj = {}) => {
        // Returns an array suitable for setSelectedFriends:
        // each item: { _id, name, paying, owing, payAmount, oweAmount, owePercent, paymentMethods: [], selectedPaymentMethodId }
        const results = [];
        let tmpIdCounter = 0;

        const findFriendById = (id) => friendsList.find((f) => String(f?._id) === String(id));
        const findFriendByName = (name) => {
            if (!name) return null;
            const lower = name.trim().toLowerCase();
            return friendsList.find((f) => (f.name || "").toLowerCase() === lower) || null;
        };

        participants.forEach((p) => {
            try {
                const name = String(p.name || "").trim();
                // Map "Me" or self mentions to the current user
                const isMeName = /^me$/i.test(name) || /^(i|me|my)$/i.test(name);
                if (isMeName && userObj && userObj?._id) {
                    results.push({
                        _id: userObj?._id,
                        name: `${userObj.name} (Me)`,
                        paying: !!p.paying,
                        owing: !!p.owing,
                        payAmount: typeof p.payAmount === "number" ? Number(p.payAmount.toFixed(2)) : Number(p.payAmount) || 0,
                        oweAmount: typeof p.oweAmount === "number" ? Number(p.oweAmount.toFixed(2)) : Number(p.oweAmount) || 0,
                        owePercent: typeof p.owePercent === "number" ? Number(p.owePercent.toFixed(2)) : p.owePercent ?? undefined,
                        paymentMethods: [], // will be filled by updateFriendsPaymentMethods
                        selectedPaymentMethodId: p.paymentMethod || null,
                    });
                    return;
                }

                // If parser provided matchedFriendId and it exists in our friends list, use it
                if (p.matchedFriendId) {
                    const f = findFriendById(p.matchedFriendId);
                    if (f) {
                        results.push({
                            ...f,
                            paying: !!p.paying,
                            owing: !!p.owing,
                            payAmount: typeof p.payAmount === "number" ? Number(p.payAmount.toFixed(2)) : Number(p.payAmount) || 0,
                            oweAmount: typeof p.oweAmount === "number" ? Number(p.oweAmount.toFixed(2)) : Number(p.oweAmount) || 0,
                            owePercent: typeof p.owePercent === "number" ? Number(p.owePercent.toFixed(2)) : p.owePercent ?? undefined,
                            paymentMethods: [], // fetched later
                            selectedPaymentMethodId: p.paymentMethod || null,
                        });
                        return;
                    }
                }

                // If no matchedFriendId, try name match (exact)
                const byName = findFriendByName(name);
                if (byName) {
                    results.push({
                        ...byName,
                        paying: !!p.paying,
                        owing: !!p.owing,
                        payAmount: typeof p.payAmount === "number" ? Number(p.payAmount.toFixed(2)) : Number(p.payAmount) || 0,
                        oweAmount: typeof p.oweAmount === "number" ? Number(p.oweAmount.toFixed(2)) : Number(p.oweAmount) || 0,
                        owePercent: typeof p.owePercent === "number" ? Number(p.owePercent.toFixed(2)) : p.owePercent ?? undefined,
                        paymentMethods: [],
                        selectedPaymentMethodId: p.paymentMethod || null,
                    });
                    return;
                }

                // Unknown participant -> make a temporary placeholder (user will confirm)
                tmpIdCounter += 1;
                results.push({
                    _id: `__tmp_${Date.now()}_${tmpIdCounter}`,
                    name: name || `Participant ${tmpIdCounter}`,
                    paying: !!p.paying,
                    owing: !!p.owing,
                    payAmount: typeof p.payAmount === "number" ? Number(p.payAmount.toFixed(2)) : Number(p.payAmount) || 0,
                    oweAmount: typeof p.oweAmount === "number" ? Number(p.oweAmount.toFixed(2)) : Number(p.oweAmount) || 0,
                    owePercent: typeof p.owePercent === "number" ? Number(p.owePercent.toFixed(2)) : p.owePercent ?? undefined,
                    paymentMethods: [],
                    selectedPaymentMethodId: p.paymentMethod || null,
                    // mark as temporary/unmatched so UI can surface "confirm this person"
                    __unmatched: true,
                });
            } catch (err) {
                // ignore malformed participant entry
            }
        });

        return results;
    };

    const handleVoiceParsed = async (parsed) => {
        try {
            if (!parsed || typeof parsed !== "object") return;

            // Basic top-level fields
            if (parsed.amount != null && !isNaN(Number(parsed.amount))) {
                setAmount(String(Number(parsed.amount)));
            }

            if (parsed.currency) {
                setCurrency(String(parsed.currency).toUpperCase());
            }

            if (parsed.description) {
                setDesc(parsed.description);
            } else if (parsed.raw_transcript) {
                setDesc(String(parsed.raw_transcript).slice(0, 200));
            }

            if (parsed.category) {
                const catLower = String(parsed.category).toLowerCase();
                const found = Object.entries(categoryMap).find(([key, cfg]) => {
                    if ((cfg.label || "").toLowerCase() === catLower) return true;
                    if (key.toLowerCase() === catLower) return true;
                    return Array.isArray(cfg.keywords) && cfg.keywords.some((k) => k.toLowerCase() === catLower);
                });
                if (found) setCategory(found[0]);
            }

            // Date
            if (parsed.date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)) {
                setExpenseDate(parsed.date);
            }

            // Notes
            if (parsed.notes) {
                setNotes((prev) => (prev ? `${prev}; ${parsed.notes}` : parsed.notes));
            }

            // Group mention
            if (parsed.groupMention && (parsed.groupMention.groupId || parsed.groupMention.groupName)) {
                if (parsed.groupMention.groupId) {
                    const g = groups.find((x) => String(x?._id) === String(parsed.groupMention.groupId));
                    if (g) {
                        setGroupSelect(g);
                    } else {
                        // try name match
                        const gn = parsed.groupMention.groupName || "";
                        const match = groups.find((gg) => (gg.name || "").toLowerCase() === String(gn).toLowerCase());
                        if (match) setGroupSelect(match);
                    }
                } else if (parsed.groupMention.groupName) {
                    const gn = parsed.groupMention.groupName;
                    const match = groups.find((gg) => (gg.name || "").toLowerCase() === String(gn).toLowerCase());
                    if (match) setGroupSelect(match);
                    else {
                        // set a lightweight banner to tell user we detected a group name but couldn't match it
                        setBanner({ type: "info", text: `Mentioned group: "${gn}" — no exact match found.` });
                        setTimeout(() => setBanner(null), 3500);
                    }
                }
            }

            // Decide mode: prefer parsed.mode, but fallback: if participants > 1 -> split; else personal
            let incomingMode = parsed.mode || "unsure";
            if (incomingMode === "unsure") {
                if (Array.isArray(parsed.participants) && parsed.participants.length > 1) incomingMode = "split";
                else incomingMode = "personal";
            }

            if (incomingMode === "split") {
                setExpenseMode("split");
                // set split mode if provided
                if (parsed.splitMode && ["equal", "value", "percent"].includes(parsed.splitMode)) {
                    setMode(parsed.splitMode);
                } else {
                    setMode("equal");
                }

                // map participants -> selectedFriends
                const mapped = mapParsedParticipantsToSelectedFriends(parsed.participants || [], friends || [], user || {});
                let finalList = mapped;

                // After you've built finalList = mapParsedParticipantsToSelectedFriends(...)

                // --- NEW FIX: reconcile payers ---

                const totalPaid = finalList.reduce((s, f) => s + Number(f.payAmount || 0), 0);

                // If multiple participants are paying, trust the parser’s payAmount
                if (totalPaid > 0) {
                    // normalize pay amounts if they don't sum to total
                    if (total > 0 && Math.abs(totalPaid - total) > 0.01) {
                        const factor = total / totalPaid;
                        finalList = finalList.map((f) => ({
                            ...f,
                            payAmount: f.paying ? Number(((f.payAmount || 0) * factor).toFixed(2)) : 0,
                        }));
                    }
                } else {
                    // fallback: assume only me is paying if no payAmounts given
                    finalList = finalList.map((f) => ({
                        ...f,
                        payAmount: /^.*\(Me\)$/.test(f.name) ? total : 0,
                        paying: /^.*\(Me\)$/.test(f.name),
                    }));
                }

                // Ensure current user is present if parser identified "Me" or if any participant has user id
                const hasUser = finalList.some((f) => String(f?._id) === String(user?._id));
                if (!hasUser && parsed.participants && parsed.participants.some((p) => /^me$/i.test(String(p.name || "")))) {
                    // inject me at top
                    finalList = addMeIfNeeded(finalList);
                } else {
                    // still prefer to ensure me is included when splitting with others
                    const others = finalList.filter((f) => String(f?._id) !== String(user?._id));
                    if (others.length > 0 && !hasUser) {
                        finalList = addMeIfNeeded(finalList);
                    }
                }

                // If parsed gave total amount and individual oweAmounts exist and sum to total, keep them.
                // Otherwise, if splitMode === equal, compute equal owes
                const total = Number(parsed.amount || 0);
                const hasAnyOweAmounts = finalList.some((f) => Number(f.oweAmount || 0) > 0);
                const oweSum = finalList.reduce((s, f) => s + Number(f.oweAmount || 0), 0);
                if (parsed.splitMode === "equal" || (!hasAnyOweAmounts && parsed.splitMode === "unspecified")) {
                    // mark all as owing true (if they represent participants) and distribute equal owe
                    finalList = finalList.map((f) => ({ ...f, owing: true }));
                    finalList = distributeEqualOwe(finalList);
                } else if (parsed.splitMode === "value" && hasAnyOweAmounts && Math.abs(Number((oweSum - total).toFixed(2))) <= 0.01) {
                    // sums match — keep them.
                } else if (parsed.splitMode === "percent" && finalList.some((f) => typeof f.owePercent === "number")) {
                    // compute oweAmount from percent if percent sums roughly to 100
                    const pctSum = finalList.reduce((s, f) => s + Number(f.owePercent || 0), 0);
                    if (Math.abs(pctSum - 100) <= 0.5) {
                        finalList = finalList.map((f) => ({ ...f, oweAmount: typeof f.owePercent === "number" ? Number(((total * (f.owePercent / 100)) || 0).toFixed(2)) : f.oweAmount }));
                    }
                } else {
                    // ambiguous numeric splits — leave numeric fields as supplied (if any) and flag later via hint
                }

                // set selectedFriends and fetch payment methods for those with real ids
                setSelectedFriends(finalList);
                try {
                    const realIds = finalList.filter((f) => f && String(f?._id).indexOf("__tmp_") !== 0).map((f) => f?._id);
                    if (realIds.length) await updateFriendsPaymentMethods(realIds);
                } catch (e) {
                    // ignore
                }

                // choose which tab to open to help user review: if someone is paying -> open "paid", else "owed"
                const anyPayers = finalList.some((f) => f.paying);
                setActiveTab(anyPayers ? "paid" : "owed");
            } else {
                // PERSONAL or fallback
                setExpenseMode("personal");

                // if parsed mentions participants but only Me => treat as personal
                // pick paymentMethod if present (and exists in user's methods)
                if (parsed.paymentMethod) {
                    const exists = (paymentMethods || []).find((pm) => String(pm?._id) === String(parsed.paymentMethod));
                    if (exists) setPaymentMethod(parsed.paymentMethod);
                }

                // If parser suggests participants and one is payer and it's not me, we can pre-select friend in selectedFriends
                // but do not force split mode; instead add friend to selectedFriends (so user can switch to split if needed)
                if (Array.isArray(parsed.participants) && parsed.participants.length > 0) {
                    // map participants but keep personal mode: we will add the payer friend (if any) as selected friend
                    const mapped = mapParsedParticipantsToSelectedFriends(parsed.participants || [], friends || [], user || {});
                    // filter out me (we don't want selectedFriends to be only me in personal mode)
                    const others = mapped.filter((f) => String(f?._id) !== String(user?._id));
                    if (others.length > 0) {
                        // add these friends as selectedFriends so user can convert to split quickly
                        setSelectedFriends((prev) => {
                            // avoid duplicates
                            const existingIds = new Set((prev || []).map((x) => String(x?._id)));
                            const merged = [...prev];
                            others.forEach((o) => {
                                if (!existingIds.has(String(o._id))) merged.push(o);
                            });
                            return addMeIfNeeded(merged);
                        });
                        // fetch payment methods for these friends
                        try {
                            const ids = others.filter((f) => String(f?._id).indexOf("__tmp_") !== 0).map((f) => f?._id);
                            if (ids.length) await updateFriendsPaymentMethods(ids);
                        } catch { }
                    }
                }
            }

            // top-level paymentMethod fallback for personal mode (already handled above), but also if parsed gave one for split and payer is me:
            if (parsed.paymentMethod && parsed.mode === "split") {
                // If parser suggests an overall paymentMethod and the payer is me, set my paymentMethod
                const payByMe = Array.isArray(parsed.participants) && parsed.participants.some((p) => /^me$/i.test(String(p.name || "")) && p.paying);
                if (payByMe) {
                    const exists = (paymentMethods || []).find((pm) => String(pm?._id) === String(parsed.paymentMethod));
                    if (exists) setPaymentMethod(parsed.paymentMethod);
                }
            }

            // Low-confidence or ambiguous sums -> alert banner
            if (typeof parsed.confidence === "number" && parsed.confidence < 0.6) {
                Alert.alert("Low confidence", "The AI was unsure about some fields. Please double-check the pre-filled values.");
            } else if (parsed.mode === "split") {
                // extra arithmetic check: if owes don't add up in equal mode fix automatically; if value mode doesn't sum, flag banner
                const totalAmt = Number(parsed.amount || 0);
                if (parsed.splitMode === "value") {
                    const sumOwes = (parsed.participants || []).reduce((s, p) => s + Number(p.oweAmount || 0), 0);
                    if (totalAmt > 0 && Math.abs(Number((sumOwes - totalAmt).toFixed(2))) > 0.01) {
                        setBanner({ type: "info", text: "Parsed split doesn't sum to total — please review the shares." });
                        setTimeout(() => setBanner(null), 3500);
                    }
                }
            }

            // final: if low confidence but everything looks fine, still show a small banner to review
            setTimeout(() => { }, 0);
        } catch (e) {
            console.warn("handleVoiceParsed error", e);
        }
    };



    const refreshAll = useCallback(async () => {
        setRefreshing(true);
        try {
            await Promise.all([pullFriends(), pullGroups(), pullSuggestions()]);
        } finally {
            setRefreshing(false);
        }
    }, [pullFriends, pullGroups, pullSuggestions]);


    useFocusEffect(
        useCallback(() => {
            let isActive = true; // optional guard for async calls

            (async () => {
                await Promise.all([pullFriends(), pullGroups(), pullSuggestions()]);
                if (isActive) setLoading(false);
            })();

            return () => {
                // cleanup when screen loses focus
                isActive = false;
            };
        }, [pullFriends, pullGroups, pullSuggestions])
    );


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
                suggested: suggestedIds.includes(String(g?._id)),
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
    // Apply preselected friend/group (props) once friends/groups are available.
    // This is tailored for a BottomSheet: wait for data, then toggle selection.
    // We only apply once per open; the guards are reset on sheet dismiss below.
    useEffect(() => {
        if (!innerRef.current) {
            return;
        }

        if (appliedPreselectFromProps.current) return;

        // wait until lists are loaded
        if ((!groups || groups.length === 0) && (!friends || friends.length === 0)) return;

        // prefer group preselection if both provided
        if (preSelectedGroupId && !hasPreselectedGroup.current) {
            const g = groups.find((x) => String(x?._id) === String(preSelectedGroupId));
            if (g) {
                setExpenseMode("split");
                hasPreselectedGroup.current = true;
                appliedPreselectFromProps.current = true;
                // use toggleGroup to keep logic consistent
                toggleGroup(g);
                return;
            }
        }


        if (preSelectedFriendId && !hasPreselectedFriend.current) {
            const f = friends.find((x) => String(x?._id) === String(preSelectedFriendId));
            if (f) {
                setExpenseMode("split");
                hasPreselectedFriend.current = true;
                appliedPreselectFromProps.current = true;

                // Build initial selectedFriends: add the friend + ensure me is present
                // then set defaults: me pays, everyone (including me) owes; distribute equal owes
                const friendEntry = { ...f, paying: false, owing: true, payAmount: 0, oweAmount: 0, owePercent: 0 };
                let initial = addMeIfNeeded([friendEntry]);

                // mark me as payer (if user exists)
                initial = initial.map((it) =>
                    String(it._id) === String(user?._id)
                        ? { ...it, paying: true, payAmount: num(amount) } // if amount empty -> 0
                        : { ...it, paying: false }
                );

                // ensure owe flags for everyone (including me)
                initial = initial.map((it) => ({ ...it, owing: true }));

                // distribute equal owe among those owing
                initial = distributeEqualOwe(initial);

                setSelectedFriends(initial);
                // update payment methods for real ids
                // try {
                //   const realIds = initial.filter((x) => x && String(x?._id).indexOf("__tmp_") !== 0).map((x) => x?._id);
                //   if (realIds.length) await updateFriendsPaymentMethods(realIds);
                // } catch (e) {
                //   // ignore
                // }
                return;
            }
        }

    }, [preSelectedFriendId, preSelectedGroupId, friends, groups, innerRef]);


    // ---------- selection handlers ----------
    const addMeIfNeeded = (list) => {
        if (!user || !user._id) return list;
        let updated = list.map((x) => {
            if (String(x?._id) === String(user._id)) {
                return { ...x, name: `${user.name} (Me)` };
            }
            return x;
        });

        const hasNonMe = updated.some((x) => String(x?._id) !== String(user._id));
        const meExists = updated.some((x) => String(x?._id) === String(user._id));

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
            let upd = [...selectedFriends];
            const exists = upd.some((f) => String(f?._id) === String(friend?._id));
            if (exists) {
                upd = upd.filter((f) => String(f?._id) !== String(friend?._id));
                if (String(preSelectedFriendId.current) === String(friend?._id)) {
                    hasPreselectedFriend.current = false;
                    preSelectedFriendId.current = null;
                }
            } else {
                upd = [...upd, { ...friend, paying: false, owing: false, payAmount: 0, oweAmount: 0, owePercent: 0 }];
            }
            upd = addMeIfNeeded(upd);
            setSelectedFriends(upd);
            // schedule payment methods update for the changed list
            updateFriendsPaymentMethods(upd.map((f) => f?._id));
            // re-run local friend filter so suggested UI is updated
            friendFilter(search);
        } catch (e) {
        }
    };


    const toggleGroup = (group) => {
        try {
            if (groupSelect?._id === group._id) {
                // deselect group: remove group members from selectedFriends (but keep any other non-group selections)
                const ids = new Set((group.members || []).map((m) => String(m?._id)));
                const upd = selectedFriends.filter((f) => !ids.has(String(f?._id)));
                setSelectedFriends(upd);
                setGroupSelect(null);
                if (String(preSelectedGroupId.current) === String(group._id)) {
                    hasPreselectedGroup.current = false;
                    preSelectedGroupId.current = null;
                }
            } else {
                // add group's members who are not already in selectedFriends
                const existingIds = new Set((selectedFriends || []).map((f) => String(f?._id)));
                const newMembers = (group.members || [])
                    .filter((gm) => !existingIds.has(String(gm?._id)) && String(gm?._id) !== String(user?._id))
                    .map((gm) => ({ ...gm, paying: false, owing: false, payAmount: 0, oweAmount: 0, owePercent: 0 }));
                const upd = addMeIfNeeded([...selectedFriends, ...newMembers]);
                setSelectedFriends(upd);
                setGroupSelect(group);
                updateFriendsPaymentMethods(upd.map((f) => f?._id));
            }
        } catch (e) {
        }
    };


    const removeFriend = (friend) => {
        let upd = selectedFriends.filter((f) => f?._id !== friend?._id);
        const onlyMeLeft = upd.length === 1 && upd[0]._id === user._id;
        if (onlyMeLeft || upd.length === 0) {
            upd = upd.filter((f) => f?._id !== user._id);
        }
        setSelectedFriends(upd);
        if (String(preSelectedFriendId.current) === String(friend?._id)) {
            hasPreselectedFriend.current = false;
            preSelectedFriendId.current = null;
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
    // react to amount change: smarter updates for equal splits and preselected rows
    useEffect(() => {
        setSelectedFriends((prev = []) => {
            const total = num(amount);

            if (!Array.isArray(prev) || prev.length === 0) return prev;

            // copy to avoid mutating state objects
            const current = prev.map((f) => ({ ...f }));

            // who are explicitly paying / owing
            const payers = current.filter((f) => f.paying);
            const owers = current.filter((f) => f.owing);

            // HELPER: do any payers exist with payAmount === 0 (need recompute)
            const payersWithZero = payers.some((p) => Number(p.payAmount || 0) === 0);
            // HELPER: do any owers exist with oweAmount === 0 (need recompute)
            const owersWithZero = owers.some((o) => Number(o.oweAmount || 0) === 0);

            // If amount is not a positive number -> clear numeric fields to avoid stale values.
            if (!(total > 0)) {
                return current.map((f) => ({ ...f, payAmount: 0, oweAmount: 0, owePercent: 0 }));
            }

            // If UI is in equal mode, recompute equal distributions for both sides
            // (payers -> payAmount, owers -> oweAmount).
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

                // neither payers nor owers: nothing to recompute, keep previous numeric values
                return current.map((f) => ({ ...f, payAmount: f.payAmount || 0, oweAmount: f.oweAmount || 0 }));
            }

            // MODE != 'equal'
            // If user/parser already set explicit flags/percent/amounts, we normally keep them.
            // HOWEVER: if there are payers/owers but their numeric values are still zero (e.g. preselection applied before amount),
            // recompute sensible defaults so fields aren't left at 0 after user types amount.
            const anyExplicit = current.some(
                (f) =>
                    !!f.paying ||
                    !!f.owing ||
                    (typeof f.owePercent === "number" && !isNaN(Number(f.owePercent))) ||
                    (typeof f.payAmount === "number" && Number(f.payAmount) > 0)
            );

            if (anyExplicit) {
                // If payers exist but none have payAmount > 0, compute equal pay distribution across payers
                if (payers.length > 0 && payersWithZero) {
                    return distributeEqualPay(current);
                }

                // If owers exist but none have oweAmount > 0, compute equal owe distribution across owers
                if (owers.length > 0 && owersWithZero) {
                    return distributeEqualOwe(current);
                }

                // otherwise preserve current (user likely intentionally set numbers)
                return current;
            }

            // No explicit flags or numbers -> compute neutral defaults (same logic as before)
            const participantsExcludingMe = current.filter((f) => String(f?._id) !== String(user?._id));

            // baseline: clear flags/numbers
            let neutral = current.map((f) => ({
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
                // There are others: default: you paid and everyone owes equally
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

            return neutral;
        });
        // note: include `mode` and `amount` so recompute runs at appropriate times
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

        // If parser/user already set any explicit flags or percentages, do NOT override them.
        const anyExplicit = selectedFriends.some(
            (f) =>
                !!f.paying ||
                !!f.owing ||
                (typeof f.owePercent === "number" && !isNaN(Number(f.owePercent))) ||
                (typeof f.payAmount === "number" && Number(f.payAmount) > 0)
        );
        if (anyExplicit) {
            // Keep parser/user choices intact.
            return;
        }

        // No explicit choices -> compute neutral defaults (same logic as before)
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
            // There are others: default: you paid and everyone owes equally
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
        // note: we intentionally do not include selectedFriends in deps to avoid immediate re-run;
        // but we need to rerun when amount, expenseMode or user changes (above deps).
    }, [amount, expenseMode, user?._id]);

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
        if (preferred?._id) setPaymentMethod(preferred?._id);
    }, [expenseMode, paymentMethods, paymentMethod]);

    // ----- payment modal data -----
    const paymentOptions = useMemo(() => {
        if (paymentModalCtx.context === "personal") return paymentMethods || [];
        const f = selectedFriends.find((x) => x?._id === paymentModalCtx.friendId);
        return (f?.paymentMethods || []).map((m) => ({ _id: m.paymentMethodId, ...m }));
    }, [paymentModalCtx, paymentMethods, selectedFriends]);

    const paymentValue = useMemo(() => {
        if (paymentModalCtx.context === "personal") return paymentMethod || null;
        const f = selectedFriends.find((x) => x?._id === paymentModalCtx.friendId);
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
    const onSavePayAcc = async (payload) => {

        try {
            await createPaymentMethod(payload, userToken);
            await fetchPaymentMethods();
        } catch (e) {
            console.error(e);
            alert(e.message || "Failed to save payment account");
        } finally {
            newPaymentSheetRef.current?.dismiss()
        }
    };
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

            const response = await createExpense(payload, userToken);
            onSave?.()

            // reset
            setDesc("");
            setCategory("default");
            setAmount("");
            setMode("equal");
            setSelectedFriends([]);
            setGroupSelect(null);
            setExpenseDate(todayISO());
            await fetchPaymentMethods();

            if (hasPreselectedGroup.current && groupSelect?._id) {
                hasPreselectedGroup.current = false;
                hasPreselectedFriend.current = false;
                preSelectedFriendId.current = null;
                return router.back();
            }
            if (hasPreselectedFriend.current && preSelectedFriendId.current) {
                hasPreselectedGroup.current = false;
                hasPreselectedFriend.current = false;
                preSelectedFriendId.current = null;
                return router.back();
            }

            sheetRef?.current?.dismiss?.();
            setBanner({ type: "success", text: "Expense saved." });
            setTimeout(() => setBanner(null), 2000);
        } catch (e) {
            setBanner({ type: "error", text: e?.message || "Failed to create expense." });
            setTimeout(() => setBanner(null), 3000);
        } finally {
            setLoading(false);
        }
    };
    // animated keyboard height (pixels)
    // Animated keyboard height value (pixels)
    const kbAnim = useRef(new Animated.Value(0)).current;

    // Optional: keep numeric kbHeight if other code uses it
    const [kbHeight, setKbHeight] = useState(0);
    const [keyboardOpen, setKeyboardOpen] = useState(false);

    useEffect(() => {
        // choose events per platform for best timing
        const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
        const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

        const onShow = (e) => {
            const height = e?.endCoordinates?.height || 0;
            setKbHeight(height);
            setKeyboardOpen(true);

            Animated.timing(kbAnim, {
                toValue: height,
                duration: e?.duration || 220,
                useNativeDriver: true,
            }).start();
        };

        const onHide = (e) => {
            setKbHeight(0);
            setKeyboardOpen(false);

            Animated.timing(kbAnim, {
                toValue: 0,
                duration: e?.duration || 180,
                useNativeDriver: true,
            }).start();
        };

        const s = Keyboard.addListener(showEvent, onShow);
        const h = Keyboard.addListener(hideEvent, onHide);

        return () => {
            s.remove();
            h.remove();
        };
    }, [kbAnim]);

    // at top (you already import Keyboard)
    const dismissKb = () => {
        try { Keyboard.dismiss(); } catch (_) { }
    };


    return (
        <BottomSheetModal
            ref={sheetRef}
            snapPoints={snapPoints}
            enablePanDownToClose={false}
            enableDynamicSizing={false}
            enableOverDrag={false}
            overDragResistanceFactor={0}
            // helpful props for keyboard integration on Android/iOS (gorhom supports these)
            keyboardBehavior={"interactive"}
            keyboardBlurBehavior={"restore"}
            onDismiss={() => {
                hasPreselectedGroup.current = false;
                hasPreselectedFriend.current = false;
                appliedPreselectFromProps.current = false;
                if (typeof onDismiss === "function") onDismiss();
            }}
            handleComponent={null}
            backgroundComponent={() => <View style={[styles.bg]} />}
            style={[styles.sheet, backgroundStyle]}
        >
            <View style={[styles.container, { flex: 1 }]}>
                {/* Header */}
                <View
                    style={[
                        styles.header,
                        { paddingHorizontal: 16, paddingTop: insets.top ? insets.top + 8 : 12 },
                    ]}
                >
                    <Text style={styles.headerText}>Add Expense</Text>
                    <TouchableOpacity onPress={handleLocalClose} style={styles.closeBtn} accessibilityRole="button">
                        <Text style={styles.closeText}>Cancel</Text>
                    </TouchableOpacity>
                </View>

                {/* Body: single keyboard-aware scroll container */}
                <KeyboardAvoidingView
                    behavior={Platform.OS === "ios" ? "padding" : undefined}
                    keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 64}
                    style={{ flex: 1 }}
                >
                    <KeyboardAwareScrollView
                        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
                        enableOnAndroid={true}
                        enableAutomaticScroll={false}      // Important: disable auto scrolling to focused input
                        extraScrollHeight={Platform.OS === "android" ? 0 : 40} // reduce extra height
                        keyboardOpeningTime={0}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                        nestedScrollEnabled={true}               // allow nested scrolling so pull works reliably
                        scrollEnabled={!keyboardOpen} // important: avoid nested scrolling on Android
                        refreshControl={
                            <RefreshControl
                                refreshing={refreshing}
                                onRefresh={refreshAll}
                                tintColor={theme?.colors?.primary ?? "#00d0b0"}
                                colors={[theme?.colors?.primary ?? "#00d0b0"]} // Android spinner color
                            />
                        }
                    >
                        {/* Mode toggle */}
                        <View style={styles.modeToggle}>
                            <TouchableOpacity
                                onPress={() => setExpenseMode("personal")}
                                style={[styles.modeBtn, expenseMode === "personal" && styles.modeBtnActive]}
                            >
                                <Text style={[styles.modeText, expenseMode === "personal" && styles.modeTextActive]}>
                                    Personal Expense
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => setExpenseMode("split")}
                                style={[styles.modeBtn, expenseMode === "split" && styles.modeBtnActive]}
                            >
                                <Text style={[styles.modeText, expenseMode === "split" && styles.modeTextActive]}>
                                    Split Expense
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {/* Search area */}
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
                            <View style={[
                                styles.banner,
                                banner?.type === "success" && styles.bannerSuccess,
                                banner?.type === "error" && styles.bannerError,
                                banner?.type === "info" && styles.bannerInfo,
                            ]}>
                                <Text style={styles.bannerText}>{banner?.text || "Banner Text"}</Text>
                                <TouchableOpacity onPress={() => setBanner(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                    <Text style={{ color: styles.colors.mutedFallback }}>✕</Text>
                                </TouchableOpacity>
                            </View>
                        ) : null}

                        {/* Suggestions / Groups / Friends (single scrollable area) */}
                        <View style={{ paddingBottom: 12 }}>
                            {expenseMode === "split" ? (
                                <>
                                    {groups.length === 0 && friends.length === 0 ? (
                                        <View style={{ marginTop: 12 }}>
                                            <EmptyCTA
                                                visible={true}
                                                title="No friends or groups yet"
                                                subtitle="Add a friend or create a group to start splitting expenses."
                                                ctaLabel="Add Friend"
                                                onPress={() => {
                                                    router.push("friends")
                                                    innerRef?.current?.dismiss()
                                                }}
                                                secondaryLabel="Add Group"
                                                onSecondaryPress={() => {
                                                    router.push("groups")
                                                    innerRef?.current?.dismiss()
                                                }}
                                            />
                                        </View>
                                    ) : (
                                        <>
                                            {(groups.length > 0 || friends.length > 0) && (
                                                <>
                                                    {(groupSelect || selectedFriends.filter((f) => f?._id !== user._id).length > 0) && (
                                                        <View style={{ marginTop: 8, gap: 8 }}>
                                                            {!groupSelect ? (
                                                                <View>
                                                                    <Text style={styles.sectionLabel}>Friend Selected</Text>
                                                                    {selectedFriends.filter((f) => f?._id !== user._id).map((fr) => (
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

                                                    {/* Suggestions lists */}
                                                    {!(groupSelect || selectedFriends.filter((f) => f?._id !== user._id).length > 0) && (
                                                        <View style={{ marginTop: 12, gap: 12 }}>
                                                            {filteredGroups.length > 0 && (
                                                                <View>
                                                                    <Text style={styles.suggestHeader}>{search.length === 0 ? "SUGGESTED " : ""}GROUPS</Text>
                                                                    <View style={styles.chipsWrap}>
                                                                        {filteredGroups.map((g) => {
                                                                            const active = groupSelect?._id === g?._id;
                                                                            return (
                                                                                <TouchableOpacity key={g?._id} onPress={() => toggleGroup(g)} style={[styles.chip, active && styles.chipActive]}>
                                                                                    <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>{g.name}</Text>
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
                                                                                    <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>{fr.name}</Text>
                                                                                </TouchableOpacity>
                                                                            );
                                                                        })}
                                                                    </View>
                                                                </View>
                                                            )}
                                                        </View>
                                                    )}
                                                </>
                                            )}
                                        </>
                                    )}
                                </>
                            ) : null}

                            {/* Create expense block */}
                            {(expenseMode === "personal" || selectedFriends.filter((f) => f?._id !== user._id).length > 0) && (
                                <View style={{ marginTop: 10, gap: 10 }}>
                                    <TextInput placeholder="Description" placeholderTextColor={styles.colors.mutedFallback} value={desc} onChangeText={setDesc} style={styles.input} />

                                    <View style={{ flexDirection: "row", gap: 8 }}>
                                        <TouchableOpacity onPress={() => {
                                            dismissKb();
                                            openCurrencySheet();
                                        }}
                                            style={[styles.input, styles.btnLike, { flex: 1 }]}>
                                            <Text style={[styles.btnLikeText, currency ? { color: styles.colors.textFallback } : { color: styles.colors.mutedFallback }]}>{currency || "Currency"}</Text>
                                        </TouchableOpacity>
                                        <TextInput
                                            placeholder="Amount"
                                            placeholderTextColor={styles.colors.mutedFallback}
                                            keyboardType="number-pad"
                                            value={String(amount)}
                                            onChangeText={(text) => {
                                                const cleaned = text.replace(/[^0-9.]/g, "");
                                                const parts = cleaned.split(".");
                                                const numericValue = parts.length > 1 ? `${parts[0]}.${parts.slice(1).join("")}` : cleaned;
                                                setAmount(numericValue);
                                            }}
                                            style={[styles.input, { flex: 2 }]}
                                        />
                                    </View>

                                    <View style={{ flexDirection: "row", gap: 8 }}>
                                        <TouchableOpacity onPress={() => {
                                            dismissKb();
                                            openCategorySheet()
                                        }}
                                            style={[styles.input, styles.btnLike, { flex: 1 }]}>
                                            <Text style={[styles.btnLikeText, selectedCategory || category ? { color: styles.colors.textFallback } : { color: styles.colors.mutedFallback }]}>{selectedCategory || category || "Category"}</Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity onPress={() => {
                                            dismissKb();
                                            setShowDatePicker(true)
                                        }} style={[styles.input, { flex: 1, justifyContent: "center" }]} activeOpacity={0.7}>
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

                                    {expenseMode === "personal" && (
                                        <TouchableOpacity onPress={() => {
                                            dismissKb();
                                            openPaymentSheet({ context: "personal" })
                                        }}
                                            style={[styles.input, styles.btnLike]}>
                                            <Text style={[styles.btnLikeText, paymentMethod ? { color: styles.colors.textFallback } : { color: styles.colors.mutedFallback }]}>
                                                {paymentMethod ? (paymentMethods.find((a) => a?._id === paymentMethod)?.label || "Payment Account") : "Payment Account"}
                                            </Text>
                                        </TouchableOpacity>
                                    )}

                                    {expenseMode === "split" && desc && num(amount) > 0 && category ? (
                                        <>

                                            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                                                {/* Paid by button */}
                                                <TouchableOpacity
                                                    onPress={() => {
                                                        dismissKb();
                                                        setActiveTab("paid")
                                                    }}
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
                                                    onPress={() => {
                                                        dismissKb();
                                                        setActiveTab("owed")
                                                    }}
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
                                            {activeTab === "paid" ? (
                                                <>
                                                    <Text style={styles.helperSmall}>(Select the people who paid.)</Text>


                                                    {/* Use radio-style rows (like 'owed' block) instead of chips */}

                                                    {selectedFriends.map((f) => {
                                                        const isPaying = !!f.paying;
                                                        const manyPMs = Array.isArray(f.paymentMethods) && f.paymentMethods.length > 1;
                                                        const selPM = f.paymentMethods?.find((m) => m.paymentMethodId === f.selectedPaymentMethodId);

                                                        return (
                                                            <TouchableOpacity
                                                                key={`payrow-${f?._id}`}
                                                                onPress={() => {
                                                                    // toggle paying and recompute pay distribution (togglePaying handles distributeEqualPay)
                                                                    togglePaying(f?._id);
                                                                }}
                                                                activeOpacity={0.8}
                                                                style={[styles.rowBetween, { paddingVertical: 4, height: 45 }]}
                                                            >
                                                                <View style={{ flexDirection: "row", alignItems: "center", flex: 1, gap: 4 }}>
                                                                    <View style={styles.radioWrap}>
                                                                        <View style={[styles.radioOuter, isPaying && styles.radioOuterActive]}>
                                                                            {isPaying ?
                                                                                <View style={styles.radioInnerActive} /> :
                                                                                <View style={styles.radioInner} />}
                                                                        </View>
                                                                    </View>

                                                                    <Text style={{ color: styles.colors.textFallback, flex: 1 }} numberOfLines={1}>
                                                                        {f.name}
                                                                    </Text>
                                                                </View>

                                                                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                                                    {/* Payment method selector if friend has >1 PMs */}
                                                                    {manyPMs && isPaying ? (
                                                                        <TouchableOpacity
                                                                            onPress={() => openPaymentSheet({ context: "split", friendId: f?._id })}
                                                                            style={[
                                                                                styles.pmBtn,
                                                                                selPM ? { borderColor: styles.colors.borderFallback, backgroundColor: "transparent" } : { borderColor: styles.colors.dangerFallback, backgroundColor: "rgba(244,67,54,0.08)" },
                                                                            ]}
                                                                        >
                                                                            <Text style={[styles.pmBtnText, { color: selPM ? styles.colors.textFallback : styles.colors.dangerFallback }]} numberOfLines={1}>
                                                                                {selPM ? selPM.label || selPM.type || "Payment Method" : "Select"}
                                                                            </Text>
                                                                        </TouchableOpacity>
                                                                    ) : null}

                                                                    {/* Amount field: only show when more than one payer (same as before) */}
                                                                    {selectedFriends.filter((x) => x.paying).length > 1 && isPaying ? (
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
                                                            </TouchableOpacity>
                                                        );
                                                    })}


                                                    {/* Helper totals when multiple payers exist and sum mismatch */}
                                                    {selectedFriends.filter((f) => f.paying).length > 1 && !isPaidValid ? (
                                                        <View style={{ alignItems: "center", marginTop: 6 }}>
                                                            <Text style={styles.helperMono}>{fmtMoney(currency, paidTotal)} / {fmtMoney(currency, num(amount))}</Text>
                                                            <Text style={[styles.helperMono, { color: styles.colors.mutedFallback }]}>{fmtMoney(currency, num(amount) - paidTotal)} left</Text>
                                                        </View>
                                                    ) : null}
                                                    <View style={{ height: Math.max(kbHeight, 240) }} />
                                                </>
                                            ) : null}
                                            {/* Owed by tab */}
                                            {activeTab === "owed" ? (

                                                <>
                                                    <Text style={styles.helperSmall}>(Select the people who owe.)</Text>

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
                                                                    .map((f) => {
                                                                        const isOwing = !!f.owing;
                                                                        return (
                                                                            <TouchableOpacity
                                                                                key={`ow-${f?._id}`}
                                                                                onPress={() => {
                                                                                    // toggle owing flag for this friend (works in all modes)
                                                                                    setSelectedFriends((prev) => {
                                                                                        const updated = prev.map((x) => {
                                                                                            if (x?._id === f?._id) {
                                                                                                const newOwing = !x.owing;
                                                                                                return {
                                                                                                    ...x,
                                                                                                    owing: newOwing,
                                                                                                    oweAmount: newOwing ? x.oweAmount : 0, // or null, depending on your logic
                                                                                                };
                                                                                            }
                                                                                            return x;
                                                                                        });

                                                                                        // re-run equal distribution if we're in equal mode
                                                                                        if (mode === "equal") return distributeEqualOwe(updated);
                                                                                        return updated;
                                                                                    });
                                                                                }}
                                                                                activeOpacity={0.8}
                                                                                style={[styles.rowBetween, { paddingVertical: 4, height: 45 }]}
                                                                            >
                                                                                <View style={{ flexDirection: "row", alignItems: "center", flex: 1, gap: 4 }}>
                                                                                    {/* Radio (equal mode) or simple bullet */}

                                                                                    <View style={styles.radioWrap}>
                                                                                        <View style={[styles.radioOuter, isOwing && styles.radioOuterActive]}>
                                                                                            {isOwing ? <View style={styles.radioInnerActive} /> : <View style={styles.radioInner} />}
                                                                                        </View>
                                                                                    </View>


                                                                                    <Text style={{ color: styles.colors.textFallback, flex: 1 }} numberOfLines={1}>
                                                                                        {f?.name}
                                                                                    </Text>
                                                                                </View>
                                                                                {isOwing && <>

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
                                                                                </>}
                                                                            </TouchableOpacity>
                                                                        );
                                                                    })}

                                                            </View>
                                                        </View>
                                                    ) : null}
                                                    <View style={{ height: Math.max(kbHeight, 240) }} />
                                                </>
                                            ) : null}
                                        </>
                                    ) : null}
                                    {/* If personal mode: show voice input component */}
                                    {/* {expenseMode === "personal" && (
                                            <View style={{ flex: 1, backgroundColor: '#333', flexDirection: 'column', height: '100%' }}>
                                                
                                            </View>
                                        )} */}
                                    {/* SPLIT flow (omitted here for brevity — keep your existing logic) */}
                                    {/* ... your paid/owed UI, lists and inputs (kept the same structure) ... */}
                                </View>
                            )}
                        </View>

                        {/* Spacing at bottom so content can scroll above footer */}

                    </KeyboardAwareScrollView>

                    {/* Sheets (keep them here, outside the scrollable content) */}
                    <SheetCurrencies innerRef={currencySheetRef} value={currency} options={currencyOptions} onSelect={setCurrency} onClose={() => { }} />
                    <SheetCategories innerRef={categorySheetRef} value={category} options={categoryOptions} onSelect={setCategory} onClose={() => { }} />
                    <SheetPayments
                        innerRef={paymentSheetRef}
                        value={paymentValue}
                        options={paymentOptions}
                        onSelect={(id) => handleSelectPayment(id)} onClose={() => { }}
                        noResultsComponent={
                            <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 40 }}>
                                <Text style={{ fontSize: 16, color: "#aaa", marginBottom: 12 }}>
                                    No payment methods found
                                </Text>
                                <TouchableOpacity
                                    style={{
                                        backgroundColor: "#00C49F",
                                        paddingVertical: 10,
                                        paddingHorizontal: 18,
                                        borderRadius: 8,
                                    }}
                                    onPress={() => {
                                        paymentSheetRef?.current?.dismiss();
                                        newPaymentSheetRef?.current?.present();
                                    }}
                                >
                                    <Text style={{ color: "#fff", fontWeight: "600" }}>
                                        + Add Payment Method
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        }
                    />
                    <BottomSheetPaymentAccount
                        innerRef={newPaymentSheetRef}
                        onSave={(payload) => {
                            paymentSheetRef.current?.dismiss()
                            onSavePayAcc(payload)
                        }
                        }
                    />
                    {/* Animated footer overlay */}
                    <Animated.View
                        pointerEvents="box-none"
                        style={{
                            position: "absolute",
                            left: 0,
                            right: 0,
                            bottom: kbHeight > 0 ? 0 : 8,
                            paddingBottom: 12,
                            backgroundColor: theme?.colors?.background,
                            // move up by keyboard height smoothly: translateY = -kbAnim
                            transform: [{ translateY: Platform.OS == 'ios' ? Animated.multiply(kbAnim, -1) : 0 }],
                            zIndex: 9999,
                            elevation: 20,
                        }}
                    >
                        <View style={styles.footerWrap} pointerEvents="auto">
                            <View style={styles.footerInner}>
                                <View style={{ flex: 1, flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
                                    <Text style={styles.hint} numberOfLines={2}>{hint}</Text>

                                    <TouchableOpacity
                                        disabled={!canSubmit}
                                        onPress={handleSubmit}
                                        activeOpacity={0.8}
                                        accessibilityRole="button"
                                        style={[
                                            styles.submitBtn,
                                            {
                                                backgroundColor: canSubmit ? theme?.colors?.primary : (theme?.colors?.muted ?? "#212121"),
                                                width: "100%",
                                                opacity: canSubmit ? 1 : 0.6,
                                            },
                                        ]}
                                    >
                                        <Text style={styles.submitText}>Save Expense</Text>
                                    </TouchableOpacity>
                                </View>

                                <View style={{ flexDirection: 'column', marginLeft: 12 }}>
                                    <VoiceInput initialValue={desc} locale="en-US" onParsed={handleVoiceParsed} token={userToken} />
                                </View>
                            </View>
                        </View>
                    </Animated.View>


                </KeyboardAvoidingView>
            </View>
        </BottomSheetModal>
    );

};

export default MainBottomSheet;
// final styles — paste in place of your existing createStyles + styles
// Replace existing createStyles with this
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

    const spacing = {
        pageHorizontal: 16,
        xs: 6,
        sm: 8,
        md: 12,
        lg: 16,
    };

    const s = StyleSheet.create({
        // top-level tokens
        safe: { flex: 1, backgroundColor: palette.background },

        container: { flex: 1, backgroundColor: palette.background },

        /* Header area */
        header: {
            paddingVertical: 10,
            paddingHorizontal: spacing.pageHorizontal,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: palette.border,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: "transparent",
        },
        headerText: { color: palette.text, fontSize: 18, fontWeight: "700" },
        closeBtn: { paddingHorizontal: 8, paddingVertical: 6 },
        closeText: { color: '#EA4335', fontSize: 14, fontWeight: "600" },

        /* mode toggle + small controls reused from earlier */
        modeToggle: {
            flexDirection: "row",
            alignSelf: "center",
            backgroundColor: palette.card,
            borderRadius: 999,
            padding: 4,
            borderWidth: 1,
            borderColor: palette.border,
            marginVertical: 8,
        },
        modeBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999 },
        modeBtnActive: { backgroundColor: palette.text },
        modeText: { color: palette.text, fontSize: 13, fontWeight: "600" },
        modeTextActive: { color: palette.background },

        /* Inputs / Buttons */
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

        /* chips */
        chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
        chip: {
            paddingHorizontal: 12,
            height: 40,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: palette.border,
            justifyContent: "center",
            backgroundColor: palette.card,
        },
        chipActive: { backgroundColor: "#DFF3E8", borderColor: "#DFF3E8" },
        chipText: { color: palette.text },
        chipTextActive: { color: palette.text, fontWeight: "700" },
        chip2: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, borderWidth: 2, borderColor: palette.muted, backgroundColor: "transparent" },
        chip2Active: { backgroundColor: `${palette.cta}33`, borderColor: `${palette.cta}33` },
        chip2Text: { color: palette.text },
        chip2TextActive: { color: palette.text, fontWeight: "700" },

        suggestHeader: { color: palette.primary, fontSize: 12, letterSpacing: 1, marginBottom: 5 },
        /* helper text */
        sectionLabel: { color: palette.cta, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" },
        helperSmall: { color: palette.muted, fontSize: 12 },

        /* banners */
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
            marginTop: 10,
        },
        bannerSuccess: { backgroundColor: "rgba(0,150,136,0.16)", borderColor: "#009688" },
        bannerError: { backgroundColor: "rgba(244,67,54,0.12)", borderColor: "#f44336" },
        bannerInfo: { backgroundColor: "rgba(158,158,158,0.12)", borderColor: "#9e9e9e" },
        bannerText: { color: palette.text, flex: 1 },

        /* summary + radio */
        summaryBtn: {
            flex: 1,
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: palette.border,
            backgroundColor: palette.card,
        },
        summaryBtnActive: { borderColor: palette.cta },
        summaryLabel: { fontSize: 12, color: palette.muted, marginBottom: 2 },
        summaryValue: { fontSize: 14, color: palette.text, fontWeight: "600" },

        radioWrap: { width: 28, alignItems: "center", justifyContent: "center" },
        radioOuter: {
            width: 18,
            height: 18,
            borderRadius: 18,
            borderWidth: 2,
            borderColor: palette.border,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "transparent",
        },
        radioOuterActive: { borderColor: palette.cta, },
        radioInner: { width: 10, height: 10, borderRadius: 10, backgroundColor: palette.border },
        radioInnerActive: { width: 10, height: 10, borderRadius: 10, backgroundColor: palette.cta },

        /* footer area (keyboard-friendly) */
        footerWrap: {
            position: "absolute",
            left: spacing.pageHorizontal,
            right: spacing.pageHorizontal,
            bottom: 0,
            paddingBottom: 12,
            borderTopColor: palette.border,
            borderTopWidth: 1,
            paddingTop: 8,
            backgroundColor: theme?.colors?.background,
        },
        footerInner: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: 'center',
            gap: 4,
            paddingHorizontal: 12,
        },
        hint: { color: palette.helperMuted, textAlign: "center", fontSize: 12, minHeight: 16, marginBottom: 6 },
        submitBtn: {
            height: 44,
            borderRadius: 12,
            backgroundColor: palette.cta,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 16,
        },
        submitText: { color: palette.background, fontWeight: "700", fontSize: 15 },

        voicePlaceholder: {
            width: 44,
            height: 44,
            borderRadius: 10,
            backgroundColor: palette.card,
            borderWidth: 1,
            borderColor: palette.border,
        },

        /* small variants */
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

        helperMono: { color: palette.text, fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }) },

        /* color tokens available for inline use from JSX */
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

        /* smaller interactive controls used in flows */
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
        modeMiniActive: { backgroundColor: `${palette.cta}33`, borderColor: palette.cta },
        modeMiniText: { color: palette.text, fontSize: 14, fontWeight: "600" },
        modeMiniTextActive: { color: palette.cta, fontWeight: "700" },

        // errors / highlights
        summaryBtnError: { backgroundColor: "rgba(244,67,54,0.06)" },
        summaryLabelError: { color: palette.danger },
        summaryValueError: { color: palette.danger },
        suggestHeader: { color: palette.primary, fontSize: 12, letterSpacing: 1, marginBottom: 5 },
        selRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", height: 30 },
        selText: { color: palette.text, fontSize: 16, textTransform: "capitalize" },
        rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    });

    // keep s.colors reference for backwards compatibility
    s.colors = s.colors || s.colors;
    return s;
};


// Replace existing static styles `styles` with this
const styles = StyleSheet.create({
    sheet: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -9 },
        shadowOpacity: 0.75,
        shadowRadius: 12.35,
        elevation: 19,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        overflow: "hidden",
        backgroundColor: "transparent",
    },
    bg: {
        flex: 1,
        backgroundColor: "transparent",
    },
});


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
