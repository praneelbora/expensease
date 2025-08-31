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
import SplitSection from "./splitSection"; // ⚡ your split UI logic

const ExpenseSheet = ({
  innerRef,
  expense, // null | expense object
  onClose,
  onSave,
  onDelete,
  userId,
  categories,
  currencyOptions,
  paymentMethods,
}) => {
  const insets = useSafeAreaInsets();
  const [isEditing, setIsEditing] = useState(false);
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

  // sync with incoming expense
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

  if (!expense) return <></>;

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

      {/* Body */}
      <BottomSheetScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
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

            {form.mode === "split" && (
              <SplitSection
                splits={form.splits}
                amount={form.amount}
                currency={form.currency}
                userId={userId}
                editable={false}
              />
            )}
          </>
        ) : (
          <>
            {/* Edit mode */}
            <TextInput
              style={styles.input}
              placeholder="Description"
              value={form.description}
              onChangeText={(v) =>
                setForm((f) => ({ ...f, description: v }))
              }
            />

            <TextInput
              style={styles.input}
              placeholder="Amount"
              keyboardType="decimal-pad"
              value={String(form.amount)}
              onChangeText={(v) =>
                setForm((f) => ({ ...f, amount: parseFloat(v) || 0 }))
              }
            />

            {/* TODO: add dropdowns for currency + category here */}

            {form.mode === "split" && (
              <SplitSection
                splits={form.splits}
                amount={form.amount}
                currency={form.currency}
                userId={userId}
                editable={true}
                onChangeSplits={(splits) =>
                  setForm((f) => ({ ...f, splits }))
                }
              />
            )}
          </>
        )}

        {/* Footer buttons */}
        <View style={styles.footer}>
          {!isEditing ? (
            <>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => onDelete?.(expense._id)}
              >
                <Feather name="trash-2" size={16} color="#EA4335" />
                <Text style={styles.deleteText}>Delete</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() => setIsEditing(true)}
              >
                <Feather name="edit" size={16} color="#EBF1D5" />
                <Text style={styles.editText}>Edit</Text>
              </TouchableOpacity>
            </>
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
                <Feather name="save" size={16} color="#121212" />
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

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#333",
  },
  headerText: { color: "#EBF1D5", fontSize: 18, fontWeight: "700" },
  closeText: { color: "#EA4335", fontSize: 16 },
  topRow: { flexDirection: "row", justifyContent: "space-between", padding: 16 },
  amountText: { color: "#00C49F", fontSize: 22, fontWeight: "700" },
  dateText: { color: "#aaa", fontSize: 14 },
  input: {
    backgroundColor: "#1f1f1f",
    borderRadius: 8,
    padding: 12,
    color: "#EBF1D5",
    margin: 8,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 16,
  },
  deleteBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  deleteText: { color: "#EA4335", fontWeight: "600" },
  editBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  editText: { color: "#EBF1D5" },
  saveBtn: {
    backgroundColor: "#00C49F",
    padding: 10,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  saveText: { color: "#121212", fontWeight: "700" },
  cancelBtn: { padding: 10 },
  cancelText: { color: "#EBF1D5" },
});
