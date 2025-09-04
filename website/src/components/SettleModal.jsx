// components/SettleModal.jsx
import React, { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import ModalWrapper from "./ModalWrapper";
import CustomSelect from "./CustomSelect"; // ⬅️ import
import { getSymbol } from "../utils/currencies";
import CurrencyModal from "./CurrencyModal";
import { ArrowRightLeft, User as UserIcon, Layers, Users2 } from "lucide-react";


export default function SettleModal({
    setShowModal,
    showModal,
    group,
    simplifiedTransactions = [], // [{from, to, amount}]
    onSubmit,                     // ({ payerId, receiverId, amount, description })
    userId,
    friends = [],                  // [{id, name}]
    prefill,
    currencyOptions,
    defaultCurrency,
    preferredCurrencies
}) {
    console.log(simplifiedTransactions);

    const [payerId, setPayerId] = useState("");
    const [receiverId, setReceiverId] = useState("");
    const [amount, setAmount] = useState("");
    const [description, setDescription] = useState("");
    const [currency, setCurrency] = useState("");
    const [settleMode, setSettleMode] = useState("suggested");
    const [selectedTxnIndex, setSelectedTxnIndex] = useState(null);
    const [confirmationVisible, setConfirmationVisible] = useState(false);
    const [showCurrencyModal, setShowCurrencyModal] = useState(false);
    // NEW: stable selection + meta
    const [selectedKey, setSelectedKey] = useState(null);
    const [selectedMeta, setSelectedMeta] = useState(null);

    // Keep a consistent "You"
    const getMemberName = (id) => {
        if (!id) return "Unknown";
        const m = members.find(x => x.id === id);
        if (!m) return "Unknown";
        return m.id === userId ? "You" : (m.name || "Unknown");
    };

    // Unique key per txn (works across sections)
    const keyOf = (tx) => {
        // include groupId/name when present so per-group rows are unique
        const gid = tx.groupId || tx?.group?._id || "";
        const gname = tx.name || "";
        return `${tx.type}|${tx.currency}|${tx.from}|${tx.to}|${tx.amount}|${gid}|${gname}`;
    };

    const members = useMemo(() => {
        if (group?.members?.length) {
            return group.members.map((m) => ({ id: m._id, name: m.name }));
        }
        return friends;
    }, [group, friends]);


    const resetForm = () => {
        setPayerId("");
        setReceiverId("");
        setAmount("");
        setDescription("");
        setSelectedKey(null);        // <-- new
        setSelectedMeta(null);       // <-- new
        setConfirmationVisible(false);
    };


    const handleToggle = (mode) => {
        setSettleMode(mode);
        resetForm();
    };

    const handlePrefill = (txn) => {
        setPayerId(txn.from);
        setReceiverId(txn.to);
        setAmount(Number(txn.amount || 0).toFixed(2));
        setCurrency(txn.currency);
        setDescription(`Settling between ${getMemberName(txn.from)} and ${getMemberName(txn.to)}`);

        // NEW: save a stable key + meta (type, idsByCurrency or groupId)
        const key = keyOf(txn);
        console.log(txn);

        setSelectedKey(key);
        // normalize meta so caller gets predictable shape
        setSelectedMeta(txn);
    };

    useEffect(() => {
        if (showModal && prefill) {
            setPayerId(prefill.payerId || "");
            setReceiverId(prefill.receiverId || "");
            setAmount(Number(prefill.amount || 0) > 0 ? Number(prefill.amount).toFixed(2) : "");
            setCurrency(prefill.currency || "");
            setDescription(prefill.description || "");
            setSettleMode("custom");
            if (prefill.meta) setSelectedMeta(prefill.meta);
        }
    }, [showModal, prefill]);

    const isValid =
        payerId &&
        receiverId &&
        payerId !== receiverId &&
        Number(amount) > 0 &&
        !Number.isNaN(Number(amount));

    const getConfirmationText = () => {
        const payerName = getMemberName(payerId);
        const receiverName = getMemberName(receiverId);
        if (!isValid) return "";
        if (payerName === "You") return `You paid ${receiverName}`;
        if (receiverName === "You") return `${payerName} paid You`;
        return `${payerName} paid ${receiverName}`;
    };

    // 1) keep your helper (you already have this)
    const keyTuple = (t) => `${t.currency}|${t.from}|${t.to}|${Number(t.amount || 0)}`;

    const pruneSettlementLists = (list = []) => {
        const byType = { net: [], all_personal: [], all_groups: [], group: [] };
        for (const x of list) (byType[x.type] ||= []).push(x);

        const hasGroups = byType.group.length > 0;
        const hasPersonal = byType.all_personal.length > 0;

        // Only one group, no personal: drop all_groups/net identical to that single group
        if (hasGroups && byType.group.length === 1 && !hasPersonal) {
            const g = byType.group[0];
            const gKey = keyTuple(g);
            byType.all_groups = byType.all_groups.filter(a => keyTuple(a) !== gKey);
            byType.net = byType.net.filter(n => keyTuple(n) !== gKey);
        }

        // Only personal, no groups: drop net rows identical to personal rows
        if (hasPersonal && !hasGroups) {
            const pKeys = new Set(byType.all_personal.map(keyTuple));
            byType.net = byType.net.filter(n => !pKeys.has(keyTuple(n)));
        }

        // One all_groups and one group identical → keep group, drop all_groups
        if (byType.all_groups.length === 1 && byType.group.length === 1) {
            if (keyTuple(byType.all_groups[0]) === keyTuple(byType.group[0])) {
                byType.all_groups = [];
            }
        }

        return [
            ...byType.net,
            ...byType.all_personal,
            ...byType.all_groups,
            ...byType.group,
        ];
    };

    const prunedTxns = useMemo(
        () => pruneSettlementLists(simplifiedTransactions),
        [simplifiedTransactions]
    );


    const handleConfirmClick = () => {
        if (!isValid) return;
        if (!selectedMeta && settleMode === "custom") {
            setSelectedMeta({ type: "custom", currency });
        }
        setConfirmationVisible(true);
    };
    useEffect(() => {
        console.log('test: ', selectedMeta);

    }, [selectedMeta])
    const handleFinalSubmit = () => {
        if (!isValid) return;
        onSubmit({
            payerId,
            receiverId,
            amount: parseFloat(amount),
            description,
            currency,
            // NEW: optional metadata (caller can ignore safely)
            meta: selectedMeta || undefined,
        });
        setShowModal(false);
    };
    // 4) fix confirmation “group count” to support array OR object ids
    const countGroupIds = (meta) => {
        if (!meta) return 0;
        // you have cases where ids is an object map, or an array, or groups object
        if (Array.isArray(meta.ids)) return meta.ids.length;
        if (meta.ids && typeof meta.ids === "object") return Object.keys(meta.ids).length;
        if (meta.groups && typeof meta.groups === "object") return Object.keys(meta.groups).length;
        return 0;
    };

    const formatSettlementDetail = (meta) => {
        if (!meta?.type) return { badge: "CUSTOM", title: "Custom settlement", sub: "" };
        const gCount = countGroupIds(meta);
        const gText = gCount ? ` • ${gCount} group${gCount > 1 ? "s" : ""}` : "";

        switch (meta.type) {
            case "net":
                return { badge: "NET", title: "Settling all personal & group", sub: (meta.currency || "") + gText };
            case "all_personal":
                return { badge: "PERSONAL", title: "Settling personal", sub: meta.currency || "" };
            case "all_groups":
                return { badge: "GROUPS", title: "Settling all groups", sub: (meta.currency || "") + gText };
            case "group":
                return { badge: "GROUP", title: `Settling group${meta.name ? `: ${meta.name}` : ""}`, sub: meta.currency || "" };
            default:
                return { badge: "OTHER", title: "Settling", sub: meta.currency || "" };
        }
    };


    useEffect(() => {
        const onKey = (e) => {
            if (e.key === "Escape") setShowModal(false);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [setShowModal]);
    // Helper: order of sections
    // Helper: order + labels
    const sectionOrder = ["net", "all_personal", "all_groups", "group"];
    const sectionLabels = {
        net: "Settle ALL (Net)",
        all_personal: "Settle Personal",
        all_groups: "Settle Groups (Total)",
        group: "Per-Group Settlements"
    };

    // 3) build grouped from the PRUNED list (not the raw prop)
    const grouped = (prunedTxns || []).reduce((acc, tx) => {
        (acc[tx.type] ||= []).push(tx);
        return acc;
    }, {});
    if (grouped.group) {
        grouped.group.sort((a, b) => {
            const an = (a.name || "Unnamed Group").localeCompare(b.name || "Unnamed Group");
            if (an !== 0) return an;
            return Math.abs(Number(b.amount || 0)) - Math.abs(Number(a.amount || 0));
        });
    }


    // (optional) sort group items by group name, then amount desc
    if (grouped.group) {
        grouped.group.sort((a, b) => {
            const an = (a.name || "Unnamed Group").localeCompare(b.name || "Unnamed Group");
            if (an !== 0) return an;
            return Math.abs(Number(b.amount || 0)) - Math.abs(Number(a.amount || 0));
        });
    }
    return (
        <ModalWrapper
            show={showModal}
            onClose={() => setShowModal(false)}
            title="Record a Settlement"
            size="xl"
            footer={<>
                {confirmationVisible ? (
                    <>
                        <button
                            onClick={() => setConfirmationVisible(false)}
                            className="px-4 py-2 rounded hover:bg-[#2a2a2a]"
                        >
                            Back
                        </button>
                        <button
                            onClick={handleFinalSubmit}
                            className="bg-teal-400 text-black px-4 py-2 rounded font-semibold disabled:opacity-60"
                            disabled={!isValid}
                        >
                            Confirm
                        </button>
                    </>
                ) : (
                    <>
                        <button
                            onClick={() => setShowModal(false)}
                            className="px-4 py-2 rounded hover:bg-[#2a2a2a]"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleConfirmClick}
                            className="bg-teal-400 text-black px-4 py-2 rounded font-semibold disabled:opacity-20"
                            disabled={
                                !isValid || (settleMode === "suggested" && !selectedKey) // <-- use selectedKey
                            }
                        >
                            Confirm
                        </button>

                    </>
                )}
            </>}
        >
            {/* Mode Switch */}
            {!confirmationVisible && (
                <div className="flex items-center justify-center mt-2">
                    <div className="inline-flex border border-[#EBF1D5] rounded-full p-1 bg-[#1f1f1f]">
                        <button
                            onClick={() => handleToggle("suggested")}
                            className={`px-6 py-1.5 rounded-full text-sm font-medium ${settleMode === "suggested"
                                ? "bg-[#EBF1D5] text-[#121212]"
                                : "text-[#EBF1D5] hover:bg-[#2a2a2a]"
                                }`}
                        >
                            Suggested
                        </button>
                        <button
                            onClick={() => handleToggle("custom")}
                            className={`px-6 py-1.5 rounded-full text-sm font-medium ${settleMode === "custom"
                                ? "bg-[#EBF1D5] text-[#121212]"
                                : "text-[#EBF1D5] hover:bg-[#2a2a2a]"
                                }`}
                        >
                            Custom
                        </button>
                    </div>
                </div>
            )}

            {/* Content */}
            <div className="flex flex-col gap-3 mt-4 max-h-[80dvh] overflow-y-auto">
                {confirmationVisible ? (
                    <div className="flex flex-col items-center justify-center gap-2">
                        {/* Detail header */}
                        {(() => {
                            const { badge, title, sub } = formatSettlementDetail(selectedMeta);
                            return (
                                <div className="flex flex-col items-center gap-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs px-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-[#cfcfcf]">
                                            {badge}
                                        </span>
                                        <p className="text-sm text-center font-medium">{title}</p>
                                    </div>
                                    {sub ? <p className="text-xs text-[#9aa090]">{sub}</p> : null}
                                </div>
                            );
                        })()}

                        {/* Who paid whom */}
                        <p className="text-lg text-center font-medium mt-2">{getConfirmationText()}</p>

                        {/* Amount */}
                        <p className="text-2xl text-teal-400">
                            {getSymbol(currency)} {Number(amount || 0).toFixed(2)}
                        </p>

                        {/* Optional description */}
                        {description && (
                            <p className="text-sm text-[#c9c9c9] mt-1">{description}</p>
                        )}

                        {/* If we have group ids (net / all_groups), show a compact count */}
                        {selectedMeta?.ids?.length ? (
                            <p className="text-xs text-[#9aa090] mt-1">
                                Applies to {selectedMeta.ids.length} group{selectedMeta.ids.length > 1 ? "s" : ""}.
                            </p>
                        ) : null}
                    </div>

                ) : settleMode === "suggested" ? (
                    <div className="flex flex-col gap-4 text-sm overflow-y-scroll no-scrollbar ">
                        {sectionOrder.map((type) => {
                            const txns = grouped[type] || [];
                            if (!txns.length) return null;
                            return (
                                <div key={type} className="flex flex-col gap-2">
                                    <p className="text-xs uppercase tracking-wide text-[#9aa090] font-semibold">
                                        {sectionLabels[type]}
                                    </p>
                                    <div className="flex flex-col gap-2">
                                        {txns.map((txn) => {
                                            const rowKey = keyOf(txn);
                                            const from = getMemberName(txn.from);
                                            const to = getMemberName(txn.to);
                                            const amt = Number(txn.amount || 0).toFixed(2);
                                            const sym = getSymbol(txn.currency);
                                            const theyPayYou = txn.to === userId;
                                            const amtClass = theyPayYou ? "text-teal-400" : "text-red-400";
                                            const isSelected = rowKey === selectedKey;

                                            return (
                                                <button
                                                    key={rowKey}
                                                    onClick={() => { setSelectedKey(rowKey); handlePrefill(txn); setConfirmationVisible(false); }}
                                                    className={`flex justify-between items-center px-3 py-2 rounded border text-left transition
                ${isSelected ? "bg-teal-900 border-teal-400 text-teal-200" : "bg-[#121212] border-[rgba(255,255,255,0.1)] hover:bg-[#1a1a1a]"}`}
                                                >
                                                    <div className="flex flex-col">
                                                        <span className="text-xs text-[#bdbdbd]">{from} → {to}</span>
                                                        {type === "group" && (
                                                            <span className="text-[11px] text-[#9aa090]">{txn.name || "Unnamed Group"}</span>
                                                        )}
                                                    </div>
                                                    <span className={`text-base font-semibold ${amtClass}`}>{sym} {amt}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}

                        {(!prunedTxns || prunedTxns.length === 0) && (
                            <p className="text-[#c9c9c9]">Nothing to settle — all clear!</p>
                        )}


                        {/* Empty state */}
                        {(!simplifiedTransactions || simplifiedTransactions.length === 0) && (
                            <p className="text-[#c9c9c9]">Nothing to settle — all clear!</p>
                        )}

                        {/* Footer */}
                        <p className="text-[#a0a0a0] text-center text-sm">
                            Select a transaction or create a{" "}
                            <span
                                className="text-[#EBF1D5] underline underline-offset-3 cursor-pointer hover:text-teal-400"
                                onClick={() => handleToggle("custom")}
                            >
                                custom one
                            </span>
                        </p>
                    </div>

                ) : (
                    <div className="flex flex-col gap-3">
                        <p className="text-[#a0a0a0] text-sm">
                            This only settles friend expenses (non group)
                        </p>
                        {/* Paid By */}
                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-[#a0a0a0]">Paid By</label>
                            <CustomSelect
                                value={payerId}
                                onChange={setPayerId}
                                options={members.map(m => ({ value: m.id, label: m.id === userId ? "You" : m.name }))}
                                placeholder="Select payer"
                            />
                        </div>

                        {/* Received By */}
                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-[#a0a0a0]">Received By</label>
                            <CustomSelect
                                value={receiverId}
                                onChange={setReceiverId}
                                options={members.map(m => ({ value: m.id, label: m.id === userId ? "You" : m.name }))}
                                placeholder="Select receiver"
                            />
                        </div>


                        {/* Amount */}
                        <div className="flex flex-row gap-2">
                            <div className="flex-1">
                                <button
                                    onClick={() => setShowCurrencyModal(true)}
                                    className={`w-full ${currency ? 'text-[#EBF1D5]' : 'text-[rgba(130,130,130,1)]'} text-[18px] border-b-2 border-[#55554f] 
                                           p-2 text-base h-[45px] pl-3 flex-1 text-left`}
                                >
                                    {currency || "Currency"}
                                </button>
                                <CurrencyModal
                                    show={showCurrencyModal}
                                    onClose={() => setShowCurrencyModal(false)}
                                    value={currency}
                                    options={currencyOptions}
                                    onSelect={setCurrency}
                                    defaultCurrency={defaultCurrency}
                                    preferredCurrencies={preferredCurrencies}
                                />
                            </div>

                            <div className="flex flex-col gap-1">
                                <input
                                    type="number"
                                    step="0.01"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    placeholder="Enter amount"
                                    className="text-[18px] border-b-2 border-[#55554f] 
                                           p-2 text-base h-[45px] pl-3 flex-1 text-left"
                                />
                            </div>
                        </div>

                        {/* Description */}
                        <div className="flex flex-col gap-1">
                            {/* <label className="text-xs text-[#a0a0a0]">Description (optional)</label> */}
                            <input
                                type="text"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Description (optional)"
                                className="text-[18px] border-b-2 border-[#55554f] 
                                           p-2 text-base h-[45px] pl-3 flex-1 text-left"
                            />
                        </div>

                        <p className="text-[#a0a0a0] text-center text-sm">
                            Create a transaction or select a{" "}
                            <span
                                className="text-[#EBF1D5] underline underline-offset-3 cursor-pointer hover:text-teal-400"
                                onClick={() => handleToggle("suggested")}
                            >
                                suggested one
                            </span>
                        </p>
                    </div>
                )}
            </div>

            {/* Footer */}

        </ModalWrapper>
    );
}
