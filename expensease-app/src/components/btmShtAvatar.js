// components/btmShtAvatar.js
import React, { useMemo, useState, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import BottomSheetLayout from "./btmShtHeaderFooter"; // your provided component
import avatars from "@/avatars"; // generated index.js exporting {id, Component}
import { useTheme } from "context/ThemeProvider";

export default function AvatarPickerSheet({
  innerRef,
  title = "Choose Avatar",
  currentId = null,
  initialSelection = null,
  onSave = async () => {},
  onClose = () => {},
}) {
  const { theme } = useTheme();
  const colors = theme.colors || {};
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [selected, setSelected] = useState(initialSelection ?? currentId);
  const [busy, setBusy] = useState(false);

  const handlePrimary = useCallback(async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await onSave(selected);
    } finally {
      setBusy(false);
      innerRef?.current?.dismiss?.();
      onClose?.();
    }
  }, [selected, onSave, onClose, innerRef]);

  const handlePressTile = (id) => {
    setSelected(id);
  };

  return (
    <BottomSheetLayout
      innerRef={innerRef}
      title={title}
      onClose={() => {
        onClose?.();
        innerRef?.current?.dismiss?.();
      }}
      footerOptions={{
        primaryLabel: "Save",
        onPrimary: handlePrimary,
        primaryDisabled: !selected || busy,
        onCancel: () => {
          innerRef?.current?.dismiss?.();
          onClose?.();
        },
        busy,
      }}
      addView={false}
    >
      <View style={{ paddingTop: 8 }}>
        <Text style={styles.hint}>Pick an avatar to show on your profile.</Text>

        {/* Non-virtualized grid to avoid nested VirtualizedLists */}
        <View style={styles.gridContainer}>
          {avatars.map((item) => {
            const AvatarComp = item.Component;
            const isSelected = item.id === selected;
            return (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.8}
                onPress={() => handlePressTile(item.id)}
                style={[styles.tile]}
              >
                <View style={styles.avatarWrap}>
                  <AvatarComp width={56} height={56} />
                </View>
                {isSelected && (
                  <View style={styles.checkBadge}>
                    <Text style={styles.checkText}>✓</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </BottomSheetLayout>
  );
}

const createStyles = (c = {}) =>
  StyleSheet.create({
    hint: { color: c.muted || "#9aa19a", fontSize: 13, marginBottom: 8 },
    gridContainer: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "flex-start",
      paddingVertical: 12,
    },
    tile: {
      width: "25%", // 4 columns
      padding: 8,
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
    },
    tileActive: {
      borderRadius: 12,
      backgroundColor: c.cardAlt || "rgba(0,0,0,0.03)",
    },
    avatarWrap: {
      width: 72,
      height: 72,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.background || "#fff",
    },
    checkBadge: {
      position: "absolute",
      right: 4,
      top: 4,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: c.primary || "#60DFC9",
      alignItems: "center",
      justifyContent: "center",
    },
    checkText: { color: c.mode === "dark" ? "#000" : "#121212", fontWeight: "700" },
  });
