import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme as useThemeContext } from "context/ThemeProvider";

/**
 * EmptyCTA
 * Generic, reusable CTA card template for any empty state.
 *
 * Props:
 * - visible: boolean — whether to show the CTA
 * - title: string — headline text
 * - subtitle: string — supporting text
 * - ctaLabel: string — primary button label
 * - onPress: function — primary button handler
 * - secondaryLabel: string (optional) — second button label
 * - onSecondaryPress: function (optional) — second button handler
 * - icon: string (Ionicons name, optional)
 * - style: object (optional) — container-level style override
 * - textAlign: string (optional) — title/subtitle alignment, default 'center'
 * - theme: optional theme override object
 */
export default function EmptyCTA({
  visible = true,
  title = "No data yet!",
  subtitle = "Nothing to display here.",
  ctaLabel = "Take Action",
  onPress,
  secondaryLabel,
  onSecondaryPress,
  icon = "information-circle-outline",
  style,
  textAlign = "center",
  theme: themeProp,
}) {
  if (!visible) return null;

  let themeFromContext;
  try {
    themeFromContext = useThemeContext?.().theme;
  } catch {
    themeFromContext = null;
  }

  let themeFromUtils = null;
  try {
    const utilsTheme = require("utils/theme");
    themeFromUtils = utilsTheme?.default || utilsTheme?.theme || null;
  } catch {
    themeFromUtils = null;
  }

  const theme = {
    colors: {
      background: "#ffffff",
      card: "#ffffff",
      text: "#0F172A",
      muted: "#6B7280",
      primary: "#0B5FFF",
      inverseText: "#ffffff",
      ...(themeFromUtils?.colors || {}),
      ...(themeFromContext?.colors || {}),
      ...(themeProp?.colors || {}),
    },
    ...(themeFromUtils || {}),
    ...(themeFromContext || {}),
    ...(themeProp || {}),
  };

  const styles = makeStyles(theme);

  return (
    <View style={[styles.card, style]} accessibilityRole="summary">

      <Text style={[styles.title, { textAlign }]}>{title}</Text>
      <Text style={[styles.subtitle, { textAlign }]}>{subtitle}</Text>

      <View style={styles.btnRow}>
        {onPress && (
          <TouchableOpacity
            onPress={onPress}
            style={[styles.ctaBtn, styles.primaryBtn]}
            accessibilityRole="button"
            accessibilityLabel={ctaLabel}
          >
            <Text style={styles.primaryBtnText}>{ctaLabel}</Text>
          </TouchableOpacity>
        )}

        {secondaryLabel && onSecondaryPress && (
          <TouchableOpacity
            onPress={onSecondaryPress}
            style={[styles.ctaBtn, styles.secondaryBtn]}
            accessibilityRole="button"
            accessibilityLabel={secondaryLabel}
          >
            <Text style={styles.secondaryBtnText}>{secondaryLabel}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const makeStyles = (theme) =>
  StyleSheet.create({
    card: {
      width: "100%",
      padding: 20,
      borderRadius: 12,
      backgroundColor: theme.colors.card ?? "#fff",
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOpacity: 0.03,
      shadowRadius: 8,
      elevation: 2,
    },
    iconWrap: {
      marginBottom: 12,
    },
    title: {
      fontSize: 18,
      fontWeight: "700",
      color: theme.colors.text ?? "#0F172A",
      marginBottom: 6,
    },
    subtitle: {
      fontSize: 14,
      color: theme.colors.muted ?? "#6B7280",
      marginBottom: 14,
      textAlign: "center",
    },
    btnRow: {
      flexDirection: "row",
      gap: 10,
      marginTop: 6,
    },
    ctaBtn: {
      height: 44,
      minWidth: 120,
      paddingHorizontal: 16,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    primaryBtn: {
      backgroundColor: theme.colors.primary ?? "#0B5FFF",
    },
    primaryBtnText: {
      color: theme.colors.text ?? "#fff",
      fontWeight: "700",
      fontSize: 15,
    },
    secondaryBtn: {
      backgroundColor: theme.colors.primary ?? "#0B5FFF",
    },
    secondaryBtnText: {
      color: theme.colors.text ?? "#fff",
      fontWeight: "700",
      fontSize: 15,
    },
  });
