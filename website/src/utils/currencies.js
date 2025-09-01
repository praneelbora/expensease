// utils/currencies.js
import currencies from "../assets/currencies.json"; // adjust path

// quick lookup by code
const currencyMap = {};
currencies.forEach(c => {
    currencyMap[c.code] = c;
});

export const getCurrency = (code = "INR") => currencyMap[code];

export const getSymbol = (code = "INR") =>
    currencyMap[code]?.symbol || currencyMap[code]?.symbolNative || "";

export const getDigits = (code = "INR") =>
    currencyMap[code]?.decimalDigits ?? 2;

export const formatMoney = (code, v = 0) => {
    const c = currencyMap[code];
    const symbol = c?.symbolNative || c?.symbol || "";
    const digits = c?.decimalDigits ?? 2;
    return `${symbol} ${Number(v || 0).toFixed(digits)}`;
};

export const allCurrencies = currencies;

/**
 * Returns all ISO currency codes.
 */
export const getAllCurrencyCodes = () =>
    currencies.map(c => c.code);

/**
 * Convert currency codes into nice Select options.
 * Each option: { value, label, symbol, name, trigger }
 */
export const toCurrencyOptions = (codes, locale = "en-IN") => {
    return codes
        .map(code => {
            const c = currencyMap[code];
            if (!c) return null;
            return {
                value: code,
                symbol: c.symbolNative || c.symbol || "",
                name: c.name,
                // long label in menu: "₹ INR — Indian Rupee"
                label: `${c.name} (${c.symbol || c.symbolNative || ""})`,
                // short trigger label: "₹ INR"
                trigger: `${c.symbolNative || c.symbol || ""} ${code}`,
            };
        })
        .filter(Boolean);
};
