import React from 'react'
import type { StockInfo, StockTicker } from '../data/stocks'

export type ReturnVolInputsProps = {
  tickers: StockTicker[]
  stockReturns: Record<StockTicker, StockInfo>
  baseExpectedReturns: Record<StockTicker, number>
  baseVolatilities: Record<StockTicker, number>
  customExpectedReturns: Record<StockTicker, number>
  customVolatilities: Record<StockTicker, number>
  onCustomExpectedReturnChange: (ticker: StockTicker, value: number | null) => void
  onCustomVolatilityChange: (ticker: StockTicker, value: number | null) => void
  onResetCustom: () => void
}

export default function ReturnVolInputs({
  tickers,
  stockReturns,
  baseExpectedReturns,
  baseVolatilities,
  customExpectedReturns,
  customVolatilities,
  onCustomExpectedReturnChange,
  onCustomVolatilityChange,
  onResetCustom
}: ReturnVolInputsProps) {
  if (tickers.length === 0) return null

  return (
    <div className="returnVolInputs">
      <div className="returnVolHeaderRow">
        <h3 className="subTitle">Erwartete Rendite &amp; Volatilität</h3>
        <button className="smallButton" type="button" onClick={onResetCustom}>
          Zurücksetzen auf Standardwerte
        </button>
      </div>
      <div className="tableHint" style={{ marginBottom: 8 }}>
        Werte in % pro Jahr. Standardwerte aus historischer Serie (Dataset). Du kannst sie hier anpassen.
      </div>
      <div className="returnVolTable">
        <div className="returnVolHeader">
          <span>Asset</span>
          <span>Rendite (% p.a.)</span>
          <span>Volatilität (% p.a.)</span>
        </div>
        {tickers.map((t) => {
          const info = stockReturns[t]
          const baseR = Number.isFinite(baseExpectedReturns[t]) ? baseExpectedReturns[t] * 100 : NaN
          const baseV = Number.isFinite(baseVolatilities[t]) ? baseVolatilities[t] * 100 : NaN
          const customR = Number.isFinite(customExpectedReturns[t]) ? customExpectedReturns[t] * 100 : NaN
          const customV = Number.isFinite(customVolatilities[t]) ? customVolatilities[t] * 100 : NaN
          const displayR = Number.isFinite(customR) ? customR : baseR
          const displayV = Number.isFinite(customV) ? customV : baseV

          return (
            <div key={t} className="returnVolRow">
              <span>{info.name}</span>
              <input
                type="number"
                className="textInput"
                value={Number.isFinite(displayR) ? displayR.toFixed(2) : ''}
                onChange={(e) => {
                  const value = parseFloat(e.target.value)
                  onCustomExpectedReturnChange(t, Number.isFinite(value) ? value / 100 : null)
                }}
                placeholder={Number.isFinite(baseR) ? baseR.toFixed(2) : ''}
              />
              <input
                type="number"
                className="textInput"
                value={Number.isFinite(displayV) ? displayV.toFixed(2) : ''}
                onChange={(e) => {
                  const value = parseFloat(e.target.value)
                  onCustomVolatilityChange(t, Number.isFinite(value) ? value / 100 : null)
                }}
                placeholder={Number.isFinite(baseV) ? baseV.toFixed(2) : ''}
              />
            </div>
          )
        })}
      </div>
      <div className="tableHint" style={{ marginTop: 8 }}>
        Aktuelle Werte: Rendite = manuell angegebener Wert (falls vorhanden) oder historischer Datasetwert.
      </div>
    </div>
  )
}

