// components/FAB.js
import React from "react";
import { TouchableOpacity, View, Text, StyleSheet, Platform } from "react-native";
import { useTheme } from "context/ThemeProvider";
import Plus from "@/accIcons/plus.svg";

export default function FAB({ onPress = () => { }, size = 54, right = 18, bottom = Platform.OS === "ios" ? 18 : 18, accessibilityLabel = "Add" }) {
    const { theme } = useTheme();
    const styles = makeStyles(theme, size, right, bottom);

    return (
        <TouchableOpacity style={[styles.fab, { backgroundColor: theme?.colors?.primary ?? "#00C49F" }]} onPress={onPress}>
            <Plus width={22} height={22} color={theme?.colors?.inverseText ?? "#121212"} />
            <Text style={styles.fabText}>Add Expense</Text>
        </TouchableOpacity>
    );
}

const makeStyles = (theme, size, right, bottom) =>
    StyleSheet.create({
        fab: {
            position: "absolute",
            right: 16,
            bottom: 24,
            borderRadius: 999,
            paddingHorizontal: 16,
            paddingVertical: 12,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            shadowColor: "#000",
            shadowOpacity: 0.36,
            shadowRadius: 8,
            shadowOffset: { width: 4, height: 4 },
            elevation: 10,

        },
        fabText: { color: theme?.colors?.inverseText ?? "#121212", fontWeight: "700" },

    });
