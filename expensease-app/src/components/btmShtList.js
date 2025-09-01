// components/BottomSheetList.js
import React, { useState, useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, TextInput } from "react-native";
import { Feather } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MainBottomSheet from "./mainBottomSheet";
import CategoryIcon from "./categoryIcon"; // ✅ ensure this points to your CategoryIcon component

const BottomSheetList = ({
    innerRef,
    onClose,
    title = "",
    options = [],
    value,
    onSelect,
    withSearch = true,
    searchPlaceholder = "Search...",
    labelKey = "label",
    valueKey = "value",
    extraRightKey, // e.g. "code" to show currency code
}) => {
    const insets = useSafeAreaInsets();
    const [search, setSearch] = useState("");

    // Filtered options
    const filteredOptions = useMemo(() => {
        if (!withSearch || !search.trim()) return options;
        const q = search.toLowerCase();
        return options.filter((opt) => {
            const labelMatch = String(opt[labelKey]).toLowerCase().includes(q);
            const codeMatch =
                extraRightKey && String(opt[extraRightKey] || "").toLowerCase().includes(q);
            const keywordMatch = Array.isArray(opt.keywords)
                ? opt.keywords.some((k) => String(k).toLowerCase().includes(q))
                : false;
            return labelMatch || codeMatch || keywordMatch;
        });
    }, [search, options, labelKey, extraRightKey, withSearch]);

    return (
        <MainBottomSheet innerRef={innerRef} onDismiss={onClose}>
            {/* Header with safe area top */}
            <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                <Text style={styles.headerText}>{title}</Text>
                <TouchableOpacity
                    onPress={() => innerRef.current?.dismiss()}
                    style={styles.closeBtn}
                >
                    <Text style={styles.closeText}>Cancel</Text>
                </TouchableOpacity>
            </View>

            {/* Search */}
            {withSearch && (
                <View style={styles.searchWrap}>
                    <Feather name="search" size={18} color="#aaa" style={{ marginRight: 8 }} />
                    <TextInput
                        placeholder={searchPlaceholder}
                        placeholderTextColor="#777"
                        value={search}
                        onChangeText={setSearch}
                        style={styles.searchInput}
                    />
                </View>
            )}

            {/* List */}
            <BottomSheetScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {filteredOptions.map((opt) => {
                    const active = value === opt[valueKey];
                    return (
                        <TouchableOpacity
                            key={opt[valueKey]}
                            style={[styles.row, active && { backgroundColor: "rgba(0,196,159,0.2)" }]}
                            onPress={() => {
                                onSelect(opt[valueKey]);
                                onClose?.(opt[valueKey]);
                                innerRef.current?.dismiss();
                            }}
                        >
                            {/* Left: icon + label */}
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                {opt.icon ? <CategoryIcon category={opt.value} size={20} /> : null}
                                <Text style={styles.label}>{opt[labelKey]}</Text>
                            </View>

                            {/* Right: extra key or check */}
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                {extraRightKey && (
                                    <Text style={styles.code}>{opt[extraRightKey]}</Text>
                                )}
                                {active ? <Feather name="check" size={18} color="#00C49F" /> : null}
                            </View>
                        </TouchableOpacity>
                    );
                })}

                {/* Safe area bottom spacer */}
                <View style={{ height: insets.bottom + 12 }} />
            </BottomSheetScrollView>
        </MainBottomSheet>
    );
};

export default BottomSheetList;

const styles = StyleSheet.create({
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: "#333",
    },
    headerText: {
        color: "#EBF1D5",
        fontSize: 18,
        fontWeight: "700",
    },
    closeBtn: {
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    closeText: {
        color: "#EA4335",
        fontSize: 16,
        fontWeight: "600",
    },
    searchWrap: {
        flexDirection: "row",
        alignItems: "center",
        marginHorizontal: 16,
        marginTop: 8,
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 8,
        backgroundColor: "#121212",
    },
    searchInput: {
        flex: 1,
        color: "#EBF1D5",
        paddingVertical: 8,
        fontSize: 16,
    },
    scrollContent: {
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    row: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 12,
        paddingHorizontal: 10,
        borderRadius: 8,
        marginBottom: 6,
        backgroundColor: "rgba(255,255,255,0.05)"
    },
    label: { color: "#EBF1D5", fontSize: 16 },
    code: { color: "#aaa", fontSize: 14 },
});
