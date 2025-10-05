// components/ExpenseRow.js
import React, { useRef } from "react";
import { View, Text, StyleSheet, Alert } from "react-native";
import { useAuth } from "context/AuthContext";
import { useTheme } from "context/ThemeProvider";
import { getSymbol } from "utils/currencies";
import CategoryIcon from "./categoryIcon";
import { categoryMap } from "utils/categories";
import { deleteExpense, updateExpense } from "services/ExpenseService";
import SettleIcon from "@/icons/handshake";
import BottomSheetExpense from "./btmShtExpense";
import Ionicons from "@expo/vector-icons/Ionicons";

// Gesture handler imports
import {
  RectButton,
  TapGestureHandler,
  Swipeable,
  State,
} from "react-native-gesture-handler";

const ExpenseRow = ({ expense = {}, userId, showExpense = false, update }) => {
  const { categories = [] } = useAuth() || {};
  const { theme } = useTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const [isSwiped, setIsSwiped] = React.useState(false);

  const isSettle = expense.typeOf === "settle";
  const isSplit = expense.mode === "split";
  const expenseSheetRef = useRef(null);
  const swipeableRef = useRef(null);

  // Tap handler to allow taps along with swipe
  const onTapHandlerStateChange = ({ nativeEvent }) => {
    if (nativeEvent.state === State.END) {
      try {
        swipeableRef.current?.close?.();
      } catch (e) {}
      openSheet();
    }
  };

  const date = expense.date ? new Date(expense.date) : new Date();
  const month = date.toLocaleString("default", { month: "short" });
  const day = date.getDate().toString().padStart(2, "0");

  const getPayerInfo = (splits = []) => {
    const userSplit = splits.find((s) => s.friendId && s.friendId?._id === userId);
    if (!userSplit) return false;
    const payers = splits.filter((s) => s.paying && s.payAmount > 0);
    if (payers.length === 1) {
      return `${payers[0].friendId?._id === userId ? "You" : payers[0].friendId?.name} paid`;
    } else if (payers.length > 1) {
      return `${payers.length} people paid`;
    }
    return "No one paid";
  };

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

    const payerIsYou = payer.friendId?._id === userId;
    const receiverIsYou = receiver.friendId?._id === userId;

    const payerName = payerIsYou ? "You" : shortenName(payer.friendId?.name);
    const receiverName = receiverIsYou ? "you" : shortenName(receiver.friendId?.name);

    return `${payerName} paid ${receiverName}`;
  };

  const getOweInfo = (splits = []) => {
    const userSplit = splits.find((s) => s.friendId && s.friendId?._id === userId);
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

  const getExpenseContext = () => {
    if (expense.groupId) {
      return `Group: ${expense.groupId.name}`;
    }
    if (expense.splits && expense.splits.length > 1) {
      const other = expense.splits.find((s) => s.friendId && s.friendId?._id !== userId);
      if (other) {
        return `With ${shortenName(other.friendId?.name)}`;
      }
    }
    return "Personal expense";
  };

  const categoryKey = isSettle ? "settle" : expense.category;
  const categoryConfig = categoryMap[categoryKey] || categoryMap.notepad;
  const showIcon = !!categoryConfig || isSettle;
  const oweInfo = !isSettle && isSplit ? getOweInfo(expense.splits || []) : null;

  const openSheet = () => {
    expenseSheetRef.current?.present?.();
  };

  /**
   * New handleDelete pattern:
   * - Do NOT close swipeable immediately.
   * - Show Alert.
   * - On user confirming "Delete", first close the swipeable,
   *   then perform deleteExpense and refresh.
   */
  const handleDelete = async (swipeableMethods) => {
    Alert.alert(
      "Delete expense",
      "Are you sure you want to delete this expense?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            // close swipeable first so row animates back cleanly
            try {
              swipeableMethods?.close?.();
            } catch (e) {}
            // small delay to allow the close animation to finish before heavy work
            setTimeout(async () => {
              try {
                await deleteExpense(expense._id);
                typeof update === "function" && update();
              } catch (err) {
                console.warn("deleteExpense failed:", err);
              } finally {
                // if bottom sheet is open for this expense, dismiss it
                try {
                  expenseSheetRef?.current?.dismiss?.();
                } catch (e) {}
              }
            }, 150); // 120-200ms feels smooth; tweak if needed
          },
        },
      ],
      { cancelable: true }
    );
  };

  const renderRightActions = (_progress, _dragX) => {
    return (
      <View style={{ flexDirection: "row", alignItems: "stretch" }}>
        <View
          style={[
            styles.actionBtn,
            {
              backgroundColor: theme.colors.negative || "#E55353",
              marginLeft: 16,
              marginRight: 4,
              marginVertical: 8,
              borderRadius: 30,
            },
          ]}
        >
          <RectButton
            style={styles.actionInner}
            rippleColor="transparent"
            underlayColor="transparent"
            onPress={() => {
              // show confirm alert; pass swipeableRef.current so the alert handler can close it
              handleDelete(swipeableRef.current);
            }}
          >
            <Ionicons name="trash-outline" size={22} color="#fff" />
          </RectButton>
        </View>
      </View>
    );
  };

  return (
    <>
      <Swipeable
        ref={swipeableRef}
        friction={1}
        overshootRight={false}
        overshootLeft={false}
        rightThreshold={40}
        renderRightActions={renderRightActions}
        onSwipeableWillOpen={() => setIsSwiped(true)}
        onSwipeableWillClose={() => setIsSwiped(false)}
      >
        {/* TapGestureHandler allows taps to be recognized along with swipe */}
        <TapGestureHandler
          onHandlerStateChange={onTapHandlerStateChange}
          simultaneousHandlers={swipeableRef}
        >
          <RectButton
            style={styles.row}
            rippleColor="transparent"
            underlayColor="transparent"
            activeOpacity={1}
            onPress={() => {
              try {
                swipeableRef.current?.close?.();
              } catch (e) {}
              // fallback press handler
              openSheet();
            }}
          >
            <View style={styles.dateBox}>
              <Text style={styles.dateMonth}>{month}</Text>
              <Text style={styles.dateDay}>{day}</Text>
            </View>

            <View style={styles.divider} />

            {showIcon && !isSettle ? (
              <View style={styles.iconBox}>
                {isSettle ? (
                  <SettleIcon width={20} height={20} color={theme.colors.text} />
                ) : (
                  <CategoryIcon category={expense.category} size={20} color={theme.colors.text} />
                )}
              </View>
            ) : null}

            <View style={styles.main}>
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
                  <Text style={[styles.sub, { marginLeft: 10 }]} numberOfLines={1}>
                    {getSettleDirectionText(expense.splits || [])} {getSymbol(expense.currency)} {Number(expense.amount || 0).toFixed(2)}
                  </Text>
                )}
              </View>

              {!isSettle && (
                <View style={styles.right}>
                  {isSplit && oweInfo ? (
                    showExpense ? (
                      <>
                        <Text style={[styles.oweText, { color: theme.colors.muted }]}>your share</Text>
                        <Text style={[styles.oweAmt, { color: theme.colors.negative ?? theme.colors.text }]}>
                          {getSymbol(expense.currency)} {Number(oweInfo.oweAmount || 0).toFixed(2)}
                        </Text>
                      </>
                    ) : (
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
          </RectButton>
        </TapGestureHandler>
      </Swipeable>

      <BottomSheetExpense
        innerRef={expenseSheetRef}
        expense={expense}
        userId={userId}
        onUpdateExpense={async (id, payload) => {
          try {
            await updateExpense(id, payload);
            update();
          } catch (error) {
            console.warn("updateExpense failed:", error);
          }
        }}
        onDeleteExpense={async (id) => {
          try {
            await deleteExpense(id);
            update();
          } catch (e) {
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
      backgroundColor: theme.colors.background,
      overflow: "hidden",
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

    actionBtn: {
      width: 64,
      justifyContent: "center",
      alignItems: "center",
    },
    actionInner: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 8,
    },
    actionText: {
      fontWeight: "700",
      fontSize: 14,
    },
  });
