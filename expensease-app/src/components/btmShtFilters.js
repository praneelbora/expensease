// components/FilterSheet.js
import React, { useEffect, useState, useMemo } from "react";
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MainBottomSheet from "./mainBottomSheet";
import { categoryMap } from "utils/categories";
import { iconMap } from "@/icons";
import { useTheme } from "context/ThemeProvider";

const FilterSheet = ({ innerRef, selected, filters = [], categories = [], onApply, onClose }) => {
    const insets = useSafeAreaInsets();
    const { theme } = useTheme();
    const colors = theme?.colors || {};
    const styles = useMemo(() => createStyles(colors), [colors]);

    const [local, setLocal] = useState(selected || {});

    useEffect(() => {
        console.log(selected);
        console.log(filters);

        setLocal(selected || {});
    }, [selected]);

    const setKey = (k, v) => setLocal((s) => ({ ...s, [k]: v }));

    return (
        <MainBottomSheet innerRef={innerRef} onDismiss={onClose}>
            <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                <Text style={styles.headerText}>Filters</Text>
                <TouchableOpacity onPress={() => innerRef.current?.dismiss()}>
                    <Text style={styles.closeText}>Cancel</Text>
                </TouchableOpacity>
            </View>

            <ScrollView
                style={styles.container}
                contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
                showsVerticalScrollIndicator={false}
            >
                {/* Type */}
                <Text style={styles.sectionLabel}>Type</Text>
                <View style={styles.chipsRow}>
                    {filters.map((f) => (
                        <TouchableOpacity
                            key={f.key}
                            style={[styles.chip, local.type === f.key && styles.chipActive]}
                            onPress={() => {
                                if (f.key === "settle") {
                                    setKey("category", "all");
                                    setKey("mode", "splits");
                                }
                                setKey("type", f.key);
                            }}
                        >
                            <Text style={[styles.chipText, local.type === f.key && styles.chipTextActive]}>
                                {f.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Category */}
                {local.type !== "settle" && (
                    <>
                        <Text style={styles.sectionLabel}>Category</Text>
                        <View style={styles.chipsRow}>
                            {categories.map((c) => {
                                const entry = Object.values(categoryMap).find((cat) => cat.label === c);
                                const Icon = entry ? iconMap[entry.icon] : null;
                                const active = local.category === c;
                                return (
                                    <TouchableOpacity
                                        key={String(c)}
                                        style={[styles.chip, active && styles.chipActive, { flexDirection: "row", alignItems: "center" }]}
                                        onPress={() => setKey("category", c)}
                                    >
                                        {Icon && (
                                            <Icon
                                                width={14}
                                                height={14}
                                                color={active ? colors.background : colors.text}
                                                style={{ marginRight: 6 }}
                                            />
                                        )}
                                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                                            {c === "all" ? "All" : c}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </>
                )}

                {/* Mode */}
                {local.type !== "settle" && (
                    <>
                        <Text style={styles.sectionLabel}>Mode</Text>

                        <View style={styles.chipsRow}>
                            {[
                                { k: "split", label: "Splits" },
                                { k: "expense", label: "Expenditure" },
                            ].map(({ k, label }) => (
                                <TouchableOpacity
                                    key={k}
                                    style={[styles.chip, local.mode === k && styles.chipActive]}
                                    onPress={() => setKey("mode", k)}
                                >
                                    <Text style={[styles.chipText, local.mode === k && styles.chipTextActive]}>
                                        {label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <Text style={styles.sectionHint}>
                            Choose whether to see your actual expenditure (what you actually spent)
                            or your share of splits (what you owe/borrow).
                        </Text>
                    </>
                )}

                {/* Sort */}
                <Text style={styles.sectionLabel}>Sort</Text>
                <View style={styles.chipsRow}>
                    {[
                        { k: "newest", label: "Newest" },
                        { k: "oldest", label: "Oldest" },
                    ].map(({ k, label }) => (
                        <TouchableOpacity
                            key={k}
                            style={[styles.chip, local.sort === k && styles.chipActive]}
                            onPress={() => setKey("sort", k)}
                        >
                            <Text style={[styles.chipText, local.sort === k && styles.chipTextActive]}>
                                {label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Footer Actions */}
                <View style={styles.footerBtns}>
                    <TouchableOpacity
                        style={styles.btnSecondary}
                        onPress={() => {
                            onClose?.();
                            innerRef.current?.dismiss();
                        }}
                    >
                        <Text style={styles.btnText}>Cancel</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.btnPrimary}
                        onPress={() => {
                            onApply?.(local);
                            onClose?.();
                            innerRef.current?.dismiss();
                        }}
                    >
                        <Text style={[styles.btnText]}>Apply</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </MainBottomSheet>
    );
};

export default FilterSheet;

/* theme-aware styles */
const createStyles = (colors = {}) =>
    StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.card ?? "#1f1f1f" },

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
        headerText: { color: colors.text ?? "#EBF1D5", fontSize: 18, fontWeight: "700" },
        closeText: { color: colors.negative ?? "#EA4335", fontSize: 16, fontWeight: "600" },

        sectionLabel: {
            color: colors.cta ?? colors.primary ?? "#00C49F",
            fontSize: 12,
            letterSpacing: 1,
            marginHorizontal: 16,
            marginTop: 16,
            marginBottom: 8,
            textTransform: "uppercase",
        },

        chipsRow: {
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            paddingHorizontal: 16,
        },
        chip: {
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border ?? "#333",
            marginBottom: 8,
            backgroundColor: colors.card,
        },
        chipActive: {
            backgroundColor: colors.cta ?? colors.primary ?? "#DFF3E8",
            borderColor: colors.cta ?? colors.primary ?? "#DFF3E8",
        },
        chipText: { color: colors.text ?? "#EBF1D5" },
        chipTextActive: { color: colors.background ?? "#121212", fontWeight: "700" },

        footerBtns: {
            flexDirection: "row",
            justifyContent: "flex-end",
            gap: 12,
            marginTop: 20,
            paddingHorizontal: 16,
        },
        btnSecondary: {
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: 8,
            backgroundColor: colors.cardAlt ?? "#2a2a2a",
        },
        btnPrimary: {
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: 8,
            backgroundColor: colors.cta ?? colors.primary ?? "#00C49F",
        },
        sectionHint: {
            color: colors.muted ?? "#888",
            fontSize: 11,
            marginHorizontal: 16,
            marginBottom: 8,
        },

        btnText: { color: colors.text ?? "#EBF1D5", fontWeight: "600" },
        btnTextPrimary: { color: colors.background ?? "#121212", fontWeight: "700" },
    });
