// components/SplitSection.js
import React from "react";
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from "react-native";
import { getSymbol } from "../utils/currencies";

const SplitSection = ({
  amountNum,
  currency,
  selectedFriends,
  setSelectedFriends,
  splitMode,
  setSplitMode,
  userId,
  equalizePay,
  equalizeOwe,
  isPaidAmountValid,
  handleOweChange,
  handleOwePercentChange,
  getPaidAmountInfoTop,
  getPaidAmountInfoBottom,
  getRemainingTop,
  getRemainingBottom,
}) => {
  const togglePaying = (friendId) => {
    setSelectedFriends((prev) => {
      let next = prev.map((f) =>
        f._id === friendId ? { ...f, paying: !f.paying } : f
      );
      next = equalizePay(next);
      return next;
    });
  };

  const toggleOwing = (friendId) => {
    setSelectedFriends((prev) => {
      let next = prev.map((f) =>
        f._id === friendId ? { ...f, owing: !f.owing } : f
      );
      if (splitMode === "equal") next = equalizeOwe(next);
      else next = next.map((f) => ({ ...f, oweAmount: 0, owePercent: undefined }));
      return next;
    });
  };

  return (
    <View style={styles.section}>
      {/* Paid by */}
      <Text style={styles.sectionTitle}>
        Paid by <Text style={styles.hint}>(select who paid)</Text>
      </Text>
      <View style={styles.chipWrap}>
        {selectedFriends?.map((f) => (
          <TouchableOpacity
            key={`pay-${f._id}`}
            onPress={() => togglePaying(f._id)}
            style={[
              styles.chip,
              f.paying && styles.chipActive,
            ]}
          >
            <Text style={[styles.chipText, f.paying && styles.chipTextActive]}>
              {f.name} {f._id === userId ? "(You)" : ""}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {selectedFriends?.filter((f) => f.paying).length > 1 && (
        <View style={styles.breakdown}>
          <Text style={styles.breakdownText}>
            {getSymbol(currency)} {getPaidAmountInfoTop()} / {getSymbol(currency)}{" "}
            {amountNum.toFixed(2)}
          </Text>
          <Text style={styles.breakdownSub}>
            {getSymbol(currency)} {getPaidAmountInfoBottom()} left
          </Text>
        </View>
      )}

      {/* Owed by */}
      {isPaidAmountValid && isPaidAmountValid() && (
        <View style={{ marginTop: 16 }}>
          <Text style={styles.sectionTitle}>
            Owed by <Text style={styles.hint}>(select who owes)</Text>
          </Text>
          <View style={styles.chipWrap}>
            {selectedFriends.map((f) => (
              <TouchableOpacity
                key={`owe-${f._id}`}
                onPress={() => toggleOwing(f._id)}
                style={[
                  styles.chip,
                  f.owing && styles.chipActive,
                ]}
              >
                <Text
                  style={[styles.chipText, f.owing && styles.chipTextActive]}
                >
                  {f.name} {f._id === userId ? "(You)" : ""}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Split mode buttons */}
          {selectedFriends.filter((f) => f.owing).length > 1 && (
            <View style={styles.modeRow}>
              {["equal", "value", "percent"].map((m) => (
                <TouchableOpacity
                  key={m}
                  onPress={() => setSplitMode(m)}
                  style={[
                    styles.modeBtn,
                    splitMode === m && styles.modeBtnActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.modeText,
                      splitMode === m && styles.modeTextActive,
                    ]}
                  >
                    {m === "equal" ? "=" : m === "value" ? "123" : "%"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Inputs per friend if value/percent */}
          {selectedFriends.filter((f) => f.owing).length > 1 && (
            <View style={{ marginTop: 12 }}>
              {selectedFriends
                .filter((f) => f.owing)
                .map((f) => (
                  <View key={`oweAmount-${f._id}`} style={styles.oweRow}>
                    <Text style={styles.oweLabel}>
                      {f.name} {f._id === userId ? "(You)" : ""}
                    </Text>
                    {splitMode === "percent" ? (
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(f.owePercent ?? "")}
                        onChangeText={(v) =>
                          handleOwePercentChange(f._id, v)
                        }
                        placeholder="%"
                        placeholderTextColor="#777"
                      />
                    ) : splitMode === "value" ? (
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(f.oweAmount ?? "")}
                        onChangeText={(v) =>
                          handleOweChange(f._id, v)
                        }
                        placeholder="Amount"
                        placeholderTextColor="#777"
                      />
                    ) : (
                      <Text style={{ color: "#EBF1D5" }}>
                        {Number(f.oweAmount || 0).toFixed(2)}
                      </Text>
                    )}
                  </View>
                ))}

              {/* Remaining info */}
              {(!isPaidAmountValid() || splitMode !== "equal") && (
                <View style={styles.remainingWrap}>
                  <Text style={styles.breakdownText}>{getRemainingTop()}</Text>
                  <Text style={styles.breakdownSub}>{getRemainingBottom()}</Text>
                </View>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
};

export default SplitSection;

const styles = StyleSheet.create({
  section: { marginTop: 16 },
  sectionTitle: { color: "#EBF1D5", fontSize: 16, fontWeight: "700" },
  hint: { color: "#aaa", fontSize: 12 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", marginTop: 8, gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: "#55554f",
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipActive: { backgroundColor: "#00C49F", borderColor: "#00C49F" },
  chipText: { color: "#EBF1D5" },
  chipTextActive: { color: "#121212", fontWeight: "700" },
  breakdown: { alignItems: "center", marginTop: 8 },
  breakdownText: { color: "#EBF1D5", fontSize: 12, fontFamily: "monospace" },
  breakdownSub: { color: "#aaa", fontSize: 12, fontFamily: "monospace" },
  modeRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  modeBtn: {
    borderWidth: 1,
    borderColor: "#55554f",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  modeBtnActive: { backgroundColor: "#00C49F", borderColor: "#00C49F" },
  modeText: { color: "#EBF1D5" },
  modeTextActive: { color: "#121212", fontWeight: "700" },
  oweRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 6,
    alignItems: "center",
  },
  oweLabel: { color: "#EBF1D5", fontSize: 14 },
  input: {
    backgroundColor: "#1f1f1f",
    color: "#EBF1D5",
    borderRadius: 6,
    padding: 6,
    width: 80,
    textAlign: "right",
  },
  remainingWrap: { alignItems: "center", marginTop: 8 },
});
