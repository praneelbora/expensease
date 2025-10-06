// src/components/charts/category.js
import React, { useMemo, useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    Dimensions,
    TouchableOpacity,
    ScrollView,
    Pressable,
} from "react-native";
import { PieChart } from "react-native-gifted-charts";
import { getSymbol } from "../../utils/currencies";
import { getCategoryLabel } from "../../utils/categoryOptions";
import { useTheme } from "context/ThemeProvider";

import ChevronUp from "@/accIcons/chevronUp.svg";
import ChevronDown from "@/accIcons/chevronDown.svg";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const getCurrencyCode = (exp) =>
    exp?.currencyCode ||
    exp?.currency?.code ||
    exp?.currency ||
    exp?.meta?.currency ||
    "INR";

/* ---------- Dropdown component (only one open allowed) ---------- */
function Dropdown({ id, openId, setOpenId, options = [], value, onChange, colors }) {
    const open = openId === id;
    return (
        <View style={{ position: "relative", marginRight: 8 }}>
            <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setOpenId(open ? null : id)}
                style={[
                    styles.selectorBtn,
                    { backgroundColor: colors.card, borderColor: colors.border, minWidth: id=='range'?120:105, },
                ]}
            >
                <Text style={[styles.selectorBtnText, { color: colors.text }]}>
                    {options.find((o) => o.value === value)?.label || String(value)}
                </Text>

                {open ? (
                    <ChevronUp width={16} height={16} color={colors.text} />
                ) : (
                    <ChevronDown width={16} height={16} color={colors.text} />
                )}
            </TouchableOpacity>

            {open && (
                <View style={[styles.dropdownCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <ScrollView style={{ maxHeight: 220 }}>
                        {options.map((opt) => (
                            <TouchableOpacity
                                key={String(opt.value)}
                                onPress={() => {
                                    onChange(opt.value);
                                    setOpenId(null);
                                }}
                                style={styles.dropdownItem}
                            >
                                <Text style={[styles.dropdownItemText, { color: colors.text }]}>{opt.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            )}
        </View>
    );
}

/* ----------------------------- Main component ----------------------------- */
export default function CategoryDistribution({
    expenses = [],
    userId,
    defaultCurrency = "INR",
    showControls = true,
}) {
    const { theme } = useTheme();
    const colors = theme?.colors || {
        background: "#121212",
        text: "#EDEDED",
        card: "#212121",
        cardAlt: "#191919",
        border: "#2a2a2a",
        muted: "#888888",
        primary: "#14b8a6",
    };

    const [timeRange, setTimeRange] = useState("thisMonth");
    const [expenseType, setExpenseType] = useState("all");
    const [currency, setCurrency] = useState(defaultCurrency);
    const [openDropdown, setOpenDropdown] = useState(null); // "range" | "type" | "currency"
    const [debugOpen, setDebugOpen] = useState(false);

    const baseFiltered = useMemo(() => {
        const now = new Date();
        const start = new Date();
        if (timeRange === "thisMonth") start.setMonth(now.getMonth(), 1);
        else if (timeRange === "last3m") start.setMonth(now.getMonth() - 2, 1);
        else if (timeRange === "thisYear") start.setMonth(0, 1);
        start.setHours(0, 0, 0, 0);

        return (expenses || []).filter((exp) => {
            if (exp.typeOf !== "expense") return false;
            const d = new Date(exp.date || exp.createdAt);
            if (d < start) return false;
            if (expenseType === "personal")
                return !exp.groupId && (!exp.splits || exp.splits.length === 0);
            if (expenseType === "group") return !!exp.groupId;
            if (expenseType === "friend") return !exp.groupId && exp.splits?.length > 0;
            return true;
        });
    }, [expenses, timeRange, expenseType]);

    const availableCurrencies = useMemo(() => {
        const set = new Set(baseFiltered.map(getCurrencyCode));
        const list = Array.from(set).filter(Boolean).sort();
        if (list.length && !list.includes(currency)) {
            const next = list.includes(defaultCurrency) ? defaultCurrency : list[0];
            setCurrency(next);
        }
        return list;
    }, [baseFiltered, defaultCurrency]);

    const showCurrencySelect = availableCurrencies.length > 1;

    const filteredExpenses = useMemo(
        () => baseFiltered.filter((exp) => getCurrencyCode(exp) === currency),
        [baseFiltered, currency]
    );

    const categoryChartRaw = useMemo(() => {
        const totals = {};
        filteredExpenses.forEach((exp) => {
            const cat = getCategoryLabel(exp.category) || "Uncategorized";
            const userSplit = exp.splits?.find((s) => {
                if (!s) return false;
                const fid = s.friendId?._id ?? s.friendId;
                return fid === userId;
            });
            if (userSplit?.owing) totals[cat] = (totals[cat] || 0) + Number(userSplit.oweAmount || 0);
            if (!exp.groupId && (!exp.splits || exp.splits.length === 0))
                totals[cat] = (totals[cat] || 0) + Number(exp.amount || 0);
        });

        const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
        const totalValue = entries.reduce((s, [, v]) => s + v, 0);

        const big = [];
        let otherSum = 0;
        for (const [name, value] of entries) {
            const pct = totalValue ? (value / totalValue) * 100 : 0;
            if (pct >= 7 || big.length <= 4) big.push({ name, value });
            else otherSum += value;
        }
        if (otherSum > 0) big.push({ name: "Other", value: otherSum });
        return big;
    }, [filteredExpenses, userId]);

    const palette = [
        "#4f46e5",
        "#06b6d4",
        "#f97316",
        "#f43f5e",
        "#10b981",
        "#a78bfa",
        "#f59e0b",
        "#ef4444",
        "#06b6d4",
    ];

    let pieData = categoryChartRaw
        .map((c, i) => ({
            value: Number(c.value || 0),
            label: c.name,
            color: palette[i % palette.length],
        }))
        .filter((d) => Number(d.value) > 0);

    if (pieData.length === 1) {
        const only = pieData[0];
        pieData = [
            only,
            { value: only.value * 0.0001 || 0.0001, label: "__empty__", color: "#2a2a2a" },
        ];
    }

    const totalSum = pieData.reduce((s, it) => s + (it.value || 0), 0);
    const chartSize = Math.min(340, SCREEN_WIDTH - 24);
    const donutWidth = 0;
    const symbol = getSymbol(currency) || "";

    // Dropdown option lists
    const timeOptions = [
        { label: "This Month", value: "thisMonth" },
        { label: "3 Months", value: "last3m" },
        { label: "This Year", value: "thisYear" },
    ];
    const typeOptions = [
        { label: "All", value: "all" },
        { label: "Personal", value: "personal" },
        { label: "Group", value: "group" },
        { label: "Friend", value: "friend" },
    ];
    const currencyOptions = showCurrencySelect
        ? availableCurrencies.map((c) => ({ label: `${getSymbol(c) || ""} ${c}`, value: c }))
        : [{ label: `${getSymbol(currency) || ""} ${currency}`, value: currency }];

    return (
        <View style={[styles.container, { backgroundColor: colors.background || "#121212" }]}>
            <View style={styles.rowBetween}>
            <Text style={[styles.sectionLabel,{color: colors.primary}]}>Categories</Text>
            </View>

            {showControls && (
                <>
                    {openDropdown && <Pressable style={styles.outsideOverlay} onPress={() => setOpenDropdown(null)} />}

                    <View style={styles.controlsRow}>
                        <Dropdown
                            id="range"
                            openId={openDropdown}
                            setOpenId={setOpenDropdown}
                            options={timeOptions}
                            value={timeRange}
                            onChange={(v) => setTimeRange(v)}
                            colors={colors}
                        />

                        <Dropdown
                            id="type"
                            openId={openDropdown}
                            setOpenId={setOpenDropdown}
                            options={typeOptions}
                            value={expenseType}
                            onChange={(v) => setExpenseType(v)}
                            colors={colors}
                        />

                        {showCurrencySelect ? (
                            <Dropdown
                                id="currency"
                                openId={openDropdown}
                                setOpenId={setOpenDropdown}
                                options={currencyOptions}
                                value={currency}
                                onChange={(v) => setCurrency(v)}
                                colors={colors}
                            />
                        ) : (
                            <View style={[styles.selectorBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
                                <Text style={[styles.selectorBtnText, { color: colors.text }]}>{currencyOptions[0].label}</Text>
                            </View>
                        )}
                    </View>
                </>
            )}

            <View style={{ marginTop: 8, alignItems: "center" }}>
                {pieData.length === 0 ? (
                    <View style={styles.emptyBox}>
                        <Text style={[styles.emptyText, { color: colors.muted || "#888" }]}>No expenses found for selected filters.</Text>
                    </View>
                ) : (
                    <>
                        <View style={{ width: chartSize, height: chartSize, alignItems: "center", justifyContent: "center" }}>
                            <PieChart
                                data={pieData}
                                donut
                                radius={chartSize / 2}
                                innerRadius={donutWidth}
                                innerCircleColor={colors.card}
                                centerLabelComponent={() => (
                                    <View style={styles.centerLabel}>
                                        <Text style={[styles.centerLabelValue, { color: colors.text }]}>{symbol} {totalSum.toFixed(2)}</Text>
                                        <Text style={[styles.centerLabelSub, { color: colors.muted || "#aaa" }]}>Total</Text>
                                    </View>
                                )}
                                onPress={() => { }}
                                showStrip
                                showText={false}
                            />
                        </View>

                        <View style={{ marginTop: 12, width: "100%", paddingHorizontal: 8 }}>
                            {pieData.map((d) => d.label === "__empty__" ? null : (
                                <View key={d.label} style={styles.forceLegendRow}>
                                    <View style={[styles.legendSwatch, { backgroundColor: d.color }]} />
                                    <Text style={[styles.forceLegendLabel, { color: colors.text }]}>{d.label}</Text>
                                    <Text style={[styles.forceLegendAmount, { color: colors.text }]}>{symbol}{Number(d.value || 0).toFixed(2)}</Text>
                                </View>
                            ))}
                        </View>
                    </>
                )}
            </View>

            {debugOpen && (
                <View style={[styles.debugPanel, { borderColor: colors.border, backgroundColor: colors.card }]}>
                    <ScrollView style={{ maxHeight: 220 }}>
                        <Text style={[styles.debugText, { color: colors.text }]}>categoryChartRaw: {JSON.stringify(categoryChartRaw, null, 2)}</Text>
                        <Text style={[styles.debugText, { color: colors.text }]}>pieData: {JSON.stringify(pieData, null, 2)}</Text>
                        <Text style={[styles.debugText, { color: colors.text }]}>totalSum: {JSON.stringify(totalSum)}</Text>
                        <Text style={[styles.debugText, { color: colors.text }]}>filteredExpenses: {filteredExpenses.length}</Text>
                    </ScrollView>
                </View>
            )}
        </View>
    );
}

/* ----------------------------- styles (theme applied at runtime) ----------------------------- */
const styles = StyleSheet.create({
    title: { fontSize: 16, fontWeight: "700", marginBottom: 6, textAlign: "left" },
    controlsRow: { flexDirection: "row", rowGap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 },
    selectorBtn: {
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginRight: 8,
        borderWidth: 1,
        maxWidth: 125,
        alignItems: "center",
        flexDirection: "row",
        justifyContent: "space-between",
        gap: 8,
    },
    selectorBtnText: { fontSize: 13, flex: 1 },
    caret: { marginLeft: 8, fontSize: 16 },

    dropdownCard: {
        position: "absolute",
        top: 40,
        left: 0,
        minWidth: 140,
        maxWidth: 300,
        borderWidth: 1,
        borderRadius: 8,
        paddingVertical: 4,
        zIndex: 50,
        elevation: 6,
        shadowColor: "#000",
        shadowOpacity: 0.2,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 4 },
    },
    dropdownItem: { paddingVertical: 10, paddingHorizontal: 12 },
    dropdownItemText: { fontSize: 14 },

    outsideOverlay: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 40,
    },

    debugBtn: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
    debugBtnText: { fontSize: 12 },

    emptyBox: { padding: 20, alignItems: "center", justifyContent: "center" },
    emptyText: { fontSize: 13 },

    centerLabel: {
        ...StyleSheet.absoluteFillObject,
        alignItems: "center",
        justifyContent: "center",
    },
    centerLabelValue: { fontWeight: "800", fontSize: 18, textAlign: "center" },
    centerLabelSub: { fontSize: 12, marginTop: 2, textAlign: "center" },

    forceLegendRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
    legendSwatch: { width: 16, height: 16, borderRadius: 4, marginRight: 12 },
    forceLegendLabel: { flex: 1, fontSize: 15, fontWeight: "600" },
    forceLegendAmount: { fontSize: 15, fontWeight: "700" },

    debugPanel: { marginTop: 12, padding: 10, borderRadius: 8, borderWidth: 1 },
    debugText: { fontSize: 12, marginBottom: 8 },
    sectionLabel: { fontSize: 12, letterSpacing: 1, textTransform: "uppercase" },
    rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 8 },
});
