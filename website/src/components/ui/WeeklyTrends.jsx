"use client"

import * as React from "react"
import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
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
import { getSymbol } from "@/utils/currencies"

export default function WeeklyExpenseTrends({ expenses = [], userId, defaultCurrency }) {
  const [timeRange, setTimeRange] = React.useState("12w")

  // --- build weekly data ---
  const weeklyData = React.useMemo(() => {
    const buckets = {}

    for (const exp of expenses || []) {
      if (exp.typeOf !== "expense") continue

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
        if (split?.owing) {
          buckets[weekKey].group += share
        }
      } else if (exp.splits?.length > 0) {
        if (split?.owing) {
          buckets[weekKey].friend += share
        }
      } else {
        buckets[weekKey].personal += Number(exp.amount) || 0
      }
    }

    return Object.values(buckets)
      .sort((a, b) => a._date - b._date)
      .map(({ _date, ...rest }) => rest)
  }, [expenses, userId])

  // --- filter by selected range (last N weeks) ---
  const filteredData = React.useMemo(() => {
    let N = 12
    if (timeRange === "4w") N = 4
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
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="rounded-lg text-sm">
            <SelectValue placeholder="Select range" />
          </SelectTrigger>
          <SelectContent className="border-[#EBF1D5] bg-[#212121]">
            <SelectItem className="text-[#EBF1D5]" value="4w">Last 4 weeks</SelectItem>
            <SelectItem className="text-[#EBF1D5]" value="12w">Last 12 weeks</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
          <AreaChart
            data={filteredData}
            margin={{  }}
          >
            <defs>
              {Object.entries(chartConfig).map(([key, cfg]) => (
                <linearGradient
                  key={key}
                  id={`fill-${key}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="5%" stopColor={cfg.color} stopOpacity={0.6} />
                  <stop offset="95%" stopColor={cfg.color} stopOpacity={0.05} />
                </linearGradient>
              ))}
            </defs>

            <CartesianGrid vertical={false} stroke="#2a2a2a" />
            <XAxis
              dataKey="week"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis 
              width={54}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.rangeLabel}
                  indicator="dot"
                  formatter={(val, name) =>
                    `${chartConfig[name]?.label || name}: ${
                      getSymbol(defaultCurrency)
                    }${Number(val || 0).toFixed(2)}`
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

// --- helper: compute week range ---
function getWeekRange(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 1 - dayNum) // Monday start
  const startDate = new Date(d)
  const endDate = new Date(d)
  endDate.setUTCDate(startDate.getUTCDate() + 6)

  const startLabel = startDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })

  const rangeLabel = `${startDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })} – ${endDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })}`

  const weekKey = `${startDate.getFullYear()}-${startDate.getMonth()}-${startDate.getDate()}`
  return { weekKey, startLabel, rangeLabel, startDate }
}
