// src/components/WeeklyExpenseTrends.jsx
"use client"

import * as React from "react"
import { AreaChart, Area, CartesianGrid, XAxis, YAxis } from "recharts"
import {
    Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card"
import {
    ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent,
} from "@/components/ui/chart"
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { getSymbol } from "@/utils/currencies"

// robust currency picker from expense object
const getCurrencyCode = (exp) =>
    exp?.currencyCode || exp?.currency?.code || exp?.currency || exp?.meta?.currency || "INR"

export default function WeeklyExpenseTrends({ expenses = [], userId, defaultCurrency = "INR" }) {
    const [timeRange, setTimeRange] = React.useState("12w")
    const [currency, setCurrency] = React.useState(defaultCurrency)

    // 1) Base filter for time range (currency-agnostic, to discover currencies)
    const baseFiltered = React.useMemo(() => {
        // keep all; time slicing happens after bucketing via slice(-N)
        // (you already do last 4/12 weeks by slicing final array)
        return expenses.filter((e) => e?.typeOf === "expense")
    }, [expenses])

    // 2) Available currencies in scope
    const availableCurrencies = React.useMemo(() => {
        const set = new Set(baseFiltered.map(getCurrencyCode))
        const list = Array.from(set).filter(Boolean).sort()
        // keep selection sane if filters changed
        if (list.length && !list.includes(currency)) {
            setCurrency(list.includes(defaultCurrency) ? defaultCurrency : list[0])
        }
        return list
    }, [baseFiltered, currency, defaultCurrency])

    const showCurrencySelect = availableCurrencies.length > 1
    const symbol = getSymbol(currency) || ""

    // 3) Weekly bucketing with currency filter applied
    const weeklyData = React.useMemo(() => {
        const buckets = {}

        for (const exp of baseFiltered) {
            if (getCurrencyCode(exp) !== currency) continue

            const d = new Date(exp.date)
            const { weekKey, startLabel, rangeLabel, startDate } = getWeekRange(d)

            if (!buckets[weekKey]) {
                buckets[weekKey] = {
                    week: startLabel,   // X-axis label
                    rangeLabel,         // Tooltip label
                    personal: 0,
                    group: 0,
                    friend: 0,
                    _date: startDate,
                }
            }

            const split = exp.splits?.find((s) => s.friendId?._id === userId)
            const share = Number(split?.oweAmount) || 0

            if (exp.groupId) {
                if (split?.owing) buckets[weekKey].group += share
            } else if (exp.splits?.length > 0) {
                if (split?.owing) buckets[weekKey].friend += share
            } else {
                buckets[weekKey].personal += Number(exp.amount) || 0
            }
        }

        return Object.values(buckets)
            .sort((a, b) => a._date - b._date)
            .map(({ _date, ...rest }) => rest)
    }, [baseFiltered, userId, currency])

    // 4) Range slice (last N weeks)
    const filteredData = React.useMemo(() => {
        const N = timeRange === "4w" ? 4 : 12
        return weeklyData.slice(-N)
    }, [weeklyData, timeRange])

    const chartConfig = {
        personal: { label: "Personal", color: "var(--chart-1)" },
        group: { label: "Group", color: "var(--chart-2)" },
        friend: { label: "Friend", color: "var(--chart-3)" },
    }

    return (
        <Card className="bg-[#1f1f1f] py-0 pr-2 pb-4 rounded-xl shadow-md border-none">
            <CardHeader className="p-5 pb-0 items-center justify-between">
                <div>
                    <CardTitle className="text-lg font-semibold">Weekly Expense Trends</CardTitle>
                    <CardDescription>Breakdown by Personal, Group & Friend</CardDescription>
                </div>
                <div className="flex gap-2">
                    <Select value={timeRange} onValueChange={setTimeRange}>
                        <SelectTrigger className="rounded-lg text-sm">
                            <SelectValue placeholder="Select range" />
                        </SelectTrigger>
                        <SelectContent className="border-[#EBF1D5] bg-[#212121]">
                            <SelectItem className="text-[#EBF1D5]" value="4w">Last 4 weeks</SelectItem>
                            <SelectItem className="text-[#EBF1D5]" value="12w">Last 12 weeks</SelectItem>
                        </SelectContent>
                    </Select>

                    {showCurrencySelect && (
                        <Select value={currency} onValueChange={setCurrency}>
                            <SelectTrigger className="rounded-lg text-sm w-[120px]">
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
            </CardHeader>

            <CardContent>
                <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
                    <AreaChart data={filteredData} margin={{}}>
                        <defs>
                            {Object.entries(chartConfig).map(([key, cfg]) => (
                                <linearGradient key={key} id={`fill-${key}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={cfg.color} stopOpacity={0.6} />
                                    <stop offset="95%" stopColor={cfg.color} stopOpacity={0.05} />
                                </linearGradient>
                            ))}
                        </defs>

                        <CartesianGrid vertical={false} stroke="#2a2a2a" />
                        <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={8} />
                        <YAxis width={54} />
                        <ChartTooltip
                            cursor={false}
                            content={
                                <ChartTooltipContent
                                    labelFormatter={(_, payload) => payload?.[0]?.payload?.rangeLabel}
                                    indicator="dot"
                                    className={"bg-[#212121]"}
                                    formatter={(val, name) =>
                                        `${chartConfig[name]?.label || name}: ${symbol} ${Number(val || 0).toFixed(2)}`
                                    }
                                />
                            }
                        />
                        <ChartLegend content={<ChartLegendContent />} />

                        {Object.keys(chartConfig).map((key) => (
                            <Area
                                key={key}
                                dataKey={key}
                                type="linear"
                                stroke={chartConfig[key].color}
                                fill={`url(#fill-${key})`}
                                strokeWidth={2}
                                stackId="a"
                                isAnimationActive={true}
                            />
                        ))}
                    </AreaChart>
                </ChartContainer>
            </CardContent>
        </Card>
    )
}

// --- helper: compute week range (kept as-is: Monday–Sunday) ---
function getWeekRange(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    const dayNum = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() + 1 - dayNum) // Monday start
    const startDate = new Date(d)
    const endDate = new Date(d)
    endDate.setUTCDate(startDate.getUTCDate() + 6)

    const startLabel = startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    const rangeLabel = `${startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${endDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`

    const weekKey = `${startDate.getFullYear()}-${startDate.getMonth()}-${startDate.getDate()}`
    return { weekKey, startLabel, rangeLabel, startDate }
}
