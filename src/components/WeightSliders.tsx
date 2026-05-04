import React, { useMemo } from 'react'
import type { StockInfo, StockTicker } from '../data/stocks'

export default function WeightSliders({
  tickers,
  weights,
  stockReturns,
  onWeightChange,
  onWeightsCommit
}: {
  tickers: StockTicker[]
  weights: Record<StockTicker, number | null>
  stockReturns: Record<StockTicker, StockInfo>
  onWeightChange: (ticker: StockTicker, nextWeightPercent: number | null) => void
  onWeightsCommit: () => void
}) {
  const [draftValues, setDraftValues] = React.useState<Partial<Record<StockTicker, string>>>({})

  React.useEffect(() => {
    const next: Partial<Record<StockTicker, string>> = {}
    for (const t of tickers) {
      const v = weights[t]
      next[t] = Number.isFinite(v as number) ? String(v) : ''
    }
    setDraftValues(next)
  }, [tickers, weights])

  const total = useMemo(() => {
    return tickers.reduce((acc, t) => acc + (weights[t] ?? 0), 0)
  }, [tickers, weights])

  if (tickers.length === 0) return null

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div className="label">Gewichtung (Summe = 100%)</div>
        <div className="weightTotal" title="Gesamtgewichtung">
          {Math.round(total * 10) / 10}% 
        </div>
      </div>

      <div className="weightsList">
        {tickers.map((t) => {
          const s = stockReturns[t]
          const value = weights[t] ?? 0
          return (
            <div key={t} className="weightRow">
              <div className="weightTop">
                <div>
                  <div className="weightTicker">
                    {s.ticker} <span className="weightName">{s.name}</span>
                  </div>
                </div>
                <div className="weightValue">
                  <div className="weightNumberWrap">
                    <input
                      className="weightNumber"
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={draftValues[t] ?? ''}
                      onChange={(e) => {
                        const raw = e.target.value
                        setDraftValues((prev) => ({ ...prev, [t]: raw }))
                      }}
                      onBlur={() => {
                        const raw = (draftValues[t] ?? '').trim()
                        if (raw === '') {
                          onWeightChange(t, null)
                        } else {
                          const parsed = parseFloat(raw)
                          if (Number.isFinite(parsed)) {
                            onWeightChange(t, parsed)
                          } else {
                            onWeightChange(t, null)
                          }
                        }
                        onWeightsCommit()
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur()
                      }}
                      aria-label={`Gewichtung für ${s.ticker}`}
                    />
                    <span className="weightSuffix">%</span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

