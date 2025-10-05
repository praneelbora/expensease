// components/ExpenseBottomSheet.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import BottomSheetLayout from "./btmShtHeaderFooter"; // your reusable layout
import SheetCurrencies from "~/shtCurrencies";
import SheetCategories from "~/shtCategories";
import SheetPayments from "~/shtPayments";
import { getSymbol, formatMoney } from "../utils/currencies";
import { useTheme } from "context/ThemeProvider";
import { getCategoryLabel, getCategoryOptions } from "../utils/categoryOptions";
import { fetchFriendsPaymentMethods } from "../services/PaymentMethodService";
import { getGroupDetails } from "../services/GroupService";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import ChevronDown from "@/accIcons/chevronDown.svg"; // should exist in your accIcons folder
/**
 * Props:
 * - innerRef (ref for the bottom sheet)
 * - onClose()
 * - expense (object)
 * - userToken
 * - userId
 * - currencyOptions
 * - defaultCurrency
 * - preferredCurrencies
 * - paymentMethods (array of user's payment methods)
 * - getGroupDetails (fn)
 * - onUpdateExpense (async fn id,payload,token)
 * - onDeleteExpense (async fn id,token)
 * - fetchFriendsPaymentMethods (fn)
 * - onSaved (callback)
 */
export default function ExpenseBottomSheet({
    innerRef,
    onClose,
    expense,
    userToken,
    userId,
    currencyOptions = [],
    defaultCurrency = "INR",
    preferredCurrencies = [],
    paymentMethods = [],
    onUpdateExpense,
    onDeleteExpense,
    fetchFriendsPaymentMethods: fetchFriendsPM = fetchFriendsPaymentMethods,
    onSaved,
}) {

    const insets = useSafeAreaInsets();
    const { theme } = useTheme();
    const colors = theme?.colors || {};
    const styles = useMemo(() => createStyles(colors), [colors]);

    // sheet refs
    const currencySheetRef = useRef(null);
    const categorySheetRef = useRef(null);
    const paymentSheetRef = useRef(null);
    const paymentModalCtxInitial = { context: "personal", friendId: null };
    const [paymentModalCtx, setPaymentModalCtx] = useState(paymentModalCtxInitial);
    const openCategorySheet = () => categorySheetRef.current?.present();
    const openPaymentSheet = (ctx) => {
        setPaymentModalCtx(ctx);
        paymentSheetRef.current?.present();
    };
    const openCurrencySheet = () => currencySheetRef.current?.present();

    // control state
    const [loading, setLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [viewSplits, setViewSplits] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    // date picker modal control
    const [showDatePicker, setShowDatePicker] = useState(false);

    // readable label for the input (e.g. "19 Sep 2025")
    const formatReadable = (isoStr) => {
        if (!isoStr) return "";
        try {
            const d = new Date(isoStr);
            return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
        } catch {
            return isoStr;
        }
    };

    const _id = expense?._id;

    // formatters
    const fmtMoney = (n) => `${Number(n || 0).toFixed(2)}`;
    const fmtDate = (d) =>
        d ? new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "long", year: "numeric" }) : "";
    const fmtDateTimeNoSecs = (d) =>
        d ? new Date(d).toLocaleDateString("en-IN", { year: "2-digit", month: "2-digit", day: "2-digit" }) : "";

    const toInputDate = (d) => {
        if (!d) return "";
        const dt = new Date(d);
        const yyyy = dt.getFullYear();
        const mm = String(dt.getMonth() + 1).padStart(2, "0");
        const dd = String(dt.getDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
    };

    // form initial state
    const [form, setForm] = useState({
        description: expense?.description || "",
        category: expense?.category || "",
        amount: expense?.amount ?? 0,
        date: toInputDate(expense?.date),
        typeOf: expense?.typeOf || "expense",
        mode: expense?.mode || "personal",
        splitMode: expense?.splitMode || detectSplitMode(expense?.splits || []),
        currency: (expense?.currency || defaultCurrency || "INR").toUpperCase(),
        splits: (expense?.splits || []).map(normalizeSplit),
    });

    const [groupMembers, setGroupMembers] = useState([]);
    const [selectedFriends, setSelectedFriends] = useState(() => mergeMembersWithSplits([], form.splits));

    const [paymentModal, setPaymentModal] = useState({ open: false, context: "personal", friendId: null });
    const [personalPaymentMethod, setPersonalPaymentMethod] = useState("");

    const [reSplit, setReSplit] = useState(false);

    // initialize/reset when expense changes
    useEffect(() => {
        setIsEditing(false);
        setConfirmDelete(false);
        setViewSplits(false);
        setShowHistory(false);
        setLoading(false);
        setReSplit(false);

        const splits = (expense?.splits || []).map(normalizeSplit);

        setForm({
            description: expense?.description || "",
            category: expense?.category || "",
            amount: expense?.amount ?? 0,
            date: toInputDate(expense?.date),
            typeOf: expense?.typeOf || "expense",
            mode: expense?.mode || "personal",
            splitMode: expense?.splitMode || detectSplitMode(expense?.splits || []),
            currency: (expense?.currency || defaultCurrency || "INR").toUpperCase(),
            splits,
        });

        (async () => {
            if (!expense?.groupId) {
                const norm = mergeMembersWithSplits([], splits);
                setSelectedFriends(norm);
                return;
            }
            try {
                const group = await getGroupDetails(expense?.groupId?._id ? expense?.groupId?._id : expense?.groupId, userToken);
                const members = Array.isArray(group?.members) ? group.members : [];
                setGroupMembers(members);
                setSelectedFriends(mergeMembersWithSplits(members, splits));
            } catch (err) {
                console.warn("Failed to load group members:", err);
                setGroupMembers([]);
                setSelectedFriends(mergeMembersWithSplits([], splits));
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [_id, expense]);

    // when editing, fetch friends' payment methods
    useEffect(() => {
        if (!isEditing) return;
        updateFriendsPaymentMethods(selectedFriends.map((f) => f?._id));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isEditing]);

    // derived + helpers
    const amountNum = Number(form.amount || 0);
    const currency = form.currency;

    const unifiedOptions = useMemo(() => {
        if (!paymentModal.open) return [];
        if (paymentModal.context === "personal") return paymentMethods || [];
        const f = selectedFriends.find((x) => x._id === paymentModal.friendId);
        return (f?.paymentMethods || []).map((m) => ({ _id: m.paymentMethodId, ...m }));
    }, [paymentModal, selectedFriends, paymentMethods]);

    const unifiedValue = useMemo(() => {
        if (paymentModal.context === "personal") return personalPaymentMethod || null;
        const f = selectedFriends.find((x) => x._id === paymentModal.friendId);
        return f?.selectedPaymentMethodId ?? null;
    }, [paymentModal, personalPaymentMethod, selectedFriends]);

    const handleSelectUnified = (id) => {
        if (paymentModal.context === "personal") {
            setPersonalPaymentMethod(id);
        } else {
            setSelectedFriends((prev) => prev.map((f) => (f?._id === paymentModal.friendId ? { ...f, selectedPaymentMethodId: id } : f)));
        }
    };

    const payersWithPM = selectedFriends.filter((f) => f.paying && Array.isArray(f.paymentMethods) && f.paymentMethods.length > 1);
    const payersNeedingPM = payersWithPM.filter((f) => !f.selectedPaymentMethodId);

    const totalPaid = () => selectedFriends.filter((f) => f.paying).reduce((a, b) => a + Number(b.payAmount || 0), 0);
    const isPaidAmountValid = () => Number(totalPaid().toFixed(2)) === Number(amountNum.toFixed(2));

    const equalizePay = (arr) => {
        const payers = arr.filter((f) => f.paying);
        const n = payers.length;
        if (!n) return arr.map((f) => ({ ...f, payAmount: 0 }));
        const equal = Math.floor((amountNum / n) * 100) / 100;
        const totalSoFar = equal * n;
        const leftover = Number((amountNum - totalSoFar).toFixed(2));
        let idx = 0;
        return arr.map((f) => {
            if (!f.paying) return { ...f, payAmount: 0 };
            idx += 1;
            const pay = idx === n ? Number((equal + leftover).toFixed(2)) : equal;
            return { ...f, payAmount: pay };
        });
    };

    const equalizeOwe = (arr) => {
        const owing = arr.filter((f) => f.owing);
        const n = owing.length;
        const equal = n ? Math.floor((amountNum / n) * 100) / 100 : 0;
        const totalSoFar = equal * n;
        const leftover = Number((amountNum - totalSoFar).toFixed(2));
        let idx = 0;
        return arr.map((f) => {
            if (!f.owing) return { ...f, oweAmount: 0, owePercent: undefined };
            idx += 1;
            const owe = idx === n ? Number((equal + leftover).toFixed(2)) : equal;
            return { ...f, oweAmount: owe, owePercent: undefined };
        });
    };

    const deleteOwe = (arr) => arr.map((f) => ({ ...f, oweAmount: 0, owePercent: undefined }));

    const togglePaying = (friendId) => {
        setSelectedFriends((prev) => {
            let next = prev.map((f) => (f?._id === friendId ? { ...f, paying: !f.paying } : f));
            next = equalizePay(next);
            return next;
        });
    };

    const toggleOwing = (friendId) => {
        setSelectedFriends((prev) => {
            let next = prev.map((f) => (f?._id === friendId ? { ...f, owing: !f.owing } : f));
            if (form.splitMode === "equal") next = equalizeOwe(next);
            else next = deleteOwe(next);
            return next;
        });
    };

    const handleOweChange = (id, val) => {
        const v = Number(val || 0);
        setSelectedFriends((arr) => arr.map((f) => (f?._id === id ? { ...f, oweAmount: v, owePercent: undefined } : f)));
    };

    const handleOwePercentChange = (id, val) => {
        const p = Number(val || 0);
        setSelectedFriends((arr) => arr.map((f) => (f?._id === id ? { ...f, owePercent: p, oweAmount: Number(((p / 100) * amountNum).toFixed(2)) } : f)));
    };

    const addSplitMember = (friendId, name) => {
        if (!friendId) return;
        setSelectedFriends((prev) => (prev.some((f) => f?._id === friendId) ? prev : [...prev, { _id: friendId, name: name || "Member", paying: false, payAmount: 0, owing: false, oweAmount: 0 }]));
    };

    const selectedIds = new Set(selectedFriends.map((m) => m._id));
    const availableMembers = groupMembers.filter((m) => !selectedIds.has(m._id));

    const getRemainingTop = () => {
        const owingFriends = selectedFriends.filter((f) => f.owing);
        if (form.splitMode === "percent") {
            const totalPercent = owingFriends.reduce((sum, f) => sum + (parseFloat(f.owePercent) || 0), 0);
            return `${totalPercent.toFixed(2)} / 100%`;
        }
        if (form.splitMode === "value") {
            const totalValue = owingFriends.reduce((sum, f) => sum + parseFloat(f.oweAmount || 0), 0);
            return `${getSymbol(currency)} ${totalValue.toFixed(2)} / ${getSymbol(currency)} ${form?.amount?.toFixed(2)}`;
        }
        return "";
    };

    const getRemainingBottom = () => {
        const owingFriends = selectedFriends.filter((f) => f.owing);
        if (form.splitMode === "percent") {
            const totalPercent = owingFriends.reduce((sum, f) => sum + (parseFloat(f.owePercent) || 0), 0);
            const remaining = 100 - totalPercent;
            return `${remaining.toFixed(2)}% left`;
        }
        if (form.splitMode === "value") {
            const totalValue = owingFriends.reduce((sum, f) => sum + (f.oweAmount || 0), 0);
            const remaining = form.amount - totalValue;
            return `${getSymbol(currency)} ${remaining.toFixed(2)} left`;
        }
        return "";
    };
    const num = (x) => (isNaN(Number(x)) ? 0 : Number(x));

    const buildEqualResplit = (totalAmount, currentSplits) => {
        const members = currentSplits?.length || 0;
        if (!members || !Number(totalAmount)) return currentSplits;
        const perHead = Number(totalAmount) / members;
        return currentSplits.map((s) => ({ ...s, paying: false, payAmount: 0, oweAmount: perHead }));
    };

    const updateFriendsPaymentMethods = async (list) => {
        try {
            const map = await fetchFriendsPM(list, userToken); // expected { [friendId]: [paymentMethods...] }
            const oldSelections = {};
            (expense?.splits || []).forEach((s) => {
                const fid = s.friendId?._id || s.friendId;
                if (s?.paidFromPaymentMethodId) {
                    oldSelections[fid] = s?.paidFromPaymentMethodId?._id ? s?.paidFromPaymentMethodId?._id : null;
                }
            });
            setSelectedFriends((prev) =>
                prev.map((f) => {
                    const raw = map[f?._id === "me" ? userId : f?._id] || [];
                    let selectedPaymentMethodId = f.selectedPaymentMethodId;
                    const oldSelected = oldSelections[f?._id];
                    if (oldSelected && raw.some((m) => m.paymentMethodId === oldSelected)) {
                        selectedPaymentMethodId = oldSelected;
                    } else {
                        const stillValid = raw.some((m) => m.paymentMethodId === selectedPaymentMethodId);
                        if (!stillValid) selectedPaymentMethodId = raw.length === 1 ? raw[0].paymentMethodId : null;
                    }
                    return { ...f, paymentMethods: raw, selectedPaymentMethodId };
                })
            );
        } catch (err) {
            console.warn("Failed to fetch friends payment methods", err);
        }
    };

    // save
    const handleSave = async () => {
        if (!_id) return;
        const payload = {
            description: form.description.trim(),
            amount: Number(form.amount || 0),
            date: form.date ? new Date(form.date).toISOString() : null,
            category: form.category,
            typeOf: form.typeOf,
            mode: form.mode,
            splitMode: form.mode === "split" ? form.splitMode : undefined,
            groupId: expense?.groupId || undefined,
            currency: form.currency,
            splits:
                form.mode === "split"
                    ? selectedFriends.map((f) => ({
                        friendId: f?._id || f.friendId || "me",
                        paying: !!f.paying,
                        owing: !!f.owing,
                        payAmount: Number(f.payAmount || 0),
                        oweAmount: Number(f.oweAmount || 0),
                        ...(form.splitMode === "percent" ? { owePercent: Number(f.owePercent || 0) } : {}),
                        paymentMethodId: f.selectedPaymentMethodId,
                    }))
                    : [],
        };

        if (!payload.description) return Alert.alert("Validation", "Description is required.");
        if (isNaN(payload.amount) || payload.amount <= 0) return Alert.alert("Validation", "Enter a valid amount.");
        if (!payload.date) return Alert.alert("Validation", "Date is required.");

        if (form.mode === "personal" && personalPaymentMethod) {
            payload.paymentMethodId = personalPaymentMethod;
        }

        if (expense?.mode === "split" && reSplit) {
            payload.splits = buildEqualResplit(payload.amount, expense?.splits || []);
        }

        try {
            setLoading(true);
            await onUpdateExpense(_id, payload, userToken);
            if (onSaved) onSaved();
            setIsEditing(false);
            innerRef?.current?.dismiss?.();
            onClose?.();
        } catch (err) {
            console.error(err);
            Alert.alert("Save failed", err?.message || "Could not save expense");
        } finally {
            setLoading(false);
        }
    };

    // delete
    const handleDelete = async () => {
        if (!_id) return;
        try {
            setLoading(true);
            await onDeleteExpense(_id, userToken);
            innerRef?.current?.dismiss?.();
            onClose?.();
        } catch (err) {
            console.error(err);
            Alert.alert("Delete failed", err?.message || "Could not delete expense");
        } finally {
            setLoading(false);
        }
    };

    // diff helpers for history
    function diffExpense(before, after, getUserNameById, currency) {
        const changes = [];
        for (const key of Object.keys(after || {})) {
            if (["auditLog", "__v", "_id", "updatedAt", "createdAt"].includes(key)) continue;
            const beforeVal = before?.[key];
            const afterVal = after?.[key];
            if (key === "amount" && beforeVal !== afterVal) {
                changes.push({ label: "Cost", before: beforeVal, after: afterVal });
                continue;
            }
            if (key === "splits" && Array.isArray(beforeVal) && Array.isArray(afterVal)) {
                afterVal.forEach((splitAfter, idx) => {
                    const splitBefore = beforeVal[idx];
                    if (!splitBefore) return;
                    const friendName = getUserNameById(splitAfter.friendId) || "Someone";
                    if (splitBefore.oweAmount !== splitAfter.oweAmount) {
                        changes.push({ label: friendName.toLowerCase() == "you" ? "Your share" : `${friendName}'s share`, before: splitBefore.oweAmount, after: splitAfter.oweAmount });
                    }
                    if (splitBefore.payAmount !== splitAfter.payAmount) {
                        changes.push({ label: friendName.toLowerCase() == "you" ? "Your payment amount" : `${friendName} payment amount`, before: splitBefore.payAmount, after: splitAfter.payAmount });
                    }
                });
                continue;
            }
            if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
                changes.push({ label: key, before: beforeVal, after: afterVal });
            }
        }
        return changes;
    }

    function fmtCurrency(val, currency = "INR") {
        if (val == null) return "—";
        try {
            return new Intl.NumberFormat("en-IN", { style: "currency", currency, minimumFractionDigits: 2 }).format(val);
        } catch {
            return `${getSymbol(currency)} ${Number(val).toFixed(2)}`;
        }
    }

    const getUserNameById = (idOrObj) => {
        if (!idOrObj) return "";
        if (typeof idOrObj === "object") {
            if (idOrObj._id === userId) return "You";
            return idOrObj.name || "";
        }
        const id = idOrObj;
        if (id === userId) return "You";
        if ((expense?.createdBy?._id) === id) return expense.createdBy.name;
        const gm = groupMembers.find((m) => m._id === id);
        if (gm) return gm.name;
        const splitUser = (expense?.splits || []).map((s) => s.friendId).find((u) => (typeof u === "object" ? u._id : u) === id);
        if (splitUser && typeof splitUser === "object") return splitUser.name || "";
        return "";
    };

    const displayUser = (u) => {
        if (!u) return "";
        if (typeof u === "string") return u === userId ? "You" : u;
        if (u._id === userId) return "You";
        return u.name || u.email || "";
    };

    const lastAudit = Array.isArray(expense?.auditLog) && expense?.auditLog.length ? expense.auditLog[expense.auditLog.length - 1] : null;
    // UI tab state + small helpers (add near other useState declarations)
    const [activeTab, setActiveTab] = useState("paid");

    // derived values used by the UI
    const mode = form.splitMode; // "equal" | "value" | "percent"
    const paidTotal = totalPaid();
    const isPaidValid = isPaidAmountValid();

    const paidHasIssue = !isPaidValid;
    const splitHasIssue = (() => {
        if (!selectedFriends || !selectedFriends.length) return false;
        if (mode === "percent") {
            const totalPercent = selectedFriends.filter((f) => f.owing).reduce((sum, f) => sum + (parseFloat(f.owePercent) || 0), 0);
            return Number(totalPercent.toFixed(3)) !== 100;
        }
        if (mode === "value") {
            const totalValue = selectedFriends.filter((f) => f.owing).reduce((sum, f) => sum + Number(f.oweAmount || 0), 0);
            return Number(totalValue.toFixed(2)) !== Number(Number(form.amount || 0).toFixed(2));
        }
        // equal mode: no split issue unless no owing selected
        return selectedFriends.filter((f) => f.owing).length === 0;
    })();

    // small mutators to keep JSX concise
    const setPayAmount = (friendId, v) => {
        const val = Number(v || 0);
        setSelectedFriends((prev) => prev.map((p) => (p._id === friendId ? { ...p, payAmount: val } : p)));
    };

    const setOweAmount = (friendId, v) => handleOweChange(friendId, v);
    const setOwePercent = (friendId, v) => handleOwePercentChange(friendId, v);

    // helper used in owed-tab when switching to equal mode
    const distributeEqualOwe = (arr) => {
        const n = arr.filter((f) => f.owing).length;
        if (!n) return arr.map((f) => ({ ...f, oweAmount: 0 }));
        const equal = Math.floor((Number(form.amount || 0) / n) * 100) / 100;
        const totalSoFar = equal * n;
        const leftover = Number((Number(form.amount || 0) - totalSoFar).toFixed(2));
        let idx = 0;
        return arr.map((f) => {
            if (!f.owing) return { ...f, oweAmount: 0, owePercent: undefined };
            idx += 1;
            const owe = idx === n ? Number((equal + leftover).toFixed(2)) : equal;
            return { ...f, oweAmount: owe, owePercent: undefined };
        });
    };

    // footer options for layout
    // footer options for layout (replace your existing footerOptions)
    const footerOptions = {
        showDelete: true,
        onDelete: () => {
            // show confirmation alert before deleting
            Alert.alert(
                "Delete Expense",
                "Are you sure you want to delete this expense? This will delete the expense for everyone.",
                [
                    { text: "Cancel", style: "cancel" },
                    {
                        text: "Delete",
                        style: "destructive",
                        onPress: () => {
                            // call the existing delete handler
                            handleDelete();
                        },
                    },
                ],
                { cancelable: true }
            );
            // return nothing; delete happens in onPress of the alert
        },
        deleteLabel: "Delete",
        onCancel: () => {
            innerRef?.current?.dismiss?.();
        },
        cancelLabel: "Close",
        primaryLabel: isEditing ? "Save" : "Edit",
        onPrimary: () => {
            if (!isEditing) {
                setIsEditing(true);
                return;
            }
            handleSave();
        },
        primaryDisabled: loading || (isEditing && !canSubmit()),
        busy: loading,
    };


    function canSubmit() {
        if (form.mode == "personal" && form.typeOf == "expense") {
            if (form.description.length > 0 && form.amount > 0 && form.category.length > 0) return true;
            return false;
        }
        const hasOwing = selectedFriends.some((friend) => friend.owing);
        const hasPaying = selectedFriends.some((friend) => friend.paying);
        if (!hasOwing || !hasPaying) return false;
        if (form.splitMode === "equal") return hasOwing && isPaidAmountValid();
        if (form.splitMode === "percent") {
            const totalPercent = selectedFriends.filter((friend) => friend.owing).reduce((sum, f) => sum + (parseFloat(f.owePercent) || 0), 0);
            return totalPercent === 100 && isPaidAmountValid();
        }
        if (form.splitMode === "value") {
            const totalValue = selectedFriends.filter((friend) => friend.owing).reduce((sum, f) => sum + (f.oweAmount || 0), 0);
            return totalValue === form.amount && isPaidAmountValid();
        }
        return false;
    }

    const usableCurrencyOptions = useMemo(() => {
        const codes = new Set([form.currency, defaultCurrency, ...(currencyOptions || [])].filter(Boolean).map((c) => String(c).toUpperCase()));
        const arr = Array.from(codes).sort().map((code) => ({ value: code, label: `${code}${getSymbol(code) ? ` (${getSymbol(code)})` : ""}` }));
        if (preferredCurrencies.length) {
            const preferredSet = new Set(preferredCurrencies.map((c) => String(c).toUpperCase()));
            const pref = arr.filter((a) => preferredSet.has(a.value));
            const rest = arr.filter((a) => !preferredSet.has(a.value));
            return [...pref, ...rest];
        }
        return arr;
    }, [form.currency, currencyOptions, defaultCurrency, preferredCurrencies]);

    // Top view when not editing
    const topView = (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingTop: 16, gap: 10 }}>
            {form.description ? <Text style={styles.titleText}>{form.description}</Text> : null}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={styles.amountText}>{getSymbol(form.currency)} {fmtMoney(form.amount)}</Text>
                {form.mode === "personal" && expense?.paidFromPaymentMethodId && <Text style={styles.smallText}>{expense.paidFromPaymentMethodId?.label}</Text>}
            </View>

            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    {expense?.typeOf === "expense" && <View style={styles.categoryIcon}><Text style={styles.categoryIconText}>{(expense?.category || "").slice(0, 1).toUpperCase()}</Text></View>}
                    <Text style={styles.smallText}>{expense?.category ? getCategoryLabel(expense.category) : "Uncategorized"}</Text>
                </View>
                {form.date ? <Text style={styles.smallText}>{fmtDate(form.date)}</Text> : null}
            </View>

            {form.mode === "split" && (
                <>
                    <View style={styles.divider} />
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <View>
                            {(() => {
                                const mine = (expense?.splits || []).find((s) => (s?.friendId?._id || s?.friendId) === userId);
                                const myExpense = Math.abs(Number(mine?.oweAmount || 0));
                                return myExpense > 0 ? <Text style={styles.tealText}>Your share: {getSymbol(expense?.currency)} {fmtMoney(myExpense)}</Text> : <Text style={styles.mutedText}>Not Involved</Text>;
                            })()}
                        </View>

                        <TouchableOpacity onPress={() => setViewSplits((v) => !v)}>
                            <Text style={styles.tealLink}>{viewSplits ? "Hide Details" : "View Details"}</Text>
                        </TouchableOpacity>
                    </View>

                    {viewSplits && (
                        <View style={{ gap: 8 }}>
                            {(expense?.splits || []).filter((s) => (s.payAmount || 0) > 0 || (s.oweAmount || 0) > 0).map((s, idx) => {
                                const name = s?.friendId?._id == userId ? "You" : s?.friendId?.name || "Member";
                                const payTxt = (s.payAmount || 0) > 0 ? `paid ${getSymbol(expense?.currency)} ${fmtMoney(s.payAmount)}` : "";
                                const andTxt = (s.payAmount || 0) > 0 && (parseFloat(s.oweAmount) || 0) > 0 ? " and " : "";
                                const oweTxt = parseFloat(s.oweAmount) > 0 ? `owe${s?.friendId?._id !== userId ? "s" : ""} ${getSymbol(expense?.currency)} ${fmtMoney(parseFloat(s.oweAmount) || 0)}` : "";
                                return <Text key={idx} style={s?.friendId?._id == userId ? null : styles.mutedText}>{`${name} ${payTxt}${andTxt}${oweTxt}`}</Text>;
                            })}

                            <View style={styles.divider} />

                            {(expense?.createdBy?.name || expense?.createdAt) && (
                                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                                    <Text style={styles.mutedText}>Created by {expense?.createdBy?.name ? `${expense.createdBy.name} ` : ""}</Text>
                                    <Text style={styles.mutedText}>{expense?.createdAt ? fmtDateTimeNoSecs(expense.createdAt) : ""}</Text>
                                </View>
                            )}

                            {Array.isArray(expense?.auditLog) && expense?.auditLog.length > 0 && (
                                <View style={{ gap: 8 }}>
                                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                                        {(() => {
                                            const editors = (expense.auditLog || []).map((e) => displayUser(e.updatedBy)).filter(Boolean);
                                            const uniqueEditors = [...new Set(editors)];
                                            const firstTwo = uniqueEditors.slice(0, 1).join(", ");
                                            const remaining = uniqueEditors.length - 1;
                                            return <Text style={styles.mutedText}>Edited by {firstTwo}{remaining > 0 ? ` and ${remaining} more` : ""}</Text>;
                                        })()}

                                        <TouchableOpacity onPress={() => setShowHistory((s) => !s)}>
                                            <Text style={styles.tealLink}>{showHistory ? "Hide Edit History" : "View Edit History"}</Text>
                                        </TouchableOpacity>
                                    </View>

                                    {showHistory && (expense.auditLog || []).map((entry, idx) => {
                                        const changes = diffExpense(entry.before, entry.after, getUserNameById, form.currency);
                                        return (
                                            <View key={idx} style={styles.historyRow}>
                                                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                                                    <Text style={styles.mutedText}>{`${displayUser(entry.updatedBy)} updated this transaction`}</Text>
                                                    <Text style={styles.mutedText}>{fmtDateTimeNoSecs(entry.at)}</Text>
                                                </View>
                                                {changes.length > 0 && changes.map((c, i) => (
                                                    <View key={i} style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                                                        <Text style={styles.historyLabel}>{c.label}:</Text>
                                                        <Text style={styles.historyBefore}>{fmtCurrency(c.before, form.currency)}</Text>
                                                        <Text style={styles.historyArrow}> → </Text>
                                                        <Text style={styles.historyAfter}>{fmtCurrency(c.after, form.currency)}</Text>
                                                    </View>
                                                ))}
                                            </View>
                                        );
                                    })}
                                </View>
                            )}
                        </View>
                    )}
                </>
            )}
        </ScrollView>
    );

    // main editing UI
    const editView = (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
            <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingTop: 16 }}>
                <View style={{ gap: 12 }}>
                    {/* Description */}
                    <View style={styles.row}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.label}>Description</Text>
                            <TextInput style={styles.input} placeholder="What was this for?" placeholderTextColor={colors.muted || "#888"} value={form.description} onChangeText={(t) => setForm((f) => ({ ...f, description: t }))} maxLength={140} />
                        </View>
                    </View>

                    {/* Currency + amount */}
                    <View style={styles.row}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.label}>Currency</Text>
                            <TouchableOpacity style={styles.selector} onPress={() => currencySheetRef.current?.present?.()}>
                                <Text style={styles.selectorText}>{form.currency}</Text>
                                <ChevronDown width={16} height={16} color={colors.muted || "#aaa"} />
                            </TouchableOpacity>
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.label}>Amount</Text>
                            <TextInput keyboardType="decimal-pad" style={styles.input} value={String(form.amount)} onChangeText={(v) => {
                                const n = Number(v || 0);
                                setForm((f) => ({ ...f, amount: n }));
                                if (form.mode === "split") {
                                    setSelectedFriends((prev) => {
                                        let next = prev;
                                        if (prev.some((p) => p.paying)) next = equalizePay(next);
                                        if (form.splitMode === "equal") next = equalizeOwe(next);
                                        return next;
                                    });
                                }
                            }} placeholder="0.00" />
                        </View>
                    </View>

                    {/* Category + Date + Payment Account (personal) */}
                    <View style={styles.row}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.label}>Category</Text>
                            <TouchableOpacity style={styles.selector} onPress={() => categorySheetRef.current?.present?.()}>
                                <Text style={styles.selectorText}>{form.category ? getCategoryLabel(form.category) : "Category"}</Text>
                                <ChevronDown width={16} height={16} color={colors.muted || "#aaa"} />
                            </TouchableOpacity>
                        </View>

                        <View style={{ flex: 1 }}>
                            <Text style={styles.label}>Date</Text>

                            <TouchableOpacity
                                onPress={() => setShowDatePicker(true)}
                                style={[styles.input, { justifyContent: "center" }]}
                                activeOpacity={0.7}
                            >
                                <Text style={{ color: form.date ? (colors.text || "#fff") : (colors.muted || "#888") }}>
                                    {form.date ? formatReadable(form.date) : "Select date"}
                                </Text>
                            </TouchableOpacity>

                            <DateTimePickerModal
                                isVisible={showDatePicker}
                                mode="date"
                                date={form.date ? new Date(form.date) : new Date()}
                                // optional: restrict to past dates only
                                // maximumDate={new Date()}
                                onConfirm={(date) => {
                                    setShowDatePicker(false);
                                    // keep the same YYYY-MM-DD input format used elsewhere
                                    const yyyy = date.getFullYear();
                                    const mm = String(date.getMonth() + 1).padStart(2, "0");
                                    const dd = String(date.getDate()).padStart(2, "0");
                                    setForm((f) => ({ ...f, date: `${yyyy}-${mm}-${dd}` }));
                                }}
                                onCancel={() => setShowDatePicker(false)}
                            />
                        </View>
                    </View>


                    {form.mode === "personal" && (
                        <View style={{ flex: 1 }}>
                            <Text style={styles.label}>Payment Account</Text>
                            <TouchableOpacity style={styles.selector} onPress={() => {
                                setPaymentModal({ open: true, context: "personal", friendId: null });
                                paymentSheetRef.current?.present?.();
                            }}>
                                <Text style={styles.selectorText}>{personalPaymentMethod ? (paymentMethods.find((p) => p._id === personalPaymentMethod)?.label || personalPaymentMethod) : "Payment Account"}</Text>
                            </TouchableOpacity>
                        </View>
                    )}


                    {/* Split editing */}
                    {form.mode === "split" && (
                        <>
                            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                                <TouchableOpacity
                                    onPress={() => setActiveTab("paid")}
                                    style={[
                                        styles.summaryBtn || { padding: 8, borderRadius: 8 }, //  if you don't have summaryBtn in stylesheet
                                        activeTab === "paid" && styles.summaryBtnActive,
                                        paidHasIssue && styles.summaryBtnError,
                                    ]}
                                >
                                    <Text style={[styles.summaryLabel || { fontWeight: "700" }, paidHasIssue && styles.summaryLabelError]}>Paid by</Text>
                                    <Text style={styles.summaryValue || { fontSize: 12 }}>
                                        {(() => {
                                            const payers = selectedFriends.filter((f) => f.paying);
                                            if (payers.length === 0) return "—";
                                            if (payers.length === 1) return payers[0]._id === userId ? "You" : payers[0].name;
                                            return `${payers.length} people`;
                                        })()}
                                    </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={() => setActiveTab("owed")}
                                    style={[
                                        styles.summaryBtn || { padding: 8, borderRadius: 8 },
                                        activeTab === "owed" && styles.summaryBtnActive,
                                        splitHasIssue && styles.summaryBtnError,
                                    ]}
                                >
                                    <Text style={[styles.summaryLabel || { fontWeight: "700" }, splitHasIssue && styles.summaryLabelError]}>Split by</Text>
                                    <Text style={styles.summaryValue || { fontSize: 12 }}>
                                        {mode === "equal" ? "equally" : mode === "value" ? "amounts" : "percentages"}
                                    </Text>
                                </TouchableOpacity>
                            </View>

                            {/* Paid tab */}
                            {activeTab === "paid" ? (
                                <>
                                    <Text style={styles.sectionHint}>Select the people who paid</Text>



                                    {/* Use radio-style rows (like 'owed' block) instead of chips */}

                                    {selectedFriends.map((f) => {
                                        const isPaying = !!f.paying;
                                        const manyPMs = Array.isArray(f.paymentMethods) && f.paymentMethods.length > 1;
                                        const selPM = f.paymentMethods?.find((m) => m.paymentMethodId === f.selectedPaymentMethodId);

                                        return (
                                            <TouchableOpacity
                                                key={`payrow-${f._id}`}
                                                onPress={() => {
                                                    // toggle paying and recompute pay distribution (togglePaying handles distributeEqualPay)
                                                    togglePaying(f._id);
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

                                                    <Text style={{ color: theme.colors.text, flex: 1 }} numberOfLines={1}>
                                                        {f.name}
                                                    </Text>
                                                </View>

                                                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                                    {/* Payment method selector if friend has >1 PMs */}
                                                    {manyPMs && isPaying ? (
                                                        <TouchableOpacity
                                                            onPress={() => openPaymentSheet({ context: "split", friendId: f._id })}
                                                            style={[
                                                                styles.pmBtn,
                                                                selPM ? { borderColor: theme.colors.border, backgroundColor: "transparent" } : { borderColor: theme.colors.negative, backgroundColor: "rgba(244,67,54,0.08)" },
                                                            ]}
                                                        >
                                                            <Text style={[styles.pmBtnText, { color: selPM ? theme.colors.text : theme.colors.negative }]} numberOfLines={1}>
                                                                {selPM ? selPM.label || selPM.type || "Payment Method" : "Select"}
                                                            </Text>
                                                        </TouchableOpacity>
                                                    ) : null}

                                                    {/* Amount field: only show when more than one payer (same as before) */}
                                                    {selectedFriends.filter((x) => x.paying).length > 1 && isPaying ? (
                                                        <TextInput
                                                            placeholder="Amount"
                                                            placeholderTextColor={theme.colors.muted}
                                                            keyboardType="decimal-pad"
                                                            value={String(f.payAmount || "")}
                                                            onChangeText={(v) => setPayAmount(f._id, v)}
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
                                            {console.log(paidTotal, amountNum)}
                                            <Text style={[styles.helperMono]}>{formatMoney(currency, num(amountNum) - paidTotal)} left</Text>
                                            <Text style={[styles.helperMono, { color: theme.colors.muted }]}>{formatMoney(currency, paidTotal)} / {formatMoney(currency, num(amountNum))}</Text>
                                        </View>
                                    ) : null}
                                </>
                            ) : null}

                            {/* Owed tab */}
                            {activeTab === "owed" && (
                                <>
                                    <Text style={styles.sectionHint}>Select who owes</Text>

                                    {selectedFriends.length > 1 ? (
                                        <View style={{ gap: 8 }}>
                                            <View style={{ flexDirection: "row", gap: 8 }}>
                                                {["equal", "value", "percent"].map((m) => {
                                                    const active = mode === m;
                                                    return (
                                                        <TouchableOpacity key={m} onPress={() => {
                                                            setForm((f) => ({ ...f, splitMode: m }));
                                                            if (m === "equal") {
                                                                setSelectedFriends((prev) => {
                                                                    // ensure everyone is set to owing true default when switching to equal
                                                                    const marked = prev.map((p) => ({ ...p, owing: true, owePercent: undefined }));
                                                                    return distributeEqualOwe(marked);
                                                                });
                                                            } else if (m === "value") {
                                                                setSelectedFriends((prev) => prev.map((p) => ({ ...p, oweAmount: p.owing ? p.oweAmount ?? 0 : 0, owePercent: undefined })));
                                                            } else if (m === "percent") {
                                                                setSelectedFriends((prev) => prev.map((p) => ({ ...p, owePercent: p.owePercent ?? 0, oweAmount: 0 })));
                                                            }
                                                        }} style={[styles.modeBtn, active ? styles.modeBtnActive : styles.modeBtnInactive]}>
                                                            <Text style={active ? { color: colors.textDark || "#000" } : { color: colors.text || "#fff" }}>{m === "equal" ? "=" : m === "value" ? "1.23" : "%"}</Text>
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                            </View>

                                            <View style={{ gap: 8 }}>
                                                {selectedFriends.map((f) => {
                                                    const isOwing = !!f.owing;
                                                    return (
                                                        <TouchableOpacity
                                                            key={`ow-${f._id}`}
                                                            onPress={() => {
                                                                setSelectedFriends((prev) => {
                                                                    const updated = prev.map((x) => {
                                                                    if (x._id === f?._id) {
                                                                        const newOwing = !x.owing;
                                                                        return {
                                                                        ...x,
                                                                        owing: newOwing,
                                                                        oweAmount: newOwing ? x.oweAmount : 0, // or null, depending on your logic
                                                                        };
                                                                    }
                                                                    return x;
                                                                    });

                                                                    if (mode === "equal") return distributeEqualOwe(updated);
                                                                    return updated;
                                                                });
                                                            }}
                                                            activeOpacity={0.8}
                                                            style={[styles.splitRow, { paddingVertical: mode === "equal" ? 8 : 0 }]}
                                                        >
                                                            <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>

                                                                    <View style={styles.radioWrap}>
                                                                        <View style={[styles.radioOuter, isOwing && styles.radioOuterActive]}>
                                                                            {isOwing ? <View style={styles.radioInnerActive} /> : <View style={styles.radioInner} />}
                                                                        </View>
                                                                    </View>


                                                                <Text style={{ color: colors.text || "#fff", flex: 1 }}>{f.name}</Text>
                                                            </View>
                                                            {isOwing && <>
                                                            {mode === "percent" ? (
                                                                <TextInput keyboardType="decimal-pad" style={[styles.smallInput, { width: 100 }]} value={String(f.owePercent ?? "")} onChangeText={(v) => setOwePercent(f._id, v)} />
                                                            ) : mode === "value" ? (
                                                                <TextInput keyboardType="decimal-pad" style={[styles.smallInput, { width: 100 }]} value={String(f.oweAmount ?? "")} onChangeText={(v) => setOweAmount(f._id, v)} />
                                                            ) : (
                                                                <Text style={{ color: colors.text || "#fff' " }}>{Number(f.oweAmount || 0).toFixed(2)}</Text>
                                                            )}</>}
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                            </View>
                                            <View style={{ alignItems: "center", marginTop: 6 }}>
                                            <Text style={[styles.helperMono, { color: theme.colors.muted }]}>{getRemainingBottom()}</Text>
                                            <Text style={[styles.helperMono]}>{getRemainingTop()}</Text>
                                            </View>

                                        </View>
                                    ) : (
                                        <Text style={styles.mutedText}>Add more people to split this expense.</Text>
                                    )}
                                </>
                            )}
                        </>
                    )}

                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );

    if (loading) {
        return (
            <BottomSheetLayout
                innerRef={innerRef}
                title={`${isEditing ? "Edit" : ""} ${form.typeOf === "expense" ? "Expense" : "Settlement"}`.trim()}
                onClose={onClose}
                footerOptions={{ ...footerOptions, primaryDisabled: true, busy: true }}
            >
                <View style={{ padding: 20, alignItems: "center" }}>
                    <ActivityIndicator size="large" />
                </View>
            </BottomSheetLayout>
        );
    }

    return (
        <BottomSheetLayout
            innerRef={innerRef}
            title={`${isEditing ? "Edit" : ""} ${form.typeOf === "expense" ? form.mode : "Settle"} Expense`.trim()}
            onClose={onClose}
            footerOptions={footerOptions}
        >
            <View style={{ paddingHorizontal: 0 }}>
                {!isEditing ? topView : editView}
                <View style={{ height: insets.bottom + 12 }} />
            </View>

            <SheetCurrencies
                innerRef={currencySheetRef}
                value={form.currency}
                options={usableCurrencyOptions}
                onSelect={(v) => setForm((f) => ({ ...f, currency: String(v).toUpperCase() }))}
                onClose={() => { }}
            />

            <SheetCategories
                innerRef={categorySheetRef}
                value={form.category}
                options={getCategoryOptions}
                onSelect={(val) => setForm((f) => ({ ...f, category: val }))}
                onClose={() => { }}
            />

            <SheetPayments
                innerRef={paymentSheetRef}
                value={unifiedValue}
                options={unifiedOptions}
                onSelect={(id) => {
                    handleSelectUnified(id);
                    // auto-close sheet
                    paymentSheetRef.current?.dismiss?.();
                    setPaymentModal({ open: false, context: "personal", friendId: null });
                }}
                onClose={() => setPaymentModal({ open: false, context: "personal", friendId: null })}
            />
        </BottomSheetLayout>
    );

    // ---- helpers ----

    function normalizeSplit(s) {
        return {
            ...s,
            friendId: s?.friendId?._id || s?.friendId,
            payAmount: Number(s?.payAmount || 0),
            oweAmount: Number(s?.oweAmount || 0),
            paying: !!s?.paying,
            owing: !!s?.owing,
            owePercent: s?.owePercent != null ? Number(s.owePercent) : undefined,
            selectedPaymentMethodId: s?.paymentMethodId || s?.paidFromPaymentMethodId || null,
            name: s?.friendId?.name || s?.name || "Member",
        };
    }

    function detectSplitMode(splitsArr = []) {
        if (!Array.isArray(splitsArr) || !splitsArr.length) return "equal";
        if (splitsArr.some((s) => s?.owePercent != null)) return "percent";
        if (splitsArr.some((s) => Number(s?.oweAmount || 0) > 0)) return "value";
        return "equal";
    }

    function mergeMembersWithSplits(members = [], splitsArr = []) {
        const byId = new Map(
            splitsArr.map((s) => [
                s?.friendId?._id || s?.friendId,
                {
                    paying: !!s?.paying,
                    owing: !!s?.owing,
                    payAmount: Number(s?.payAmount || 0),
                    oweAmount: Number(s?.oweAmount || 0),
                    owePercent: s?.owePercent != null ? Number(s.owePercent) : undefined,
                    name: s?.friendId?.name || s?.name || "Member",
                    selectedPaymentMethodId: s?.paymentMethodId || s?.paidFromPaymentMethodId || null,
                    paymentMethods: s?.paymentMethods || [],
                },
            ])
        );

        const merged = members.map((m) => {
            const prev = byId.get(m._id);
            return {
                _id: m._id,
                name: m.name || prev?.name || "Member",
                paying: prev?.paying || false,
                owing: prev?.owing || false,
                payAmount: prev?.payAmount || 0,
                oweAmount: prev?.oweAmount || 0,
                owePercent: prev?.owePercent,
                selectedPaymentMethodId: prev?.selectedPaymentMethodId || null,
                paymentMethods: prev?.paymentMethods || [],
            };
        });

        (splitsArr || []).forEach((s) => {
            const id = s?.friendId?._id || s?.friendId;
            if (!merged.some((x) => x._id === id)) {
                merged.push({
                    _id: id,
                    name: s?.friendId?.name || s?.name || "Member",
                    paying: !!s?.paying,
                    owing: !!s?.owing,
                    payAmount: Number(s?.payAmount || 0),
                    oweAmount: Number(s?.oweAmount || 0),
                    owePercent: s?.owePercent != null ? Number(s.owePercent) : undefined,
                    selectedPaymentMethodId: s?.paymentMethodId || s?.paidFromPaymentMethodId || null,
                    paymentMethods: s?.paymentMethods || [],
                });
            }
        });

        return merged;
    }
}

// ---------------- styles ----------------
const createStyles = (c = {}) =>
    StyleSheet.create({
        titleText: { color: c.text || "#EBF1D5", fontSize: 18, fontWeight: "700" },
        amountText: { color: c.primary || "#2bbf9a", fontSize: 22, fontWeight: "700" },
        smallText: { color: c.muted || "#9aa", fontSize: 13 },
        mutedText: { color: c.muted || "#9aa" },
        tealText: { color: c.primary || "#2bbf9a" },
        tealLink: { color: c.primary || "#2bbf9a", textDecorationLine: "underline" },
        divider: { height: 1, backgroundColor: c.border || "#2a2a2a", marginVertical: 8 },

        categoryIcon: { width: 26, height: 26, borderRadius: 6, backgroundColor: "#222", alignItems: "center", justifyContent: "center" },
        categoryIconText: { color: "#ddd", fontSize: 12 },

        row: { flexDirection: "row", gap: 8, alignItems: "center" },
        label: { color: c.muted || "#9aa", marginBottom: 6, fontSize: 13, fontWeight: "700" },
        input: { backgroundColor: c.cardAlt || "#111", color: c.text || "#EBF1D5", borderRadius: 12, borderWidth: 1, borderColor: c.border || "#444", paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },

        selector: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: c.cardAlt || "transparent", borderBottomWidth: 1, borderColor: c.border || "#444", paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8 },
        selectorText: { color: c.text || "#EBF1D5", fontSize: 15 },

        sectionTitle: { color: c.text || "#EBF1D5", fontSize: 14, fontWeight: "700" },
        sectionHint: { color: c.muted || "#9aa", fontWeight: "600", fontSize: 12 },

        chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
        chipActive: { backgroundColor: c.primary || "#60DFC9", borderColor: c.primary || "#60DFC9" },
        chipInactive: { backgroundColor: "transparent", borderColor: c.border || "#444" },
        chipText: { color: c.text || "#EBF1D5", fontSize: 13 },
        chipTextActive: { color: c.card || "#121212", fontWeight: "700" },

        chip2: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, borderWidth: 1.5, borderColor: c.muted, backgroundColor: "transparent" },
        chip2Active: { backgroundColor: `${c.cta}33`, borderColor: `${c.cta}33` },
        chip2Text: { color: c.text },
        chip2TextActive: { color: c.text, fontWeight: "700" },

        splitRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4, height: 45  },
        smallInput: { width: 100, padding: 8, borderBottomWidth: 1, borderColor: c.border || "#333", color: c.text || "#fff", textAlign: "right", borderRadius: 6, backgroundColor: c.cardAlt || "#111" },
        smallBtn: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, backgroundColor: c.cardAlt || "#111", borderWidth: 1, borderColor: c.border || "#444" },
        smallBtnText: { color: c.text || "#fff" },

        centerMono: { alignItems: "center" },
        monoText: { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", color: c.text || "#fff" },

        historyRow: { padding: 8, borderWidth: 1, borderColor: c.border || "#2a2a2a", borderRadius: 8 },
        historyLabel: { color: c.text || "#ddd", fontWeight: "700" },
        historyBefore: { color: "#f66" },
        historyAfter: { color: "#2bbf9a" },
        historyArrow: { color: "#ddd" },

        modeBtn: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 2, color: c.text, minWidth: '30%', justifyContent: 'center', alignItems: 'center' },
        modeBtnActive: { backgroundColor: c.primary || "#2bbf9a" },
        modeBtnInactive: { backgroundColor: "transparent", borderWidth: 1, borderColor: c.border || "#444" },
        summaryBtn: {
            flex: 1,
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: c.card,
        },
        summaryBtnActive: {
            borderColor: c.cta,
        },
        summaryLabel: {
            fontSize: 12,
            color: c.muted,
            marginBottom: 2,
        },
        summaryValue: {
            fontSize: 14,
            color: c.text,
            fontWeight: "600",
        },
        radioWrap: { width: 28, alignItems: "center", justifyContent: "center" },
        radioOuter: {
            width: 18,
            height: 18,
            borderRadius: 18,
            borderWidth: 2,
            borderColor: c.border,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "transparent",
        },
        radioOuterActive: { borderColor: c.cta, },
        radioInner: { width: 10, height: 10, borderRadius: 10, backgroundColor: c.border },
        radioInnerActive: { width: 10, height: 10, borderRadius: 10, backgroundColor: c.cta },


        summaryBtnError: {

            backgroundColor: "rgba(244,67,54,0.06)",
        },
        summaryLabelError: {
            color: c.negative,
        },
        summaryValueError: {
            color: c.negative,
        },
        pmBtn: {
            borderWidth: 1,
            borderColor: c.border,
            paddingHorizontal: 10,
            paddingVertical: 8,
            borderRadius: 10,
            maxWidth: 180,
            alignItems: "center",
            justifyContent: "center",
        },
        pmBtnText: { fontSize: 14, color: c.text },

        selRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", height: 30 },
        selText: { color: c.text, fontSize: 16, textTransform: "capitalize" },
        rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
        helperMono: { color: c.text, fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }) },

    });
