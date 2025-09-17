// components/ExpenseRow.js
import React, { useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useAuth } from "context/AuthContext";
import { useTheme } from "context/ThemeProvider";
import { getSymbol } from "utils/currencies";
import CategoryIcon from "./categoryIcon";
import { categoryMap } from "utils/categories";
import { deleteExpense, updateExpense } from "services/ExpenseService";
import SettleIcon from "@/icons/handshake";
import BottomSheetExpense from "./btmShtExpense";

const ExpenseRow = ({ expense = {}, userId, showExpense = false, update }) => {
    const { categories = [] } = useAuth() || {};
    const { theme } = useTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);

    const isSettle = expense.typeOf === "settle";
    const isSplit = expense.mode === "split";
    const expenseSheetRef = useRef(null);

    const date = expense.date ? new Date(expense.date) : new Date();
    const month = date.toLocaleString("default", { month: "short" });
    const day = date.getDate().toString().padStart(2, "0");

    const getPayerInfo = (splits = []) => {
        const userSplit = splits.find((s) => s.friendId && s.friendId._id === userId);
        if (!userSplit) return false;
        const payers = splits.filter((s) => s.paying && s.payAmount > 0);
        if (payers.length === 1) {
            return `${payers[0].friendId._id === userId ? "You" : payers[0].friendId.name} paid`;
        } else if (payers.length > 1) {
            return `${payers.length} people paid`;
        }
        return "No one paid";
    };

    // Shorten names (e.g. Rahul Dev Singh → Rahul D S)
    const shortenName = (fullName, isYou = false) => {
        if (isYou) return fullName;
        if (!fullName) return "";
        const parts = fullName.trim().split(/\s+/);
        if (parts.length === 1) return parts[0];
        return parts[0] + " " + parts.slice(1).map((p) => p[0].toUpperCase()).join(" ");
    };

    const getSettleDirectionText = (splits = []) => {
        const payer = splits.find((s) => s.paying && s.payAmount > 0);
        const receiver = splits.find((s) => s.owing && s.oweAmount > 0);
        if (!payer || !receiver) return "Invalid settlement";

        const payerIsYou = payer.friendId._id === userId;
        const receiverIsYou = receiver.friendId._id === userId;

        const payerName = payerIsYou ? "You" : shortenName(payer.friendId.name);
        const receiverName = receiverIsYou ? "you" : shortenName(receiver.friendId.name);

        return `${payerName} paid ${receiverName}`;
    };

    const getOweInfo = (splits = []) => {
        const userSplit = splits.find((s) => s.friendId && s.friendId._id === userId);
        if (!userSplit) return { text: "" };

        const { oweAmount = 0, payAmount = 0 } = userSplit;
        const net = Number(payAmount) - Number(oweAmount);

        if (net > 0) {
            return {
                text: "you lent",
                amount: `${getSymbol(expense.currency)} ${net.toFixed(2)}`,
                positive: true,
                oweAmount,
                payAmount,
            };
        } else if (net < 0) {
            return {
                text: "you borrowed",
                amount: `${getSymbol(expense.currency)} ${Math.abs(net).toFixed(2)}`,
                negative: true,
                oweAmount,
                payAmount,
            };
        }
        return { text: "no balance", amount: "", oweAmount, payAmount };
    };

    // Expense context (Group / Friend / Personal)
    const getExpenseContext = () => {
        if (expense.groupId) {
            return `Group: ${expense.groupId.name}`;
        }
        if (expense.splits && expense.splits.length > 1) {
            const other = expense.splits.find((s) => s.friendId && s.friendId._id !== userId);
            if (other) {
                return `With ${shortenName(other.friendId.name)}`;
            }
        }
        return "Personal expense";
    };

    // Category
    const categoryKey = isSettle ? "settle" : expense.category;
    const categoryConfig = categoryMap[categoryKey] || categoryMap.notepad;
    const showIcon = !!categoryConfig || isSettle;
    const oweInfo = !isSettle && isSplit ? getOweInfo(expense.splits || []) : null;

    const openSheet = () => {
        expenseSheetRef.current?.present();
    };

    return (
        <>
            <TouchableOpacity
                style={styles.row}
                activeOpacity={0.85}
                onPress={openSheet}
            >
                {/* Date */}
                <View style={styles.dateBox}>
                    <Text style={styles.dateMonth}>{month}</Text>
                    <Text style={styles.dateDay}>{day}</Text>
                </View>

                {/* Divider */}
                <View style={styles.divider} />

                {/* Icon */}
                {showIcon ? (
                    <View style={styles.iconBox}>
                        {isSettle ? (
                            <SettleIcon width={20} height={20} color={theme.colors.text} />
                        ) : (
                            <CategoryIcon category={expense.category} size={20} color={theme.colors.text} />
                        )}
                    </View>
                ) : null}

                {/* Main content */}
                <View style={styles.main}>
                    {/* Left */}
                    <View style={styles.left}>
                        {!isSettle ? (
                            <>
                                <Text style={styles.title} numberOfLines={1}>
                                    {expense.description || "—"}
                                </Text>
                                <Text style={styles.sub} numberOfLines={1}>
                                    {showExpense
                                        ? getExpenseContext()
                                        : isSplit
                                            ? getPayerInfo(expense.splits || []) !== false
                                                ? `${getPayerInfo(expense.splits || [])} ${getSymbol(expense.currency)} ${Number(expense.amount || 0).toFixed(2)}`
                                                : "not involved"
                                            : (categoryConfig?.label || expense.category || "")}
                                </Text>
                            </>
                        ) : (
                            <Text style={styles.sub} numberOfLines={1}>
                                {getSettleDirectionText(expense.splits || [])} {getSymbol(expense.currency)} {Number(expense.amount || 0).toFixed(2)}
                            </Text>
                        )}
                    </View>

                    {/* Right */}
                    {!isSettle && (
                        <View style={styles.right}>
                            {isSplit && oweInfo ? (
                                showExpense ? (
                                    // Show "your share"
                                    <>
                                        <Text style={[styles.oweText, { color: theme.colors.muted }]}>your share</Text>
                                        <Text style={[styles.oweAmt, { color: theme.colors.negative ?? theme.colors.text }]}>
                                            {getSymbol(expense.currency)} {Number(oweInfo.oweAmount || 0).toFixed(2)}
                                        </Text>
                                    </>
                                ) : (
                                    // Show net owe/lent
                                    <>
                                        <Text
                                            style={[
                                                styles.oweText,
                                                oweInfo.positive ? { color: theme.colors.positive } : oweInfo.negative ? { color: theme.colors.negative } : { color: theme.colors.muted },
                                            ]}
                                        >
                                            {oweInfo.text}
                                        </Text>
                                        <Text
                                            style={[
                                                styles.oweAmt,
                                                oweInfo.positive ? { color: theme.colors.positive } : oweInfo.negative ? { color: theme.colors.negative } : { color: theme.colors.text },
                                            ]}
                                        >
                                            {oweInfo.amount}
                                        </Text>
                                    </>
                                )
                            ) : (
                                <Text style={[styles.amount, { color: theme.colors.negative ?? theme.colors.text }]}>
                                    {getSymbol(expense.currency)} {Math.abs(Number(expense.amount || 0)).toFixed(2)}
                                </Text>
                            )}
                        </View>
                    )}
                </View>
            </TouchableOpacity>

            <BottomSheetExpense
                innerRef={expenseSheetRef}
                expense={expense}
                userId={userId}
                onUpdateExpense={async (id, payload) => {
                    try {
                        await updateExpense(id, payload);
                        update()
                    } catch (error) {
                        console.warn("updateExpense failed:", error);
                    }
                }}
                onDeleteExpense={async (id) => {
                    try {
                        await deleteExpense(id);
                        update()
                    } catch (e) {
                        // swallow; sheet or parent should show error if needed
                        console.warn("deleteExpense failed:", e);
                    } finally {
                        expenseSheetRef?.current?.dismiss?.();
                    }
                }}
            />
        </>
    );
};

export default ExpenseRow;

const createStyles = (theme) =>
    StyleSheet.create({
        row: {
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: 8,
            borderRadius: 12,
            marginBottom: 6,
            backgroundColor: "transparent",
        },
        dateBox: { width: 28, alignItems: "center" },
        dateMonth: { fontSize: 12, color: theme.colors.muted, textTransform: "uppercase" },
        dateDay: { fontSize: 16, color: theme.colors.text, fontWeight: "700", marginTop: -2 },
        divider: { width: 1.5, backgroundColor: theme.colors.border, alignSelf: "stretch", borderRadius: 1, marginHorizontal: 8 },
        iconBox: {
            width: 34,
            height: 34,
            borderRadius: 8,
            backgroundColor: theme.colors.card,
            alignItems: "center",
            justifyContent: "center",
            marginHorizontal: 8,
            borderWidth: 1,
            borderColor: theme.colors.border,
        },
        main: { flex: 1, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
        left: { flex: 1, paddingRight: 8 },
        title: { color: theme.colors.text, fontSize: 16, fontWeight: "600" },
        sub: { color: theme.colors.muted, fontSize: 12, marginTop: 2 },
        right: { alignItems: "flex-end", justifyContent: "center" },
        oweText: { fontSize: 12, color: theme.colors.muted },
        oweAmt: { fontSize: 16, fontWeight: "600", color: theme.colors.text, marginTop: -2 },
        amount: { fontSize: 16, fontWeight: "700", color: theme.colors.text },
    });
