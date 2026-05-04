import React from 'react'

export default function InvestmentSettings({
  startCapital,
  setStartCapital,
  years,
  setYears,
  lookbackYears,
  setLookbackYears
}: {
  startCapital: number
  setStartCapital: (v: number) => void
  years: number
  setYears: (v: number) => void
  lookbackYears: number
  setLookbackYears: (v: number) => void
}) {
  return (
    <div className="grid2">
      <div>
        <div className="label" style={{ marginBottom: 8 }}>
          Startkapital
        </div>
        <input
          className="textInput"
          type="number"
          min={0}
          step={50}
          value={startCapital}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            setStartCapital(Number.isFinite(v) ? v : 0)
          }}
        />
        <div className="tableHint" style={{ marginTop: 8 }}>
          Beispiel: 1.000 €
        </div>
      </div>

      <div>
        <div className="label" style={{ marginBottom: 8 }}>
          Simulationslaufzeit
        </div>
        <select
          className="selectInput"
          value={years}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10)
            setYears(Number.isFinite(v) ? v : 10)
          }}
        >
          <option value={5}>5 Jahre</option>
          <option value={10}>10 Jahre</option>
          <option value={15}>15 Jahre</option>
          <option value={20}>20 Jahre</option>
          <option value={25}>25 Jahre</option>
        </select>
        <div className="tableHint" style={{ marginTop: 8 }}>
          Monate/Jahre in die Zukunft (Simulation).
        </div>
      </div>

      <div>
        <div className="label" style={{ marginBottom: 8 }}>
          Historischer Datenzeitraum
        </div>
        <select
          className="selectInput"
          value={lookbackYears}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10)
            setLookbackYears(Number.isFinite(v) ? v : 10)
          }}
        >
          <option value={5}>Letzte 5 Jahre</option>
          <option value={10}>Letzte 10 Jahre</option>
          <option value={15}>Letzte 15 Jahre</option>
          <option value={20}>Letzte 20 Jahre</option>
          <option value={25}>Letzte 25 Jahre</option>
        </select>
        <div className="tableHint" style={{ marginTop: 8 }}>
          Basis für Volatilität und Rendite-Berechnung.
        </div>
      </div>
    </div>
  )
}

