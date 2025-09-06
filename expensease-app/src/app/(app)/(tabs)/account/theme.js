// app/account/theme.js
import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import Header from "~/header";
import { useTheme } from "context/ThemeProvider";

export default function ThemeSettingsScreen() {
    const router = useRouter();
    const { theme, preference, setPreference } = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    console.log();

    const onSelect = (pref) => {
        setPreference(pref);
        // little confirmation
        // Alert.alert("Theme changed", `Theme set to ${pref === "system" ? "System" : pref === "dark" ? "Dark" : "Light"}`);
    };

    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            <StatusBar style={theme.statusBarStyle === "dark-content" ? "dark" : "light"} />
            <Header showBack title="App Theme" />
            <View style={{ padding: 16, gap: 12 }}>
                <View style={styles.row}>
                    <View style={styles.iconWrap}>
                        <Feather name="sun" size={28} color={theme.colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.title}>{theme.mode} Theme</Text>
                        <Text style={styles.subtitle}>Choose how the app should look.</Text>
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
                            {active ? <Feather name="check" size={18} color={theme.colors.primary} /> : null}
                        </TouchableOpacity>
                    );
                })}
            </View>
        </SafeAreaView>
    );
}

const createStyles = (theme) =>
    StyleSheet.create({
        safe: { flex: 1, backgroundColor: theme.colors.background },
        row: { flexDirection: "row", alignItems: "center", gap: 12 },
        iconWrap: {
            width: 56,
            height: 56,
            borderRadius: 12,
            backgroundColor: theme.colors.card,
            borderWidth: 1,
            borderColor: theme.colors.border,
            alignItems: "center",
            justifyContent: "center",
            marginRight: 8,
        },
        title: { color: theme.colors.primary, fontSize: 16, fontWeight: "700", textTransform: 'capitalize' },
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
