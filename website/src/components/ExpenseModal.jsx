// components/ExpenseModal.jsx
import React, { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import ModalWrapper from "./ModalWrapper";
import { deleteExpense } from "../services/ExpenseService";
import { logEvent } from "../analytics";

const fmtMoney = (n) => `₹${Number(n || 0).toFixed(2)}`;
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

export default function ExpenseModal({
    showModal,        // either false or the expense object
    setShowModal,
    fetchExpenses,
    userToken,
}) {
    if (!showModal) return null;

    const {
        _id,
        mode,                 // 'split' | 'personal'
        description,
        amount,
        date,
        createdAt,
        updatedAt,
        createdBy,
        splits = [],
    } = showModal || {};

    const [busy, setBusy] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const close = () => !busy && setShowModal(false);

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
            setBusy(true);
            await deleteExpense(_id, userToken);
            await fetchExpenses?.();
            setShowModal(false);
        } catch (err) {
            console.log(err?.message || "Something went wrong while deleting.");
        } finally {
            setBusy(false);
        }
    };

    // Build footer once to keep the JSX tidy
    const footer = (
        <>
            {!confirmDelete ? (
                <>
                    <button
                        onClick={() => {
                            setConfirmDelete(true)
                        }}
                        disabled={busy}
                        className="text-red-400 border border-red-500 px-4 py-2 rounded-md hover:bg-red-500/10 transition text-sm inline-flex items-center gap-1"
                    >
                        <Trash2 size={16} /> Delete Expense
                    </button>
                    <button
                        onClick={close}
                        disabled={busy}
                        className="text-[#EBF1D5] border border-[#EBF1D5] px-4 py-2 rounded-md hover:bg-[#3a3a3a] transition text-sm"
                    >
                        Close
                    </button>
                </>
            ) : (
                <div className="flex items-center gap-2">
                    <span className="text-sm text-[#c9c9c9]">Delete permanently?</span>
                    <button
                        onClick={() => setConfirmDelete(false)}
                        disabled={busy}
                        className="px-4 py-2 rounded-md border border-[#55554f] hover:bg-[#2a2a2a] text-sm"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => {
                            logEvent('expense_deleted', {
                                surface: 'modal'
                            })
                            handleDelete()
                        }}
                        disabled={busy}
                        className="px-4 py-2 rounded-md bg-red-600 hover:bg-red-700 text-white text-sm inline-flex items-center gap-1"
                    >
                        <Trash2 size={16} /> Confirm
                    </button>
                </div>
            )}
        </>
    );

    return (
        <ModalWrapper
            show={!!showModal}
            onClose={close}
            title={`${mode} Expense`}
            size="lg"
            footer={footer}
        >
            {/* Body */}
            <div className="w-full flex flex-col gap-3">
                {/* Top row: amount + date */}
                <div className="flex items-start justify-between gap-3">
                    <p className="text-2xl font-semibold">{fmtMoney(amount)}</p>
                    {date && <p className="text-sm text-[#c9c9c9]">{fmtDate(date)}</p>}
                </div>

                {description && <p className="text-base capitalize">{description}</p>}

                <hr className="border-[#2a2a2a]" />

                {/* Split details */}
                {mode === "split" && (
                    <>
                        <p className="text-base">
                            {payerInfo} {amount ? ` ${fmtMoney(amount)}` : ""}
                        </p>

                        <div className="ms-1">
                            <div className="flex flex-col gap-1 text-sm">
                                {splits
                                    .filter((s) => (s.payAmount || 0) > 0 || (s.oweAmount || 0) > 0)
                                    .map((s, idx) => {
                                        const name = s?.friendId?.name || "Member";
                                        const payTxt =
                                            (s.payAmount || 0) > 0 ? `paid ${fmtMoney(s.payAmount)}` : "";
                                        const andTxt =
                                            (s.payAmount || 0) > 0 && (s.oweAmount || 0) > 0 ? " and " : "";
                                        const oweTxt = `owes ${fmtMoney(s.oweAmount || 0)}`;
                                        return (
                                            <div key={idx} className="flex">
                                                <p>
                                                    {name} {payTxt}
                                                    {andTxt}
                                                    {oweTxt}
                                                </p>
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>

                        <hr className="border-[#2a2a2a]" />
                    </>
                )}

                {/* Meta */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    {mode === "split" && createdBy?.name && (
                        <p className="capitalize">
                            <span className="text-[#9aa08e]">Created By:</span> {createdBy.name}
                        </p>
                    )}
                    {createdAt && (
                        <p>
                            <span className="text-[#9aa08e]">Created On:</span>{" "}
                            {fmtDateTimeNoSecs(createdAt)}
                        </p>
                    )}
                    {updatedAt && (
                        <p>
                            <span className="text-[#9aa08e]">Updated On:</span>{" "}
                            {fmtDateTimeNoSecs(updatedAt)}
                        </p>
                    )}
                </div>
            </div>
        </ModalWrapper>
    );
}
