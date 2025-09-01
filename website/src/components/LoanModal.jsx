// components/LoanViewModal.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Trash2, CheckCircle2 } from "lucide-react";
import ModalWrapper from "./ModalWrapper";
import {
    addRepayment as addLoanRepayment,
    closeLoan as closeLoanApi,
} from "../services/LoanService";
import { logEvent } from "../utils/analytics";
import { getSymbol } from "../utils/currencies";
import CurrencyModal from "./CurrencyModal";

const fmt = (n) => `${Number(n || 0).toFixed(2)}`;

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
    openPaymentModal,
    party,
    counterParty,
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
    const [currency, setCurrency] = useState(loan.currency);
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
            setError(`Amount exceeds outstanding (${getSymbol(loan?.currency)} ${fmt(outstanding)})`);
            return;
        }

        try {
            setSavingRepay(true);
            await addLoanRepayment(
                localLoan._id,
                {
                    currency: currency,
                    amount: amt,
                    note: repayNote,
                    paymentMethodId: !youAreLender ? party.selectedPaymentMethodId : counterParty.selectedPaymentMethodId,
                    recieverMethodId: youAreLender ? party.selectedPaymentMethodId : counterParty.selectedPaymentMethodId
                },
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
                                onClick={() => {
                                    logEvent('loan_deleted', {
                                        surface: 'modal'
                                    })
                                    doDelete()
                                }}
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
                        onClick={() => {
                            setShowRepayForm((s) => !s)
                        }}
                        className={`px-4 py-2 rounded-md border ${showRepayForm
                            ? "border-red-500 text-red-500"
                            : "border-teal-500 text-teal-500"
                            } text-sm`}
                    >
                        {showRepayForm ? "Cancel" : "Add Repayment"}
                    </button>

                    {showRepayForm && (
                        <button
                            onClick={() => {
                                logEvent('loan_repayment', {
                                    surface: 'modal'
                                })
                                submitRepayment()
                            }}
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
                        onClick={() => {
                            logEvent('loan_closed', {
                                surface: 'modal'
                            })
                            doCloseLoan()
                        }}
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
                    <div className="text-xl text-teal-500 mb-4">
                        {youAreLender ? "You lent" : "You borrowed"} {getSymbol(loan?.currency)} {fmt(localLoan?.principal)}{" "}
                        {youAreLender ? "to" : "from"} {counterpartyName}
                    </div>

                    {!showRepayForm && localLoan?.description && (<>
                        <p className="text-sm font-medium mb-1 text-teal-500 uppercase">
                            Description
                        </p>
                        <div className="text-[#a0a0a0] mt-1 italic">{localLoan.description}</div>
                    </>
                    )}

                    {!showRepayForm && localLoan?.notes && (<>
                        <p className="text-sm font-medium mb-1 text-teal-500 uppercase">
                            Notes
                        </p>
                        <div className="text-[#a0a0a0] mt-1 italic">{localLoan.notes}</div>
                    </>
                    )}


                    {localLoan?.estimatedReturnDate && (
                        <div className="text-[#a0a0a0]">
                            Target date:{" "}
                            <span className="text-[#EBF1D5]">
                                {new Date(localLoan.estimatedReturnDate).toLocaleDateString()}
                            </span>
                        </div>
                    )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col">
                        <span className="text-sm font-medium mb-1 text-teal-500 uppercase">
                            Status
                        </span>
                        <span className="text-[#EBF1D5] capitalize">
                            {localLoan?.status}</span>
                    </div><div className="flex flex-col">
                        <span className="text-sm font-medium mb-1 text-teal-500 uppercase">
                            Outstanding
                        </span>
                        <span className="text-[#EBF1D5]">{getSymbol(loan?.currency)} {fmt(outstanding)}</span>
                    </div>
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
                            <div className="flex flex-col gap-2">
                                <div className="flex flex-row w-full gap-4">
                                    <div className="flex-1">
                                        <button
                                            disabled={true}
                                            className={`w-full ${currency ? 'text-[#EBF1D5]' : 'text-[rgba(130,130,130,1)]'} text-[18px] border-b-2 border-[#55554f]  p-2 text-base h-[45px] pl-3 flex-1 text-left`}
                                        >
                                            {currency || "Currency"}
                                        </button>

                                    </div>

                                    <input
                                        className="flex-1 text-[#EBF1D5] text-[18px] border-b-2 border-[#55554f] p-2 text-base min-h-[40px] pl-3"
                                        type="number"
                                        placeholder="Enter Amount"
                                        value={repayAmount}
                                        onChange={(e) => setRepayAmount(parseFloat(e.target.value))}
                                    />
                                </div>
                                <div className="flex-1">
                                    <input
                                        type="text"
                                        value={repayNote}
                                        onChange={(e) => setRepayNote(e.target.value)}
                                        className="w-full flex-1 text-[#EBF1D5] text-[18px] border-b-2 border-[#55554f] p-2 text-base min-h-[40px] pl-3"
                                        placeholder="Note (optional) e.g., UPI"
                                    />
                                </div>
                                <div className="flex flex-col">
                                    <p className="text-[rgba(130,130,130,1)]">{party?.name}'s Account</p>
                                    <button
                                        onClick={() => openPaymentModal({ context: 'lender' })}
                                        className={`w-full ${party?.selectedPaymentMethodId ? 'text-[#EBF1D5]' : 'text-[rgba(130,130,130,1)]'} text-[18px] border-b-2 border-[#55554f]  p-2 text-base h-[45px] pl-3 flex-1 text-left`}
                                    >
                                        {party?.selectedPaymentMethodId ? party?.paymentMethods?.find(acc => acc.paymentMethodId === party?.selectedPaymentMethodId)?.label : "Payment Account"}
                                    </button>
                                </div>
                                <div className="flex flex-col flex-1/3">
                                    <p className="text-[rgba(130,130,130,1)]">{counterParty?.name}'s Account</p>
                                    <button
                                        onClick={() => openPaymentModal({ context: 'borrower' })}
                                        className={`w-full ${counterParty?.selectedPaymentMethodId ? 'text-[#EBF1D5]' : 'text-[rgba(130,130,130,1)]'} text-[18px] border-b-2 border-[#55554f]  p-2 text-base h-[45px] pl-3 flex-1 text-left`}
                                    >
                                        {counterParty?.selectedPaymentMethodId ? counterParty?.paymentMethods?.find(acc => acc.paymentMethodId === counterParty?.selectedPaymentMethodId)?.label : "Payment Account"}
                                        {/* Split (inside payer rows) */}
                                    </button>
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
