import React, { useMemo } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatCurrency } from '../utils/format'

type CompareSeries = {
  id: string
  name: string
  color: string
  values: { year: number; value: number }[]
}

export default function SavedPortfolioCompareChart({
  series
}: {
  series: CompareSeries[]
}) {
  const chartData = useMemo(() => {
    if (!series || series.length === 0) return []
    const years = Array.from(
      new Set(series.flatMap((item) => item.values.map((p) => p.year)))
    ).sort((a, b) => a - b)

    const data = years.map((year) => {
      const row: Record<string, number | undefined> = { year }
      series.forEach((item) => {
        const point = item.values.find((p) => p.year === year)
        row[item.id] = point ? point.value : NaN
      })
      return row
    })

    return data
  }, [series])

  if (!series || series.length === 0) return null

  return (
    <div style={{ width: '100%', minHeight: 360 }}>
      <ResponsiveContainer width="100%" height={360}>
        <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="4 6" />
          <XAxis dataKey="year" tick={{ fill: 'var(--muted)', fontSize: 12 }} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
          <YAxis
            tick={{ fill: 'var(--muted)', fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
            tickFormatter={(v) => {
              const n = Number(v)
              if (!Number.isFinite(n)) return ''
              if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`
              return `${Math.round(n)}`
            }}
          />
          <Tooltip
            formatter={(value: number) => formatCurrency(value)}
            labelFormatter={(label) => `Jahr ${label}`}
            contentStyle={{ background: 'var(--bg1)', border: '1px solid var(--border)' }}
          />
          <Legend />
          {series.map((item) => (
            <Line
              key={item.id}
              type="monotone"
              dataKey={item.id}
              name={item.name}
              stroke={item.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
