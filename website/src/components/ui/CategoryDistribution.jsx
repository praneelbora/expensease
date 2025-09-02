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

export default function CategoryDistribution({ expenses, userId, defaultCurrency }) {
    const [timeRange, setTimeRange] = useState("thisMonth");
    const [expenseType, setExpenseType] = useState("all");

    // --- filter expenses by time + type ---
    const filteredExpenses = useMemo(() => {
        const now = new Date();
        const start = new Date();

        if (timeRange === "thisMonth") {
            start.setMonth(now.getMonth(), 1);
        } else if (timeRange === "last3m") {
            start.setMonth(now.getMonth() - 2, 1); // includes this + 2 prev months
        } else if (timeRange === "thisYear") {
            start.setMonth(0, 1);
        }
        start.setHours(0, 0, 0, 0);


        return (expenses || []).filter((exp) => {
            if (exp.typeOf !== "expense") return false;

            const d = new Date(exp.date || exp.createdAt);
            console.log(d);
            console.log(start);
            
            if (d < start) return false;

            // type filter
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

    // --- build chart data ---
    const categoryChart = useMemo(() => {
        const totals = {};

        filteredExpenses.forEach((exp) => {
            const cat = getCategoryLabel(exp.category) || "Uncategorized";
            const userSplit = exp.splits?.find((s) => s.friendId?._id === userId);

            if (userSplit?.owing) {
                totals[cat] = (totals[cat] || 0) + (userSplit.oweAmount || 0);
            }

            if (!exp.groupId && (!exp.splits || exp.splits.length === 0)) {
                totals[cat] = (totals[cat] || 0) + (exp.amount || 0);
            }
        });

        const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
        const totalValue = entries.reduce((sum, [, v]) => sum + v, 0);

        const big = [];
        let otherSum = 0;

        for (const [name, value] of entries) {
            const pct = (value / totalValue) * 100;
            if (pct >= 7) {
                big.push({ name, value });
            } else {
                otherSum += value;
            }
        }

        if (otherSum > 0) {
            big.push({ name: "Other", value: otherSum });
        }

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

    return (
        <div className="bg-[#1f1f1f] p-4 rounded-xl shadow-md overflow-hidden">
            <div className="flex flex-col mb-2 gap-2">
                <h3 className="text-lg font-semibold">Category Distribution</h3>

                <div className="flex gap-2">
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
                    <Select value={expenseType} onValueChange={setExpenseType}>
                        <SelectTrigger className="w-[120px] border-[#EBF1D5] bg-[#212121] text-[#EBF1D5] text-xs">
                            <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent className="border-[#EBF1D5] bg-[#212121]">
                            <SelectItem className="text-[#EBF1D5]" value="all">
                                All
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
                </div>
            </div>

            <ChartContainer
                config={chartConfig}
                className="mx-auto aspect-square h-[300px]"
            >
                <PieChart>
                    <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                    <Pie
                        data={categoryChartWithColors}
                        dataKey="value"
                        nameKey="name"
                        outerRadius={140}
                    >
                        <LabelList
                            dataKey="name"
                            fill="#ffffff"
                            stroke="none"
                            fontSize={12}
                        />
                    </Pie>
                </PieChart>
            </ChartContainer>

            <div className="mt-3 grid md:grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {categoryChart.map((c) => (
                    <div key={c.name} className="flex items-center justify-between">
                        <span className="truncate">{c.name}</span>
                        <span className="text-[#ededed]">
                            {getSymbol(defaultCurrency)}
                            {Number(c.value || 0).toFixed(2)}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
