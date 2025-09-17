// src/components/charts/category.js
import React, { useMemo, useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    Dimensions,
    TouchableOpacity,
    Modal,
    FlatList,
    ScrollView,
} from "react-native";
import { PieChart } from "react-native-gifted-charts";
import { getSymbol } from "../../utils/currencies";
import { getCategoryLabel } from "../../utils/categoryOptions";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const getCurrencyCode = (exp) =>
    exp?.currencyCode ||
    exp?.currency?.code ||
    exp?.currency ||
    exp?.meta?.currency ||
    "INR";

export default function CategoryDistribution({
    expenses = [],
    userId,
    defaultCurrency = "INR",
    showControls = true,
}) {
    const [timeRange, setTimeRange] = useState("thisMonth");
    const [expenseType, setExpenseType] = useState("all");
    const [currency, setCurrency] = useState(defaultCurrency);

    const [modalVisible, setModalVisible] = useState(false);
    const [modalItems, setModalItems] = useState([]);
    const [modalTitle, setModalTitle] = useState("");
    const [activeSetter, setActiveSetter] = useState(() => { });
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
    const donutWidth = 0
    const symbol = getSymbol(currency) || "";


    const openSelector = (title, items, setter) => {
        setModalTitle(title);
        setModalItems(items);
        setActiveSetter(() => setter);
        setModalVisible(true);
    };

    const timeOptions = [
        { label: "This Month", value: "thisMonth" },
        { label: "Last 3 Months", value: "last3m" },
        { label: "This Year", value: "thisYear" },
    ];
    const typeOptions = [
        { label: "All Expenses", value: "all" },
        { label: "Personal", value: "personal" },
        { label: "Group", value: "group" },
        { label: "Friend", value: "friend" },
    ];
    const currencyOptions = showCurrencySelect
        ? availableCurrencies.map((c) => ({ label: `${getSymbol(c) || ""} ${c}`, value: c }))
        : [{ label: `${getSymbol(currency) || ""} ${currency}`, value: currency }];

    return (
        <View style={localStyles.container}>
            <Text style={localStyles.title}>Category Distribution</Text>

            {showControls && (
                <View style={localStyles.controlsRow}>
                    <TouchableOpacity style={localStyles.selectorBtn} onPress={() => openSelector("Range", timeOptions, (v) => setTimeRange(v))}>
                        <Text style={localStyles.selectorBtnText}>{timeOptions.find((o) => o.value === timeRange)?.label || "Range"}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={localStyles.selectorBtn} onPress={() => openSelector("Type", typeOptions, (v) => setExpenseType(v))}>
                        <Text style={localStyles.selectorBtnText}>{typeOptions.find((o) => o.value === expenseType)?.label || "Type"}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={localStyles.selectorBtn} onPress={() => openSelector("Currency", currencyOptions, (v) => setCurrency(v))}>
                        <Text style={localStyles.selectorBtnText}>{currencyOptions.find((o) => o.value === currency)?.label || currency}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={localStyles.debugBtn} onPress={() => setDebugOpen((s) => !s)}>
                        <Text style={localStyles.debugBtnText}>{debugOpen ? "Hide Debug" : "Show Debug"}</Text>
                    </TouchableOpacity>
                </View>
            )}

            <View style={{ marginTop: 8, alignItems: "center" }}>
                {pieData.length === 0 ? (
                    <View style={localStyles.emptyBox}>
                        <Text style={localStyles.emptyText}>No expenses found for selected filters.</Text>
                    </View>
                ) : (
                    <>
                        <PieChart
                            data={pieData}
                            donut
                            radius={chartSize / 2}
                            innerRadius={donutWidth}
                            centerLabelComponent={() => (
                                <View style={localStyles.centerLabel}>
                                    <Text style={localStyles.centerLabelValue}>{symbol} {totalSum.toFixed(2)}</Text>
                                    <Text style={localStyles.centerLabelSub}>Total</Text>
                                </View>
                            )}
                            onPress={() => { }}
                            showStrip
                        />

                        {/* FORCE-VISIBLE legend: big labels & amounts below the chart */}
                        <View style={{ marginTop: 12, width: "100%", paddingHorizontal: 8 }}>
                            {pieData.map((d) => d.label === "__empty__" ? null : (
                                <View key={d.label} style={localStyles.forceLegendRow}>
                                    <View style={[localStyles.legendSwatch, { backgroundColor: d.color }]} />
                                    <Text style={localStyles.forceLegendLabel}>{d.label}</Text>
                                    <Text style={localStyles.forceLegendAmount}>{symbol}{Number(d.value || 0).toFixed(2)}</Text>
                                </View>
                            ))}
                        </View>
                    </>
                )}
            </View>

            {/* debug JSON */}
            {debugOpen && (
                <View style={localStyles.debugPanel}>
                    <ScrollView style={{ maxHeight: 220 }}>
                        <Text style={localStyles.debugText}>categoryChartRaw: {JSON.stringify(categoryChartRaw, null, 2)}</Text>
                        <Text style={localStyles.debugText}>pieData: {JSON.stringify(pieData, null, 2)}</Text>
                        <Text style={localStyles.debugText}>totalSum: {JSON.stringify(totalSum)}</Text>
                        <Text style={localStyles.debugText}>filteredExpenses: {filteredExpenses.length}</Text>
                    </ScrollView>
                </View>
            )}

            {/* Modal selector */}
            <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
                <View style={modalStyles.backdrop}>
                    <View style={modalStyles.card}>
                        <Text style={modalStyles.modalTitle}>{modalTitle}</Text>
                        <FlatList
                            data={modalItems}
                            keyExtractor={(i) => i.value}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    onPress={() => {
                                        setModalVisible(false);
                                        activeSetter(item.value);
                                    }}
                                    style={modalStyles.modalItem}
                                >
                                    <Text style={modalStyles.modalItemText}>{item.label}</Text>
                                </TouchableOpacity>
                            )}
                            ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: "#222", marginVertical: 4 }} />}
                        />
                        <TouchableOpacity style={[modalStyles.modalClose]} onPress={() => setModalVisible(false)}>
                            <Text style={modalStyles.modalCloseText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const localStyles = StyleSheet.create({
    container: { backgroundColor: "#1f1f1f", padding: 12, borderRadius: 12 },
    title: { color: "#fff", fontSize: 16, fontWeight: "700", marginBottom: 6, textAlign: "left" },
    controlsRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", alignItems: "center" },
    selectorBtn: { backgroundColor: "#212121", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8, borderWidth: 1, borderColor: "#444" },
    selectorBtnText: { color: "#EBF1D5", fontSize: 13 },
    debugBtn: { backgroundColor: "#333", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
    debugBtnText: { color: "#fff", fontSize: 12 },
    emptyBox: { padding: 20, alignItems: "center", justifyContent: "center" },
    emptyText: { color: "#bbb" },

    centerLabel: { alignItems: "center", justifyContent: "center" },
    centerLabelValue: { color: "#fff", fontWeight: "800", fontSize: 18 },
    centerLabelSub: { color: "#ccc", fontSize: 12, marginTop: 2 },

    forceLegendRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#171717" },
    legendSwatch: { width: 16, height: 16, borderRadius: 4, marginRight: 12 },
    forceLegendLabel: { color: "#fff", flex: 1, fontSize: 15, fontWeight: "600" },
    forceLegendAmount: { color: "#EDEDED", fontSize: 15, fontWeight: "700" },

    debugPanel: { marginTop: 12, backgroundColor: "#0b0b0b", padding: 10, borderRadius: 8, borderWidth: 1, borderColor: "#222" },
    debugText: { color: "#ddd", fontSize: 12, marginBottom: 8 },
});

const modalStyles = StyleSheet.create({
    backdrop: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
    card: { width: "100%", maxWidth: 420, backgroundColor: "#121212", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#222" },
    modalTitle: { color: "#fff", fontSize: 16, fontWeight: "700", marginBottom: 8 },
    modalItem: { paddingVertical: 12, paddingHorizontal: 8 },
    modalItemText: { color: "#EDEDED", fontSize: 14 },
    modalClose: { marginTop: 12, alignSelf: "flex-end", paddingVertical: 8, paddingHorizontal: 12 },
    modalCloseText: { color: "#ccc" },
});
