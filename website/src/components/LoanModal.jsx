// components/LoanViewModal.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Trash2, CheckCircle2 } from "lucide-react";
import ModalWrapper from "./ModalWrapper";
import {
    addRepayment as addLoanRepayment,
    closeLoan as closeLoanApi,
} from "../services/LoanService";

const fmt = (n) => `₹${Number(n || 0).toFixed(2)}`;

export default function LoanViewModal({
    showModal,          // ✅ pass boolean to show/hide
    onClose,            // () => void
    loan,
    friend,
    userId,
    userToken,
    onCloseLoan,        // optional async override
    onDeleteLoan,       // async () => void (required for delete)
    onAfterChange,      // optional refresh callback
}) {
    const [busy, setBusy] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);

    // Local copy for optimistic updates
    const [localLoan, setLocalLoan] = useState(loan);
    useEffect(() => setLocalLoan(loan), [loan]);

    // Repayment form state
    const [showRepayForm, setShowRepayForm] = useState(false);
    const [repayAmount, setRepayAmount] = useState("");
    const [repayNote, setRepayNote] = useState("");
    const [autoCloseIfFull, setAutoCloseIfFull] = useState(true);
    const [savingRepay, setSavingRepay] = useState(false);
    const [error, setError] = useState("");

    const youAreLender = localLoan?.lenderId?._id === userId;
    const counterpartyName = friend?.name || "Friend";

    const outstanding = useMemo(() => {
        const paid = (localLoan?.repayments || []).reduce(
            (s, r) => s + (Number(r.amount) || 0),
            0
        );
        return Math.max(0, (Number(localLoan?.principal) || 0) - paid);
    }, [localLoan]);

    const doCloseLoan = async () => {
        try {
            setBusy(true);
            if (onCloseLoan) {
                await onCloseLoan();
            } else {
                await closeLoanApi(localLoan._id, {}, userToken);
                await onAfterChange?.();
            }
        } finally {
            setBusy(false);
        }
    };

    const doDelete = async () => {
        try {
            setBusy(true);
            await onDeleteLoan();
            await onAfterChange?.();
            onClose?.();
        } finally {
            setBusy(false);
        }
    };

    const submitRepayment = async () => {
        setError("");
        const amt = Number(repayAmount);
        if (!amt || amt <= 0) {
            setError("Enter a valid amount > 0");
            return;
        }
        if (amt > outstanding) {
            setError(`Amount exceeds outstanding (${fmt(outstanding)})`);
            return;
        }

        try {
            setSavingRepay(true);
            await addLoanRepayment(
                localLoan._id,
                { amount: amt, note: repayNote },
                userToken
            );

            // Optimistic update
            const nowIso = new Date().toISOString();
            setLocalLoan((prev) => ({
                ...prev,
                repayments: [
                    ...(prev.repayments || []),
                    { amount: amt, at: nowIso, note: repayNote },
                ],
                updatedAt: nowIso,
            }));

            // Auto-close if fully paid
            if (autoCloseIfFull && Math.abs(outstanding - amt) < 1e-9) {
                if (onCloseLoan) {
                    await onCloseLoan();
                } else {
                    await closeLoanApi(localLoan._id, {}, userToken);
                }
            }

            setRepayAmount("");
            setRepayNote("");
            setShowRepayForm(false);
            await onAfterChange?.();
        } catch (e) {
            setError(e?.message || "Failed to add repayment");
        } finally {
            setSavingRepay(false);
        }
    };

    // Footer builder
    const footer = (
        <div className="flex flex-row gap-2 justify-end w-full">
            {/* Delete / confirm block (hidden while showing repay form) */}
            {!showRepayForm && (
                <div className="flex items-center gap-2">
                    {!confirmDelete ? (
                        <button
                            onClick={() => setConfirmDelete(true)}
                            className="px-4 py-2 rounded-md border border-red-500 text-red-500 hover:bg-red-500/10 text-sm inline-flex items-center gap-1 disabled:opacity-60"
                            disabled={busy}
                        >
                            <Trash2 size={16} /> Delete
                        </button>
                    ) : (
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-[#c9c9c9]">Delete permanently?</span>
                            <button
                                onClick={() => setConfirmDelete(false)}
                                className="px-4 py-2 rounded-md border border-[#55554f] hover:bg-[#222] text-sm"
                                disabled={busy}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={doDelete}
                                className="px-4 py-2 rounded-md bg-red-600 hover:bg-red-700 text-white text-sm inline-flex items-center gap-1 disabled:opacity-60"
                                disabled={busy}
                            >
                                <Trash2 size={16} /> Confirm
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Add/Cancel repayment */}
            {outstanding > 0 && !confirmDelete && (
                <>
                    <button
                        onClick={() => setShowRepayForm((s) => !s)}
                        className={`px-4 py-2 rounded-md border ${showRepayForm
                                ? "border-red-500 text-red-500"
                                : "border-teal-500 text-teal-500"
                            } text-sm`}
                    >
                        {showRepayForm ? "Cancel" : "Add Repayment"}
                    </button>

                    {showRepayForm && (
                        <button
                            onClick={submitRepayment}
                            disabled={savingRepay}
                            className="px-4 py-2 rounded-md border border-teal-500 text-teal-500 text-sm disabled:opacity-60"
                        >
                            {savingRepay ? "Saving..." : "Save Repayment"}
                        </button>
                    )}
                </>
            )}

            {/* Close loan */}
            {!confirmDelete &&
                outstanding === 0 &&
                localLoan?.status !== "closed" && (
                    <button
                        onClick={doCloseLoan}
                        className="px-4 py-2 rounded-md border border-[#55554f] hover:bg-[#222] text-sm inline-flex items-center gap-1 disabled:opacity-60"
                        disabled={busy}
                    >
                        <CheckCircle2 size={16} /> Close
                    </button>
                )}
        </div>
    );

    if (!showModal) return null;

    return (
        <ModalWrapper
            show={!!showModal}
            onClose={() => {
                if (!savingRepay && !busy) onClose?.();
            }}
            title="Loan Details"
            size="lg"
            footer={footer}
        >
            {/* Body */}
            <div className="p-0 space-y-4">
                <div className="text-md">
                    <div className="text-xl text-teal-500">
                        {youAreLender ? "You lent" : "You borrowed"} {fmt(localLoan?.principal)}{" "}
                        {youAreLender ? "to" : "from"} {counterpartyName}
                    </div>
                    {localLoan?.description && (
                        <div className="text-[#a0a0a0] mt-1 italic">{localLoan.description}</div>
                    )}
                    <div className="text-[#a0a0a0] mt-1">
                        Status: <span className="text-[#EBF1D5]">{localLoan?.status}</span>
                    </div>
                    <div className="text-[#a0a0a0]">
                        Outstanding: <span className="text-[#EBF1D5]">{fmt(outstanding)}</span>
                    </div>
                    {localLoan?.estimatedReturnDate && (
                        <div className="text-[#a0a0a0]">
                            Target date:{" "}
                            <span className="text-[#EBF1D5]">
                                {new Date(localLoan.estimatedReturnDate).toLocaleDateString()}
                            </span>
                        </div>
                    )}
                </div>

                {/* Repayments */}
                <div>
                    <p className="text-sm font-medium mb-1 text-teal-500 uppercase">
                        Repayments
                    </p>
                    {localLoan?.repayments?.length ? (
                        <div className="max-h-40 overflow-y-auto pr-1 space-y-1">
                            {[...localLoan.repayments].reverse().map((r, idx) => (
                                <div
                                    key={idx}
                                    className="text-md text-[#c9c9c9] flex items-center justify-between"
                                >
                                    <span>
                                        <span className="text-sm">{idx + 1}. </span>
                                        <span className="text-lg">{fmt(r.amount)}</span>
                                    </span>
                                    <span className="text-sm">
                                        {new Date(r.at).toLocaleString(undefined, {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                            year: "numeric",
                                            month: "short",
                                            day: "numeric",
                                        })}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-md text-[#c9c9c9]">No repayments yet.</p>
                    )}
                </div>

                {/* Inline Repayment Form */}
                {outstanding > 0 && showRepayForm && (
                    <div className="rounded-lg border border-[#333] p-3 bg-[#212121] space-y-2">
                        <div className="space-y-2">
                            <label className="text-md">New Repayment</label>
                            <div className="flex gap-2">
                                <div className="flex-1">
                                    <label className="text-xs text-[#a0a0a0]">Amount</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        inputMode="decimal"
                                        value={repayAmount}
                                        onChange={(e) => setRepayAmount(e.target.value)}
                                        className="w-full bg-[#121212] border border-[#333] rounded-md px-3 py-2 text-sm outline-none focus:border-[#4b8]"
                                        placeholder={`<= ${fmt(outstanding)}`}
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="text-xs text-[#a0a0a0]">Note (optional)</label>
                                    <input
                                        type="text"
                                        value={repayNote}
                                        onChange={(e) => setRepayNote(e.target.value)}
                                        className="w-full bg-[#121212] border border-[#333] rounded-md px-3 py-2 text-sm outline-none focus:border-[#4b8]"
                                        placeholder="e.g., UPI"
                                    />
                                </div>
                            </div>

                            <label className="flex items-center gap-2 text-xs text-[#c9c9c9]">
                                <input
                                    type="checkbox"
                                    checked={autoCloseIfFull}
                                    onChange={(e) => setAutoCloseIfFull(e.target.checked)}
                                />
                                Close this loan automatically if fully repaid
                            </label>

                            {!!error && <p className="text-xs text-red-400">{error}</p>}
                        </div>
                    </div>
                )}

                {/* Timestamps (hide while editing) */}
                {!showRepayForm && (
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <p className="text-teal-500 text-sm uppercase">Updated At</p>
                            <p className="text-sm text-[#c9c9c9]">
                                {new Date(localLoan.updatedAt).toLocaleString(undefined, {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                })}
                            </p>
                        </div>
                        <div>
                            <p className="text-teal-500 text-sm uppercase">Created At</p>
                            <p className="text-sm text-[#c9c9c9]">
                                {new Date(localLoan.createdAt).toLocaleString(undefined, {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                })}
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </ModalWrapper>
    );
}
