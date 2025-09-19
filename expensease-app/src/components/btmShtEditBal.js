// components/PaymentMethodBalanceBottomSheet.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import BottomSheetLayout from "./btmShtHeaderFooter"; // <--- use the reusable layout
import { getSymbol } from "../utils/currencies";
import { useTheme } from "context/ThemeProvider";
import SheetCurrencies from "~/shtCurrencies";
import ChevronDown from "@/accIcons/chevronDown.svg"; // should exist in your accIcons folder
/**
 * Props:
 * - innerRef (ref passed to MainBottomSheet)
 * - onClose()
 * - method (payment account object)
 * - defaultCurrency (string)
 * - preferredCurrencies = []
 * - currencyOptions = []
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
  const currencySheetRef = useRef(null);

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

    if (preferredCurrencies.length) {
      const preferredSet = new Set(preferredCurrencies.map((c) => String(c).toUpperCase()));
      const pref = arr.filter((a) => preferredSet.has(a.value));
      const rest = arr.filter((a) => !preferredSet.has(a.value));
      return [...pref, ...rest];
    }
    return arr;
  }, [method, defaultCurrency, currencyOptions, preferredCurrencies]);

  const submit = async () => {
    const amt = Number(amountMajor);
    if (!currency) return alert("Choose a currency");
    if (!amt || isNaN(amt) || amt <= 0) return alert("Enter a valid amount");
    try {
      setSubmitting(true);
      await onSubmit?.({ action, currency, amountMajor: amt, bucket });
      innerRef?.current?.dismiss?.();
      onClose?.();
    } catch (err) {
      console.error(err);
      alert(err?.message || "Failed to update balance");
    } finally {
      setSubmitting(false);
    }
  };

  const title = `Credit / Debit — ${method?.label ?? ""}`;

  return (
    <BottomSheetLayout
      innerRef={innerRef}
      title={title}
      onClose={onClose}
      footerOptions={{
        showDelete: false,
        onDelete: null,
        deleteLabel: "Delete",
        onCancel: () => {
          innerRef?.current?.dismiss?.();
        },
        cancelLabel: "Cancel",
        primaryLabel: "Update",
        onPrimary: submit,
        primaryDisabled: submitting,
        busy: submitting,
      }}
    >
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={{ paddingHorizontal: 0 }}>
          {/* Currency row */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Currency</Text>
            <TouchableOpacity
              onPress={() => currencySheetRef?.current?.present?.()}
              style={[styles.rowButton]}
              activeOpacity={0.8}
            >
              <Text style={styles.rowButtonText}>{currency}</Text>
              <ChevronDown width={16} height={16} color={colors.muted || "#aaa"} />
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

          {/* Small spacer so content not flush to footer */}
          <View style={{ height: insets.bottom + 12 }} />
        </View>
      </KeyboardAvoidingView>

      <SheetCurrencies
        innerRef={currencySheetRef}
        value={currency}
        options={usableOptions}
        onSelect={(v) => {
          setCurrency(String(v).toUpperCase());
        }}
        onClose={() => {}}
      />
    </BottomSheetLayout>
  );
}

/* styles (matching the theme and your other bottom sheet) */
const createStyles = (c = {}) =>
  StyleSheet.create({
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
