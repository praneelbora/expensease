// components/PaymentMethodCard.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { getSymbol } from "../utils/currencies";
import { Pencil } from "lucide-react";
import { getPMIcon } from './pmIcons';

/**
 * Props:
 * - paymentMethod
 * - balancesPeek: { [paymentMethodId]: { [CCY]: { available, pending } } }
 * - onPeekBalances(id)
 * - onSetDefault(id, 'send'|'receive')
 * - onDelete(id)
 * - onEdit(paymentMethod)
 * - onAddBalance?()
 *
 * Privacy UX:
 * - Balances are ALWAYS rendered but blurred.
 * - Clicking "View balances" reveals them for 5s, then auto-blurs again.
 * - We only fetch balances once per card (first reveal); later reveals don't re-fetch.
 * - Also shows a small chip with the number of currencies (once fetched).
 */
export default function PaymentMethodCard({
    paymentMethod,
    balancesPeek = {},
    onPeekBalances,
    onEdit,
    onAddBalance,
    onDelete
}) {
    const Icon = getPMIcon({ iconKey: paymentMethod.iconKey, type: paymentMethod.type });
    const a = paymentMethod ?? {};
    // const peek = balancesPeek?.[a._id]; // undefined until fetched
    const peek = paymentMethod.balances; // undefined until fetched
    const currencyCode = a.defaultCurrency || "INR";
    const caps = Array.isArray(a.capabilities) ? a.capabilities : [];

    const [revealed, setRevealed] = useState(true);
    const timerRef = useRef(null);

    useEffect(() => {
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    const handleReveal = () => {
        // fetch once, then reuse
        if (!peek) onPeekBalances?.(a._id);
        // reveal for 5s
        setRevealed(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setRevealed(false), 5000);
    };

    const hideNow = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        setRevealed(false);
    };

    const symbol = useMemo(() => {
        try {
            return getSymbol?.(currencyCode) || "";
        } catch {
            return "";
        }
    }, [currencyCode]);

    const blurClass = revealed
        ? "blur-0 opacity-100"
        : "blur-sm opacity-70 select-none";

    const balancesCount = peek ? Object.keys(peek).length : 0;
    const skeletonKeys = useMemo(() => Object.keys(a?.balances || {}), [a?.balances]);

    return (
        <li className="group rounded-2xl border border-[#2a2a2a] bg-[#141414] p-4 sm:p-5 transition-colors hover:border-teal-700/40">
            {/* Header */}
            <div className="flex flex-col ">
                <div className="flex flex-col gap-2">
                    <div className="flex flex-row items-start justify-between gap-3">
                        <div className="flex  items-center gap-2 flex-wrap">
                            <div className="p-2 rounded-lg bg-[#262626]">
                                <Icon className="h-full w-full p-1" />
                            </div>
                            <div className="-space-y-1">
                                <h3 className="text-lg font-semibold truncate" title={a.label}>
                                    {a.label}
                                </h3>
                                {a.type.toLowerCase() == 'cash' && a.label.toLowerCase() == "cash" ? <></> : <>{a.type && <Chip className="uppercase">{a.type}</Chip>}</>}
                            </div>
                        </div>
                        <div className="flex flex-col items-center gap-2 flex-wrap">
                            {a.isDefaultSend && <Chip accent="teal">Expenses Default</Chip>}
                            {a.isDefaultReceive && <Chip accent="indigo">Recieving Default</Chip>}
                        </div>

                    </div>




                    {/* Actions (top-right) */}

                </div>
                {Object.entries(peek).length > 0 && <div className="flex flex-col mt-2">
                    <span className="text-sm font-medium text-[#b9c29f]">Current Balances</span>
                    <div className="flex flex-wrap justify-between mt-2 ">

                        <div className="w-full flex flex-wrap gap-2">
                            {Object.entries(peek).map(([ccy, obj]) => (
                                <div
                                    key={ccy}
                                    className="flex items-baseline gap-2 rounded-xl bg-[#181818] border border-[#2a2a2a] px-3 py-2"
                                >
                                    <span className={`text-[#cfdac0] transition ${blurClass}`}>{obj?.available ?? 0}</span>
                                    <span className="text-sm font-medium text-[#b9c29f]">{ccy}</span>
                                </div>
                            ))}


                        </div>
                    </div>

                </div>}


                {/* Balances (rendered always; blurred until revealed) */}
                {/* <div className="mt-1">`
                    {peek ? (
                        Object.keys(peek).length === 0 ? (
                            <div className="text-xs text-[#9aa489]">No balances yet</div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {Object.entries(peek).map(([ccy, obj]) => (
                                    <div
                                        key={ccy}
                                        className="flex items-center justify-between rounded-xl bg-[#181818] border border-[#2a2a2a] px-3 py-2"
                                    >
                                        <span className="text-xs font-medium text-[#b9c29f]">{ccy}</span>
                                        <div className="flex items-center gap-3 text-xs">
                                            <span className={`text-[#cfdac0] transition ${blurClass}`}>
                                                <span className="text-[#93a57c]">Balance:</span> {obj?.available ?? 0}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    ) : (
                        // Placeholder before first fetch — rows equal to actual balances in a.balances
                        skeletonKeys.length ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {skeletonKeys.map((ccy) => (
                                    <div
                                        key={ccy}
                                        className="flex items-center justify-between rounded-xl bg-[#181818] border border-[#2a2a2a] px-3 py-2"
                                    >
                                        <span className="text-xs font-medium text-[#b9c29f]">{ccy}</span>
                                        <div className="flex items-center gap-3 text-xs">
                                            <span className={`text-[#cfdac0] transition ${blurClass}`}>Balance: •••</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-xs text-[#9aa489]">No balances yet</div>
                        )
                    )}
                </div> */}

                {/* Privacy control / reveal button */}
                {/* <div className="flex flex-row w-full gap-2 justify-between"> */}
                {/* {((peek ? Object.keys(peek).length : Object.keys(a?.balances || {}).length) > 0) && (
                        <div className="flex flex-row items-center justify-end gap-2">
                            {!revealed ? (
                                <button
                                    type="button"
                                    onClick={handleReveal}
                                    className="text-xs text-teal-300 hover:text-teal-200 underline underline-offset-2"
                                >
                                    View balances
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={hideNow}
                                    className="text-xs text-teal-300 hover:text-teal-200 underline underline-offset-2"
                                >
                                    Hide
                                </button>
                            )}
                        </div>
                    )} */}
                <div className="w-full flex flex-1 justify-between ">

                    <div className="flex justify-baseline items-end">
                        <button outline="teal" onClick={onAddBalance} title="Add / adjust balance" className="px-1 py-1 text-xs text-teal-500 border-b border-b-teal-500 ">
                            Edit Balances
                        </button>
                    </div>

                    <div className="shrink-0 flex flex-wrap items-end justify-between gap-2">

                        <Btn onClick={() => onEdit?.(a)} title="Edit" square="aspect-square">
                            <Pencil width={20} height={20} />
                        </Btn>


                    </div>
                </div>
                {/* </div> */}


            </div>
        </li>
    );
}

/* ---------- tiny UI helpers ---------- */

function Chip({ children, accent, className = "" }) {
    const accentMap = {
        teal: "bg-teal-700/30 border-teal-700/40",
        indigo: "bg-indigo-700/30 border-indigo-700/40",
    };
    const base =
        "text-[10px] px-2 py-1 rounded-full border border-[#2a2a2a] text-[#e7f0d7]";
    return (
        <span className={`${base} ${accent ? accentMap[accent] : ""} ${className}`}>
            {children}
        </span>
    );
}

function Btn({ children, onClick, disabled, title, outline, square }) {
    const outlineMap = {
        teal: "border-teal-700/60 text-teal-300 hover:bg-teal-800/20",
        red: "border-red-800/60 text-red-300 hover:bg-red-900/20",
    };
    const base =
        "p-2 text-xs rounded-lg border border-[#2a2a2a] hover:bg-[#1d1d1d] disabled:opacity-50";
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            title={title}
            className={`${base} ${outline ? outlineMap[outline] : ""} ${square}`}
        >
            {children}
        </button>
    );
}
