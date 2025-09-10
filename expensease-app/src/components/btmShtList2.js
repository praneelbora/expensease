// components/BottomSheetList.js
import React, { useState, useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, TextInput } from "react-native";
import { Feather } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MainBottomSheet from "./mainBottomSheet";
import CategoryIcon from "./categoryIcon"; // ensure this points to your CategoryIcon component
import { useTheme } from "context/ThemeProvider";

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
    const { theme } = useTheme?.() || {};
    const colors = theme?.colors || {};
    const styles = useMemo(() => createStyles(colors), [colors]);

    // Filtered options
    const filteredOptions = useMemo(() => {
        if (!withSearch || !search.trim()) return options;
        const q = search.toLowerCase();
        return options.filter((opt) => {
            const labelMatch = String(opt[labelKey] ?? "").toLowerCase().includes(q);
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
                    <Feather name="search" size={18} color={colors.muted ?? "#aaa"} style={{ marginRight: 8 }} />
                    <TextInput
                        placeholder={searchPlaceholder}
                        placeholderTextColor={colors.muted ?? "#777"}
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
                            key={String(opt[valueKey])}
                            style={[styles.row, active && { backgroundColor: (colors.cta ?? "#00C49F") + "22" }]}
                            onPress={() => {
                                onSelect(opt[valueKey]);
                                onClose?.();
                                innerRef.current?.dismiss();
                            }}
                        >
                            {/* Left: icon + label */}
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 }}>
                                {opt.icon ? <CategoryIcon category={opt.value} size={20} color={colors.text} /> : null}
                                <Text numberOfLines={1} style={styles.label}>{opt[labelKey]}</Text>
                            </View>

                            {/* Right: extra key or check */}
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                {extraRightKey && (
                                    <Text style={styles.code}>{opt[extraRightKey]}</Text>
                                )}
                                {active ? <Feather name="check" size={18} color={colors.cta ?? "#00C49F"} /> : null}
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

/* theme-aware styles */
const createStyles = (colors = {}) => StyleSheet.create({
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border ?? "#333",
        backgroundColor: colors.card ?? "#1f1f1f",
    },
    headerText: {
        color: colors.text ?? "#EBF1D5",
        fontSize: 18,
        fontWeight: "700",
    },
    closeBtn: {
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    closeText: {
        color: colors.negative ?? "#EA4335",
        fontSize: 16,
        fontWeight: "600",
    },
    searchWrap: {
        flexDirection: "row",
        alignItems: "center",
        marginHorizontal: 16,
        marginVertical: 8,
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 8,
        backgroundColor: colors.background ?? "#121212",
    },
    searchInput: {
        flex: 1,
        color: colors.text ?? "#EBF1D5",
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
        backgroundColor: colors.cardAlt ?? "rgba(255,255,255,0.05)",
    },
    label: { color: colors.text ?? "#EBF1D5", fontSize: 16, flexShrink: 1 },
    code: { color: colors.muted ?? "#aaa", fontSize: 14 },
});
