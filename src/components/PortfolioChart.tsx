import React, { useMemo } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import type { PortfolioSeriesPoint } from '../utils/portfolio'
import type { StockInfo } from '../data/stocks'
import { formatCurrency } from '../utils/format'

export default function PortfolioChart({
  series
}: {
  series: PortfolioSeriesPoint[]
  tickers: string[]
  stockReturns: Record<string, StockInfo>
}) {
  const data = useMemo(() => series, [series])

  return (
    <div style={{ width: '100%', height: 320 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="4 6" />
          <XAxis
            dataKey="year"
            tick={{ fill: 'var(--muted)', fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
          />
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
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--primary)"
            strokeWidth={3}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

