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

export default function MonthlyTrends({ trendChart, trendRange, setTrendRange }) {
  const chartConfig = {
    value: {
      label: "Expenses",
      color: "var(--chart-1)",
    },
  }

  const ranges = [
    { key: "thisMonth", label: "This Month" },
    { key: "lastMonth", label: "Last Month" },
    { key: "thisYear", label: "This Year" },
  ]

  return (
    <Card className="bg-[#1f1f1f] rounded-xl py-0 pr-2 shadow-md border-none">
      <CardHeader className="p-4 flex flex-col gap-2 pb-0 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-lg font-semibold">Monthly Expenses</CardTitle>
          {/* <CardDescription>Breakdown of expenses by month</CardDescription> */}
        </div>
        <Select value={trendRange} onValueChange={setTrendRange}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue placeholder="Select range" />
          </SelectTrigger>
          <SelectContent className="border-[#EBF1D5] bg-[#212121]">

      <SelectItem className="text-[#EBF1D5]" value="thisMonth">This Month</SelectItem>
    <SelectItem className="text-[#EBF1D5]" value="last3m">Last 3 Months</SelectItem>
    <SelectItem className="text-[#EBF1D5]" value="thisYear">This Year</SelectItem>

          </SelectContent>
        </Select>
      </CardHeader>

      <CardContent>
        <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
          <BarChart
            accessibilityLayer
            data={trendChart}
            margin={{  }}
          >
            <CartesianGrid vertical={false} stroke="#2a2a2a" />
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={false}
              tickMargin={10}
            />
            <YAxis 
              width={54}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent />}
            />
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
