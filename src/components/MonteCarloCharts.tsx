import React, { useMemo } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  BarChart,
  Bar
} from 'recharts'
import type { MonteCarloPath, MonteCarloSummary } from '../utils/monteCarlo'
import { formatCurrency } from '../utils/format'

export function MonteCarloPathsChart({ paths }: { paths: MonteCarloPath[] }) {
  const sampled = useMemo(() => paths.slice(0, 50), [paths])

  const merged = useMemo(() => {
    if (sampled.length === 0) return []
    const maxLen = Math.max(...sampled.map((p) => p.length))
    const rows: { step: number; year: number; [key: string]: number }[] = []
    for (let i = 0; i < maxLen; i++) {
      const row: { step: number; year: number; [key: string]: number } = {
        step: i,
        year: sampled[0][Math.min(i, sampled[0].length - 1)].year
      }
      sampled.forEach((path, idx) => {
        const point = path[Math.min(i, path.length - 1)]
        row[`sim${idx}`] = point.value
      })
      rows.push(row)
    }
    return rows
  }, [sampled])

  if (merged.length === 0) {
    return <div className="tableHint">Noch keine Monte-Carlo-Simulation ausgeführt.</div>
  }

  return (
    <div style={{ width: '100%', height: 320 }}>
      <ResponsiveContainer>
        <LineChart data={merged} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
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
          {sampled.map((_, idx) => (
            <Line
              key={idx}
              type="monotone"
              dataKey={`sim${idx}`}
              stroke={`hsl(${(idx * 47) % 360} 70% 55%)`}
              strokeWidth={1}
              dot={false}
              opacity={0.6}
              legendType="none"
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function MonteCarloHistogram({
  histogram
}: {
  histogram: { bucket: number; count: number }[]
}) {
  const data = useMemo(
    () =>
      histogram.map((h) => ({
        ...h,
        label: h.bucket
      })),
    [histogram]
  )

  if (data.length === 0) {
    return <div className="tableHint">Noch keine Verteilung der Endwerte berechnet.</div>
  }

  return (
    <div style={{ width: '100%', height: 260 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="4 6" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: 'var(--muted)', fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
            tickFormatter={(v) => {
              const n = Number(v)
              if (!Number.isFinite(n)) return ''
              if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`
              return `${Math.round(n)}`
            }}
          />
          <YAxis
            tick={{ fill: 'var(--muted)', fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
          />
          <Tooltip
            formatter={(value: number) => `${value.toFixed(0)} Läufe`}
            labelFormatter={(label) => `Endwert ca. ${formatCurrency(Number(label))}`}
            contentStyle={{ background: 'var(--bg1)', border: '1px solid var(--border)' }}
          />
          <Bar dataKey="count" fill="var(--primary)" opacity={0.8} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function MonteCarloSummaryStats({
  summary
}: {
  summary: MonteCarloSummary | null
}) {
  if (!summary || summary.simulations === 0) {
    return (
      <div className="tableHint">
        Starte eine Monte-Carlo-Simulation, um Szenario-Kennzahlen zu sehen.
      </div>
    )
  }

  const { meanEnd, medianEnd, bestEnd, worstEnd, p5, p95, simulations, horizonYears } = summary

  return (
    <div className="resultsGrid">
      <div className="resultsItem">
        <div className="resultsLabel">Durchschnittlicher Endwert</div>
        <div className="resultsValue">{formatCurrency(meanEnd)}</div>
      </div>
      <div className="resultsItem">
        <div className="resultsLabel">Median</div>
        <div className="resultsValue">{formatCurrency(medianEnd)}</div>
      </div>
      <div className="resultsItem resultsItemBest">
        <div className="resultsLabel">Best Case</div>
        <div className="resultsValue">{formatCurrency(bestEnd)}</div>
      </div>
      <div className="resultsItem resultsItemWorst">
        <div className="resultsLabel">Worst Case</div>
        <div className="resultsValue">{formatCurrency(worstEnd)}</div>
      </div>
      <div className="resultsItem resultsItemVar">
        <div className="resultsLabel">5%-Perzentil (VaR)</div>
        <div className="resultsValue">{formatCurrency(p5)}</div>
      </div>
      <div className="resultsItem resultsItemP95">
        <div className="resultsLabel">95%-Perzentil</div>
        <div className="resultsValue">{formatCurrency(p95)}</div>
      </div>
      <div className="resultsItem">
        <div className="resultsLabel">Anzahl Läufe</div>
        <div className="resultsValue">
          {simulations.toLocaleString('de-DE')} · {horizonYears} Jahre
        </div>
      </div>
    </div>
  )
}

