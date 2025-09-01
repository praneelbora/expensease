// components/CurrencySelect.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import CustomSelect from "./CustomSelect";
import { getSymbol, getDigits, formatMoney, allCurrencies } from "../utils/currencies";

export default function CurrencySelect({
    value,
    onChange,
    locale = (typeof navigator !== "undefined" ? navigator.language : "en-IN"),
    placeholder = "Select currency...",
    className = "",
    disabled = false,
    maxMenuHeight = 280,
    // optional persistence / defaults
    persistKey = "prefCurrency",
    userDefaultCode, // pass user's saved currency code from backend if you have it
}) {
    const [opts, setOpts] = useState([]);
    const inittedRef = useRef(false);

    // Build options once (or when locale changes)
    useEffect(() => {
        const codes = getAllCurrencyCodes();
        // toCurrencyOptions returns { value, label, symbol, name, trigger }
        const options = toCurrencyOptions(codes, locale)
            // de-dupe & sort by name for nicer UX
            .filter((v, i, a) => a.findIndex(x => x.value === v.value) === i)
            .sort((a, b) => a?.name?.localeCompare(b?.name, locale));
        setOpts(options);
    }, [locale]);

    // Auto-select default if none is chosen yet
    useEffect(() => {
        if (inittedRef.current || !opts.length) return;
        inittedRef.current = true;

        // priority: prop -> localStorage -> region guess -> 'USD'
        const fromProp = userDefaultCode;
        const fromLS =
            typeof window !== "undefined" ? localStorage.getItem(persistKey) : null;

        const region =
            (typeof Intl !== "undefined" &&
                typeof Intl.Locale === "function" &&
                new Intl.Locale(locale).maximize().region) ||
            (locale.split("-")[1] || "").toUpperCase();

        const regionToCurrency = {
            IN: "INR",
            US: "USD",
            GB: "GBP",
            EU: "EUR",
            AE: "AED",
            SG: "SGD",
            AU: "AUD",
            CA: "CAD",
            JP: "JPY",
            CH: "CHF",
            CN: "CNY",
        };

        const guess = regionToCurrency[region] || "USD";

        const pick = [fromProp, fromLS, guess].find(
            c => c && opts.some(o => o.value === c)
        );
        if (!value && pick) onChange(pick);
    }, [opts, value, onChange, userDefaultCode, persistKey, locale]);

    // Persist on change (local quick win; you can also call your API here)
    useEffect(() => {
        if (!value) return;
        try {
            if (typeof window !== "undefined") {
                localStorage.setItem(persistKey, value);
            }
        } catch { }
    }, [value, persistKey]);

    const renderTriggerLabel = useMemo(() => {
        return (opt) => (opt ? `${opt.symbol} ${opt.value}` : "");
    }, []);

    return (
        <CustomSelect
            value={value}
            onChange={onChange}
            options={opts} // open menu shows long label: "₹ INR — Indian Rupee"
            placeholder={placeholder}
            className={className}
            disabled={disabled}
            maxMenuHeight={maxMenuHeight}
            // closed trigger shows short label: "₹ INR"
            renderTriggerLabel={renderTriggerLabel}
        />
    );
}
