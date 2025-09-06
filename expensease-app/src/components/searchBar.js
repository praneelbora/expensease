// components/SearchBar.js
import React from "react";
import { View, TextInput, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "context/ThemeProvider";

export default function SearchBar({
    value,
    onChangeText,
    placeholder = "Search...",
    style,
}) {
    const { theme } = useTheme();
    const colors = theme.colors;

    return (
        <View
            style={[
                styles.searchWrap,
                {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                },
                style,
            ]}
        >
            <Feather
                name="search"
                size={18}
                color={colors.muted}
                style={{ marginRight: 8 }}
            />
            <TextInput
                placeholder={placeholder}
                placeholderTextColor={colors.muted}
                value={value}
                onChangeText={onChangeText}
                style={[styles.searchInput, { color: colors.text }]}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    searchWrap: {
        flexDirection: "row",
        alignItems: "center",
        borderRadius: 10,
        borderWidth: 1,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    searchInput: {
        flex: 1,
        fontSize: 16,
    },
});
