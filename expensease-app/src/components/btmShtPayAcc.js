// components/BottomSheetPaymentAccount.js
import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  PixelRatio,
  FlatList,
  Modal,
  Pressable,
  Platform,
  Switch,
} from "react-native";
import BottomSheetLayout from "./btmShtHeaderFooter"; // <- new layout component
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "context/ThemeProvider";
import { PM_ICON_CHOICES } from "./pmIcons";

/**
 * Props:
 * - innerRef
 * - onClose()
 * - onSave(payload) -> called with { label, type, iconKey, capabilities, notes, isDefaultSend, isDefaultReceive, visibleForOthers, excludeFromSummaries }
 * - onDelete(id)
 * - busy (boolean)
 * - initialValues (optional)
 */

const TYPE_OPTIONS = [
  { value: "upi", label: "UPI" },
  { value: "bank", label: "Bank" },
  { value: "debit card", label: "Debit Card" },
  { value: "credit card", label: "Credit Card" },
  { value: "cash", label: "Cash" },
  { value: "wallet", label: "Wallet" },
  { value: "other", label: "Other" },
];

const BottomSheetPaymentAccount = ({
  innerRef,
  onClose,
  onSave,
  onDelete,
  busy = false,
  initialValues,
}) => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const colors = theme?.colors || {};
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [label, setLabel] = useState(initialValues?.label || "");
  const [type, setType] = useState(initialValues?.type || "upi");
  const [iconKey, setIconKey] = useState(initialValues?.iconKey ?? "auto");
  const [capSend, setCapSend] = useState(Boolean(initialValues?.capabilities?.includes("send")));
  const [capReceive, setCapReceive] = useState(Boolean(initialValues?.capabilities?.includes("receive")));

  // new fields
  const [notes, setNotes] = useState(initialValues?.notes || "");
  const [isDefaultSend, setIsDefaultSend] = useState(Boolean(initialValues?.isDefaultSend));
  const [isDefaultReceive, setIsDefaultReceive] = useState(Boolean(initialValues?.isDefaultReceive));
  const [visibleForOthers, setVisibleForOthers] = useState(
    initialValues?.visibleForOthers === undefined ? true : Boolean(initialValues?.visibleForOthers)
  );

  // NEW: excludeFromSummaries flag
  const [excludeFromSummaries, setExcludeFromSummaries] = useState(Boolean(initialValues?.excludeFromSummaries));

  const [typeModalVisible, setTypeModalVisible] = useState(false);

  const editing = Boolean(initialValues?._id);

  // responsive icon grid: prefer 5 columns for good screens, fallback to 4
  const [containerWidth, setContainerWidth] = useState(Dimensions.get("window").width - 32);
  const [cols, setCols] = useState(5); // prefer 5
  const measuredRef = useRef(false);

  useEffect(() => {
    const pr = PixelRatio.get();
    const { width, height } = Dimensions.get("window");
    const minSide = Math.min(width, height);
    const useFive = pr >= 1.5 && minSide >= 360;
    setCols(useFive ? 5 : 4);
  }, []);

  // Sync initial values when editing changes (intent: sync on mount and when editing identity changes)
  useEffect(() => {
    setLabel(initialValues?.label || "");
    setType(initialValues?.type || "upi");
    setIconKey(initialValues?.iconKey ?? "auto");
    setCapSend(Boolean(initialValues?.capabilities?.includes("send")));
    setCapReceive(Boolean(initialValues?.capabilities?.includes("receive")));
    setNotes(initialValues?.notes || "");
    setIsDefaultSend(Boolean(initialValues?.isDefaultSend));
    setIsDefaultReceive(Boolean(initialValues?.isDefaultReceive));
    setVisibleForOthers(initialValues?.visibleForOthers === undefined ? true : Boolean(initialValues?.visibleForOthers));
    setExcludeFromSummaries(Boolean(initialValues?.excludeFromSummaries));
  }, [initialValues?._id]); // only re-run when the _id changes

  useEffect(() => {
    if (!innerRef?.current) return;
    const reset = () => {
      setLabel("");
      setType("upi");
      setIconKey("auto");
      setCapSend(false);
      setCapReceive(false);
      setNotes("");
      setIsDefaultSend(false);
      setIsDefaultReceive(false);
      setVisibleForOthers(true);
      setExcludeFromSummaries(false);
    };
    innerRef.current?.addListener?.("onDismiss", reset);
    return () => innerRef.current?.removeListener?.("onDismiss", reset);
  }, [innerRef]);

  const save = () => {
    const payload = {
      label: (label || "").trim(),
      type: (type || "").trim(),
      iconKey: iconKey || "auto",
      capabilities: [...(capSend ? ["send"] : []), ...(capReceive ? ["receive"] : [])],
      notes: (notes || "").trim(),
      isDefaultSend: !!isDefaultSend,
      isDefaultReceive: !!isDefaultReceive,
      visibleForOthers: !!visibleForOthers,
      // NEW: include excludeFromSummaries
      excludeFromSummaries: !!excludeFromSummaries,
    };
    onSave?.(payload);
  };

  // When hiding from others, defaults must be cleared
  const toggleVisibleForOthers = (val) => {
    const next = typeof val === "boolean" ? val : !visibleForOthers;
    setVisibleForOthers(next);
    if (!next) {
      setIsDefaultSend(false);
      setIsDefaultReceive(false);
    }
  };

  // When a default is set, ensure visibleForOthers is true
  const setDefaultSendHandler = (v) => {
    setIsDefaultSend(v);
    if (v) setVisibleForOthers(true);
  };
  const setDefaultReceiveHandler = (v) => {
    setIsDefaultReceive(v);
    if (v) setVisibleForOthers(true);
  };

  // ensure defaults are cleared immediately whenever visibility is off
  useEffect(() => {
    if (!visibleForOthers) {
      setIsDefaultSend(false);
      setIsDefaultReceive(false);
    }
  }, [visibleForOthers]);

  // compute icon item size given containerWidth and cols
  const iconGap = 8;
  const horizontalPadding = 16 * 2; // sheet paddingHorizontal
  const effectiveWidth = Math.max(containerWidth - horizontalPadding, 0);
  const itemSize = Math.floor((effectiveWidth - iconGap * (cols - 1)) / cols);

  // render icon item (button-like compact)
  const renderIconItem = ({ item }) => {
    const active = item.key === iconKey;
    const Icon = item.Icon;
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setIconKey(item.key)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        style={[styles.iconButton, active && styles.iconButtonActive, { width: itemSize }]}
      >
        <Icon size={20} color={colors.text} />
        <Text style={[styles.iconButtonLabel, active && { color: colors.text, opacity: 1 }]} numberOfLines={1}>
          {item.label}
        </Text>
      </TouchableOpacity>
    );
  };

  // RowSwitch: label + optional hint + native Switch on the right
  const RowSwitch = ({ label: lbl, value, onValueChange, disabled, hint }) => (
    <View style={[styles.rowSwitch, disabled && { opacity: 0.6 }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowSwitchLabel}>{lbl}</Text>
        {hint ? <Text style={styles.rowSwitchHint}>{hint}</Text> : null}
      </View>

      <Switch
        value={!!value}
        onValueChange={(v) => !disabled && onValueChange(v)}
        disabled={!!disabled}
        thumbColor={Platform.OS === "android" ? (!!value ? colors.primary || "#60DFC9" : "#fff") : undefined}
        trackColor={{
          true: hexToRgba(colors.primary || "#60DFC9"),
          false: undefined,
        }}
      />
    </View>
  );

  // footer handlers passed into BottomSheetLayout footerOptions
  const handleCancel = () => {
    innerRef.current?.dismiss();
  };

  const handleDelete = () => {
    if (editing) onDelete?.(initialValues._id);
  };

  return (
    <BottomSheetLayout
      innerRef={innerRef}
      title={editing ? "Edit Payment Account" : "Add Payment Account"}
      onClose={onClose}
      footerOptions={{
        showDelete: editing,
        onDelete: handleDelete,
        deleteLabel: "Delete",
        onCancel: handleCancel,
        cancelLabel: "Cancel",
        primaryLabel: editing ? "Save" : "Add",
        onPrimary: save,
        primaryDisabled: !label.trim() || busy,
        busy,
      }}
    >
      {/* Content goes here (children of BottomSheetLayout) */}
      <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
        <View style={{ flex: 1.8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={styles.sectionTitle}>Label</Text>
            <Text style={styles.counterText}>max 15 characters</Text>
          </View>
          <TextInput
            placeholder="e.g. HDFC UPI, Cash"
            placeholderTextColor={colors.muted || "#777"}
            value={label}
            onChangeText={(t) => setLabel(t.slice(0, 15))}
            style={styles.input}
            maxLength={15}
          />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={[styles.sectionTitle, { marginBottom: 6 }]}>Type</Text>
          <TouchableOpacity onPress={() => setTypeModalVisible(true)} style={styles.customSelect}>
            <Text style={styles.customSelectText}>{TYPE_OPTIONS.find((o) => o.value === type)?.label || "Select"}</Text>
            <Feather name="chevron-down" size={18} color={colors.muted || "#999"} />
          </TouchableOpacity>

          {/* Type modal */}
          <Modal visible={typeModalVisible} transparent animationType="fade" onRequestClose={() => setTypeModalVisible(false)}>
            <Pressable style={styles.modalBackdrop} onPress={() => setTypeModalVisible(false)}>
              <View style={[styles.modalCardSmall, { marginHorizontal: 24 }]}>
                <FlatList
                  data={TYPE_OPTIONS}
                  keyExtractor={(it) => it.value}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      onPress={() => {
                        setType(item.value);
                        setTypeModalVisible(false);
                      }}
                      style={styles.modalOption}
                    >
                      <Text style={styles.modalOptionText}>{item.label}</Text>
                    </TouchableOpacity>
                  )}
                  ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.border || "#333", marginVertical: 4 }} />}
                />
              </View>
            </Pressable>
          </Modal>
        </View>
      </View>

      <Text style={[styles.helperText, { marginTop: 8 }]}>Label and Type will be visible to friends while splitting</Text>

      {/* Icon chooser (responsive grid) */}
      <Text style={[styles.sectionTitle, { marginTop: 12 }]}>Icon</Text>

      <View
        onLayout={(e) => {
          const w = e?.nativeEvent?.layout?.width ?? Dimensions.get("window").width - 32;
          if (!measuredRef.current || Math.abs(w - containerWidth) > 6) {
            measuredRef.current = true;
            setContainerWidth(w + 32);
          }
        }}
        style={{ marginTop: 8 }}
      >
        <FlatList
          data={PM_ICON_CHOICES}
          keyExtractor={(i) => i.key}
          renderItem={renderIconItem}
          numColumns={cols}
          columnWrapperStyle={{ justifyContent: "flex-start", gap: iconGap, marginBottom: 12 }}
          scrollEnabled={false}
        />
        <Text style={styles.helperTextSmall}>
          Tip: choose <Text style={{ fontWeight: "700" }}>Auto</Text> to let the app pick icon based on type.
        </Text>
      </View>

      {/* Notes */}
      <Text style={[styles.sectionTitle, { marginTop: 12 }]}>Notes (optional)</Text>
      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder="Notes about this account (for your reference)"
        placeholderTextColor={colors.muted || "#777"}
        style={[styles.input, { minHeight: 80, textAlignVertical: "top", paddingTop: 12 }]}
        multiline
        numberOfLines={4}
      />

      {/* Visibility & Defaults + Exclude switch */}
      <Text style={[styles.sectionTitle, { marginTop: 12 }]}>Visibility & Defaults</Text>

      <View style={{ marginTop: 8, gap: 8 }}>
        <RowSwitch
          label="Visible to others"
          value={visibleForOthers}
          onValueChange={toggleVisibleForOthers}
          hint="When off, friends won’t see this method in splits but you can still use it."
        />

        <RowSwitch
          label="Default for Expenses"
          value={isDefaultSend}
          onValueChange={setDefaultSendHandler}
          disabled={!visibleForOthers}
          hint={!visibleForOthers ? "Hidden methods can’t be set as defaults." : undefined}
        />

        <RowSwitch
          label="Default for Receiving Money"
          value={isDefaultReceive}
          onValueChange={setDefaultReceiveHandler}
          disabled={!visibleForOthers}
          hint={!visibleForOthers ? "Hidden methods can’t be set as defaults." : undefined}
        />

        <RowSwitch
          label="Exclude from summaries & trends"
          value={excludeFromSummaries}
          onValueChange={() => setExcludeFromSummaries((prev) => !prev)}
          hint="When enabled this payment method will be ignored in summary calculations, charts and trends (analytics)."
        />
      </View>

      {/* spacer so content doesn't butt up directly against footer */}
      <View style={{ height: 8 }} />
    </BottomSheetLayout>
  );
};

export default BottomSheetPaymentAccount;

/* styles */
const createStyles = (c = {}) =>
  StyleSheet.create({
    sectionTitle: {
      color: c.text || "#EBF1D5",
      fontSize: 14,
      fontWeight: "700",
      marginBottom: 6,
    },

    counterText: { color: c.muted || "#9aa19a", fontSize: 12 },

    input: {
      backgroundColor: c.cardAlt || "#1f1f1f",
      color: c.text || "#EBF1D5",
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border || "#55554f",
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      marginBottom: 8,
      height: 40,
    },

    customSelect: {
      height: 40,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border || "#555",
      backgroundColor: c.cardAlt || "#1f1f1f",
      paddingHorizontal: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    customSelectText: { color: c.text || "#EBF1D5" },

    modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center" },
    modalCardSmall: { backgroundColor: c.card || "#1f1f1f", marginHorizontal: 20, borderRadius: 12, padding: 8, maxHeight: "60%" },
    modalOption: { paddingVertical: 12, paddingHorizontal: 12 },
    modalOptionText: { color: c.text || "#EBF1D5", fontSize: 16 },

    iconButton: {
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 10,
      borderRadius: 10,
      gap: 5,
      backgroundColor: "transparent",
      borderWidth: 1,
      borderColor: c.cardAlt || "#262626",
    },
    iconButtonActive: {
      backgroundColor: c.primary ? `${hexToRgba(c.primary, 0.12)}` : "rgba(96,223,201,0.12)",
      borderColor: c.primary || "#60DFC9",
    },
    iconButtonLabel: {
      color: c.text || "#EBF1D5",
      fontSize: 10,
      maxWidth: "100%",
      textAlign: "center",
    },

    helperText: { color: c.muted || "#9aa19a", fontSize: 12 },
    helperTextSmall: { color: c.muted || "#9aa19a", fontSize: 11, marginTop: 6 },

    btn: { borderRadius: 8, paddingVertical: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 14, backgroundColor: c.cardAlt || "#2a2a2a" },
    btnText: { fontWeight: "700", color: c.text || "#EBF1D5" },
    btnMuted: { backgroundColor: c.cardAlt || "#2a2a2a", borderWidth: 1, borderColor: c.border || "#444" },
    btnDisabled: { backgroundColor: c.border || "#555", opacity: 0.8 },
    btnDanger: { backgroundColor: c.danger || "#ef4444" },

    // footer helpers (not used directly here but kept for consistency)
    footerBtn: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, minWidth: 96, alignItems: "center", justifyContent: "center", backgroundColor: c.cardAlt || "#2a2a2a" },
    footerBtnText: { color: c.text || "#EBF1D5", fontWeight: "700" },
    footerPrimaryBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, backgroundColor: c.primary || "#60DFC9", marginLeft: 8 },
    footerPrimaryBtnText: { color: "#121212", fontWeight: "800" },

    // RowSwitch styles
    rowSwitch: { flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 12 },
    rowSwitchLabel: { color: c.text || "#EBF1D5", fontSize: 14, fontWeight: "600" },
    rowSwitchHint: { color: c.muted || "#9aa19a", fontSize: 12 },

    modalOptionText: { color: c.text || "#EBF1D5", fontSize: 16 },
  });

// small helper to create rgba from hex
function hexToRgba(hex = "#000000", alpha = 1) {
  const h = hex.replace("#", "");
  if (h.length !== 6) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
