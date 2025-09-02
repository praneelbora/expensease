// src/components/MonthlyTrends.jsx
"use client"

import {
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  LabelList,
} from "recharts"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import React, { useMemo, useState } from "react"
import { getSymbol } from "@/utils/currencies"

export default function MonthlyTrends({ expenses, userId, defaultCurrency }) {
  const [trendRange, setTrendRange] = useState("thisMonth")  // default: This Month
  const [expenseType, setExpenseType] = useState("all")      // default: All

  // --- build monthly data ---
  const trendChartRaw = useMemo(() => {
    const monthly = {}

    for (const exp of expenses || []) {
      if (exp.typeOf !== "expense") continue

      const d = new Date(exp.date)
      const monthKey = d.toLocaleString("default", {
        month: "short",
        year: "2-digit",
      })

      const split = exp.splits?.find((s) => s.friendId?._id === userId)
      const share = Number(split?.oweAmount) || 0

      let shouldInclude = false
      let amount = 0

      if (expenseType === "all") {
        if (exp.groupId && split?.owing) {
          shouldInclude = true
          amount = share
        } else if (exp.splits?.length > 0 && split?.owing) {
          shouldInclude = true
          amount = share
        } else if (!exp.groupId && (!exp.splits || exp.splits.length === 0)) {
          shouldInclude = true
          amount = Number(exp.amount) || 0
        }
      } else if (expenseType === "group" && exp.groupId && split?.owing) {
        shouldInclude = true
        amount = share
      } else if (expenseType === "friend" && exp.splits?.length > 0 && split?.owing && !exp.groupId) {
        shouldInclude = true
        amount = share
      } else if (expenseType === "personal" && !exp.groupId && (!exp.splits || exp.splits.length === 0)) {
        shouldInclude = true
        amount = Number(exp.amount) || 0
      }

      if (shouldInclude) {
        monthly[monthKey] = (monthly[monthKey] || 0) + amount
      }
    }

    return Object.entries(monthly).map(([name, value]) => {
      const [mon, yr] = name.split(" ")
      const date = new Date(`${mon} 01, 20${yr.replace("'", "")}`)
      return { name, value, date }
    }).sort((a, b) => a.date - b.date)
  }, [expenses, userId, expenseType])

  // --- filter by time range ---
  const trendChart = useMemo(() => {
    if (!trendChartRaw.length) return []

    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()

    if (trendRange === "thisMonth") {
      return trendChartRaw.filter(
        (d) =>
          d.date.getMonth() === currentMonth &&
          d.date.getFullYear() === currentYear
      )
    }

    if (trendRange === "last3m") {
      const threeMonthsAgo = new Date(currentYear, currentMonth - 2, 1)
      threeMonthsAgo.setHours(0, 0, 0, 0)
      return trendChartRaw.filter((d) => d.date >= threeMonthsAgo)
    }

    if (trendRange === "thisYear") {
      return trendChartRaw.filter(
        (d) => d.date.getFullYear() === currentYear
      )
    }

    return trendChartRaw
  }, [trendChartRaw, trendRange])

  const chartConfig = {
    value: {
      label: "Expenses",
      color: "var(--chart-1)",
    },
  }

  const ranges = [
    { key: "thisMonth", label: "This Month" },
    { key: "last3m", label: "Last 3 Months" },
    { key: "thisYear", label: "This Year" },
  ]

  const types = [
    { key: "all", label: "All Expenses" },
    { key: "personal", label: "Personal Expenses" },
    { key: "group", label: "Group Expenses" },
    { key: "friend", label: "Friend Expenses" },
  ]

  return (
    <Card className="bg-[#1f1f1f] rounded-xl py-0 pr-2 pb-4 shadow-md border-none">
      <CardHeader className="p-4 flex flex-col gap-2 pb-0 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-lg font-semibold">Monthly Expenses</CardTitle>
        </div>

        <div className="flex gap-2">
          {/* Range filter */}
          <Select value={trendRange} onValueChange={setTrendRange}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
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
          <Select value={expenseType} onValueChange={setExpenseType}>
            <SelectTrigger className="w-[120px] h-8 text-xs">
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

        </div>
      </CardHeader>

      <CardContent>
        <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
          <BarChart
            accessibilityLayer
            data={trendChart}
            margin={{ left: 0, right: 10, bottom: 0, top: 20 }}
          >
            <CartesianGrid vertical={false} stroke="#2a2a2a" />
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={false}
              tickMargin={10}
            />
            <YAxis width={48} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="value" fill="var(--color-value)" radius={8}>
              <LabelList
                dataKey="value"
                position="top"
                offset={6}
                className="fill-foreground text-xs"
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
