import React from 'react'
import { formatCurrency, formatPercent } from '../utils/format'

export default function ResultsSummary({
  totals
}: {
  totals: { endCapital: number; totalGain: number; percentReturn: number }
}) {
  const gainPositive = totals.totalGain >= 0

  return (
    <div className="metricGrid" aria-label="Ergebnisübersicht">
      <div className="metricCard">
        <div className="metricLabel">Endkapital</div>
        <div className="metricValue">{formatCurrency(totals.endCapital)}</div>
      </div>

      <div className="metricCard">
        <div className="metricLabel">Gesamtgewinn</div>
        <div className="metricValue" style={{ color: gainPositive ? 'var(--success)' : 'var(--danger)' }}>
          {gainPositive ? '+' : ''}
          {formatCurrency(totals.totalGain)}
        </div>
      </div>

      <div className="metricCard">
        <div className="metricLabel">Prozentuale Rendite</div>
        <div className="metricValue" style={{ color: totals.percentReturn >= 0 ? 'var(--success)' : 'var(--danger)' }}>
          {formatPercent(totals.percentReturn, 2)}
        </div>
      </div>
    </div>
  )
}

