// components/PaymentMethodBalanceBottomSheet.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import MainBottomSheet from "./mainBottomSheet"; // same pattern as your other sheet
// import CurrencyModal from "./CurrencyModal"; // RN currency picker bottom sheet/modal
// import CustomSelect from "./CustomSelect"; // RN select (or use RN Picker)
import { getSymbol } from "../utils/currencies";
import { useTheme } from "context/ThemeProvider";
import SheetCurrencies from "~/shtCurrencies";
/**
 * Props:
 * - innerRef (ref passed to MainBottomSheet)
 * - onClose()
 * - show (optional boolean — if you use show pattern instead of ref)
 * - method (payment account object)
 * - defaultCurrency (string)
 * - preferredCurrencies = []
 * - currencyOptions = [{value:'INR', label: 'INR (₹)'}]
 * - onSubmit({ action, currency, amountMajor, bucket }) => Promise<void>
 */
export default function PaymentMethodBalanceBottomSheet({
    innerRef,
    onClose,
    method,
    defaultCurrency = "INR",
    preferredCurrencies = [],
    currencyOptions = [],
    onSubmit,
}) {
    const insets = useSafeAreaInsets();
    const { theme } = useTheme();
    const colors = theme?.colors || {};
    const styles = useMemo(() => createStyles(colors), [colors]);

    const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
    const [currency, setCurrency] = useState(() =>
        (method?.defaultCurrency || defaultCurrency || "INR").toUpperCase()
    );
    const [amountMajor, setAmountMajor] = useState("");
    const [action, setAction] = useState("credit"); // credit | debit
    const [bucket, setBucket] = useState("available"); // optional
    const [submitting, setSubmitting] = useState(false);
    const currencySheetRef = useRef(null)
    useEffect(() => {
        // reset when sheet opens/changes
        setAction("credit");
        setAmountMajor("");
        setCurrency((method?.defaultCurrency || defaultCurrency || "INR").toUpperCase());
        setBucket("available");
    }, [method, defaultCurrency]);

    // Build usable currency options (unique + sensible order)
    const usableOptions = useMemo(() => {
        const codes = new Set(
            [
                method?.defaultCurrency,
                ...(method?.supportedCurrencies || []),
                ...Object.keys(method?.balances || {}),
                defaultCurrency,
                ...currencyOptions.map((o) => o.value),
            ]
                .filter(Boolean)
                .map((c) => String(c).toUpperCase())
        );

        const arr = Array.from(codes)
            .sort()
            .map((code) => ({
                value: code,
                label: `${code}${getSymbol(code) ? ` (${getSymbol(code)})` : ""}`,
            }));

        // Put preferred currencies first if present
        if (preferredCurrencies.length) {
            const preferredSet = new Set(preferredCurrencies.map((c) => String(c).toUpperCase()));
            const pref = arr.filter((a) => preferredSet.has(a.value));
            const rest = arr.filter((a) => !preferredSet.has(a.value));
            return [...pref, ...rest];
        }
        return arr;
    }, [method, defaultCurrency, currencyOptions, preferredCurrencies]);

    const canPickBucket = action === "credit" || action === "debit";

    const submit = async () => {
        const amt = Number(amountMajor);
        if (!currency) return alert("Choose a currency");
        if (!amt || isNaN(amt) || amt <= 0) return alert("Enter a valid amount");
        try {
            setSubmitting(true);
            console.log({ action, currency, amountMajor: amt, bucket });

            await onSubmit?.({ action, currency, amountMajor: amt, bucket });
            // dismiss sheet after successful submit if ref available
            innerRef?.current?.dismiss?.();
            onClose?.();
        } catch (err) {
            console.error(err);
            alert(err?.message || "Failed to update balance");
        } finally {
            setSubmitting(false);
        }
    };

    // If you're using show boolean pattern instead of ref, you can early return null here —
    // but since the project uses MainBottomSheet + ref, we render the sheet container.
    return (
        <MainBottomSheet innerRef={innerRef} onDismiss={onClose}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
                <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                    <Text style={styles.headerText}>
                        {`Credit or Debit — ${method?.label ?? ""}`}
                    </Text>
                    <TouchableOpacity onPress={() => innerRef?.current?.dismiss?.()} style={styles.closeBtn}>
                        <Text style={styles.closeText}>Cancel</Text>
                    </TouchableOpacity>
                </View>

                <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}>
                    {/* Currency row */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Currency</Text>
                        <TouchableOpacity
                            onPress={() => currencySheetRef?.current?.present()}
                            style={[styles.rowButton]}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.rowButtonText}>{currency}</Text>
                            <Feather name="chevron-down" size={18} color={colors.muted || "#aaa"} />
                        </TouchableOpacity>

                        {/* Action (credit/debit) */}
                        <Text style={[styles.sectionTitle, { marginTop: 12 }]}>Action</Text>
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                            {["credit", "debit"].map((a) => {
                                const active = a === action;
                                return (
                                    <TouchableOpacity
                                        key={a}
                                        onPress={() => setAction(a)}
                                        style={[styles.chip, active && styles.chipActive]}
                                        activeOpacity={0.8}
                                    >
                                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                                            {a.toUpperCase()}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        {/* Amount */}
                        <Text style={[styles.sectionTitle, { marginTop: 12 }]}>
                            Amount ({getSymbol(currency) || currency})
                        </Text>
                        <TextInput
                            keyboardType="decimal-pad"
                            style={styles.input}
                            placeholder="0.00"
                            placeholderTextColor={colors.muted || "#777"}
                            value={amountMajor}
                            onChangeText={setAmountMajor}
                        />
                    </View>

                    {/* Footer buttons */}
                    <View style={{ marginTop: 12, flexDirection: "row", gap: 8 }}>
                        <TouchableOpacity
                            onPress={() => innerRef?.current?.dismiss?.()}
                            style={[styles.btn, styles.btnMuted]}
                        >
                            <Text style={styles.closeText}>Cancel</Text>
                        </TouchableOpacity>

                        <View style={{ flex: 1 }} />

                        <TouchableOpacity
                            onPress={submit}
                            style={[styles.btn, submitting && styles.btnDisabled]}
                            disabled={submitting}
                        >
                            {submitting ? (
                                <ActivityIndicator color={colors.text || "#fff"} />
                            ) : (
                                <Text style={[styles.btnText, { color: "#121212" }]}>Update</Text>
                            )}
                        </TouchableOpacity>
                    </View>

                    <View style={{ height: insets.bottom + 16 }} />
                </ScrollView>
            </KeyboardAvoidingView>
            <SheetCurrencies innerRef={currencySheetRef} value={currency} options={currencyOptions} onSelect={setCurrency} onClose={() => { }} />
            {/* currency picker bottom sheet / modal */}
            {/* <CurrencyModal
        show={showCurrencyPicker}
        onClose={() => setShowCurrencyPicker(false)}
        options={usableOptions}
        value={currency}
        onSelect={(v) => {
          setCurrency(String(v).toUpperCase());
          setShowCurrencyPicker(false);
        }}
        defaultCurrency={method?.defaultCurrency || defaultCurrency}
        preferredCurrencies={preferredCurrencies}
      /> */}
        </MainBottomSheet>
    );
}

/* styles (matching the theme and your other bottom sheet) */
const createStyles = (c = {}) =>
    StyleSheet.create({
        header: {
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingBottom: 12,
            borderBottomWidth: 2,
            borderBottomColor: c.border || "#333",
        },
        headerText: { color: c.text || "#EBF1D5", fontSize: 16, fontWeight: "700" },
        closeBtn: { padding: 4 },

        section: { paddingHorizontal: 0, paddingTop: 12 },

        sectionTitle: {
            color: c.text || "#EBF1D5",
            fontSize: 13,
            fontWeight: "700",
            marginBottom: 8,
        },

        input: {
            backgroundColor: c.cardAlt || "#1f1f1f",
            color: c.text || "#EBF1D5",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: c.border || "#55554f",
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontSize: 15,
            marginBottom: 12,
        },

        rowButton: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: c.cardAlt || "transparent",
            borderBottomWidth: 1,
            borderColor: c.border || "#55554f",
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderRadius: 8,
        },
        rowButtonText: { color: c.text || "#EBF1D5", fontSize: 16 },

        chip: {
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: c.border || "#444",
            marginRight: 8,
        },
        chipActive: { backgroundColor: c.primary || "#60DFC9", borderColor: c.primary || "#60DFC9" },
        chipText: { color: c.text || "#EBF1D5", fontSize: 12 },
        chipTextActive: { color: c.card || "#121212", fontWeight: "700" },

        btn: {
            borderRadius: 8,
            paddingVertical: 12,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 14,
            minWidth: 90,
            backgroundColor: c.primary || "#60DFC9",
        },
        closeText: { color: c.negative || "#EA4335", fontSize: 16 },
        btnText: { fontWeight: "700" },
        btnMuted: { backgroundColor: c.cardAlt || "#2a2a2a", borderWidth: 1, borderColor: c.border || "#444" },
        btnDisabled: { backgroundColor: c.border || "#555", opacity: 0.8 },
    });
