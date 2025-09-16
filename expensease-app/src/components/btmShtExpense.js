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
import { Feather } from "@expo/vector-icons";
import BottomSheetLayout from "./btmShtHeaderFooter"; // your reusable layout
import SheetCurrencies from "~/shtCurrencies";
import SheetCategories from "~/shtCategories";
import SheetPayments from "~/shtPayments";
import { getSymbol } from "../utils/currencies";
import { useTheme } from "context/ThemeProvider";
import { getCategoryLabel, getCategoryOptions } from "../utils/categoryOptions";
import { fetchFriendsPaymentMethods } from "../services/PaymentMethodService";

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
    getGroupDetails,
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

    // control state
    const [loading, setLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(true);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [viewSplits, setViewSplits] = useState(false);
    const [showHistory, setShowHistory] = useState(false);

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
        setIsEditing(true);
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
                const group = await getGroupDetails(expense.groupId, userToken);
                const members = Array.isArray(group?.members) ? group.members : [];
                setGroupMembers(members);
                setSelectedFriends(mergeMembersWithSplits(members, splits));
            } catch (err) {
                // console.warn("Failed to load group members:", err);
                setGroupMembers([]);
                setSelectedFriends(mergeMembersWithSplits([], splits));
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [_id, expense]);

    // when editing, fetch friends' payment methods
    useEffect(() => {
        if (!isEditing) return;
        updateFriendsPaymentMethods(selectedFriends.map((f) => f._id));
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
            setSelectedFriends((prev) => prev.map((f) => (f._id === paymentModal.friendId ? { ...f, selectedPaymentMethodId: id } : f)));
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
            let next = prev.map((f) => (f._id === friendId ? { ...f, paying: !f.paying } : f));
            next = equalizePay(next);
            return next;
        });
    };

    const toggleOwing = (friendId) => {
        setSelectedFriends((prev) => {
            let next = prev.map((f) => (f._id === friendId ? { ...f, owing: !f.owing } : f));
            if (form.splitMode === "equal") next = equalizeOwe(next);
            else next = deleteOwe(next);
            return next;
        });
    };

    const handleOweChange = (id, val) => {
        const v = Number(val || 0);
        setSelectedFriends((arr) => arr.map((f) => (f._id === id ? { ...f, oweAmount: v, owePercent: undefined } : f)));
    };

    const handleOwePercentChange = (id, val) => {
        const p = Number(val || 0);
        setSelectedFriends((arr) => arr.map((f) => (f._id === id ? { ...f, owePercent: p, oweAmount: Number(((p / 100) * amountNum).toFixed(2)) } : f)));
    };

    const addSplitMember = (friendId, name) => {
        if (!friendId) return;
        setSelectedFriends((prev) => (prev.some((f) => f._id === friendId) ? prev : [...prev, { _id: friendId, name: name || "Member", paying: false, payAmount: 0, owing: false, oweAmount: 0 }]));
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
                    const raw = map[f._id === "me" ? userId : f._id] || [];
                    let selectedPaymentMethodId = f.selectedPaymentMethodId;
                    const oldSelected = oldSelections[f._id];
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
                        friendId: f._id || f.friendId || "me",
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

    // footer options for layout
    const footerOptions = {
        showDelete: true,
        onDelete: () => setConfirmDelete(true),
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
        <View style={{ gap: 10 }}>
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
        </View>
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
                                <Feather name="chevron-down" size={16} color={colors.muted || "#aaa"} />
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
                                <Feather name="chevron-down" size={16} color={colors.muted || "#aaa"} />
                            </TouchableOpacity>
                        </View>

                        <View style={{ flex: 1 }}>
                            <Text style={styles.label}>Date</Text>
                            <TextInput style={styles.input} placeholder="YYYY-MM-DD" value={form.date} onChangeText={(d) => setForm((f) => ({ ...f, date: d }))} />
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
                    </View>

                    {/* Split editing */}
                    {form.mode === "split" && (
                        <View style={{ gap: 12 }}>
                            <Text style={styles.sectionTitle}>Paid by <Text style={styles.sectionHint}>(select who paid)</Text></Text>
                            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                                {selectedFriends.map((f) => (
                                    <TouchableOpacity key={f._id} onPress={() => togglePaying(f._id)} style={[styles.chip, f.paying ? styles.chipActive : styles.chipInactive]}>
                                        <Text style={f.paying ? styles.chipTextActive : styles.chipText}>{f.name}{f._id === userId ? " (You)" : ""}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {(selectedFriends.filter((f) => f.paying).length > 1 || (selectedFriends.filter((f) => f.paying).length === 1 && selectedFriends.filter((f) => f.paying)[0].paymentMethods?.length > 1)) && (
                                <View style={{ gap: 8 }}>
                                    {selectedFriends.filter((f) => f.paying).map((f) => (
                                        <View key={f._id} style={styles.splitRow}>
                                            <Text>{f.name}{f._id === userId ? " (You)" : ""}</Text>
                                            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                                {Array.isArray(f.paymentMethods) && f.paymentMethods.length > 1 && (
                                                    <TouchableOpacity onPress={() => {
                                                        setPaymentModal({ open: true, context: "split", friendId: f._id });
                                                        paymentSheetRef.current?.present?.();
                                                    }} style={styles.smallBtn}>
                                                        <Text style={styles.smallBtnText}>{(f.paymentMethods?.find((m) => m.paymentMethodId === f.selectedPaymentMethodId)?.label) || "Pay"}</Text>
                                                    </TouchableOpacity>
                                                )}
                                                <TextInput keyboardType="decimal-pad" style={styles.smallInput} value={String(f.payAmount)} onChangeText={(v) => {
                                                    const val = Number(v || 0);
                                                    setSelectedFriends((prev) => prev.map((p) => (p._id === f._id ? { ...p, payAmount: val } : p)));
                                                }} />
                                            </View>
                                        </View>
                                    ))}

                                    {!isPaidAmountValid() && (
                                        <View style={styles.centerMono}>
                                            <Text style={styles.monoText}>{getSymbol(form.currency)} {totalPaid().toFixed(2)} / {getSymbol(form.currency)} {amountNum.toFixed(2)}</Text>
                                            <Text style={styles.mutedText}>{getSymbol(form.currency)} {(amountNum - totalPaid()).toFixed(2)} left</Text>
                                        </View>
                                    )}
                                </View>
                            )}

                            {isPaidAmountValid() && (
                                <View style={{ gap: 8 }}>
                                    <Text style={styles.sectionTitle}>Owed by <Text style={styles.sectionHint}>(select who owes)</Text></Text>
                                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                                        {selectedFriends.map((f) => (
                                            <TouchableOpacity key={f._id} onPress={() => toggleOwing(f._id)} style={[styles.chip, f.owing ? styles.chipActive : styles.chipInactive]}>
                                                <Text style={f.owing ? styles.chipTextActive : styles.chipText}>{f.name}{f._id === userId ? " (You)" : ""}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>

                                    {selectedFriends.filter((f) => f.owing).length > 1 && (
                                        <View style={{ gap: 8 }}>
                                            <View style={{ flexDirection: "row", gap: 8 }}>
                                                <TouchableOpacity onPress={() => { setForm((f) => ({ ...f, splitMode: "equal" })); setSelectedFriends(equalizeOwe); }} style={[styles.modeBtn, form.splitMode === "equal" ? styles.modeBtnActive : styles.modeBtnInactive]}><Text>=</Text></TouchableOpacity>
                                                <TouchableOpacity onPress={() => setForm((f) => ({ ...f, splitMode: "value" }))} style={[styles.modeBtn, form.splitMode === "value" ? styles.modeBtnActive : styles.modeBtnInactive]}><Text>1.23</Text></TouchableOpacity>
                                                <TouchableOpacity onPress={() => setForm((f) => ({ ...f, splitMode: "percent" }))} style={[styles.modeBtn, form.splitMode === "percent" ? styles.modeBtnActive : styles.modeBtnInactive]}><Text>%</Text></TouchableOpacity>
                                            </View>

                                            <View style={{ gap: 8 }}>
                                                {selectedFriends.filter((f) => f.owing).map((f) => (
                                                    <View key={f._id} style={styles.splitRow}>
                                                        <Text>{f.name}{f._id === userId ? " (You)" : ""}</Text>
                                                        {form.splitMode === "percent" ? (
                                                            <TextInput keyboardType="decimal-pad" style={styles.smallInput} value={String(f.owePercent ?? "")} onChangeText={(v) => handleOwePercentChange(f._id, v)} placeholder="Percent" />
                                                        ) : form.splitMode === "value" ? (
                                                            <TextInput keyboardType="decimal-pad" style={styles.smallInput} value={String(f.oweAmount ?? "")} onChangeText={(v) => handleOweChange(f._id, v)} placeholder="Amount" />
                                                        ) : (
                                                            <Text>{Number(f.oweAmount || 0).toFixed(2)}</Text>
                                                        )}
                                                    </View>
                                                ))}
                                                {!canSubmit() ? (
                                                    <View style={styles.centerMono}>
                                                        <Text>{getRemainingTop()}</Text>
                                                        <Text style={styles.mutedText}>{getRemainingBottom()}</Text>
                                                    </View>
                                                ) : null}
                                            </View>
                                        </View>
                                    )}
                                </View>
                            )}
                        </View>
                    )}
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );

    if (loading) {
        return (
            <BottomSheetLayout
                innerRef={innerRef}
                title={`${isEditing ? "Edit" : ""} ${form.typeOf === "expense" ? form.mode : "Settle"} Expense`.trim()}
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

        splitRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
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

        modeBtn: { padding: 8, borderRadius: 6 },
        modeBtnActive: { backgroundColor: c.primary || "#2bbf9a" },
        modeBtnInactive: { backgroundColor: "transparent", borderWidth: 1, borderColor: c.border || "#444" },
    });
