import React, { useMemo } from "react";
import ModalWrapper from "./ModalWrapper";

export default function BalancesModal({
    show,
    onClose,
    method,                 // payment account object
    manageRedirect,         // optional: () => void
}) {
    if (!show || !method) return null;

    const defaultCode = String(method?.defaultCurrency || "").toUpperCase();
    const entries = useMemo(() => {
        const b = method?.balances || {};
        const arr = Object.entries(b).map(([ccy, v]) => ({
            ccy: String(ccy).toUpperCase(),
            available: v?.available ?? 0,
            pending: v?.pending ?? 0,
        }));
        return arr.sort((a, b) => {
            if (a.ccy === defaultCode) return -1;
            if (b.ccy === defaultCode) return 1;
            return a.ccy.localeCompare(b.ccy);
        });
    }, [method, defaultCode]);

    const Badge = ({ children }) => (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#2b2b2b] border border-[#3a3a3a] text-[#EBF1D5]">
            {children}
        </span>
    );

    const formatMoney = (ccy, value = 0) => {
        try {
            return new Intl.NumberFormat(undefined, {
                style: "currency",
                currency: ccy,
            }).format(value);
        } catch {
            // fallback for exotic/crypto codes not in Intl
            const num = typeof value === "number" ? value.toLocaleString() : value;
            return `${num} ${ccy}`;
        }
    };

    const CurrencyRow = ({ e }) => (
        <div className="bg-[#1f1f1f] rounded-xl p-3 border border-[#333] flex items-center justify-between">
            <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{e.ccy}</span>
                {e.ccy === defaultCode && <Badge>Default</Badge>}
            </div>
            <div className="text-right">
                <div className="text-xs text-[#aaa]">Available</div>
                <div className="text-base font-semibold">{formatMoney(e.ccy, e.available)}</div>
            </div>
        </div>
    );

    return (
        <ModalWrapper
            show={show}
            onClose={onClose}
            title={`Balances — ${method?.label ?? ""}`}
            footer={
                manageRedirect && (
                    <div className="w-full text-center text-sm text-[#a0a0a0]">
                        Want to manage this method?{" "}
                        <button className="text-teal-400 underline" onClick={manageRedirect}>
                            Open Settings
                        </button>
                    </div>
                )
            }
        >

            <div className="space-y-2 max-h-[50dvh] overflow-y-auto pr-1">
                {entries.length ? (
                    entries.map((e) => <CurrencyRow key={e.ccy} e={e} />)
                ) : (
                    <p className="text-sm text-[#81827C]">No balances tracked for this method.</p>
                )}
            </div>
        </ModalWrapper>
    );
}
