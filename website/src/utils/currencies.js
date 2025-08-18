// utils/currencies.js
const FALLBACK_CODES = [
    "INR", "USD", "EUR", "GBP", "JPY", "AUD", "CAD", "SGD", "CHF", "CNY", "HKD", "AED", "SAR", "NZD", "SEK", "NOK", "DKK", "ZAR", "THB", "MYR", "PHP", "IDR", "KRW", "BRL", "MXN"
];

export function getAllCurrencyCodes() {
    try {
        if (typeof Intl?.supportedValuesOf === "function") {
            return Intl.supportedValuesOf("currency"); // active ISO-4217 codes
        }
    } catch { }
    return FALLBACK_CODES;
}

export function getSymbol(locale, code) {
    try {
        const parts = new Intl.NumberFormat(locale, {
            style: "currency",
            currency: code,
            currencyDisplay: "symbol",
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).formatToParts(0);
        return parts.find(p => p.type === "currency")?.value ?? code;
    } catch {
        return code;
    }
}

// utils/currencies.js (add this)
export function formatCurrency(amount, code, locale = (typeof navigator !== "undefined" ? navigator.language : "en-IN")) {
    try {
        return new Intl.NumberFormat(locale, {
            style: "currency",
            currency: code,
            currencyDisplay: "symbol", // 'symbol' || 'narrowSymbol'
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(Number(amount) || 0);
    } catch {
        const symbol = getSymbol(locale, code);
        const n = (Number(amount) || 0).toFixed(2);
        return `${symbol} ${" "} ${n}`;
    }
}

export function toCurrencyOptions(codes, locale = (typeof navigator !== "undefined" ? navigator.language : "en-IN")) {
    const dn = (() => {
        try { return new Intl.DisplayNames([locale], { type: "currency" }); }
        catch { return null; }
    })();

    return codes.map(code => {
        const symbol = getSymbol(locale, code);
        const name = (dn?.of?.(code)) || code;
        return {
            value: code,
            label: `${symbol} — ${name} (${code})`, // shown in the OPEN menu
            symbol,
            name,
            trigger: `${symbol} ${code}`,        // for the CLOSED trigger
        };
    });
}
