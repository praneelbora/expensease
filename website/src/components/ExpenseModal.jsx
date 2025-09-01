// components/ExpenseModal.jsx
import React, { useMemo, useState, useEffect } from "react";
import { Trash2, Pencil, Save, X, SplitSquareHorizontal, Coins, Loader } from "lucide-react";
import ModalWrapper from "./ModalWrapper";
import { deleteExpense, updateExpense } from "../services/ExpenseService";
import { logEvent } from "../utils/analytics";
import { getGroupDetails } from "../services/GroupService";
import { getAllCurrencyCodes, getSymbol, toCurrencyOptions } from "../utils/currencies";
import { getCategoryOptions, getCategoryLabel } from "../utils/categoryOptions";
import { fetchFriendsPaymentMethods } from "../services/PaymentMethodService";
import CurrencyModal from "./CurrencyModal";
import UnifiedPaymentModal from "./UnifiedPaymentModal";
import CategoryModal from "./CategoryModal"
const TEST_MODE = import.meta.env.VITE_TEST_MODE
const fmtMoney = (n) => `${Number(n || 0).toFixed(2)}`;
const fmtDate = (d) =>
    new Date(d).toLocaleDateString(undefined, {
        day: "2-digit",
        month: "long",
        year: "numeric",
    });
const fmtDateTimeNoSecs = (d) =>
    new Date(d).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });

// For <input type="date">
const toInputDate = (d) => {
    if (!d) return "";
    const dt = new Date(d);
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
};

export default function ExpenseModal({
    showModal,        // either false or the expense object
    setShowModal,
    fetchExpenses,
    userToken,
    userId,
    categories,
    currencyOptions,
    defaultCurrency,
    preferredCurrencies,
    paymentMethods }) {
    if (!showModal) return null;
    const {
        _id,
        mode,                 // 'split' | 'personal'
        typeOf,
        description,
        amount,
        date,
        createdAt,
        currency,
        createdBy,
        category,
        splits = [],
        auditLog
    } = showModal || {};
    useEffect(() => {
        console.log(showModal);
    }, [showModal])

    const [loading, setLoading] = useState(false);
    const [showCategoryModal, setShowCategoryModal] = useState(false);
    const categoryOptions = getCategoryOptions();
    const [confirmDelete, setConfirmDelete] = useState(false);
    const close = () => !loading && setShowModal(false);
    // Split UI state (matches your create flow concepts)
    const [selectedFriends, setSelectedFriends] = useState([]); // [{_id, name, paying, payAmount, owing, oweAmount, owePercent}]
    const [showCurrencyModal, setShowCurrencyModal] = useState(false); // "equal" | "value" | "percent"
    const paymentMethodRedirect = () => {
        setShowPaymentMethodModal(false)
        navigate('/account?section=paymentMethod')
    };
    // 🔧 EDITING: local form state
    const [isEditing, setIsEditing] = useState(false);
    // state
    const [paymentModal, setPaymentModal] = useState({ open: false, context: 'personal', friendId: null });
    const openPaymentModal = ({ context, friendId = null }) => setPaymentModal({ open: true, context, friendId });
    const [paymentMethod, setPaymentMethod] = useState('');

    const closePaymentModal = () => setPaymentModal({ open: false, context: 'personal', friendId: null });

    const unifiedOptions = useMemo(() => {
        if (!paymentModal.open) return [];
        if (paymentModal.context === 'personal') {
            // raw docs from Auth — already rich
            return paymentMethods || [];
        }
        // split: friend methods come as { paymentMethodId, ... }
        const f = selectedFriends.find(x => x._id === paymentModal.friendId);
        return (f?.paymentMethods || []).map(m => ({ _id: m.paymentMethodId, ...m }));
    }, [paymentModal, paymentMethods, selectedFriends]);

    const unifiedValue = useMemo(() => {
        if (paymentModal.context === 'personal') return paymentMethod || null;
        const f = selectedFriends.find(x => x._id === paymentModal.friendId);
        return f?.selectedPaymentMethodId ?? null;
    }, [paymentModal, paymentMethod, selectedFriends]);

    const handleSelectUnified = (id) => {
        if (paymentModal.context === 'personal') {
            setPaymentMethod(id);
        } else {
            setSelectedFriends(prev =>
                prev.map(f => f._id === paymentModal.friendId ? { ...f, selectedPaymentMethodId: id } : f)
            );
        }
    };
    const payersNeedingPM = useMemo(() => {
        return (selectedFriends || [])
            .filter(f => f.paying)
            .filter(f => Array.isArray(f.paymentMethods) && f.paymentMethods.length > 1)
            .filter(f => !f.selectedPaymentMethodId);
    }, [selectedFriends]);
    const payersWithPM = useMemo(() => {
        return (selectedFriends || [])
            .filter(f => f.paying)
            .filter(f => Array.isArray(f.paymentMethods) && f.paymentMethods.length > 1)
    }, [selectedFriends]);

    // inside component, replace your form state init with:
    const [form, setForm] = useState({
        description: description || "",
        category: category || "",
        amount: amount ?? 0,
        date: toInputDate(date) || "",
        typeOf: showModal?.typeOf || "expense",     // 'expense' | 'settle'
        mode: showModal?.mode || "personal",        // 'personal' | 'split'
        splitMode: showModal?.splitMode || "equal", // 'equal' | 'value' | 'percent'
        // keep only ids for friendId (backend expects ids)
        splits: (splits || []).map(s => ({
            ...s,
            friendId: s?.friendId?._id || s?.friendId, // normalize
            payAmount: s?.payAmount ?? 0,
            oweAmount: s?.oweAmount ?? 0,
            paying: !!s?.paying,
            owing: !!s?.owing,
        })),
        currency: showModal?.currency || 'INR'
    });

    // reset/initialize when expense or group changes
    useEffect(() => {
        let alive = true;

        (async () => {
            try {
                // no group? fall back to just the current splits
                if (!showModal?.groupId) {
                    if (alive) {
                        const norm = mergeMembersWithSplits([], splits);
                        setSelectedFriends(norm);
                        setForm((f) => ({ ...f, splitMode: showModal?.splitMode || "equal" }))
                    }
                    return;
                }

                const group = await getGroupDetails(showModal?.groupId?._id?showModal?.groupId?._id:showModal?.groupId, userToken);
                const members = Array.isArray(group?.members) ? group.members : [];

                if (alive) {
                    setGroupMembers(members);
                    setSelectedFriends(mergeMembersWithSplits(members, splits));
                    setForm((f) => ({ ...f, splitMode: showModal?.splitMode || "equal" }))
                }
            } catch (e) {
                if (alive) {
                    setGroupMembers([]);
                    setSelectedFriends(mergeMembersWithSplits([], splits));
                }
                console.error("Failed to load group members", e);
            }
        })();

        return () => { alive = false; };
    }, [_id, showModal?.groupId, userToken]);

    const amountNum = Number(form.amount || 0);
    const pmLabel = (m) => {
        return `${m?.label || m?.type || "Method"}`;
    };
    const isPaidAmountValid = () => {
        const totalPaid = selectedFriends.filter(f => f.paying).reduce((a, b) => a + Number(b.payAmount || 0), 0);
        return Number(totalPaid.toFixed(2)) === Number(amountNum.toFixed(2));
    };
    const getPaymentMethodLabel = (paymentMethod) => {
        if (!id) return null;
        const match = (paymentMethods || []).find(pm => pm._id === id);
        console.log(match);

        if (match) return match.label;

        // If split friend paymentMethods are available
        for (const f of selectedFriends) {
            const m = f.paymentMethods?.find(pm => pm.paymentMethodId === id);
            if (m) return m.label;
        }

        // Fallback: show raw id
        return id;
    };

    const getPaidAmountInfoTop = () => {
        const totalPaid = selectedFriends.filter(f => f.paying).reduce((a, b) => a + Number(b.payAmount || 0), 0);
        return totalPaid.toFixed(2);
    };
    const getPaidAmountInfoBottom = () => {
        const totalPaid = selectedFriends.filter(f => f.paying).reduce((a, b) => a + Number(b.payAmount || 0), 0);
        return (amountNum - totalPaid).toFixed(2);
    };

    // top of component
    const [memberSearch, setMemberSearch] = useState("");
    const addAllAvailable = () => {
        availableMembers.forEach(m => addSplitMember(m._id, m.name));
    };

    const addMeIfPresent = () => {
        const me = groupMembers.find(m => m.isMe || m._id === createdBy?._id);
        if (me) addSplitMember(me._id, me.name);
    };
    const handleOweChange = (id, val) => {
        const v = Number(val);
        setSelectedFriends(arr => arr.map(f => f._id === id ? { ...f, oweAmount: v, owePercent: undefined } : f));
    };

    const handleOwePercentChange = (id, val) => {
        const p = Number(val);
        setSelectedFriends(arr => arr.map(f => f._id === id ? { ...f, owePercent: p, oweAmount: Number(((p / 100) * amountNum).toFixed(2)) } : f));
    };

    const equalizePay = (arr) => {
        const payers = arr.filter(f => f.paying);
        const n = payers.length;
        if (!n) return arr.map(f => ({ ...f, payAmount: 0 }));
        const equal = Math.floor((amountNum / n) * 100) / 100;
        const totalSoFar = equal * n;
        const leftover = Number((amountNum - totalSoFar).toFixed(2));
        let idx = 0;
        return arr.map(f => {
            if (!f.paying) return { ...f, payAmount: 0 };
            idx += 1;
            const pay = idx === n ? Number((equal + leftover).toFixed(2)) : equal;
            return { ...f, payAmount: pay };
        });
    };

    const equalizeOwe = (arr) => {
        const owing = arr.filter(f => f.owing);
        const n = owing.length;
        const equal = n ? Math.floor((amountNum / n) * 100) / 100 : 0;
        const totalSoFar = equal * n;
        const leftover = Number((amountNum - totalSoFar).toFixed(2));
        let idx = 0;
        return arr.map(f => {
            if (!f.owing) return { ...f, oweAmount: 0, owePercent: undefined };
            idx += 1;
            const owe = idx === n ? Number((equal + leftover).toFixed(2)) : equal;
            return { ...f, oweAmount: owe, owePercent: undefined };
        });
    };
    const deleteOwe = (arr) => {
        return arr.map(f => ({
            ...f,
            oweAmount: 0,
            owePercent: undefined,
        }));
    };


    const togglePaying = (friendId) => {
        setSelectedFriends(prev => {
            let next = prev.map(f => f._id === friendId ? { ...f, paying: !f.paying } : f);
            next = equalizePay(next);
            return next;
        });
    };

    const toggleOwing = (friendId) => {
        setSelectedFriends(prev => {
            let next = prev.map(f => f._id === friendId ? { ...f, owing: !f.owing } : f);
            if (form.splitMode === "equal") next = equalizeOwe(next);
            else next = deleteOwe(next)
            return next;
        });
    };
    // helper: merge group members with existing splits
    function mergeMembersWithSplits(members = [], splits = []) {
        const byId = new Map(
            splits.map(s => [
                s?.friendId?._id || s?.friendId,
                {
                    paying: !!s?.paying,
                    owing: !!s?.owing,
                    payAmount: Number(s?.payAmount || 0),
                    oweAmount: Number(s?.oweAmount || 0),
                    owePercent: s?.owePercent != null ? Number(s.owePercent) : undefined,
                    name: s?.friendId?.name || "Member",
                },
            ])
        );

        const merged = members.map(m => {
            const prev = byId.get(m._id);
            return {
                _id: m._id,
                name: m.name || prev?.name || "Member",
                paying: prev?.paying || false,
                owing: prev?.owing || false,
                payAmount: prev?.payAmount || 0,
                oweAmount: prev?.oweAmount || 0,
                owePercent: prev?.owePercent,
            };
        });

        // include split users who aren't in the group list (fallback)
        splits.forEach(s => {
            const id = s?.friendId?._id || s?.friendId;
            if (!merged.some(x => x._id === id)) {
                merged.push({
                    _id: id,
                    name: s?.friendId?.name || "Member",
                    paying: !!s?.paying,
                    owing: !!s?.owing,
                    payAmount: Number(s?.payAmount || 0),
                    oweAmount: Number(s?.oweAmount || 0),
                    owePercent: s?.owePercent != null ? Number(s.owePercent) : undefined,
                });
            }
        });

        return merged;
    }

    const addSplitMember = (friendId, name) => {
        if (!friendId) return;
        setSelectedFriends(prev => prev.some(f => f._id === friendId)
            ? prev
            : [...prev, { _id: friendId, name: name || "Member", paying: false, payAmount: 0, owing: false, oweAmount: 0 }]);
    };
    const shouldShowSubmitButton = () => {
        if (form.mode == 'personal' && form.typeOf == 'expense') {
            if (form.description.length > 0 && form.amount > 0 && form.category.length > 0)
                return true
            else return false
        }
        const hasOwing = selectedFriends.some(friend => friend.owing);
        const hasPaying = selectedFriends.some(friend => friend.paying);

        if (!hasOwing || !hasPaying) return false;
        if (form.splitMode === "equal") {
            return hasOwing && isPaidAmountValid();
        }

        if (form.splitMode === "percent") {
            const totalPercent = selectedFriends
                .filter(friend => friend.owing)
                .reduce((sum, f) => sum + (parseFloat(f.owePercent) || 0), 0);

            return totalPercent === 100 && isPaidAmountValid();
        }

        if (form.splitMode === "value") {
            const totalValue = selectedFriends
                .filter(friend => friend.owing)
                .reduce((sum, f) => sum + (f.oweAmount || 0), 0);
            return totalValue === form.amount && isPaidAmountValid();
        }

        return false;
    };
    const getRemainingTop = () => {
        const owingFriends = selectedFriends.filter(f => f.owing);
        if (form.splitMode === 'percent') {
            const totalPercent = owingFriends.reduce((sum, f) => parseFloat(sum) + parseFloat(f.owePercent || 0), 0);
            return `${totalPercent.toFixed(2)} / 100%`;
        }

        if (form.splitMode === 'value') {
            const totalValue = owingFriends.reduce((sum, f) => sum + parseFloat(f.oweAmount || 0), 0);
            return `${getSymbol(currency)} ${totalValue.toFixed(2)} / ${getSymbol(currency)} ${form?.amount?.toFixed(2)}`;
        }

        return '';
    };

    const getRemainingBottom = () => {
        const owingFriends = selectedFriends.filter(f => f.owing);
        if (form.splitMode === 'percent') {
            const totalPercent = owingFriends.reduce((sum, f) => sum + (parseFloat(f.owePercent) || 0), 0);
            const remaining = 100 - totalPercent;
            return `${remaining.toFixed(2)}% left`;
        }

        if (form.splitMode === 'value') {
            const totalValue = owingFriends.reduce((sum, f) => sum + (f.oweAmount || 0), 0);
            const remaining = form.amount - totalValue;
            return `${getSymbol(currency)} ${remaining.toFixed(2)} left`;
        }

        return '';
    };
    useEffect(() => {
        if (form.mode !== 'personal') return;
        if (paymentMethod) return; // don't override user's choice

        const list = Array.isArray(paymentMethods) ? paymentMethods : [];
        if (!list.length) return;
        if (showModal?.paidFromPaymentMethodId) setPaymentMethod(showModal?.paidFromPaymentMethodId);
        // priority: default send -> default receive -> single item
        const preferred =
            list.find(pm => pm.isDefaultSend) ||
            list.find(pm => pm.isDefaultReceive) ||
            (list.length === 1 ? list[0] : null);

        if (preferred?._id) setPaymentMethod(preferred._id);
    }, [form.mode, paymentMethods, paymentMethod]);

    useEffect(() => {
        setForm({
            description: description || "",
            amount: amount ?? 0,
            date: toInputDate(date) || "",
            category: showModal?.category || "",
            typeOf: showModal?.typeOf || "expense",
            mode: showModal?.mode || "personal",
            splitMode: showModal?.splitMode || "equal",
            splits: (splits || []).map(s => ({
                ...s,
                friendId: s?.friendId?._id || s?.friendId,
                payAmount: s?.payAmount ?? 0,
                oweAmount: s?.oweAmount ?? 0,
                paying: !!s?.paying,
                owing: !!s?.owing,
            })),
            currency: showModal?.currency || 'INR'
        });
        setReSplit(false);
        setIsEditing(false);
        setConfirmDelete(false);
    }, [_id]);

    const [reSplit, setReSplit] = useState(false); // only used for 'split'
    useEffect(() => {
        if (form.mode !== "split") return;
        setSelectedFriends(prev => {
            let next = prev;

            // keep pay equalized if multiple payers
            if (prev.some(p => p.paying)) next = equalizePay(next);

            if (form.splitMode === "equal") {
                // recalc equal owes
                next = equalizeOwe(next);
            } else if (form.splitMode === "percent") {
                // keep existing percents; recompute amounts when total changes
                next = next.map(f =>
                    f.owing && f.owePercent != null
                        ? { ...f, oweAmount: Number(((Number(f.owePercent) / 100) * amountNum).toFixed(2)) }
                        : f
                );
            } // 'value' => leave as-is (user-entered amounts)

            return next;
        });
        // keep selectedFriends.length so equalizePay runs when members change
    }, [selectedFriends.length, form.splitMode, form.mode, amountNum]);


    const payerInfo = useMemo(() => {
        if (mode === "personal") return "You paid";
        const payers = splits.filter((s) => s.paying && (s.payAmount || 0) > 0);
        if (payers.length === 1) return `${payers[0]?.friendId?.name || "Someone"} paid`;
        if (payers.length > 1) return `${payers.length} people paid`;
        return "No one paid";
    }, [mode, splits]);

    const handleDelete = async () => {
        if (!_id) return;
        try {
            setLoading(true);
            await deleteExpense(_id, userToken);
            await fetchExpenses?.();
            setShowModal(false);
        } catch (err) {
            console.log(err?.message || "Something went wrong while deleting.");
        } finally {
            setLoading(false);
        }
    };
    const updateSplit = (idx, patch) =>
        setForm(f => ({
            ...f,
            splits: f.splits.map((s, i) => i === idx ? { ...s, ...patch } : s)
        }));

    const removeSplit = (idx) =>
        setForm(f => ({ ...f, splits: f.splits.filter((_, i) => i !== idx) }));

    // For groups only — provide a way to add members.
    // You can populate this from your Group endpoint.
    const [groupMembers, setGroupMembers] = useState([]);
    useEffect(() => {
        let alive = true; // <--- flag

        (async () => {
            if (isEditing && showModal?.groupId) {
                const group = await getGroupDetails(showModal.groupId, userToken);
                if (alive) { // <--- only set state if still mounted
                    setGroupMembers(Array.isArray(group?.members) ? group.members : []);
                }
            }
        })();

        return () => { alive = false }; // <--- cleanup: mark as not alive
    }, [isEditing, showModal?.groupId, userToken]);


    // find a display name for a user id or populated user
    const getUserNameById = (idOrObj) => {
        if (!idOrObj) return '';
        if (typeof idOrObj === 'object') {
            if (idOrObj._id === userId) return 'You';
            return idOrObj.name || '';
        }
        const id = idOrObj;
        if (id === userId) return 'You';
        if (createdBy?._id === id) return createdBy.name;
        const gm = groupMembers.find(m => m._id === id);
        if (gm) return gm.name;
        // try from existing splits (populated or raw id)
        const splitUser = (splits || [])
            .map(s => s.friendId)
            .find(u => (typeof u === 'object' ? u._id : u) === id);
        if (splitUser && typeof splitUser === 'object') return splitUser.name || '';
        return ''; // fallback: empty (or return id.slice(0,6)+'…')
    };

    // helper near top of component
    const displayUser = (u) => {
        // u can be an id string or a populated user object
        if (!u) return '';
        if (typeof u === 'string') return u === userId ? 'You' : u; // fallback to id if not populated
        if (u._id === userId) return 'You';
        return u.name || u.email || '';
    };

    // compute last audit entry
    const lastAudit = Array.isArray(auditLog) && auditLog.length
        ? auditLog[auditLog.length - 1]  // latest is last because we push
        : null;

    // in your Meta section

    // convenience: set of selected ids
    const selectedIds = new Set(selectedFriends.map(m => m._id));
    // member list you can add
    const availableMembers = groupMembers
        .filter(m => !selectedIds.has(m._id))
        .filter(m => m.name?.toLowerCase().includes(memberSearch.toLowerCase()));

    // 🔧 EDITING: equal re-split helper (simple + explicit)
    const buildEqualResplit = (totalAmount, currentSplits) => {
        const members = currentSplits?.length || 0;
        if (!members || !Number(totalAmount)) return currentSplits;

        const perHead = Number(totalAmount) / members;
        // We only reset owes; payers can be recalculated by your server if needed.
        return currentSplits.map((s) => ({
            ...s,
            paying: false,
            payAmount: 0,
            oweAmount: perHead,
        }));
    };

    // 🔧 EDITING: save
    const handleSave = async () => {
        if (!_id) return;
        const payload = {
            description: form.description.trim(),
            amount: amountNum,
            date: form.date ? new Date(form.date).toISOString() : null,
            category: form.category,
            typeOf: form.typeOf,
            mode: form.mode,
            splitMode: form.mode === 'split' ? form.splitMode : undefined,
            groupId: showModal?.groupId || undefined,
            currency: form.currency,
            splits:
                form.mode === 'split'
                    ? selectedFriends.map(f => ({
                        friendId: f._id || f.friendId || 'me',
                        paying: !!f.paying,
                        owing: !!f.owing,
                        payAmount: Number(f.payAmount || 0),
                        oweAmount: Number(f.oweAmount || 0),
                        ...(form.splitMode === 'percent' ? { owePercent: Number(f.owePercent || 0) } : {}),
                        paymentMethodId: f.selectedPaymentMethodId
                    }))
                    : [],
        };

        if (!payload.description) return alert("Description is required.");
        if (isNaN(payload.amount) || payload.amount <= 0) return alert("Enter a valid amount.");
        if (!payload.date) return alert("Date is required.");
        if (form.mode === 'personal' && paymentMethod) {
            form.paymentMethodId = paymentMethod;
        }
        // Optional equal re-split if enabled
        if (mode === "split" && reSplit) {
            payload.splits = buildEqualResplit(payload.amount, splits);
        }

        try {
            setLoading(true);
            await updateExpense(_id, payload, userToken);
            logEvent("expense_updated", {
                mode,
                reSplitApplied: mode === "split" && reSplit ? true : false,
                surface: "modal",
            });
            await fetchExpenses?.();
            setIsEditing(false);
            setShowModal(false)
        } catch (err) {
            console.log(err?.message || "Something went wrong while updating.");
            alert("Failed to update expense. Please try again.");
        } finally {
            setLoading(false);
        }
    };
    const updateFriendsPaymentMethods = async (list) => {
        const map = await fetchFriendsPaymentMethods(list, userToken); // { [friendId]: PaymentMethod[] }
        // Build a lookup of { [friendId]: oldPaymentMethodId }
        const oldSelections = {};
        if (showModal.splits) {
            showModal.splits.forEach((s) => {
                // Use either .friendId._id or .friendId if it's an ID, depending on how your data is structured
                const fid = s.friendId._id || s.friendId;
                if (s?.paidFromPaymentMethodId) { // adjust name if needed
                    oldSelections[fid] = s?.paidFromPaymentMethodId;
                }
            });
        }

        setSelectedFriends((prev) =>
            prev.map((f) => {
                const raw = map[f._id === 'me' ? user._id : f._id] || [];
                let selectedPaymentMethodId = f.selectedPaymentMethodId;

                // If editing (showModal), set from old if present & valid
                const oldSelected = oldSelections[f._id];
                if (oldSelected && raw.some(m => m.paymentMethodId === oldSelected)) {
                    selectedPaymentMethodId = oldSelected;
                } else {
                    // keep any previous, otherwise pick if only one method, else null
                    const stillValid = raw.some(m => m.paymentMethodId === selectedPaymentMethodId);
                    if (!stillValid) {
                        selectedPaymentMethodId =
                            raw.length === 1 ? raw[0].paymentMethodId : null;
                    }
                }

                return { ...f, paymentMethods: raw, selectedPaymentMethodId };
            })
        );
    };

    useEffect(() => {
        if (isEditing) updateFriendsPaymentMethods(selectedFriends.map((f) => f._id))
    }, [isEditing])
    // Build footer
    const footer = (
        <>
            {!confirmDelete ? (
                <>
                    {!isEditing ? (
                        <>
                            <div className="flex flex-1 gap-3">
                                <button
                                    onClick={() => setConfirmDelete(true)}
                                    disabled={loading}
                                    className="text-red-400 border border-red-500 px-4 py-2 rounded-md hover:bg-red-500/10 transition text-sm inline-flex items-center gap-1"
                                >
                                    <Trash2 size={16} /> Delete
                                </button>
                                <button
                                    onClick={() => setIsEditing(true)}
                                    disabled={loading}
                                    className="text-[#EBF1D5] border border-[#EBF1D5] px-4 py-2 rounded-md hover:bg-[#3a3a3a] transition text-sm inline-flex items-center gap-1"
                                >
                                    <Pencil size={16} /> Edit
                                </button>

                            </div>
                            <button
                                onClick={close}
                                disabled={loading}
                                className="text-[#EBF1D5] border border-[#EBF1D5] px-4 py-2 rounded-md hover:bg-[#3a3a3a] transition text-sm"
                            >
                                Close
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                onClick={handleSave}
                                disabled={loading || !shouldShowSubmitButton()}
                                className={`px-4 py-2 rounded-md ${shouldShowSubmitButton() ? 'bg-teal-500' : 'bg-gray-500'} text-white text-sm inline-flex items-center gap-1`}
                            >
                                <Save size={16} /> Save
                            </button>
                            <button
                                onClick={() => {
                                    setIsEditing(false);
                                    setForm({
                                        description: description || "",
                                        amount: amount ?? 0,
                                        date: toInputDate(date) || "",
                                    });
                                    setReSplit(false);
                                }}
                                disabled={loading}
                                className="px-4 py-2 rounded-md border border-[#55554f] hover:bg-[#2a2a2a] text-sm inline-flex items-center gap-1"
                            >
                                <X size={16} /> Cancel
                            </button>
                        </>
                    )}
                </>
            ) : (
                <div className="flex items-center gap-2">
                    <span className="text-sm text-[#c9c9c9]">Delete permanently?</span>
                    <button
                        onClick={() => setConfirmDelete(false)}
                        disabled={loading}
                        className="px-4 py-2 rounded-md border border-[#55554f] hover:bg-[#2a2a2a] text-sm"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => {
                            logEvent("expense_deleted", { surface: "modal" });
                            handleDelete();
                        }}
                        disabled={loading}
                        className="px-4 py-2 rounded-md bg-red-600 hover:bg-red-700 text-white text-sm inline-flex items-center gap-1"
                    >
                        <Trash2 size={16} /> Confirm
                    </button>
                </div>
            )}
        </>
    );
    if (loading)
        return (
            <ModalWrapper
                show={!!showModal}
                onClose={close}
                title={`${isEditing ? "Edit" : ""} ${typeOf == 'expense' ? mode : 'Settle'} Expense`.trim()}
                size="lg"
            >
                <div className="w-full flex flex-col justify-center items-center">
                    <Loader />
                </div>
            </ModalWrapper>
        )
    return (
        <ModalWrapper
            show={!!showModal}
            onClose={close}
            title={`${isEditing ? "Edit" : ""} ${typeOf == 'expense' ? mode : 'Settle'} Expense`.trim()}
            size="lg"
            footer={footer}
        >
            {/* Body */}
            <div className="w-full flex flex-col gap-3">
                {/* Top row */}
                {!isEditing ? (
                    <div className="flex items-start justify-between gap-3">
                        <p className="text-2xl font-semibold text-teal-500">{getSymbol(currency)} {fmtMoney(amount)}</p>
                        {date && <p className="text-sm text-[#c9c9c9]">{fmtDate(date)}</p>}
                    </div>
                ) : (
                    <div className="flex flex-col overflow-scroll">{/* Basic fields: Description, Amount, Date */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {/* Description */}
                            <div className="sm:col-span-2">
                                <label className="block text-sm text-[#9aa08e] mb-1">Description</label>
                                <input
                                    className="w-full text-[#EBF1D5] text-[18px] border-b-2 border-[#55554f] p-2 text-base h-[45px] pl-3 flex-1 text-left"
                                    value={form.description}
                                    onChange={(e) =>
                                        setForm((f) => ({ ...f, description: e.target.value }))
                                    }
                                    placeholder="What was this for?"
                                    maxLength={140}
                                />
                            </div>

                            {/* Amount */}
                            <div className="flex flex-row gap-2">
                                <div className="flex-1">
                                    <label className="block text-sm text-[#9aa08e] mb-1">Currency</label>
                                    <button
                                        onClick={() => setShowCurrencyModal(true)}
                                        className={`w-full text-[#EBF1D5] text-[18px] border-b-2 border-[#55554f] p-2 text-base h-[45px] pl-3 flex-1 text-left`}
                                    >
                                        {form.currency || "Currency"}
                                    </button>
                                    <CurrencyModal
                                        show={showCurrencyModal}
                                        onClose={() => setShowCurrencyModal(false)}
                                        value={form.currency}
                                        options={currencyOptions}
                                        onSelect={(val) => {
                                            setForm((f) => ({ ...f, currency: val }))
                                        }}
                                        defaultCurrency={defaultCurrency}
                                        preferredCurrencies={preferredCurrencies}
                                    />
                                </div>

                                <div className="flex-1 flex flex-col gap-1">
                                    <label className="block text-sm text-[#9aa08e] mb-1">Amount</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        className="w-full text-[#EBF1D5] text-[18px] border-b-2 border-[#55554f] p-2 text-base h-[45px] pl-3 flex-1 text-left"
                                        value={form.amount}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            const n = Number(v || 0);
                                            setForm((f) => ({ ...f, amount: n }));

                                            // If editing splits and using equal mode, keep them in sync with amount
                                            if (form.mode === "split") {
                                                setSelectedFriends((prev) => {
                                                    let next = prev;
                                                    if (prev.some((p) => p.paying)) next = equalizePay(next);
                                                    if (form.splitMode === "equal") next = equalizeOwe(next);
                                                    return next;
                                                });
                                            }
                                        }}
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>

                            {/* Date */}
                            {form.typeOf == 'expense' && <div className="flex flex-row w-full gap-2">
                                <div className="flex-1">
                                    <label className="block text-sm text-[#9aa08e] mb-1">Category</label>
                                    <button
                                        onClick={() => setShowCategoryModal(true)}
                                        className={`w-full ${category ? 'text-[#EBF1D5]' : 'text-[rgba(130,130,130,1)]'} text-[18px] border-b-2 border-[#55554f]  p-2 text-base h-[45px] pl-3 flex-1 text-left`}
                                    >
                                        {category ? getCategoryLabel(category) : "Category"}
                                    </button>
                                    <CategoryModal
                                        show={showCategoryModal}
                                        onClose={() => setShowCategoryModal(false)}
                                        value={category}
                                        options={categoryOptions}
                                        onSelect={(n) => setForm((f) => ({ ...f, category: n }))}
                                    />
                                </div><div className="flex-1">
                                    <label className="block text-sm text-[#9aa08e] mb-1">Date</label>
                                    <input
                                        type="date"
                                        className="w-full text-[#EBF1D5] text-[18px] border-b-2 border-[#55554f] p-2 text-base h-[45px] pl-3 flex-1 text-left"
                                        value={form.date}
                                        max={new Date().toISOString().split("T")[0]}
                                        onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                                    />
                                </div>
                            </div>}
                            {form.mode == "personal" && <div className="w-full flex flex-col">
                                <label className="block text-sm text-[#9aa08e] mb-1">Payment Account</label>

                                <button
                                    onClick={() => openPaymentModal({ context: 'personal' })}
                                    className={`w-full ${paymentMethod ? 'text-[#EBF1D5]' : 'text-[rgba(130,130,130,1)]'} text-[18px] border-b-2 border-[#55554f]  p-2 text-base h-[45px] pl-3 flex-1 text-left`}
                                >
                                    {paymentMethod ? paymentMethods?.find(acc => acc._id === paymentMethod)?.label : "Payment Account"}
                                    {/* Split (inside payer rows) */}
                                </button>
                            </div>}
                        </div>


                        {form.mode === 'split' && (
                            <div className="sm:col-span-3 mt-2 flex flex-col gap-4">
                                {/* Paid by */}
                                <div className="flex flex-col gap-2">
                                    <p className="text-lg font-medium">
                                        Paid by <span className="text-[13px] text-[#81827C]">(Select who paid)</span>
                                    </p>
                                    <div className="w-full flex flex-wrap gap-2">
                                        {selectedFriends.map(f => (
                                            <div
                                                key={`pay-${f._id}`}
                                                onClick={() => togglePaying(f._id)}
                                                className={`px-3 py-1 rounded-xl border-2 cursor-pointer transition-all text-sm ${f.paying ? 'bg-teal-300 text-black border-teal-300' : 'bg-transparent text-[#EBF1D5] border-[#81827C]'}`}
                                            >
                                                <p className="capitalize">{f.name} {f._id == userId ? '(You)' : ''}</p>
                                            </div>
                                        ))}
                                    </div>

                                    {(selectedFriends.filter(f => f.paying).length > 1 || payersWithPM.length > 0) && (
                                        <div className="w-full flex flex-col gap-2">
                                            {selectedFriends.filter(f => f.paying).map(f => (
                                                <div key={`payAmount-${f._id}`} className="flex justify-between items-center w-full">
                                                    <p className="capitalize">{f.name} {f._id == userId ? '(You)' : ''}</p>
                                                    <div className="flex flex-row gap-2 items-end">
                                                        {/* Only show button when >1 methods; auto-select kept for single method */}
                                                        {Array.isArray(f.paymentMethods) && f.paymentMethods.length > 1 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => openPaymentModal({ context: 'split', friendId: f._id })}
                                                                className="bg-transparent border-2 border-[#55554f] text-[#EBF1D5] px-2 py-1 rounded-md hover:border-teal-600 transition"
                                                            >
                                                                {(() => {
                                                                    const sel = f.paymentMethods?.find(
                                                                        m => m.paymentMethodId === f.selectedPaymentMethodId
                                                                    );
                                                                    return sel ? pmLabel(sel) : <Coins />;
                                                                })()}
                                                            </button>
                                                        )}
                                                        {selectedFriends.filter(f => f.paying).length > 1 && <input
                                                            className="max-w-[100px] text-[#EBF1D5] border-b-2 border-b-[#55554f] p-2 text-base min-h-[40px] pl-3 cursor-pointer text-right"
                                                            type="number"
                                                            value={f.payAmount}
                                                            onChange={(e) => {
                                                                const val = parseFloat(e.target.value || 0);
                                                                setSelectedFriends((prev) =>
                                                                    prev.map((f) => (f._id === friend._id ? { ...f, payAmount: val } : f))
                                                                );
                                                            }}
                                                            placeholder="Amount"
                                                        />}
                                                    </div>
                                                    {/* <input
                                                        className="max-w-[110px] text-[#EBF1D5] border-b-2 border-b-[#55554f] p-2 text-base min-h-[40px] pl-3 text-right"
                                                        type="number"
                                                        value={f.payAmount}
                                                        onChange={(e) => {
                                                            const v = Number(e.target.value || 0);
                                                            setSelectedFriends(prev => prev.map(x => x._id === f._id ? { ...x, payAmount: v } : x));
                                                        }}
                                                        placeholder="Amount"
                                                    /> */}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {selectedFriends.filter(f => f.paying).length > 1 && !isPaidAmountValid() && (
                                        <div className="text-[#EBF1D5] text-sm gap-[2px] text-center font-mono w-full flex flex-col">
                                            <p>{getSymbol(currency)} {getPaidAmountInfoTop()} / {getSymbol(currency)} {amountNum.toFixed(2)}</p>
                                            <p className="text-[#a0a0a0]">{getSymbol(currency)} {getPaidAmountInfoBottom()} left</p>
                                        </div>
                                    )}
                                </div>

                                {/* Owed by */}
                                {isPaidAmountValid() && (
                                    <div className="flex flex-col gap-3">
                                        <p className="text-lg font-medium">
                                            Owed by <span className="text-[13px] text-[#81827C]">(Select who owes)</span>
                                        </p>

                                        {/* Selection */}
                                        <div className="w-full flex flex-wrap gap-2">
                                            {selectedFriends.map(f => (
                                                <div
                                                    key={`owe-${f._id}`}
                                                    onClick={() => toggleOwing(f._id)}
                                                    className={`px-3 py-1 rounded-xl border-2 cursor-pointer transition-all text-sm ${f.owing ? 'bg-teal-300 text-black border-teal-300' : 'bg-transparent text-[#EBF1D5] border-[#81827C]'}`}
                                                >
                                                    <p className="capitalize">{f.name} {f._id == userId ? '(You)' : ''}</p>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Mode selection */}
                                        {selectedFriends.filter(f => f.owing).length > 1 && (
                                            <div className="flex flex-col gap-2">
                                                <p>
                                                    Split {form.splitMode === "equal" ? "Equally" : form.splitMode === "value" ? "By Amounts" : "By Percentages"}
                                                </p>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => { setForm((f) => ({ ...f, splitMode: 'equal' })); setSelectedFriends(equalizeOwe); }}
                                                        className={`px-4 py-1 text-[11px] rounded-md border ${form.splitMode === "equal" ? "bg-teal-300 text-[#000] border-teal-300 font-bold" : "bg-transparent text-[#EBF1D5] border-[#81827C]"}`}
                                                    >
                                                        =
                                                    </button>
                                                    <button
                                                        onClick={() => setForm((f) => ({ ...f, splitMode: 'value' }))}
                                                        className={`px-4 py-1 text-[11px] rounded-md border ${form.splitMode === "value" ? "bg-teal-300 text-[#000] border-teal-300 font-bold" : "bg-transparent text-[#EBF1D5] border-[#81827C]"}`}
                                                    >
                                                        1.23
                                                    </button>
                                                    <button
                                                        onClick={() => setForm((f) => ({ ...f, splitMode: 'percent' }))}
                                                        className={`px-4 py-1 text-[11px] rounded-md border ${form.splitMode === "percent" ? "bg-teal-300 text-[#000] border-teal-300 font-bold" : "bg-transparent text-[#EBF1D5] border-[#81827C]"}`}
                                                    >
                                                        %
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Inputs per mode */}
                                        {selectedFriends.filter(f => f.owing).length > 1 && (
                                            <div className="w-full flex flex-col gap-2">
                                                {selectedFriends.filter(f => f.owing).map(f => (
                                                    <div key={`oweAmount-${f._id}`} className="flex justify-between items-center w-full">
                                                        <p className="capitalize">{f.name} {f._id == userId ? '(You)' : ''}</p>
                                                        {form.splitMode === "percent" ? (
                                                            <input
                                                                className="max-w-[100px] text-[#EBF1D5] border-b-2 border-b-[#55554f] p-2 text-base min-h-[40px] pl-3 text-right"
                                                                type="number"
                                                                value={f.owePercent ?? ""}
                                                                onChange={(e) => handleOwePercentChange(f._id, e.target.value)}
                                                                placeholder="Percent"
                                                            />
                                                        ) : form.splitMode === "value" ? (
                                                            <input
                                                                className="max-w-[100px] text-[#EBF1D5] border-b-2 border-b-[#55554f] p-2 text-base min-h-[40px] pl-3 text-right"
                                                                type="number"
                                                                value={f.oweAmount ?? ""}
                                                                onChange={(e) => handleOweChange(f._id, e.target.value)}
                                                                placeholder="Amount"
                                                            />
                                                        ) : (
                                                            <p className="text-[#EBF1D5]">{Number(f.oweAmount || 0).toFixed(2)}</p>
                                                        )}
                                                    </div>

                                                ))}
                                                {!shouldShowSubmitButton() ? (
                                                    <div className="text-[#EBF1D5] text-sm gap-[2px] text-center font-mono w-full flex flex-col justify-center">
                                                        <p>{getRemainingTop()}</p>
                                                        <p className="text-[#a0a0a0]">{getRemainingBottom()}</p>
                                                    </div>) : <></>}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {!isEditing && description && <p className="text-base capitalize">{description}</p>}
                {!isEditing && (
                    <p className="text-sm text-[#9aa08e]">
                        {showModal?.typeOf == 'expense' &&
                        <>
                        {category? getCategoryLabel(category) : "Uncategorized"}
                        </>
                        }
                        {form.mode === "personal" && showModal?.paidFromPaymentMethodId && (
                            <> · {showModal?.paidFromPaymentMethodId?.label}</>
                        )}
                        {form.mode === "split" && (() => {
                            const mySplit = splits.find(
                                s => (s?.friendId?._id || s?.friendId) === userId && s?.paidFromPaymentMethodId
                            );
                            return mySplit ? <> · {mySplit.paidFromPaymentMethodId?.label}</> : null;
                        })()}
                    </p>
                )}


                {!isEditing && mode === "split" && (
                    <>
                        <hr className="border-[#2a2a2a]" />
                        <p className="text-base text-teal-500">
                            {payerInfo} {amount ? ` ${getSymbol(currency)} ${fmtMoney(amount)}` : ""}
                        </p>
                        <div className="ms-1">
                            <div className="flex flex-col gap-1 text-sm">
                                {splits
                                    .filter((s) => (s.payAmount || 0) > 0 || (s.oweAmount || 0) > 0)
                                    .map((s, idx) => {

                                        const name = s?.friendId?.name || "Member";
                                        const payTxt =
                                            (s.payAmount || 0) > 0 ? `paid ${getSymbol(currency)} ${fmtMoney(s.payAmount)}` : "";
                                        const andTxt =
                                            ((s.payAmount || 0) > 0 && (parseFloat(s.oweAmount) || 0) > 0) ? " and " : "";
                                        const oweTxt = parseFloat(s.oweAmount) > 0 ? `owes ${getSymbol(currency)} ${fmtMoney(parseFloat(s.oweAmount) || 0)}` : '';
                                        return (
                                            <div key={idx} className="flex">
                                                <p>
                                                    {name} {payTxt}
                                                    {andTxt}
                                                    {oweTxt}
                                                </p>
                                            </div>
                                        );
                                    })
                                }


                            </div>
                        </div>
                    </>
                )}

                <hr className="border-[#2a2a2a]" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    {/* Created */}
                    {(createdBy?.name || createdAt) && (
                        <p className="capitalize">
                            <span className="text-[#9aa08e]">Created:</span>{" "}
                            {createdBy?.name ? `${createdBy.name} ` : ""}
                            {createdAt ? `on ${fmtDateTimeNoSecs(createdAt)}` : ""}
                        </p>
                    )}

                    {/* Updated */}
                    {lastAudit && (
                        <p className="capitalize">
                            <span className="text-[#9aa08e]">Last Updated:</span>{' '}
                            {displayUser(lastAudit.updatedBy)}{' '}
                            {lastAudit.at ? `on ${fmtDateTimeNoSecs(lastAudit.at)}` : ''}
                        </p>
                    )}

                </div>
                <UnifiedPaymentModal
                    show={paymentModal.open}
                    onClose={closePaymentModal}
                    context={paymentModal.context}                       // 'personal' | 'split'
                    privacy={paymentModal.context === 'split' ? 'shared' : 'private'}
                    options={unifiedOptions}
                    value={unifiedValue}
                    onSelect={(id, close) => { handleSelectUnified(id); if (close) closePaymentModal(); }}
                    defaultSendId={paymentMethods?.find(a => a.isDefaultSend)?._id}
                    defaultReceiveId={paymentMethods?.find(a => a.isDefaultReceive)?._id}
                    paymentMethodRedirect={paymentMethodRedirect}
                />

            </div>
        </ModalWrapper>
    );
}
