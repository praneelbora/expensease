// components/SettleModal.jsx
import React, { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import ModalWrapper from "./ModalWrapper";
import CustomSelect from "./CustomSelect"; // ⬅️ import
import { getSymbol } from "../utils/currencies";
import CurrencyModal from "./CurrencyModal";
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
    const [payerId, setPayerId] = useState("");
    const [receiverId, setReceiverId] = useState("");
    const [amount, setAmount] = useState("");
    const [description, setDescription] = useState("");
    const [currency, setCurrency] = useState("");
    const [settleMode, setSettleMode] = useState("suggested");
    const [selectedTxnIndex, setSelectedTxnIndex] = useState(null);
    const [confirmationVisible, setConfirmationVisible] = useState(false);
    const [showCurrencyModal, setShowCurrencyModal] = useState(false);

    const members = useMemo(() => {
        if (group?.members?.length) {
            return group.members.map((m) => ({ id: m._id, name: m.name }));
        }
        return friends;
    }, [group, friends]);

    const getMemberName = (id) => {
        if (!id) return "Unknown";
        const m = members.find((x) => x.id === id);
        if (!m) return "Unknown";
        return m.id === userId ? "you" : (m.name || "Unknown");
    };

    const resetForm = () => {
        setPayerId("");
        setReceiverId("");
        setAmount("");
        setDescription("");
        setSelectedTxnIndex(null);
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
        setDescription(
            `Settling between ${getMemberName(txn.from)} and ${getMemberName(txn.to)}`
        );
    };
    useEffect(() => {
        if (showModal && prefill) {
            setPayerId(prefill.payerId || "");
            setReceiverId(prefill.receiverId || "");
            setAmount(
                Number(prefill.amount || 0) > 0 ? Number(prefill.amount).toFixed(2) : ""
            );
            setDescription(prefill.description || "");
            setSettleMode("custom"); // go straight to custom with prefilled values
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

    const handleConfirmClick = () => {
        if (!isValid) return;
        setConfirmationVisible(true);
    };

    const handleFinalSubmit = () => {
        if (!isValid) return;
        onSubmit({
            payerId,
            receiverId,
            amount: parseFloat(amount),
            description,
            currency,
        });
        setShowModal(false);
    };

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === "Escape") setShowModal(false);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [setShowModal]);

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
                                !isValid || (settleMode === "suggested" && selectedTxnIndex === null)
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
            <div className="flex flex-col gap-3 mt-4 max-h-[60dvh] overflow-y-auto">
                {confirmationVisible ? (
                    <div className="flex flex-col h-[180px] items-center justify-center gap-2">
                        <p className="text-lg text-center font-medium">{getConfirmationText()}</p>
                        <p className="text-2xl text-teal-400">
                            {getSymbol(currency)} {Number(amount || 0).toFixed(2)}
                        </p>
                        {description && (
                            <p className="text-sm text-[#c9c9c9] mt-1">{description}</p>
                        )}

                    </div>
                ) : settleMode === "suggested" ? (
                    <div className="flex flex-col gap-2 text-sm">
                        {simplifiedTransactions?.length ? (
                            simplifiedTransactions.map((txn, idx) => {
                                const from = getMemberName(txn.from);
                                const curr = txn.currency;
                                const to = getMemberName(txn.to);
                                const amt = Number(txn.amount || 0).toFixed(2);
                                const isSelected = idx === selectedTxnIndex;
                                return (
                                    <button
                                        key={idx}
                                        onClick={() => {
                                            setSelectedTxnIndex(idx);
                                            handlePrefill(txn);
                                            setConfirmationVisible(false);
                                        }}
                                        className={`flex justify-between items-center px-3 py-2 rounded border text-left ${isSelected
                                            ? "bg-teal-900 border-teal-400 text-teal-200"
                                            : "bg-[#121212] border-[rgba(255,255,255,0.1)]"
                                            }`}
                                    >
                                        {from} owes {to} {getSymbol(curr)} {amt}
                                    </button>
                                );
                            })
                        ) : (
                            <p className="text-[#c9c9c9]">Nothing to settle — all clear!</p>
                        )}
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
