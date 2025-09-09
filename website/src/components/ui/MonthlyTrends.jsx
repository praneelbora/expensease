// src/components/MonthlyTrends.jsx
"use client"

import {
    BarChart, Bar, CartesianGrid, XAxis, YAxis, LabelList,
} from "recharts"
import {
    Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card"
import {
    ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent,
} from "@/components/ui/chart"
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import React, { useMemo, useState } from "react"
import { getSymbol } from "@/utils/currencies" // ⬅️ used for labels in currency dropdown

// ---------- date helpers ----------
const atMidnight = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
const startOfWeekSun = (date) => { const d = atMidnight(date); d.setDate(d.getDate() - d.getDay()); return d }
const endOfWeekSat = (date) => { const s = startOfWeekSun(date); const e = new Date(s); e.setDate(s.getDate() + 6); e.setHours(23, 59, 59, 999); return e }
const monthStart = (date) => new Date(date.getFullYear(), date.getMonth(), 1)
const monthEnd = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999)
const ymd = (d) => atMidnight(d).toISOString().slice(0, 10)
const monthKey = (d) => d.toLocaleString("default", { month: "short", year: "2-digit" })

// ---------- UI helpers ----------
const dayShort = (d) => d.toLocaleString("default", { weekday: "short" })
const dayNum = (d) => d.getDate()

// Try to be robust about where currency might live on the expense
const getCurrencyCode = (exp) =>
    exp?.currencyCode ||
    exp?.currency?.code ||
    exp?.currency ||
    exp?.meta?.currency ||
    "INR"

export default function MonthlyTrends({ expenses, userId, defaultCurrency }) {
    const [trendRange, setTrendRange] = useState("thisMonth")
    const [expenseType, setExpenseType] = useState("all")
    const [currency, setCurrency] = useState(defaultCurrency) // "ALL" or a specific code like "INR", "USD"
    // helper: treat missing PM as included; if pm.excludeFromSummaries === true
    // then exclude ONLY when the current user is NOT part of this transaction.
    const pmIsExcludedForUser = (pm, exp, userSplitForThisUser) => {
        if (!pm) return false;
        if (typeof pm === "object" && pm.excludeFromSummaries === true) {
            // user is part if they have a split (userSplitForThisUser) OR they created the personal expense
            const userIsPartOfTransaction = !!userSplitForThisUser || String(exp.createdBy) === String(userId);
            return !userIsPartOfTransaction; // exclude only when user is NOT part
        }
        return false;
    };

    const shouldCount = (exp) => {
        if (exp.typeOf !== "expense") return { include: false, amount: 0, code: null }
        const split = exp.splits?.find((s) => s.friendId?._id === userId)
        const share = Number(split?.oweAmount) || 0
        const code = getCurrencyCode(exp)

        let include = false
        let amount = 0

        if (expenseType === "all") {
            if (exp.groupId && split?.owing) { include = true; amount = share }
            else if (exp.splits?.length > 0 && split?.owing && !exp.groupId) { include = true; amount = share }
            else if (!exp.groupId && (!exp.splits || exp.splits.length === 0)) { include = true; amount = Number(exp.amount) || 0 }
        } else if (expenseType === "group" && exp.groupId && split?.owing) {
            include = true; amount = share
        } else if (expenseType === "friend" && exp.splits?.length > 0 && split?.owing && !exp.groupId) {
            include = true; amount = share
        } else if (expenseType === "personal" && !exp.groupId && (!exp.splits || exp.splits.length === 0)) {
            include = true; amount = Number(exp.amount) || 0
        }

        // If included so far, check payment-method exclusion rules:
        if (include) {
            // For split-based items prefer split.paidFromPaymentMethodId; else use exp.paidFromPaymentMethodId
            let pmToCheck = null
            if (split && (split.paidFromPaymentMethodId || split.paidFromPaymentMethodId === null)) {
                pmToCheck = split.paidFromPaymentMethodId
            } else {
                pmToCheck = exp.paidFromPaymentMethodId
            }

            if (pmIsExcludedForUser(pmToCheck, exp, split)) {
                // payment method excludes this share for users NOT part of transaction
                // since userIsPartOfTransaction already considered in helper, if helper returns true we should not include
                include = false
                amount = 0
            }
        }

        // currency filter (if a specific currency is chosen)
        if (include && currency !== "ALL" && code !== currency) {
            include = false
            amount = 0
        }

        return { include, amount, code }
    }


    // ---------- compute available currencies (from expenses that pass type filter) ----------
    const availableCurrencies = useMemo(() => {
        const set = new Set()
        for (const exp of expenses || []) {
            // run type filter without currency constraint
            const tmp = shouldCountNoCurrency(exp, expenseType, userId)
            if (tmp.include) set.add(tmp.code)
        }
        return Array.from(set)
            .filter(Boolean)
            .sort()
    }, [expenses, expenseType, userId])

    // helper: shouldCount but ignoring currency selection
    function shouldCountNoCurrency(exp, expenseType, userId) {
        if (exp.typeOf !== "expense") return { include: false, amount: 0, code: null }
        const split = exp.splits?.find((s) => s.friendId?._id === userId)
        const share = Number(split?.oweAmount) || 0
        const code = getCurrencyCode(exp)

        if (expenseType === "all") {
            if (exp.groupId && split?.owing) {
                // check PM exclusion for this split/share
                const pmToCheck = split && (split.paidFromPaymentMethodId || split.paidFromPaymentMethodId === null) ? split.paidFromPaymentMethodId : exp.paidFromPaymentMethodId
                if (pmIsExcludedForUser(pmToCheck, exp, split)) return { include: false, amount: 0, code }
                return { include: true, amount: share, code }
            }
            if (exp.splits?.length > 0 && split?.owing && !exp.groupId) {
                const pmToCheck = split && (split.paidFromPaymentMethodId || split.paidFromPaymentMethodId === null) ? split.paidFromPaymentMethodId : exp.paidFromPaymentMethodId
                if (pmIsExcludedForUser(pmToCheck, exp, split)) return { include: false, amount: 0, code }
                return { include: true, amount: share, code }
            }
            if (!exp.groupId && (!exp.splits || exp.splits.length === 0)) {
                const pmToCheck = exp.paidFromPaymentMethodId
                if (pmIsExcludedForUser(pmToCheck, exp, null)) return { include: false, amount: 0, code }
                return { include: true, amount: Number(exp.amount) || 0, code }
            }
            return { include: false, amount: 0, code }
        }
        if (expenseType === "group" && exp.groupId && split?.owing) {
            const pmToCheck = split && (split.paidFromPaymentMethodId || split.paidFromPaymentMethodId === null) ? split.paidFromPaymentMethodId : exp.paidFromPaymentMethodId
            if (pmIsExcludedForUser(pmToCheck, exp, split)) return { include: false, amount: 0, code }
            return { include: true, amount: share, code }
        }
        if (expenseType === "friend" && exp.splits?.length > 0 && split?.owing && !exp.groupId) {
            const pmToCheck = split && (split.paidFromPaymentMethodId || split.paidFromPaymentMethodId === null) ? split.paidFromPaymentMethodId : exp.paidFromPaymentMethodId
            if (pmIsExcludedForUser(pmToCheck, exp, split)) return { include: false, amount: 0, code }
            return { include: true, amount: share, code }
        }
        if (expenseType === "personal" && !exp.groupId && (!exp.splits || exp.splits.length === 0)) {
            const pmToCheck = exp.paidFromPaymentMethodId
            if (pmIsExcludedForUser(pmToCheck, exp, null)) return { include: false, amount: 0, code }
            return { include: true, amount: Number(exp.amount) || 0, code }
        }
        return { include: false, amount: 0, code }
    }


    // ---------- prefiltered list (respects expenseType + chosen currency) ----------
    const filtered = useMemo(() => {
        const out = []
        for (const exp of expenses || []) {
            const { include, amount } = shouldCount(exp)
            if (!include) continue
            const d = new Date(exp.date)
            out.push({ date: d, amount })
        }
        return out
    }, [expenses, expenseType, userId, currency])

    // ---------- aggregators ----------
    const buildDailyForWeek = (anchorDate) => {
        const start = startOfWeekSun(anchorDate)
        const days = Array.from({ length: 7 }, (_, i) => {
            const d = new Date(start); d.setDate(start.getDate() + i); return atMidnight(d)
        })
        const acc = new Map(days.map((d) => [ymd(d), 0]))
        for (const { date, amount } of filtered) {
            const dd = atMidnight(date)
            if (dd >= days[0] && dd <= days[6]) {
                const k = ymd(dd)
                acc.set(k, (acc.get(k) || 0) + amount)
            }
        }
        return days.map((d) => ({
            name: `${dayShort(d)} ${dayNum(d)}`,
            value: acc.get(ymd(d)) || 0,
            date: d,
        }))
    }

    const buildBandsForMonth = (anchorDate) => {
        const ms = monthStart(anchorDate)
        const me = monthEnd(anchorDate)
        const endsOn = me.getDate()
        const bands = [
            { label: "1–7", start: 1, end: 7 },
            { label: "8–14", start: 8, end: 14 },
            { label: "15–21", start: 15, end: 21 },
            { label: `22–${endsOn}`, start: 22, end: endsOn },
        ].map((b) => ({
            ...b,
            sDate: new Date(ms.getFullYear(), ms.getMonth(), b.start),
            eDate: new Date(ms.getFullYear(), ms.getMonth(), b.end, 23, 59, 59, 999),
        }))

        const totals = bands.map((b) => ({ ...b, total: 0 }))
        for (const { date, amount } of filtered) {
            if (date >= ms && date <= me) {
                for (const t of totals) {
                    if (date >= t.sDate && date <= t.eDate) { t.total += amount; break }
                }
            }
        }
        return totals.map((t) => ({ name: t.label, value: t.total, date: t.sDate }))
    }

    const monthlyTotals = useMemo(() => {
        const map = new Map()
        for (const { date, amount } of filtered) {
            const bucket = monthStart(date)
            const key = `${bucket.getFullYear()}-${bucket.getMonth()}`
            const prev = map.get(key)?.total || 0
            map.set(key, { total: prev + amount, date: bucket })
        }
        return Array.from(map.values())
            .sort((a, b) => a.date - b.date)
            .map((o) => ({ name: monthKey(o.date), value: o.total, date: o.date }))
    }, [filtered])

    // ---------- final series by selected range ----------
    const trendChart = useMemo(() => {
        const now = new Date()
        switch (trendRange) {
            case "thisWeek": return buildDailyForWeek(now)
            case "lastWeek": {
                const lastSat = startOfWeekSun(now)
                lastSat.setDate(lastSat.getDate() - 1)
                return buildDailyForWeek(lastSat)
            }
            case "thisMonth": return buildBandsForMonth(now)
            case "lastMonth": {
                const lm = new Date(now.getFullYear(), now.getMonth() - 1, 15)
                return buildBandsForMonth(lm)
            }
            case "last3m": {
                const start = new Date(now.getFullYear(), now.getMonth() - 2, 1)
                return monthlyTotals.filter((d) => d.date >= start)
            }
            case "last6m": {
                const start = new Date(now.getFullYear(), now.getMonth() - 5, 1)
                return monthlyTotals.filter((d) => d.date >= start)
            }
            case "thisYear": {
                const start = new Date(now.getFullYear(), 0, 1)
                const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)
                return monthlyTotals.filter((d) => d.date >= start && d.date <= end)
            }
            default: return buildBandsForMonth(now)
        }
    }, [trendRange, monthlyTotals, filtered])

    const chartConfig = { value: { label: "Expenses", color: "var(--chart-1)" } }

    const ranges = [
        { key: "thisWeek", label: "This Week" },
        { key: "lastWeek", label: "Last Week" },
        { key: "thisMonth", label: "This Month" },
        { key: "lastMonth", label: "Last Month" },
        { key: "last3m", label: "Last 3 Months" },
        { key: "last6m", label: "Last 6 Months" },
        { key: "thisYear", label: "This Year" },
    ]

    const types = [
        { key: "all", label: "All Expenses" },
        { key: "personal", label: "Personal Expenses" },
        { key: "group", label: "Group Expenses" },
        { key: "friend", label: "Friend Expenses" },
    ]

    const titleMap = {
        thisWeek: "Daily Expenses (This Week)",
        lastWeek: "Daily Expenses (Last Week)",
        thisMonth: "Weekly Bands (This Month)",
        lastMonth: "Weekly Bands (Last Month)",
        last3m: "Monthly Expenses (Last 3 Months)",
        last6m: "Monthly Expenses (Last 6 Months)",
        thisYear: "Monthly Expenses (This Year)",
    }
    const title = titleMap[trendRange] || "Expenses"

    // Show currency dropdown only if >1 currency present in the current TYPE scope
    const showCurrencySelect = availableCurrencies.length > 1

    return (
        <Card className="bg-[#1f1f1f] rounded-xl py-0 pr-2 pb-4 shadow-md border-none">
            <CardHeader className="p-4 flex flex-col gap-2 pb-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                    <CardTitle className="text-lg font-semibold">{title}</CardTitle>
                    {currency !== "ALL" && (
                        <span className="text-muted-foreground text-xs">
                            ({getSymbol?.(currency) || ""} {currency})
                        </span>
                    )}
                </div>

                <div className="flex gap-2 flex-wrap">
                    {/* Range filter */}
                    <Select value={trendRange} onValueChange={setTrendRange}>
                        <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Range" />
                        </SelectTrigger>
                        <SelectContent className="border-[#EBF1D5] bg-[#212121]">
                            {ranges.map((r) => (
                                <SelectItem key={r.key} value={r.key} className="text-[#EBF1D5]">
                                    {r.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* Expense type filter */}
                    <Select value={expenseType} onValueChange={(v) => { setExpenseType(v); /* reset currency to ALL when type changes */ setCurrency(defaultCurrency) }}>
                        <SelectTrigger className="w-[160px] h-8 text-xs">
                            <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent className="border-[#EBF1D5] bg-[#212121]">
                            {types.map((t) => (
                                <SelectItem key={t.key} value={t.key} className="text-[#EBF1D5]">
                                    {t.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* Currency filter (only if more than one currency exists) */}
                    {showCurrencySelect && (
                        <Select value={currency} onValueChange={setCurrency}>
                            <SelectTrigger className="w-[140px] h-8 text-xs">
                                <SelectValue placeholder="Currency" />
                            </SelectTrigger>
                            <SelectContent className="border-[#EBF1D5] bg-[#212121]">
                                {availableCurrencies.map((code) => (
                                    <SelectItem key={code} value={code} className="text-[#EBF1D5]">
                                        {getSymbol?.(code) ? `${getSymbol(code)} • ${code}` : code}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </div>
            </CardHeader>

            <CardContent>
                <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
                    <BarChart accessibilityLayer data={trendChart} margin={{ left: 0, right: 10, bottom: 0, top: 20 }}>
                        <CartesianGrid vertical={false} stroke="#2a2a2a" />
                        <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={10} />
                        <YAxis width={48} />
                        <ChartTooltip content={<ChartTooltipContent
                            className={"bg-[#212121]"}
                        />} />
                        <ChartLegend content={<ChartLegendContent />} />
                        <Bar dataKey="value" fill="var(--color-value)" radius={8}>
                            <LabelList
                                dataKey="value"
                                position="top"
                                offset={6}
                                className="fill-foreground text-xs"
                                formatter={(val) => (typeof val === "number" ? val.toFixed(2) : val)}
                            />
                        </Bar>
                    </BarChart>
                </ChartContainer>
            </CardContent>
        </Card>
    )
}
