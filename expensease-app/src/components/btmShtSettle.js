// components/ShtSettle.jsx
import React, { useState, useEffect, useMemo, useRef } from "react";
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MainBottomSheet from "./mainBottomSheet";
import { getSymbol } from "utils/currencies";
import CurrenciesSheet from "./shtCurrencies";

const ShtSettle = ({
    innerRef,
    transactions = [],
    onSubmit,
    onSubmitAll,
    onClose,
    group,
    userId,
    friends = [],
    prefill,
    currencyOptions = [],
    defaultCurrency = "INR",
    preferredCurrencies = [],
}) => {
    const insets = useSafeAreaInsets();
    const [confirming, setConfirming] = useState(false);

    const [payerId, setPayerId] = useState("");
    const [receiverId, setReceiverId] = useState("");
    const [amount, setAmount] = useState("");
    const [description, setDescription] = useState("");
    const [currency, setCurrency] = useState(defaultCurrency);
    const [settleMode, setSettleMode] = useState("suggested");
    const [selectedTxnIndex, setSelectedTxnIndex] = useState(null);
    const [confirmationVisible, setConfirmationVisible] = useState(false);

    // refs for nested sheets
    const payerSheetRef = useRef(null);
    const receiverSheetRef = useRef(null);
    const currencySheetRef = useRef(null);

    const members = useMemo(() => {
        if (group?.members?.length) {
            return group.members.map((m) => ({ value: m._id, label: m.name }));
        }
        return friends.map((m) => ({ value: m.id, label: m.name }));
    }, [group, friends]);

    const getMemberName = (id) => {
        if (!id) return "Unknown";
        const m = members.find((x) => x.value === id);
        if (!m) return "Unknown";
        return m.value === userId ? "You" : m.label || "Unknown";
    };
    const resetForm = () => {
        setPayerId("");
        setReceiverId("");
        setAmount("");
        setDescription("");
        setCurrency(defaultCurrency);
        setSettleMode("suggested");
        setSelectedTxnIndex(null);
        setConfirmationVisible(false);
    };


    const handlePrefill = (txn) => {
        setPayerId(txn.from);
        setReceiverId(txn.to);
        setAmount(Number(txn.amount || 0).toFixed(2));
        setCurrency(txn.currency);
        setDescription(`Settling between ${getMemberName(txn.from)} and ${getMemberName(txn.to)}`);
    };

    useEffect(() => {
        if (prefill) {
            setPayerId(prefill.payerId || "");
            setReceiverId(prefill.receiverId || "");
            setAmount(Number(prefill.amount || 0) > 0 ? Number(prefill.amount).toFixed(2) : "");
            setDescription(prefill.description || "");
            setCurrency(prefill.currency || defaultCurrency);
            setSettleMode("custom");
        } else {
            resetForm();
        }
    }, [prefill, defaultCurrency]);

    const isValid =
        payerId &&
        receiverId &&
        payerId !== receiverId &&
        Number(amount) > 0 &&
        !Number.isNaN(Number(amount));

    const getConfirmationText = () => {
        if (!isValid) return "";
        const payerName = getMemberName(payerId);
        const receiverName = getMemberName(receiverId);
        if (payerName === "You") return `You paid ${receiverName}`;
        if (receiverName === "You") return `${payerName} paid You`;
        return `${payerName} paid ${receiverName}`;
    };

    const handleFinalSubmit = async () => {
        if (!isValid) return;
        setConfirming(true);
        try {
            await onSubmit({
                payerId,
                receiverId,
                amount: parseFloat(amount),
                description,
                currency,
            });
            resetForm(); // ✅ reset after success
        } finally {
            setConfirming(false);
            onClose();
            innerRef.current?.dismiss();
        }
    };

    const handleSettleAll = async () => {
        setConfirming(true);
        try {
            await onSubmitAll?.();
            resetForm(); // ✅ reset after settle all
        } finally {
            setConfirming(false);
            onClose();
            innerRef.current?.dismiss();
        }
    };


    return (
        <MainBottomSheet innerRef={innerRef} onDismiss={() => { resetForm(); onClose?.(); }}>
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                <Text style={styles.headerText}>Settle Up</Text>
                <TouchableOpacity onPress={() => {
                    resetForm();
                    innerRef.current?.dismiss()
                }}>
                    <Text style={styles.closeText}>Close</Text>
                </TouchableOpacity>
            </View>

            {/* Body */}
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{
                    paddingBottom: insets.bottom + 100,
                    paddingHorizontal: 16,
                }}
                showsVerticalScrollIndicator={false}
            >
                {confirmationVisible ? (
                    <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 24 }}>
                        <Text style={styles.confirmText}>{getConfirmationText()}</Text>
                        <Text style={styles.confirmAmount}>
                            {getSymbol(currency)} {Number(amount || 0).toFixed(2)}
                        </Text>
                        {description ? <Text style={styles.confirmDesc}>{description}</Text> : null}
                    </View>
                ) : (
                    <>
                        {/* Mode Switch */}
                        <View style={styles.modeSwitch}>
                            <TouchableOpacity
                                style={[styles.modeBtn, settleMode === "suggested" && styles.modeBtnActive]}
                                onPress={() => setSettleMode("suggested")}
                            >
                                <Text style={[styles.modeText, settleMode === "suggested" && styles.modeTextActive]}>
                                    Suggested
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modeBtn, settleMode === "custom" && styles.modeBtnActive]}
                                onPress={() => setSettleMode("custom")}
                            >
                                <Text style={[styles.modeText, settleMode === "custom" && styles.modeTextActive]}>
                                    Custom
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {/* Suggested Mode */}
                        {settleMode === "suggested" ? (
                            <>
                                <Text style={styles.sectionLabel}>Suggested Settlements</Text>
                                {transactions.length ? (
                                    transactions.map((txn, idx) => {
                                        const amt = Number(txn.amount || 0).toFixed(2);
                                        const curr = txn.currency;
                                        const isSelected = idx === selectedTxnIndex;
                                        return (
                                            <TouchableOpacity
                                                key={idx}
                                                onPress={() => {
                                                    setSelectedTxnIndex(idx);
                                                    handlePrefill(txn);
                                                    setConfirmationVisible(false);
                                                }}
                                                style={[styles.txRow, isSelected && styles.txRowSelected]}
                                            >
                                                <Text style={styles.txText}>
                                                    {txn.fromName} owes {txn.toName}
                                                </Text>
                                                <Text style={styles.txAmount}>
                                                    {getSymbol(curr)} {amt}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })
                                ) : (
                                    <Text style={styles.empty}>Nothing to settle — all clear! 🎉</Text>
                                )}
                            </>
                        ) : (
                            <>
                                {/* Custom Mode */}
                                <Text style={styles.sectionLabel}>Paid By</Text>
                                <TouchableOpacity style={styles.select} onPress={() => payerSheetRef.current?.present()}>
                                    <Text style={{ color: payerId ? "#EBF1D5" : "#888" }}>
                                        {payerId ? getMemberName(payerId) : "Select payer"}
                                    </Text>
                                </TouchableOpacity>

                                <Text style={styles.sectionLabel}>Received By</Text>
                                <TouchableOpacity style={styles.select} onPress={() => receiverSheetRef.current?.present()}>
                                    <Text style={{ color: receiverId ? "#EBF1D5" : "#888" }}>
                                        {receiverId ? getMemberName(receiverId) : "Select receiver"}
                                    </Text>
                                </TouchableOpacity>

                                <Text style={styles.sectionLabel}>Currency</Text>
                                <TouchableOpacity style={styles.select} onPress={() => currencySheetRef.current?.present()}>
                                    <Text style={{ color: currency ? "#EBF1D5" : "#888" }}>
                                        {currency || "Select currency"}
                                    </Text>
                                </TouchableOpacity>

                                <Text style={styles.sectionLabel}>Amount</Text>
                                <TextInput
                                    keyboardType="numeric"
                                    value={amount}
                                    onChangeText={setAmount}
                                    placeholder="0.00"
                                    placeholderTextColor="#888"
                                    style={styles.amountInput}
                                />

                                <Text style={styles.sectionLabel}>Description (optional)</Text>
                                <TextInput
                                    value={description}
                                    onChangeText={setDescription}
                                    placeholder="Description"
                                    placeholderTextColor="#888"
                                    style={styles.textInput}
                                />
                            </>
                        )}
                    </>
                )}
            </ScrollView>

            {/* Footer */}
            <View style={[styles.footerBtns, { paddingBottom: insets.bottom + 12 }]}>
                {confirmationVisible ? (
                    <>
                        <TouchableOpacity style={styles.btnSecondary} onPress={() => setConfirmationVisible(false)}>
                            <Text style={styles.btnText}>Back</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            disabled={!isValid || confirming}
                            style={[styles.btnPrimary, (!isValid || confirming) && { opacity: 0.6 }]}
                            onPress={handleFinalSubmit}
                        >
                            <Text style={[styles.btnText, { color: "#121212", fontWeight: "700" }]}>
                                {confirming ? "Recording..." : "Confirm"}
                            </Text>
                        </TouchableOpacity>
                    </>
                ) : settleMode === "suggested" ? (
                    <>
                        <View style={{ flex: 1, flexDirection: 'row' }}>
                            <TouchableOpacity
                                style={[styles.btnPrimary, { backgroundColor: "#60DFC9" }]}
                                onPress={handleSettleAll}
                            >
                                <Text style={[styles.btnText, { color: "#121212", fontWeight: "700" }]}>
                                    {confirming ? "Recording..." : "Settle All"}
                                </Text>
                            </TouchableOpacity>

                        </View>
                        <TouchableOpacity
                            style={styles.btnSecondary}
                            onPress={() => {
                                resetForm();
                                onClose();
                                innerRef.current?.dismiss();
                            }}
                        >
                            <Text style={styles.btnText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            disabled={selectedTxnIndex === null}
                            style={[styles.btnPrimary, selectedTxnIndex === null && { opacity: 0.4 }]}
                            onPress={() => setConfirmationVisible(true)}
                        >
                            <Text style={[styles.btnText, { color: "#121212", fontWeight: "700" }]}>
                                Confirm
                            </Text>
                        </TouchableOpacity>

                    </>
                ) : (
                    <>
                        <TouchableOpacity
                            style={styles.btnSecondary}
                            onPress={() => {
                                resetForm();
                                onClose();
                                innerRef.current?.dismiss();
                            }}
                        >
                            <Text style={styles.btnText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            disabled={!isValid}
                            style={[styles.btnPrimary, !isValid && { opacity: 0.4 }]}
                            onPress={() => setConfirmationVisible(true)}
                        >
                            <Text style={[styles.btnText, { color: "#121212", fontWeight: "700" }]}>
                                Confirm
                            </Text>
                        </TouchableOpacity>
                    </>
                )}
            </View>


            {/* Payer select sheet */}
            <MainBottomSheet innerRef={payerSheetRef} onDismiss={() => { }}>
                <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                    <Text style={styles.headerText}>Select Payer</Text>
                    <TouchableOpacity onPress={() => payerSheetRef.current?.dismiss()}>
                        <Text style={styles.closeText}>Close</Text>
                    </TouchableOpacity>
                </View>
                <ScrollView contentContainerStyle={{ padding: 16 }}>
                    {members.map((m) => (
                        <TouchableOpacity
                            key={m.value}
                            style={[styles.chip, payerId === m.value && styles.chipActive]}
                            onPress={() => {
                                setPayerId(m.value);
                                payerSheetRef.current?.dismiss();
                            }}
                        >
                            <Text style={[styles.chipText, payerId === m.value && styles.chipTextActive]}>
                                {m.value === userId ? "You" : m.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </MainBottomSheet>

            {/* Receiver select sheet */}
            <MainBottomSheet innerRef={receiverSheetRef} onDismiss={() => { }}>
                <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                    <Text style={styles.headerText}>Select Receiver</Text>
                    <TouchableOpacity onPress={() => receiverSheetRef.current?.dismiss()}>
                        <Text style={styles.closeText}>Close</Text>
                    </TouchableOpacity>
                </View>
                <ScrollView contentContainerStyle={{ padding: 16 }}>
                    {members.map((m) => (
                        <TouchableOpacity
                            key={m.value}
                            style={[styles.chip, receiverId === m.value && styles.chipActive]}
                            onPress={() => {
                                setReceiverId(m.value);
                                receiverSheetRef.current?.dismiss();
                            }}
                        >
                            <Text style={[styles.chipText, receiverId === m.value && styles.chipTextActive]}>
                                {m.value === userId ? "You" : m.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </MainBottomSheet>

            {/* Currency select sheet */}
            <CurrenciesSheet
                innerRef={currencySheetRef}
                value={currency}
                options={currencyOptions}
                onSelect={(val) => {
                    setCurrency(val);
                    currencySheetRef.current?.dismiss();
                }}
                onClose={() => currencySheetRef.current?.dismiss()}
            />
        </MainBottomSheet>
    );
};

export default ShtSettle;

const styles = StyleSheet.create({
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#333" },
    headerText: { color: "#EBF1D5", fontSize: 18, fontWeight: "700" },
    closeText: { color: "#EA4335", fontSize: 16, fontWeight: "600" },
    empty: { color: "#a0a0a0", textAlign: "center", marginVertical: 40, fontSize: 16 },
    txRow: { borderWidth: 1, borderColor: "#333", borderRadius: 12, padding: 12, marginBottom: 8, backgroundColor: "#1f1f1f", flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    txRowSelected: { backgroundColor: "#0d3b36", borderColor: "#00C49F" },
    txText: { color: "#EBF1D5", fontSize: 14, flexShrink: 1 },
    txAmount: { fontWeight: "700", fontSize: 15, marginLeft: 8 },
    footerBtns: { flexDirection: "row", justifyContent: "flex-end", gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#333", backgroundColor: "#212121", paddingTop: 12, paddingHorizontal: 16 },
    btnSecondary: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: "#2a2a2a" },
    btnPrimary: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: "#00C49F" },
    btnText: { color: "#EBF1D5", fontWeight: "600" },
    sectionLabel: { color: "#00C49F", fontSize: 12, letterSpacing: 1, marginTop: 12, marginBottom: 6 },
    confirmText: { fontSize: 16, color: "#EBF1D5", fontWeight: "600", textAlign: "center" },
    confirmAmount: { fontSize: 22, fontWeight: "700", color: "#00C49F" },
    confirmDesc: { color: "#c9c9c9", fontSize: 13, marginTop: 4, textAlign: "center" },
    select: { borderBottomWidth: 2, borderColor: "#55554f", paddingVertical: 10, paddingHorizontal: 8, marginBottom: 8 },
    chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: "#333", marginBottom: 8 },
    chipActive: { backgroundColor: "#DFF3E8", borderColor: "#00C49F" },
    chipText: { color: "#EBF1D5" },
    chipTextActive: { color: "#121212", fontWeight: "700" },
    modeSwitch: { flexDirection: "row", alignSelf: "center", backgroundColor: "#1f1f1f", borderRadius: 999, marginVertical: 12, borderWidth: 1, borderColor: "#EBF1D5" },
    modeBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 999 },
    modeBtnActive: { backgroundColor: "#EBF1D5" },
    modeText: { color: "#EBF1D5", fontWeight: "600" },
    modeTextActive: { color: "#121212", fontWeight: "700" },
    amountInput: { borderBottomWidth: 2, borderColor: "#55554f", paddingVertical: 10, paddingHorizontal: 8, marginBottom: 8, color: "#EBF1D5", fontSize: 18 },
    textInput: { borderBottomWidth: 2, borderColor: "#55554f", paddingVertical: 10, paddingHorizontal: 8, marginBottom: 8, color: "#EBF1D5", fontSize: 16 },
});
