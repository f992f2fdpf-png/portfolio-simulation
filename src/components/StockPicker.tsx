import React, { useEffect, useMemo, useState } from 'react'
import type { StockInfo, StockTicker } from '../data/stocks'

export default function StockPicker({
  allStocks,
  selectedTickers,
  onChangeSelection,
  onAddStock
}: {
  stocks: StockInfo[]
  allStocks: Record<StockTicker, StockInfo>
  selectedTickers: StockTicker[]
  onChangeSelection: (next: StockTicker[]) => void
  onAddStock: (stock: StockInfo) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<StockInfo[]>([])
  const [loading, setLoading] = useState(false)
  const selectedSet = useMemo(() => new Set(selectedTickers), [selectedTickers])

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults([])
      return
    }
    let active = true
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
        const data = await res.json()
        if (active && Array.isArray(data)) {
          // color is generated on client
          const mapped = data.map((d: any) => ({
            ticker: d.ticker,
            name: d.name,
            color: `hsl(${Math.random() * 360}, 70%, 50%)`
          }))
          setResults(mapped)
        }
      } catch (err) {
        console.error(err)
      } finally {
        if (active) setLoading(false)
      }
    }, 500) // debounce
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [query])

  const toggle = (ticker: StockTicker, info?: StockInfo) => {
    if (selectedSet.has(ticker)) {
      onChangeSelection(selectedTickers.filter((t) => t !== ticker))
    } else {
      if (info && !allStocks[ticker]) {
        onAddStock(info)
      }
      onChangeSelection([...selectedTickers, ticker])
    }
  }

  // Fallback to known local stocks if no query
  const displayOptions = query.trim()
    ? results
    : Object.values(allStocks).slice(0, 5) // just show 5 default options if no query

  return (
    <div>
      <div style={{ display: 'grid', gap: 10 }}>
        <div>
          <div className="label" style={{ marginBottom: 8 }}>
            Aktiensuche (Yahoo Finance)
          </div>
          <input
            className="textInput"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Suchen (z. B. Apple, MSFT, TSLA)…"
          />
        </div>

        {selectedTickers.length > 0 && (
          <div className="chipRow" aria-label="Ausgewählte Aktien">
            {selectedTickers.map((t) => {
              const s = allStocks[t] || { ticker: t, name: t, color: '#2563eb' }
              return (
                <button
                  key={t}
                  type="button"
                  className="chip"
                  onClick={() => toggle(t)}
                  title="Klicken zum Entfernen"
                >
                  <span className="chipTicker">{s.ticker}</span>
                  <span className="chipName">{s.name}</span>
                  <span className="chipX">×</span>
                </button>
              )
            })}
          </div>
        )}

        <div className="stockList">
          {loading && <div style={{ fontSize: 13, color: '#666', padding: '4px 8px' }}>Suche läuft...</div>}
          {displayOptions.map((s) => {
            const checked = selectedSet.has(s.ticker)
            return (
              <label key={s.ticker} className="stockRow">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(s.ticker, s)}
                />
                <span className="stockName">
                  {s.name} <span className="stockTicker">{s.ticker}</span>
                </span>
              </label>
            )
          })}
        </div>
      </div>
    </div>
  )
}

