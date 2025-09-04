// components/PaymentMethodCard.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { getSymbol } from "../utils/currencies";
import { Pencil, Eye, EyeOff } from "lucide-react"; // ⬅️ add icons
import { getPMIcon } from './pmIcons';

/**
 * Props:
 * - paymentMethod
 * - balancesPeek: { [paymentMethodId]: { [CCY]: { available, pending } } }
 * - onPeekBalances(id)
 * - onEdit(paymentMethod)
 * - onAddBalance?()
 * - onDelete(id)
 * - onUpdate?(id, patch)     // ⬅️ optional; used for quick visibility toggle
 */
export default function PaymentMethodCard({
    paymentMethod,
    balancesPeek = {},
    onPeekBalances,
    onEdit,
    onAddBalance,
    onDelete,
    onUpdate, // ⬅️ optional quick update handler
}) {
    const Icon = getPMIcon({ iconKey: paymentMethod.iconKey, type: paymentMethod.type });
    const a = paymentMethod ?? {};
    const peek = paymentMethod.balances;
    const currencyCode = a.defaultCurrency || "INR";
    const caps = Array.isArray(a.capabilities) ? a.capabilities : [];

    const [revealed, setRevealed] = useState(true);
    const timerRef = useRef(null);

    useEffect(() => () => timerRef.current && clearTimeout(timerRef.current), []);

    const symbol = useMemo(() => {
        try { return getSymbol?.(currencyCode) || ""; } catch { return ""; }
    }, [currencyCode]);

    const blurClass = revealed ? "blur-0 opacity-100" : "blur-sm opacity-70 select-none";

    return (
        <li className="group rounded-2xl border border-[#2a2a2a] bg-[#141414] p-4 sm:p-5 transition-colors hover:border-teal-700/40">
            {/* Header */}
            <div className="flex flex-col">
                <div className="flex flex-col gap-2">
                    <div className="flex flex-row items-start justify-between gap-3">
                        <div className="flex items-center gap-2 flex-wrap">
                            <div className="p-2 rounded-lg bg-[#262626]">
                                <Icon className="h-full w-full p-1" />
                            </div>
                            <div className="-space-y-1">
                                <h3 className="text-lg font-semibold truncate" title={a.label}>
                                    {a.label}
                                </h3>
                                {a.type.toLowerCase() === 'cash' && a.label.toLowerCase() === "cash"
                                    ? null
                                    : (a.type && <Chip className="uppercase">{a.type}</Chip>)
                                }
                            </div>
                        </div>

                        {/* Badges (defaults + visibility) */}
                        <div className="flex flex-col items-end gap-2 flex-wrap">
                            <div className="flex flex-col items-center gap-2">
                                {a.isDefaultSend && <Chip accent="teal">Expenses Default</Chip>}
                                {a.isDefaultReceive && <Chip accent="indigo">Recieving Default</Chip>}
                                {a.visibleForOthers === false && (
                                    <Chip className="bg-amber-700/25 border-amber-700/40" title="Only you can see this method">
                                        Hidden from others
                                    </Chip>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Balances preview (your existing UI) */}
                {Object.entries(peek || {}).length > 0 && (
                    <div className="flex flex-col mt-2">
                        <span className="text-sm font-medium text-[#b9c29f]">Current Balances</span>
                        <div className="flex flex-wrap justify-between mt-2 ">
                            <div className="w-full flex flex-wrap gap-2">
                                {Object.entries(peek).map(([ccy, obj]) => (
                                    <div key={ccy} className="flex items-baseline gap-2 rounded-xl bg-[#181818] border border-[#2a2a2a] px-3 py-2">
                                        <span className={`text-[#cfdac0] transition ${blurClass}`}>{obj?.available ?? 0}</span>
                                        <span className="text-sm font-medium text-[#b9c29f]">{ccy}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Footer actions */}
                <div className="w-full flex flex-1 justify-between mt-2">
                    <div className="flex items-end">
                        <button
                            onClick={onAddBalance}
                            title="Add / adjust balance"
                            className="px-1 py-1 text-xs text-teal-500 border-b border-b-teal-500"
                        >
                            Edit Balances
                        </button>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                        <Btn onClick={() => onEdit?.(a)} title="Edit" square="aspect-square">
                            <Pencil width={20} height={20} />
                        </Btn>
                    </div>
                </div>
            </div>
        </li>
    );
}

/* ---------- tiny UI helpers ---------- */

function Chip({ children, accent, className = "", title }) {
    const accentMap = {
        teal: "bg-teal-700/30 border-teal-700/40",
        indigo: "bg-indigo-700/30 border-indigo-700/40",
    };
    const base = "text-[10px] px-2 py-1 rounded-full border border-[#2a2a2a] text-[#e7f0d7]";
    return (
        <span className={`${base} ${accent ? accentMap[accent] : ""} ${className}`} title={title}>
            {children}
        </span>
    );
}

function Btn({ children, onClick, disabled, title, outline, square }) {
    const outlineMap = {
        teal: "border-teal-700/60 text-teal-300 hover:bg-[#1a2f2f]",
        red: "border-red-800/60 text-red-300 hover:bg-[#2a1212]",
    };
    const base = "p-2 text-xs rounded-lg border border-[#2a2a2a] hover:bg-[#1d1d1d] disabled:opacity-50";
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
