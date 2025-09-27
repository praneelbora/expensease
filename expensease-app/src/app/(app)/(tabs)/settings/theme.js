// app/settings/theme.js
import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import Sun from "@/accIcons/sun.svg";
import Moon from "@/accIcons/moon.svg"; // should exist in your accIcons folder
import Check from "@/accIcons/check.svg";
import Header from "~/header";
import { useTheme } from "context/ThemeProvider";

export default function ThemeSettingsScreen() {
  const router = useRouter();
  const { theme, preference, setPreference } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const onSelect = (pref) => {
    setPreference(pref);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StatusBar style={theme.statusBarStyle === "dark-content" ? "dark" : "light"} />
      <Header showBack title="App Theme" />
      <View style={{ padding: 16, gap: 12 }}>
        <View style={styles.row}>
          <SingleThemeIcon theme={theme} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{theme.mode} Theme</Text>
            <Text style={styles.subtitle}>This shows the currently active app theme.</Text>
          </View>
        </View>

        {[
          { key: "system", label: "System" },
          { key: "light", label: "Light" },
          { key: "dark", label: "Dark" },
        ].map((opt) => {
          const active = preference === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              onPress={() => onSelect(opt.key)}
              style={[styles.optionRow, active && styles.optionRowActive]}
              activeOpacity={0.8}
            >
              <Text style={[styles.optionText, active && { fontWeight: "700" }]}>{opt.label}</Text>
              {active ? <Check width={18} height={18} color={theme.colors.primary} /> : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

/** SingleThemeIcon
 *  - non-interactive, displays exactly one icon depending on theme.mode
 *  - icon uses primary color for visibility
 */
function SingleThemeIcon({ theme }) {
  const isLight = theme.mode === "light";
  const iconSize = 36;
  const iconColor = theme.colors.primary;

  return (
    <View style={[localStyles.iconContainer, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
      {isLight ? (
        <Sun width={iconSize} height={iconSize} fill={iconColor} />
      ) : (
        <Moon width={iconSize} height={iconSize} fill={iconColor} />
      )}
    </View>
  );
}

const localStyles = StyleSheet.create({
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    marginRight: 8,
  },
});

const createStyles = (theme) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.colors.background },
    row: { flexDirection: "row", alignItems: "center", gap: 12 },
    title: { color: theme.colors.primary, fontSize: 16, fontWeight: "700", textTransform: "capitalize" },
    subtitle: { color: theme.colors.muted, fontSize: 13 },
    optionRow: {
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: "transparent",
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    optionRowActive: { borderColor: theme.colors.primary },
    optionText: { color: theme.colors.text, fontSize: 15 },
  });
