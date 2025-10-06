// btmShtFilters (FilterSheet) - updated multi-select category chips
import React, { useEffect, useState, useMemo } from "react";
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Platform,
} from "react-native";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MainBottomSheet from "./mainBottomSheet";
import { categoryMap } from "utils/categories";
import { iconMap } from "@/icons";
import { useTheme } from "context/ThemeProvider";
import BottomSheetLayout from "./btmShtHeaderFooter"; // your provided component

const FormatDateLabel = (d) => {
    if (!d) return "";
    try {
        const dt = new Date(d);
        return dt.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
        }).replace(" ", " ");
    } catch (e) {
        return "";
    }
};

const FilterSheet = ({ innerRef, selected, filters = [], categories = [], onApply, onClose, defaultFilter }) => {
    const insets = useSafeAreaInsets();
    const { theme } = useTheme();
    const colors = theme?.colors || {};
    const styles = useMemo(() => createStyles(colors), [colors]);

    // ensure selected.category is normalized to array
    const normalizeSelected = (sel) => {
        const s = sel || {};
        const cat = s.category;
        if (Array.isArray(cat)) return { ...s, category: cat.length ? cat : ["all"] };
        if (cat == null) return { ...s, category: ["all"] };
        if (String(cat).trim() === "") return { ...s, category: ["all"] };
        // comma separated or single string
        const parts = String(cat).split(",").map((p) => p.trim()).filter(Boolean);
        return { ...s, category: parts.length ? parts : ["all"] };
    };

    const [local, setLocal] = useState(() => normalizeSelected(selected));

    // Date picker state
    const [showPicker, setShowPicker] = useState(false);
    const [pickerMode, setPickerMode] = useState("from"); // 'from' or 'to'
    const [pickerValue, setPickerValue] = useState(new Date());

    useEffect(() => {
        setLocal(normalizeSelected(selected));
    }, [selected]);

    const setKey = (k, v) => setLocal((s) => ({ ...s, [k]: v }));

    const setDateRange = (from, to) => {
        setKey("dateRange", { from: from ? new Date(from).toISOString() : null, to: to ? new Date(to).toISOString() : null });
    };

    const applyWeekRange = () => {
        const now = new Date();
        const day = now.getDay();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - day);
        startOfWeek.setHours(0, 0, 0, 0);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);
        setKey("date", "week");
        setDateRange(startOfWeek, endOfWeek);
    };

    const applyMonthRange = () => {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        startOfMonth.setHours(0, 0, 0, 0);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        endOfMonth.setHours(23, 59, 59, 999);
        setKey("date", "month");
        setDateRange(startOfMonth, endOfMonth);
    };
    const openCustomPicker = (which) => {
        setPickerMode(which);
        const initial = local?.dateRange?.[which] ? new Date(local.dateRange[which]) : new Date();
        setPickerValue(initial);
        setShowPicker(true);
        setKey("date", "custom");
    };

    const onPickerConfirm = (selectedDate) => {
        setShowPicker(false);
        if (!selectedDate) return;

        const currentRange = local.dateRange || { from: null, to: null };
        if (pickerMode === "from") {
            const newFrom = new Date(selectedDate);
            newFrom.setHours(0, 0, 0, 0);
            let newTo = currentRange.to ? new Date(currentRange.to) : null;
            if (newTo && newFrom > newTo) {
                newTo = new Date(newFrom);
                newTo.setHours(23, 59, 59, 999);
            }
            setDateRange(newFrom, newTo);
        } else {
            const newTo = new Date(selectedDate);
            newTo.setHours(23, 59, 59, 999);
            let newFrom = currentRange.from ? new Date(currentRange.from) : null;
            if (newFrom && newFrom > newTo) {
                newFrom = new Date(newTo);
                newFrom.setHours(0, 0, 0, 0);
            }
            setDateRange(newFrom, newTo);
        }
    };

    const onPickerCancel = () => {
        setShowPicker(false);
    };
    const isCustomEmpty = local.date === "custom" && !(local.dateRange?.from || local.dateRange?.to);

    // ---- category multi-select helpers ----
    const toggleCategory = (cat) => {
        setLocal((prev) => {
            const cur = Array.isArray(prev.category) ? [...prev.category] : ["all"];
            // selecting 'all' resets to ['all']
            if (cat === "all") {
                return { ...prev, category: ["all"] };
            }
            // if currently had 'all', remove it before toggling
            const idxAll = cur.indexOf("all");
            if (idxAll !== -1) cur.splice(idxAll, 1);

            const idx = cur.indexOf(cat);
            if (idx === -1) {
                cur.push(cat);
            } else {
                cur.splice(idx, 1);
            }
            // if nothing selected, fallback to 'all'
            if (cur.length === 0) cur.push("all");
            return { ...prev, category: cur };
        });
    };

    return (
        <BottomSheetLayout
            innerRef={innerRef}
            title="Filters"
            onClose={() => {
                onClose?.();
                innerRef?.current?.dismiss?.();
            }}
            footerOptions={{
                showDelete: true,
                deleteLabel: "Reset",
                onDelete: () => {
                    setLocal(defaultFilter);
                    onApply?.(defaultFilter);
                    onClose?.();
                    innerRef?.current?.dismiss?.();
                },
                cancelLabel: "Cancel",
                onCancel: () => {
                    onClose?.();
                    innerRef?.current?.dismiss?.();
                },
                primaryLabel: "Apply",
                onPrimary: () => {
                    // ensure category is array when applying
                    const toApply = { ...local, category: Array.isArray(local.category) ? local.category : [local.category] };
                    onApply?.(toApply);
                    onClose?.();
                    innerRef?.current?.dismiss?.();
                },
                primaryDisabled: isCustomEmpty,
                busy: false,
            }}
        >
            <ScrollView
                style={styles.container}
                contentContainerStyle={{ paddingBottom: insets.bottom + 16, paddingHorizontal: 12 }}
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
                                    setKey("category", ["all"]);
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

                {/* Category (multi-select chips) */}
                {local.type !== "settle" && (
                    <>
                        <Text style={styles.sectionLabel}>Category</Text>
                        <View style={styles.chipsRow}>
                            {categories.map((c) => {
                                const entry = Object.values(categoryMap).find((cat) => cat.label === c);
                                const Icon = entry ? iconMap[entry.icon] : null;
                                const active = Array.isArray(local.category) ? local.category.includes(c) : local.category === c;
                                return (
                                    <TouchableOpacity
                                        key={String(c)}
                                        style={[styles.chip, active && styles.chipActive, { flexDirection: "row", alignItems: "center" }]}
                                        onPress={() => toggleCategory(c)}
                                    >
                                        {Icon && (
                                            <Icon
                                                width={14}
                                                height={14}
                                                color={colors.text}
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
                            {[{ k: "split", label: "Splits" }, { k: "expense", label: "Expenditure" }].map(({ k, label }) => (
                                <TouchableOpacity
                                    key={k}
                                    style={[styles.chip, local.mode === k && styles.chipActive]}
                                    onPress={() => setKey("mode", k)}
                                >
                                    <Text style={[styles.chipText, local.mode === k && styles.chipTextActive]}>{label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <Text style={styles.sectionHint}>
                            Choose whether to see your actual expenditure (what you actually spent) or your share of splits (what you owe/borrow).
                        </Text>
                    </>
                )}

                {/* Sort */}
                <Text style={styles.sectionLabel}>Sort</Text>
                <View style={styles.chipsRow}>
                    {[{ k: "newest", label: "Newest" }, { k: "oldest", label: "Oldest" }].map(({ k, label }) => (
                        <TouchableOpacity
                            key={k}
                            style={[styles.chip, local.sort === k && styles.chipActive]}
                            onPress={() => setKey("sort", k)}
                        >
                            <Text style={[styles.chipText, local.sort === k && styles.chipTextActive]}>{label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* (date UI omitted / same as before if needed) */}

            </ScrollView>

            <DateTimePickerModal
                isVisible={showPicker}
                mode="date"
                date={pickerValue}
                onConfirm={onPickerConfirm}
                onCancel={onPickerCancel}
                headerTextIOS={pickerMode === 'from' ? 'Pick start date' : 'Pick end date'}
                confirmTextIOS="Done"
                cancelTextIOS="Cancel"
                display={Platform.OS === "android" ? "spinner" : undefined}
                isDarkModeEnabled={Platform.OS === 'android' ? false : !!theme?.dark}
                {...(Platform.OS === 'ios' && { textColor: theme?.colors?.text })}
            />
        </BottomSheetLayout>
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
            marginTop: 16,
            marginBottom: 8,
            textTransform: "uppercase",
        },

        chipsRow: {
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,

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
        chipText: { color: colors.text },
        chipTextActive: { color: colors.text },

        footerBtns: {
            flexDirection: "row",
            justifyContent: "flex-end",
            gap: 12,
            marginTop: 20,

        },
        btnSecondary: {

            paddingVertical: 10,
            borderRadius: 8,
            backgroundColor: colors.cardAlt ?? "#2a2a2a",
        },
        btnPrimary: {

            paddingVertical: 10,
            borderRadius: 8,
            backgroundColor: colors.cta ?? colors.primary ?? "#00C49F",
        },
        sectionHint: {
            color: colors.muted ?? "#888",
            fontSize: 11,
            marginBottom: 8,
        },

        btnText: { color: colors.text ?? "#EBF1D5", fontWeight: "600" },
        btnTextPrimary: { color: colors.background ?? "#121212", fontWeight: "700" },
    });
