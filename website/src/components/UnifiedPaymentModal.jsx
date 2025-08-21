
// components/UnifiedPaymentModal.jsx
import { useEffect, useMemo, useState } from "react";
import ModalWrapper from "./ModalWrapper";

// Money fmt (safe fallback)
const fmtMoney = (amount = 0, currency = "INR", locale) => {
    try {
        return new Intl.NumberFormat(locale, { style: "currency", currency }).format(Number(amount || 0));
    } catch {
        return `${currency} ${Number(amount || 0).toFixed(2)}`;
    }
};

/**
 * privacy:
 *  - "private": show identifiers (last4, UPI handle), default badges, balances
 *  - "shared":  hide identifiers + balances (safe for showing in a group)
 *
 * context:
 *  - "personal": simple modes list (Cash/UPI/Card...) — we render minimal rows
 *  - "split":    rich payment accounts (bank/card/upi...) — we render enhanced rows
 */
export default function UnifiedPaymentModal({
    show,
    onClose,
    options = [],         // mixed: simple {value,label} OR PaymentMethod docs
    value,                // selected id/value
    onSelect,             // (id)=>void

    // Advanced (for split context)
    context = "personal", // "personal" | "split"
    privacy = "private",  // "private" | "shared"
    preferredPaymentMethodIds = [],
    onTogglePreferred,    // (id, bool) => void  (not rendered in UI here; kept for future)
    displayCurrency,
    defaultSendId,
    defaultReceiveId,
    paymentMethodRedirect, // () => void

    title,                // optional; overrides computed title
}) {
    const [query, setQuery] = useState("");

    useEffect(() => {
        if (show) setQuery("");
    }, [show]);
    useEffect(() => {
        if (options?.length === 1) {
            const only = options[0];
            const id = only._id ?? only.value;
            if (id) onSelect?.(id, false);
        }
    }, [options, onSelect]);

    // Detect if an option looks like a rich PaymentMethod
    const isPaymentMethodShape = (o) =>
        o && (o.type || o.upi || o.bank || o.card || o.provider || o.balances);

    // Normalize both simple + rich shapes
    const normalizeOption = (raw) => {
        // Simple shape (personal modes)
        if (!isPaymentMethodShape(raw)) {
            const val = raw._id ?? raw.value ?? raw.label;
            return {
                kind: "simple",
                value: String(val),
                label: raw.label ?? String(val),
                // minimal searchable text
                meta: `${raw.label ?? val}`.toLowerCase(),
            };
        }

        // Rich shape (split payment accounts)
        const value = String(raw._id ?? raw.value);
        const type = raw.type || "method";
        const label = raw.label || raw.nickname || raw.name || (type?.toUpperCase());
        const provider = raw.provider || "manual";
        const status = raw.status || "unverified";
        const isDefaultSend = !!raw.isDefaultSend;
        const isDefaultReceive = !!raw.isDefaultReceive;
        const defaultCurrency = (raw.defaultCurrency || "INR").toUpperCase();

        const balances = raw.balances;
        const upiHandle = raw.upi?.handle || raw.upiHandle;
        const bank = raw.bank || {};
        const card = raw.card || {};

        // Build privacy-aware searchable meta (avoid leaking identifiers when shared)
        const metaParts = [label, type, provider, status, defaultCurrency];
        if (privacy === "private") {
            metaParts.push(
                upiHandle,
                bank?.ifsc,
                bank?.accountLast4,
                card?.brand,
                card?.last4
            );
        }
        const meta = metaParts.filter(Boolean).join(" ").toLowerCase();

        return {
            kind: "rich",
            value,
            label,
            type,
            provider,
            status,
            isDefaultSend,
            isDefaultReceive,
            defaultCurrency,
            balances,
            upiHandle,
            bank,
            card,
            meta,
        };
    };
    const normalized = useMemo(() => (options || []).map(normalizeOption), [options]);

    // Maps + sets
    const byId = useMemo(() => {
        const m = new Map();
        normalized.forEach((o) => m.set(String(o.value), o));
        return m;
    }, [normalized]);

    const preferredSet = useMemo(
        () => new Set((preferredPaymentMethodIds || []).map(String)),
        [preferredPaymentMethodIds]
    );

    // Quick picks (only meaningful for rich methods)
    const quickPicks = useMemo(() => {
        if (context !== "split") return [];
        const orderIds = [];

        if (defaultSendId) orderIds.push(String(defaultSendId));
        if (defaultReceiveId) orderIds.push(String(defaultReceiveId));

        normalized.forEach((o) => {
            if (o.kind !== "rich") return;
            if (o.isDefaultSend) orderIds.push(String(o.value));
            if (o.isDefaultReceive) orderIds.push(String(o.value));
        });

        (preferredPaymentMethodIds || []).forEach((id) => {
            const sid = String(id);
            if (!orderIds.includes(sid)) orderIds.push(sid);
        });

        const seen = new Set();
        return orderIds
            .map((id) => byId.get(id))
            .filter(Boolean)
            .filter((o) => (seen.has(o.value) ? false : (seen.add(o.value), true)));
    }, [normalized, byId, defaultSendId, defaultReceiveId, preferredPaymentMethodIds, context]);

    // Search
    const q = query.trim().toLowerCase();
    const filteredAll = useMemo(() => {
        const list = q ? normalized.filter((o) => (o.meta || "").includes(q)) : normalized;
        if (!q && quickPicks.length) {
            const quickSet = new Set(quickPicks.map((o) => String(o.value)));
            return list.filter((o) => !quickSet.has(String(o.value)));
        }
        return list;
    }, [normalized, q, quickPicks]);

    const selectFirst = () => {
        const first = (q ? filteredAll : quickPicks.concat(filteredAll))[0];
        if (first) {
            onSelect?.(first.value, true);
            onClose?.();
        }
    };
    const handleEnter = (e) => { if (e.key === "Enter") selectFirst(); };

    // Privacy-aware identity summary
    const identitySummary = (opt) => {
        if (privacy === "shared") {
            // generic, no identifiers
            switch (opt.type) {
                case "upi": return "UPI";
                case "bank": return "Bank Account";
                case "card": return opt.card?.brand ? `${opt.card.brand} Card` : "Card";
                case "wallet": return "Wallet";
                case "cash": return "Cash";
                default: return (opt.type || "Method").toUpperCase();
            }
        }
        // private: show helpful hints (still masked to last4)
        switch (opt.type) {
            case "upi":
                return opt.upiHandle ? `@ ${opt.upiHandle}` : "UPI";
            case "bank": {
                const last4 = opt.bank?.accountLast4 ? `…${opt.bank.accountLast4}` : "";
                const ifsc = opt.bank?.ifsc ? ` • ${opt.bank.ifsc}` : "";
                return `A/C ${last4}${ifsc}`;
            }
            case "card": {
                const brand = opt.card?.brand || "Card";
                const last4 = opt.card?.last4 ? `…${opt.card.last4}` : "";
                const exp = (opt.card?.expMonth && opt.card?.expYear)
                    ? ` • ${String(opt.card.expMonth).padStart(2, "0")}/${String(opt.card.expYear).slice(-2)}`
                    : "";
                return `${brand} ${last4}${exp}`;
            }
            case "wallet": return "Wallet";
            case "other": return "Other";
            case "cash": return "Cash";
            default: return opt.type || "Method";
        }
    };

    // Currency-aware balance (hidden when shared)
    const getDisplayBalance = (opt) => {
        if (privacy === "shared") return null;
        const balances = opt.balances || {};
        const getFromMap = (cur) => {
            if (!balances) return undefined;
            if (balances instanceof Map) return balances.get(cur);
            return balances[cur];
        };
        const cur = (displayCurrency || opt.defaultCurrency || "INR").toUpperCase();
        let bal = getFromMap(cur);
        if (!bal && opt.defaultCurrency && opt.defaultCurrency !== cur) {
            bal = getFromMap(opt.defaultCurrency);
            if (bal) return { ...bal, currency: opt.defaultCurrency };
        }
        if (bal) return { ...bal, currency: cur };
        return null;
    };

    const Badge = ({ children }) => (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#2b2b2b] border border-[#3a3a3a] text-[#EBF1D5]">
            {children}
        </span>
    );

    const Row = ({ opt }) => {
        const isSelected = String(value) === String(opt.value);

        // Simple row (personal)
        if (opt.kind === "simple") {
            return (
                <button
                    key={opt.value}
                    onClick={() => { onSelect?.(opt.value, true); onClose?.(); }}
                    className={`w-full text-left px-3 py-2 rounded border transition
            ${isSelected ? "bg-teal-500 text-black border-teal-500" : "border-[#333] text-[#EBF1D5] hover:border-teal-600"}`}
                >
                    <div className="font-medium">{opt.label}</div>
                </button>
            );
        }

        // Rich row (split)
        const bal = getDisplayBalance(opt);
        const balText = bal ? fmtMoney(bal.available || 0, bal.currency) : null;

        // Default badges are hidden when shared (privacy)
        const showDefaults = privacy === "private";
        const isSend = defaultSendId ? String(opt.value) === String(defaultSendId) : opt.isDefaultSend;
        const isRecv = defaultReceiveId ? String(opt.value) === String(defaultReceiveId) : opt.isDefaultReceive;
        const isPreferred = preferredSet.has(String(opt.value));

        return (
            <button
                key={opt.value}
                onClick={() => { onSelect?.(opt.value, true); onClose?.(); }}
                className={`w-full px-3 py-2 rounded border text-left transition flex items-center justify-between gap-3
          ${isSelected ? "bg-teal-500 text-black border-teal-500" : "border-[#333] text-[#EBF1D5] hover:border-teal-600"}`}
            >
                <div className="min-w-0">
                    <div className="font-medium truncate">{opt.label}</div>
                    <div className={`text-xs ${isSelected ? "text-[#EBF1D5]" : "text-[#9aa08e]"} truncate`}>
                        {opt.type?.toUpperCase()} • {identitySummary(opt)}{balText ? ` • ${balText}` : ""}
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {showDefaults && isSend && <Badge>Default Send</Badge>}
                    {showDefaults && isRecv && !isSend && <Badge>Default Receive</Badge>}
                    {showDefaults && isPreferred && <Badge>Preferred</Badge>}
                </div>
            </button>
        );
    };

    if (!show) return null;

    const computedTitle =
        title ||
        (context === "personal" ? "Select Payment Mode" : "Select Payment Account");

    const isRich = normalized.some((o) => o.kind === "rich");

    return (
        <ModalWrapper
            show={show}
            onClose={onClose}
            title={computedTitle}
            footer={
                isRich && paymentMethodRedirect && (
                    <div className="w-full text-center text-sm text-[#a0a0a0]">
                        Want to add others?{" "}
                        <button className="text-teal-400 underline" onClick={paymentMethodRedirect}>
                            Add Payment Account
                        </button>
                    </div>
                )
            }
        >
            <div className="space-y-3">
                {options.length > 1 && (
                    <input
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleEnter}
                        placeholder={
                            context === "personal"
                                ? "Search payment modes…"
                                : privacy === "private"
                                    ? "Search (name, type, UPI, IFSC, last4, provider)…"
                                    : "Search methods…"
                        }
                        className="w-full bg-[#1f1f1f] text-[#EBF1D5] border border-[#2a2a2a] rounded-md p-2 outline-none focus:border-teal-600"
                    />
                )}

                {/* Quick picks (only for rich split context, no search) */}
                {context === "split" && !q && quickPicks.length > 0 && (
                    <div>
                        <div className="text-xs text-[#81827C] mb-2">Quick picks</div>
                        <div className="max-h-[30dvh] overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2 pr-1 mb-2">
                            {quickPicks.map((opt) => <Row key={opt.value} opt={opt} />)}
                        </div>
                    </div>
                )}

                {/* Full / filtered list */}
                {filteredAll.length > 0 && (
                    <div className="text-xs text-[#81827C] mb-2">
                        {context === "split" ? "All Payment Accounts" : "All Modes"}
                    </div>
                )}
                <div className="max-h-[60dvh] overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2 pr-1">
                    {filteredAll.length === 0 && (
                        <p className="text-sm text-[#81827C] col-span-2 px-1">No matches</p>
                    )}
                    {filteredAll.map((opt) => <Row key={opt.value} opt={opt} />)}
                </div>
            </div>
        </ModalWrapper>
    );
}
