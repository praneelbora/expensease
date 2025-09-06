// components/btmShtExpense.js
import React, { useState, useEffect, useMemo } from "react";
import {
    View,
    Text,
    TouchableOpacity,
    TextInput,
    StyleSheet,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import MainBottomSheet from "./mainBottomSheet";
import { getSymbol } from "../utils/currencies";
import CategoryIcon from "./categoryIcon";
import { useTheme } from "context/ThemeProvider";

const ExpenseSheet = ({
    innerRef,
    expense,
    onClose,
    onSave,
    onDelete,
    userId,
}) => {
    const insets = useSafeAreaInsets();
    const { theme } = useTheme();
    const colors = theme?.colors || {};

    const styles = useMemo(() => createStyles(colors), [colors]);

    const [isEditing, setIsEditing] = useState(false);
    const [viewSplits, setViewSplits] = useState(false);

    const [form, setForm] = useState({
        description: "",
        amount: 0,
        date: "",
        currency: "INR",
        category: "",
        mode: "personal",
        typeOf: "expense",
        splits: [],
    });

    useEffect(() => {
        if (expense) {
            setForm({
                description: expense.description || "",
                amount: expense.amount ?? 0,
                date: expense.date
                    ? new Date(expense.date).toISOString().split("T")[0]
                    : "",
                currency: expense.currency || "INR",
                category: expense.category || "",
                mode: expense.mode || "personal",
                typeOf: expense.typeOf || "expense",
                splits: expense.splits || [],
            });
            setIsEditing(false);
        }
    }, [expense?._id]);

    if (!expense) return null;

    const handleSave = () => {
        onSave?.({ ...form, _id: expense._id });
        setIsEditing(false);
        innerRef.current?.dismiss();
    };

    return (
        <MainBottomSheet innerRef={innerRef} onDismiss={onClose}>
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                <Text style={styles.headerText}>
                    {isEditing ? "Edit" : ""}{" "}
                    {form.typeOf === "expense" ? form.mode : "Settle"} Expense
                </Text>
                <TouchableOpacity onPress={() => innerRef.current?.dismiss()}>
                    <Text style={styles.closeText}>Cancel</Text>
                </TouchableOpacity>
            </View>

            <BottomSheetScrollView
                contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
                showsVerticalScrollIndicator={false}
            >
                {!isEditing ? (
                    <>
                        {/* View mode */}
                        <View style={styles.topRow}>
                            <Text style={styles.amountText}>
                                {getSymbol(form.currency)} {Number(form.amount).toFixed(2)}
                            </Text>
                            {form.date && (
                                <Text style={styles.dateText}>
                                    {new Date(form.date).toDateString()}
                                </Text>
                            )}
                        </View>

                        {/* Description & Category */}
                        <View style={styles.summaryBox}>
                            {form.description ? (
                                <Text style={styles.summaryText}>{form.description}</Text>
                            ) : (
                                <Text style={[styles.summaryText, { color: colors.muted }]}>
                                    No description
                                </Text>
                            )}
                            {form.category ? (
                                <View
                                    style={{
                                        flexDirection: "row",
                                        alignItems: "center",
                                        gap: 8,
                                        marginTop: 5,
                                    }}
                                >
                                    <CategoryIcon category={form.category} />
                                    <Text style={styles.categoryTag}>{form.category}</Text>
                                </View>
                            ) : null}
                        </View>

                        {/* Payment Info */}
                        <View style={styles.detailsBox}>
                            {form.mode === "personal" &&
                                expense?.paidFromPaymentMethodId && (
                                    <Text style={styles.detailsText}>
                                        Paid with {expense?.paidFromPaymentMethodId?.label}
                                    </Text>
                                )}
                            {form.mode === "split" && (() => {
                                const mine = form.splits.find(
                                    (s) =>
                                        (s?.friendId?._id || s?.friendId) === userId &&
                                        s?.paidFromPaymentMethodId
                                );
                                return (
                                    mine && (
                                        <Text style={styles.detailsText}>
                                            You paid using {mine.paidFromPaymentMethodId?.label}
                                        </Text>
                                    )
                                );
                            })()}

                            {expense?.createdBy && (
                                <Text style={styles.detailsText}>
                                    Created by {expense?.createdBy?.name}
                                </Text>
                            )}
                            {expense?.lastAudit && (
                                <Text style={styles.detailsText}>
                                    Last updated by {expense?.lastAudit?.updatedBy?.name}
                                </Text>
                            )}
                        </View>

                        {/* Splits (read-only view) */}
                        {form.mode === "split" && (
                            <>
                                <View style={styles.splitHeader}>
                                    <Text style={styles.splitText}>
                                        Your share:{" "}
                                        {(() => {
                                            const mine = form.splits.find(
                                                (s) => (s?.friendId?._id || s?.friendId) === userId
                                            );
                                            const myExpense = Math.abs(Number(mine?.oweAmount || 0));
                                            return myExpense > 0
                                                ? `${getSymbol(form.currency)} ${myExpense.toFixed(2)}`
                                                : "Not involved";
                                        })()}
                                    </Text>
                                    <TouchableOpacity onPress={() => setViewSplits((p) => !p)}>
                                        <Text style={styles.viewDetails}>
                                            {viewSplits ? "Hide Details" : "View Details"}
                                        </Text>
                                    </TouchableOpacity>
                                </View>

                                {viewSplits && (
                                    <View style={styles.splitList}>
                                        {form.splits
                                            .filter(
                                                (s) =>
                                                    (s.payAmount || 0) > 0 || (s.oweAmount || 0) > 0
                                            )
                                            .map((s, idx) => {
                                                const name =
                                                    s?.friendId?._id == userId
                                                        ? "You"
                                                        : s?.friendId?.name || "Member";
                                                const payTxt =
                                                    (s.payAmount || 0) > 0
                                                        ? `paid ${getSymbol(form.currency)} ${Number(
                                                            s.payAmount
                                                        ).toFixed(2)}`
                                                        : "";
                                                const andTxt =
                                                    (s.payAmount || 0) > 0 &&
                                                        (parseFloat(s.oweAmount) || 0) > 0
                                                        ? " and "
                                                        : "";
                                                const oweTxt =
                                                    parseFloat(s.oweAmount) > 0
                                                        ? `owe${s?.friendId?._id !== userId ? "s" : ""} ${getSymbol(form.currency)
                                                        } ${Number(s.oweAmount).toFixed(2)}`
                                                        : "";

                                                return (
                                                    <Text key={idx} style={styles.splitItem}>
                                                        {name} {payTxt}
                                                        {andTxt}
                                                        {oweTxt}
                                                    </Text>
                                                );
                                            })}
                                    </View>
                                )}
                            </>
                        )}
                    </>
                ) : (
                    <>
                        {/* Edit mode */}
                        <TextInput
                            style={styles.input}
                            placeholder="Description"
                            placeholderTextColor={colors.muted}
                            value={form.description}
                            onChangeText={(v) => setForm((f) => ({ ...f, description: v }))}
                        />
                        <TextInput
                            style={styles.input}
                            placeholder="Amount"
                            placeholderTextColor={colors.muted}
                            keyboardType="decimal-pad"
                            value={String(form.amount)}
                            onChangeText={(v) =>
                                setForm((f) => ({ ...f, amount: parseFloat(v) || 0 }))
                            }
                        />

                        {/* Splits (simple inline edit) */}
                        {form.mode === "split" && (
                            <View style={styles.splitList}>
                                {form.splits.map((s, idx) => (
                                    <View key={idx} style={styles.splitRow}>
                                        <Text style={styles.splitLabel}>
                                            {s?.friendId?._id === userId
                                                ? "You"
                                                : s?.friendId?.name || "Member"}
                                        </Text>
                                        <TextInput
                                            style={styles.splitInput}
                                            keyboardType="decimal-pad"
                                            value={String(s.oweAmount || 0)}
                                            onChangeText={(v) => {
                                                const updated = [...form.splits];
                                                updated[idx].oweAmount = parseFloat(v) || 0;
                                                setForm((f) => ({ ...f, splits: updated }));
                                            }}
                                        />
                                    </View>
                                ))}
                            </View>
                        )}
                    </>
                )}

                {/* Footer */}
                <View style={styles.footer}>
                    {!isEditing ? (
                        <TouchableOpacity
                            style={styles.deleteBtn}
                            onPress={() => onDelete?.(expense._id)}
                        >
                            <Feather name="trash-2" size={16} color={colors.negative} />
                            <Text style={styles.deleteText}>Delete</Text>
                        </TouchableOpacity>
                    ) : (
                        <>
                            <TouchableOpacity
                                style={[
                                    styles.saveBtn,
                                    { opacity: form.description && form.amount ? 1 : 0.5 },
                                ]}
                                disabled={!form.description || !form.amount}
                                onPress={handleSave}
                            >
                                <Feather name="save" size={16} color={colors.text} />
                                <Text style={styles.saveText}>Save</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.cancelBtn}
                                onPress={() => setIsEditing(false)}
                            >
                                <Text style={styles.cancelText}>Cancel</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            </BottomSheetScrollView>
        </MainBottomSheet>
    );
};

export default ExpenseSheet;

/* theme-aware styles factory */
const createStyles = (c = {}) =>
    StyleSheet.create({
        header: {
            flexDirection: "row",
            justifyContent: "space-between",
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: c.border || "#333",
        },
        headerText: {
            color: c.text || "#EBF1D5",
            fontSize: 18,
            fontWeight: "700",
            textTransform: "capitalize",
        },
        closeText: { color: c.negative || "#EA4335", fontSize: 16 },
        topRow: { flexDirection: "row", justifyContent: "space-between", padding: 16 },
        amountText: { color: c.cta || c.primary || "#00C49F", fontSize: 22, fontWeight: "700" },
        dateText: { color: c.muted || "#aaa", fontSize: 14 },
        input: {
            backgroundColor: c.cardAlt || "#1f1f1f",
            borderRadius: 8,
            padding: 12,
            color: c.text || "#EBF1D5",
            margin: 8,
        },
        footer: {
            flexDirection: "row",
            justifyContent: "space-between",
            padding: 16,
        },
        deleteBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
        deleteText: { color: c.negative || "#EA4335", fontWeight: "600", marginLeft: 6 },
        saveBtn: {
            backgroundColor: c.cta || c.primary || "#00C49F",
            padding: 10,
            borderRadius: 8,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
        },
        saveText: { color: c.text || "#121212", fontWeight: "700" },
        cancelBtn: { padding: 10 },
        cancelText: { color: c.text || "#EBF1D5" },
        summaryBox: { paddingHorizontal: 16 },
        summaryText: {
            color: c.text || "#EBF1D5",
            fontSize: 18,
            fontWeight: "500",
            marginBottom: 6,
        },
        categoryTag: {
            color: c.text || "#EBF1D5",
            fontSize: 18,
            textTransform: "capitalize",
        },
        detailsBox: {
            backgroundColor: c.card || "#333",
            marginHorizontal: 16,
            marginTop: 10,
            paddingVertical: 10,
            borderRadius: 8,
            padding: 12,
        },
        detailsText: { color: c.muted || "#ccc", fontSize: 14, marginBottom: 4 },
        splitHeader: {
            flexDirection: "row",
            justifyContent: "space-between",
            marginHorizontal: 16,
            marginVertical: 8,
        },
        splitText: { color: c.text || "#EBF1D5", fontSize: 14 },
        viewDetails: { color: c.cta || c.primary || "#00C49F", fontSize: 14, borderBottomWidth: 1 },
        splitList: { marginHorizontal: 16, marginTop: 8 },
        splitItem: { color: c.text || "#EBF1D5", fontSize: 14, marginBottom: 4 },
        splitRow: {
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginVertical: 6,
        },
        splitLabel: { color: c.text || "#EBF1D5", fontSize: 14 },
        splitInput: {
            backgroundColor: c.cardAlt || "#1f1f1f",
            color: c.text || "#EBF1D5",
            borderRadius: 6,
            padding: 6,
            width: 80,
            textAlign: "right",
        },
    });
