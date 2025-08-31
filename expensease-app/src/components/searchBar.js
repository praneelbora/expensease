// components/SearchBar.js
import React from "react";
import { View, TextInput, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";

export default function SearchBar({
    value,
    onChangeText,
    placeholder = "Search...",
    style,
}) {
    return (
        <View style={[styles.searchWrap, style]}>
            <Feather
                name="search"
                size={18}
                color="#aaa"
                style={{ marginRight: 8 }}
            />
            <TextInput
                placeholder={placeholder}
                placeholderTextColor="#777"
                value={value}
                onChangeText={onChangeText}
                style={styles.searchInput}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    searchWrap: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#1f1f1f",
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#555",
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    searchInput: {
        flex: 1,
        fontSize: 16,
        color: "#EBF1D5",
    },

});
