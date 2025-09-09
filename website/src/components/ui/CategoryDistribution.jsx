// src/components/CategoryDistribution.jsx
"use client";

import { PieChart, Pie, LabelList } from "recharts";
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from "@/components/ui/chart";
import { getSymbol } from "../../utils/currencies";
import { getCategoryLabel } from "../../utils/categoryOptions";
import { useMemo, useState } from "react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

// Try to be robust about where currency lives
const getCurrencyCode = (exp) =>
    exp?.currencyCode ||
    exp?.currency?.code ||
    exp?.currency ||
    exp?.meta?.currency ||
    "INR";

export default function CategoryDistribution({ expenses, userId, defaultCurrency = "INR" }) {
    const [timeRange, setTimeRange] = useState("thisMonth");
    const [expenseType, setExpenseType] = useState("all");
    const [currency, setCurrency] = useState(defaultCurrency); // no ALL; default only

    // --- filter by time + type (currency-agnostic for discovering currencies) ---
    const baseFiltered = useMemo(() => {
        const now = new Date();
        const start = new Date();

        if (timeRange === "thisMonth") {
            start.setMonth(now.getMonth(), 1);
        } else if (timeRange === "last3m") {
            start.setMonth(now.getMonth() - 2, 1); // includes this + 2 previous months
        } else if (timeRange === "thisYear") {
            start.setMonth(0, 1);
        }
        start.setHours(0, 0, 0, 0);

        return (expenses || []).filter((exp) => {
            if (exp.typeOf !== "expense") return false;

            const d = new Date(exp.date || exp.createdAt);
            if (d < start) return false;

            if (expenseType === "personal") {
                return !exp.groupId && (!exp.splits || exp.splits.length === 0);
            }
            if (expenseType === "group") {
                return !!exp.groupId;
            }
            if (expenseType === "friend") {
                return !exp.groupId && exp.splits?.length > 0;
            }
            return true; // all
        });
    }, [expenses, timeRange, expenseType]);

    // --- available currencies within current time/type scope ---
    const availableCurrencies = useMemo(() => {
        const set = new Set(baseFiltered.map(getCurrencyCode));
        const list = Array.from(set).filter(Boolean).sort();
        // keep selected currency in sync if it disappears (e.g., filters changed)
        if (list.length && !list.includes(currency)) {
            // pick defaultCurrency if present else first available
            const next = list.includes(defaultCurrency) ? defaultCurrency : list[0];
            setCurrency(next);
        }
        return list;
    }, [baseFiltered, currency, defaultCurrency]);

    const showCurrencySelect = availableCurrencies.length > 1;

    // --- final filtered list by chosen currency ---
    const filteredExpenses = useMemo(() => {
        return baseFiltered.filter((exp) => getCurrencyCode(exp) === currency);
    }, [baseFiltered, currency]);

    // --- build chart data in selected currency ---
    const categoryChart = useMemo(() => {
        const totals = {};

        // helper: treat missing PM as included; if pm.excludeFromSummaries === true
        // then exclude **only if** the current user is NOT part of this transaction.
        const pmIsExcludedForUser = (pm, exp, userSplitForThisUser) => {
            // if no pm info (not populated), treat as included
            if (!pm) return false;
            if (typeof pm === "object" && pm.excludeFromSummaries === true) {
                // If the user is involved in this transaction, do NOT exclude
                // User involvement: either we have a userSplit (they're part of splits)
                // or they created the personal expense (createdBy === userId)
                const userIsPartOfTransaction = !!userSplitForThisUser || String(exp.createdBy) === String(userId);
                return !userIsPartOfTransaction; // exclude only when user is NOT part
            }
            return false; // not excluded
        };

        filteredExpenses.forEach((exp) => {
            const cat = getCategoryLabel(exp.category) || "Uncategorized";
            const userSplit = exp.splits?.find((s) => String(s.friendId?._id || s.friendId) === String(userId));

            if (userSplit?.owing) {
                // check split-level payment method exclusion (use userSplit.paidFromPaymentMethodId)
                const pmOnSplit = userSplit.paidFromPaymentMethodId;
                if (!pmIsExcludedForUser(pmOnSplit, exp, userSplit)) {
                    totals[cat] = (totals[cat] || 0) + Number(userSplit.oweAmount || 0);
                }
            }

            // personal (non-split, non-group) expense
            if (!exp.groupId && (!exp.splits || exp.splits.length === 0)) {
                // For personal expenses check top-level paidFromPaymentMethodId
                const pmTop = exp.paidFromPaymentMethodId;
                // user is part if they are the creator (exp.createdBy === userId)
                if (!pmIsExcludedForUser(pmTop, exp, null)) {
                    totals[cat] = (totals[cat] || 0) + Number(exp.amount || 0);
                }
            }
        });

        const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
        const totalValue = entries.reduce((sum, [, v]) => sum + v, 0);

        const big = [];
        let otherSum = 0;

        for (const [name, value] of entries) {
            const pct = totalValue ? (value / totalValue) * 100 : 0;
            if (pct >= 7 || big.length <= 4) big.push({ name, value });
            else otherSum += value;
        }
        // big.push({ name: "Other", value: otherSum });

        return big;
    }, [filteredExpenses, userId]);


    const chartConfig = categoryChart.reduce((acc, c, i) => {
        acc[c.name] = {
            label: c.name,
            color: `var(--chart-${(i % 9) + 1})`,
        };
        return acc;
    }, {});

    const categoryChartWithColors = categoryChart.map((c, i) => ({
        ...c,
        fill: `var(--chart-${(i % 9) + 1})`,
    }));

    const symbol = getSymbol(currency) || "";

    return (
        <div className="bg-[#1f1f1f] p-4 rounded-xl shadow-md overflow-hidden">
            <div className="flex flex-col mb-2 gap-2">
                <h3 className="text-lg font-semibold">Category Distribution</h3>

                <div className="flex gap-2 flex-wrap">
                    {/* Time Range */}
                    <Select value={timeRange} onValueChange={setTimeRange}>
                        <SelectTrigger className="w-[140px] border-[#EBF1D5] bg-[#212121] text-[#EBF1D5] text-xs">
                            <SelectValue placeholder="Range" />
                        </SelectTrigger>
                        <SelectContent className="border-[#EBF1D5] bg-[#212121]">
                            <SelectItem className="text-[#EBF1D5]" value="thisMonth">
                                This Month
                            </SelectItem>
                            <SelectItem className="text-[#EBF1D5]" value="last3m">
                                Last 3 Months
                            </SelectItem>
                            <SelectItem className="text-[#EBF1D5]" value="thisYear">
                                This Year
                            </SelectItem>
                        </SelectContent>
                    </Select>

                    {/* Expense Type */}
                    <Select
                        value={expenseType}
                        onValueChange={(v) => {
                            setExpenseType(v);
                            // keep currency stable if still available; else reset in availableCurrencies effect
                        }}
                    >
                        <SelectTrigger className="w-[140px] border-[#EBF1D5] bg-[#212121] text-[#EBF1D5] text-xs">
                            <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent className="border-[#EBF1D5] bg-[#212121]">
                            <SelectItem className="text-[#EBF1D5]" value="all">
                                All Expenses
                            </SelectItem>
                            <SelectItem className="text-[#EBF1D5]" value="personal">
                                Personal
                            </SelectItem>
                            <SelectItem className="text-[#EBF1D5]" value="group">
                                Group
                            </SelectItem>
                            <SelectItem className="text-[#EBF1D5]" value="friend">
                                Friend
                            </SelectItem>
                        </SelectContent>
                    </Select>

                    {/* Currency (only when >1 available) */}
                    {showCurrencySelect && (
                        <Select value={currency} onValueChange={setCurrency}>
                            <SelectTrigger className="w-[120px] border-[#EBF1D5] bg-[#212121] text-[#EBF1D5] text-xs">
                                <SelectValue placeholder="Currency" />
                            </SelectTrigger>
                            <SelectContent className="border-[#EBF1D5] bg-[#212121]">
                                {availableCurrencies.map((code) => (
                                    <SelectItem key={code} value={code} className="text-[#EBF1D5]">
                                        {getSymbol(code) ? `${getSymbol(code)} • ${code}` : code}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </div>
            </div>

            <ChartContainer
                config={chartConfig}
                className="mx-auto aspect-square h-[300px]"
            >
                <PieChart>
                    <ChartTooltip
                        content={
                            <ChartTooltipContent
                                hideLabel
                                className={"bg-[#212121]"}
                                // currency formatting in tooltip
                                formatter={(value, name) => (
                                    <span className="text-foreground font-mono font-medium tabular-nums">
                                        {name}: {symbol} {Number(value || 0).toFixed(2)}
                                    </span>
                                )}
                            />
                        }
                    />
                    <Pie
                        data={categoryChartWithColors}
                        dataKey="value"
                        nameKey="name"
                        outerRadius={140}
                    >
                        {/* Category names around the pie */}
                        <LabelList dataKey="name" fill="#ffffff" stroke="none" fontSize={12} />
                        {/* Optional: value labels on slices; uncomment if you want amounts on the chart
            <LabelList
              dataKey="value"
              position="outside"
              formatter={(val) => `${symbol}${Number(val||0).toFixed(2)}`}
              fill="#ffffff"
              stroke="none"
              fontSize={11}
            /> */}
                    </Pie>
                </PieChart>
            </ChartContainer>

            <div className="mt-3 grid md:grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {categoryChart.map((c) => (
                    <div key={c.name} className="flex items-center justify-between">
                        <span className="truncate">{c.name}</span>
                        <span className="text-[#ededed]">
                            {symbol} {Number(c.value || 0).toFixed(2)}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
