// components/CurrencyModal.jsx
import { useEffect, useMemo, useState } from "react";
import ModalWrapper from "./ModalWrapper";

export default function CurrencyModal({
    show,
    onClose,
    options = [],
    value,
    onSelect,
    // NEW:
    defaultCurrency,
    preferredCurrencies = [],
    onTogglePreferred, // optional: (code, shouldBePreferred) => void
    currencyRedirect
}) {
    const [query, setQuery] = useState("");

    useEffect(() => {
        if (show) setQuery("");
    }, [show]);

    const preferredSet = useMemo(
        () => new Set((preferredCurrencies || []).map((c) => String(c).toUpperCase())),
        [preferredCurrencies]
    );
    const defaultCode = (defaultCurrency || "").toUpperCase();

    const byCode = useMemo(() => {
        const m = new Map();
        (options || []).forEach((o) => m.set(String(o.value).toUpperCase(), o));
        return m;
    }, [options]);

    // Quick picks = default + preferred (deduped, existing in options)
    const quickPicks = useMemo(() => {
        const order = [
            ...(defaultCode ? [defaultCode] : []),
            ...Array.from(preferredSet),
        ];
        const seen = new Set();
        return order
            .map((code) => byCode.get(code))
            .filter(Boolean)
            .filter((o) => (seen.has(o.value) ? false : (seen.add(o.value), true)));
    }, [defaultCode, preferredSet, byCode]);

    const q = query.trim().toLowerCase();
    const filteredAll = useMemo(() => {
        const base = q
            ? options.filter((opt) =>
                `${opt.label} ${opt.value}`.toLowerCase().includes(q)
            )
            : options;

        // When no search, avoid duplicating quick picks in the full list
        if (!q && quickPicks.length) {
            const quickSet = new Set(quickPicks.map((o) => o.value));
            return base.filter((o) => !quickSet.has(o.value));
        }
        return base;
    }, [options, q, quickPicks]);

    const handleEnter = (e) => {
        if (e.key === "Enter") {
            const first = (q ? filteredAll : quickPicks.concat(filteredAll))[0];
            if (first) {
                onSelect(first.value);
                onClose?.();
            }
        }
    };

    const Badge = ({ children }) => (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#2b2b2b] border border-[#3a3a3a] text-[#EBF1D5]">
            {children}
        </span>
    );

    const Row = ({ opt }) => {
        const isSelected = value === opt.value;
        const isDefault = opt.value.toUpperCase() === defaultCode;
        const isPreferred = preferredSet.has(opt.value.toUpperCase());

        return (
            <button
                key={opt.value}
                onClick={() => {
                    onSelect(opt.value);
                    onClose?.();
                }}
                className={`w-full px-3 py-2 rounded border text-left transition flex items-center justify-between gap-3
          ${isSelected ? "bg-teal-500 text-black border-teal-500" : "border-[#333] text-[#EBF1D5] hover:border-teal-600"}`}
            >
                <span className="font-medium">{opt.label}</span>
                <div className="flex items-center gap-2">
                    {isDefault && <Badge>Default</Badge>}
                    {isPreferred && !isDefault && <Badge>Preferred</Badge>}
                    {typeof onTogglePreferred === "function" && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onTogglePreferred(opt.value, !isPreferred);
                            }}
                            className={`text-[11px] px-2 py-1 rounded border ${isPreferred
                                ? "border-teal-600 text-teal-400 hover:bg-[#133]"
                                : "border-[#3a3a3a] text-[#9aa] hover:border-teal-600"
                                }`}
                            aria-label={isPreferred ? "Remove from preferred" : "Add to preferred"}
                            title={isPreferred ? "Remove from preferred" : "Add to preferred"}
                        >
                            {isPreferred ? "Remove" : "Add"}
                        </button>
                    )}
                </div>
            </button>
        );
    };

    if (!show) return null;

    return (
        <ModalWrapper
            show={show}
            onClose={onClose}
            title="Select Currency"
            footer={currencyRedirect && <div className="w-full text-center text-sm text-[#a0a0a0]">
                Want to change default currency?{" "}
                <button
                    className="text-teal-400 underline"
                    onClick={currencyRedirect}
                >
                    Change Currency
                </button>
            </div>}
        >
            <div className="space-y-3">
                <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleEnter}
                    placeholder="Search currencies (e.g., INR, USD)…"
                    className="w-full bg-[#1f1f1f] text-[#EBF1D5] border border-[#2a2a2a] rounded-md p-2 outline-none focus:border-teal-600"
                />

                {/* Quick picks */}
                {!q && quickPicks.length > 0 && (
                    <div>
                        <div className="text-xs text-[#81827C] mb-2">Quick picks</div>
                        <div className="max-h-[30dvh] overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2 pr-1 mb-2">
                            {quickPicks.map((opt) => <Row key={opt.value} opt={opt} />)}
                        </div>
                    </div>
                )}
                <div className="text-xs text-[#81827C] mb-2">Other Currencies</div>
                {/* Full / filtered list */}
                <div className="max-h-[40dvh] overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2 pr-1">
                    {filteredAll.length === 0 && (
                        <p className="text-sm text-[#81827C] col-span-2 px-1">No matches</p>
                    )}
                    {filteredAll.map((opt) => <Row key={opt.value} opt={opt} />)}
                </div>
            </div>

        </ModalWrapper>
    );
}
