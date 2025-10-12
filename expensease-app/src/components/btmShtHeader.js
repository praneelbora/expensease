// components/btmShtHeaderFooter.js
import React, { useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "context/ThemeProvider";
import MainBottomSheet from "./mainBottomSheet";

/**
 * Props:
 * - innerRef
 * - title
 * - onClose
 * - children
 *
 * Footer options (three ways):
 * 1) footerOptions: { showDelete, onDelete, deleteLabel, onCancel, cancelLabel, primaryLabel, onPrimary, primaryDisabled, busy }
 * 2) footerLeft / footerCenter / footerRight: React nodes
 * 3) renderFooter: ({ busy, primaryDisabled, defaultLayout }) => ReactNode  // takes control entirely
 *
 * Priority: renderFooter > footerLeft/Center/Right > footerOptions default layout
 */
export default function BottomSheetLayout({
  innerRef,
  title,
  onClose,
  children,
  addView = false,
}) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const colors = theme?.colors || {};
  const styles = useMemo(() => createStyles(colors), [colors]);


  const defaultOnCancel = () => {
    if (onCancel) onCancel();
    innerRef?.current?.dismiss?.();
  };



  return (
    <MainBottomSheet innerRef={innerRef} onDismiss={onClose} addView={addView}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.headerText}>{title}</Text>
        <TouchableOpacity onPress={() => { onClose?.(); innerRef?.current?.dismiss?.(); }} style={styles.closeBtn}>
          <Text style={styles.closeText}>Cancel</Text>
        </TouchableOpacity>
      </View>

      {/* Scroll area */}
      <BottomSheetScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom }}
      >
        {children}
      </BottomSheetScrollView>
    </MainBottomSheet>
  );
}

/* styles - same as earlier but included for completeness */
const createStyles = (c = {}) =>
  StyleSheet.create({
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.border || "#333",
    },
    headerText: { color: c.text || "#EBF1D5", fontSize: 18, fontWeight: "700", textTransform: "capitalize" },
    closeBtn: { padding: 4 },

    footerWrap: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      borderTopWidth: 1,
      paddingHorizontal: 12,
      justifyContent: "center",
    },
    footerInner: { flexDirection: "row", alignItems: "center", gap: 12 },
    footerBtn: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, minWidth: 96, alignItems: "center", justifyContent: "center", backgroundColor: c.cardAlt || "#2a2a2a" },
    footerBtnText: { color: c.text || "#EBF1D5", fontWeight: "700" },
    footerPrimaryBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, backgroundColor: c.primary || "#60DFC9", marginLeft: 8 },
    footerPrimaryBtnText: { color: "#121212", fontWeight: "800" },

    btnMuted: { backgroundColor: c.cardAlt || "#2a2a2a", borderWidth: 1, borderColor: c.border || "#444" },
    btnDisabled: { backgroundColor: c.border || "#555", opacity: 0.8 },
    btnDanger: { backgroundColor: c.danger || "#ef4444" },

    closeText: { color: c.negative || "#EA4335", fontSize: 16 },

    rowSwitch: { flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 12 },
    rowSwitchLabel: { color: c.text || "#EBF1D5", fontSize: 14, fontWeight: "600" },
    rowSwitchHint: { color: c.muted || "#9aa19a", fontSize: 12 },
  });
