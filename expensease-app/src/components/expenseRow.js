// components/ExpenseRow.js
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useAuth } from "context/AuthContext";
import { getSymbol } from "utils/currencies";
import CategoryIcon from "./categoryIcon";
import { categoryMap } from "utils/categories";
import SettleIcon from "@/icons/handshake";

const ExpenseRow = ({ expense, userId, onPress, showExpense = false }) => {
    const { categories = [] } = useAuth() || {};
    const isSettle = expense.typeOf === "settle";
    const isSplit = expense.mode === "split";

    const date = new Date(expense.date);
    const month = date.toLocaleString("default", { month: "short" });
    const day = date.getDate().toString().padStart(2, "0");

    const getPayerInfo = (splits) => {
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

    const getSettleDirectionText = (splits) => {
        const payer = splits.find((s) => s.paying && s.payAmount > 0);
        const receiver = splits.find((s) => s.owing && s.oweAmount > 0);
        if (!payer || !receiver) return "Invalid settlement";

        const payerIsYou = payer.friendId._id === userId;
        const receiverIsYou = receiver.friendId._id === userId;

        const payerName = payerIsYou ? "You" : shortenName(payer.friendId.name);
        const receiverName = receiverIsYou ? "you" : shortenName(receiver.friendId.name);

        return `${payerName} paid ${receiverName}`;
    };

    const getOweInfo = (splits) => {
        const userSplit = splits.find((s) => s.friendId && s.friendId._id === userId);
        if (!userSplit) return { text: "" };

        const { oweAmount = 0, payAmount = 0 } = userSplit;
        const net = payAmount - oweAmount;

        if (net > 0) {
            return { text: "you lent", amount: `${getSymbol(expense.currency)} ${net.toFixed(2)}`, green: true, oweAmount, payAmount };
        } else if (net < 0) {
            return { text: "you borrowed", amount: `${getSymbol(expense.currency)} ${Math.abs(net).toFixed(2)}`, red: true, oweAmount, payAmount };
        }
        return { text: "no balance", amount: "", oweAmount, payAmount };
    };

    // ✅ Expense context (Group / Friend / Personal)
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
    let categoryConfig = categoryMap[categoryKey] || categoryMap.notepad;

    const showIcon = !!categoryConfig || isSettle;

    const oweInfo = !isSettle && isSplit ? getOweInfo(expense.splits) : null;

    return (
        <TouchableOpacity style={styles.row} activeOpacity={0.8} onPress={() => onPress?.(expense)}>
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
                        <SettleIcon width={20} height={20} color={"#EBF1D5"} />
                    ) : (
                        <CategoryIcon category={expense.category} size={22} />
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
                                {expense.description}
                            </Text>
                            <Text style={styles.sub} numberOfLines={1}>
                                {showExpense
                                    ? getExpenseContext()
                                    : isSplit
                                        ? getPayerInfo(expense.splits) !== false
                                            ? `${getPayerInfo(expense.splits)} ${getSymbol(expense.currency)} ${expense.amount.toFixed(2)}`
                                            : "not involved"
                                        : categoryConfig?.label || expense.category}
                            </Text>
                        </>
                    ) : (
                        <Text style={styles.sub} numberOfLines={1}>
                            {getSettleDirectionText(expense.splits)} {getSymbol(expense.currency)} {expense.amount.toFixed(2)}
                        </Text>
                    )}
                </View>

                {/* Right */}
                {!isSettle && (
                    <View style={styles.right}>
                        {isSplit && oweInfo ? (
                            showExpense ? (
                                // 🔹 Show "your share"
                                <>
                                    <Text style={[styles.oweText, { color: "#81827C" }]}>your share</Text>
                                    <Text style={[styles.oweAmt, { color: "#F44336" }]}>
                                        {getSymbol(expense.currency)} {oweInfo.oweAmount?.toFixed(2) || "0.00"}
                                    </Text>
                                </>
                            ) : (
                                // 🔹 Show net owe/lent
                                <>
                                    <Text
                                        style={[
                                            styles.oweText,
                                            oweInfo.green ? { color: "rgba(0,196,159,0.7)" } : oweInfo.red ? { color: "rgba(244,67,54,0.7)" } : {},
                                        ]}
                                    >
                                        {oweInfo.text}
                                    </Text>
                                    <Text
                                        style={[
                                            styles.oweAmt,
                                            oweInfo.green ? { color: "#00C49F" } : oweInfo.red ? { color: "#F44336" } : {},
                                        ]}
                                    >
                                        {oweInfo.amount}
                                    </Text>
                                </>
                            )
                        ) : (
                            <Text style={[styles.amount, { color: "#F44336" }]}>
                                {getSymbol(expense.currency)} {Math.abs(expense.amount).toFixed(2)}
                            </Text>
                        )}
                    </View>
                )}
            </View>
        </TouchableOpacity>
    );
};

export default ExpenseRow;

const styles = StyleSheet.create({
    row: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 8,
        borderRadius: 12,
        marginBottom: 8,
    },
    dateBox: { width: 36, alignItems: "center" },
    dateMonth: { fontSize: 12, color: "#81827C", textTransform: "uppercase" },
    dateDay: { fontSize: 16, color: "#EBF1D5", fontWeight: "700", marginTop: -2 },
    divider: { width: 1.5, backgroundColor: "#2A2A2A", alignSelf: "stretch", borderRadius: 1 },
    iconBox: {
        width: 34,
        height: 34,
        borderRadius: 8,
        backgroundColor: "#2A2A2A",
        alignItems: "center",
        justifyContent: "center",
        marginHorizontal: 8,
    },
    main: { flex: 1, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    left: { flex: 1, paddingRight: 8 },
    title: { color: "#EBF1D5", fontSize: 16, fontWeight: "600" },
    sub: { color: "#81827C", fontSize: 12, marginTop: 2 },
    right: { alignItems: "flex-end", justifyContent: "center" },
    oweText: { fontSize: 12, color: "#81827C" },
    oweAmt: { fontSize: 16, fontWeight: "600", color: "#EBF1D5", marginTop: -2 },
    amount: { fontSize: 16, fontWeight: "700", color: "#EBF1D5" },
});
