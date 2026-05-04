import React from 'react'

export type MonteCarloControlsProps = {
  simulations: number
  setSimulations: (v: number) => void
  frequency: 'yearly' | 'monthly'
  setFrequency: (v: 'yearly' | 'monthly') => void
  rebalancing: boolean
  setRebalancing: (v: boolean) => void
  monthlyContribution: number
  setMonthlyContribution: (v: number) => void
  inflationRate: number
  setInflationRate: (v: number) => void
}

export default function MonteCarloControls(props: MonteCarloControlsProps) {
  const {
    simulations,
    setSimulations,
    frequency,
    setFrequency,
    rebalancing,
    setRebalancing,
    monthlyContribution,
    setMonthlyContribution,
    inflationRate,
    setInflationRate
  } = props

  return (
    <div className="monteCarloControls">
      <h3 className="subTitle">Monte-Carlo-Simulation</h3>
      <div className="grid2">
        <div>
          <div className="label" style={{ marginBottom: 8 }}>
            Anzahl Simulationen
          </div>
          <input
            className="textInput"
            type="number"
            min={100}
            max={20000}
            step={100}
            value={simulations}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10)
              const safe = Number.isFinite(v) ? Math.min(20000, Math.max(100, v)) : 1000
              setSimulations(safe)
            }}
          />
          <div className="tableHint" style={{ marginTop: 8 }}>
            Höhere Werte = glattere Verteilung, aber langsamer.
          </div>
        </div>

        <div>
          <div className="label" style={{ marginBottom: 8 }}>
            Zeitschritt
          </div>
          <select
            className="selectInput"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as 'yearly' | 'monthly')}
          >
            <option value="yearly">Jährlich</option>
            <option value="monthly">Monatlich</option>
          </select>
          <div className="tableHint" style={{ marginTop: 8 }}>
            Monatlich bildet Schwankungen feiner ab.
          </div>
        </div>
      </div>

      <div className="grid2" style={{ marginTop: 16 }}>
        <div>
          <div className="label" style={{ marginBottom: 8 }}>
            Sparplan (monatlich)
          </div>
          <input
            className="textInput"
            type="number"
            min={0}
            step={50}
            value={monthlyContribution}
            onChange={(e) => {
              const v = parseFloat(e.target.value)
              setMonthlyContribution(Number.isFinite(v) ? Math.max(0, v) : 0)
            }}
          />
          <div className="tableHint" style={{ marginTop: 8 }}>
            Zusätzliche Einzahlungen je Monat.
          </div>
        </div>

        <div>
          <div className="label" style={{ marginBottom: 8 }}>
            Inflation (% p.a.)
          </div>
          <input
            className="textInput"
            type="number"
            min={0}
            step={0.5}
            value={inflationRate}
            onChange={(e) => {
              const v = parseFloat(e.target.value)
              setInflationRate(Number.isFinite(v) ? Math.max(0, v) : 0)
            }}
          />
          <div className="tableHint" style={{ marginTop: 8 }}>
            Renditen werden real (inflationsbereinigt) dargestellt.
          </div>
        </div>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
        <input
          type="checkbox"
          checked={rebalancing}
          onChange={(e) => setRebalancing(e.target.checked)}
        />
        <span className="label">Jährliches Rebalancing auf Zielgewichte</span>
      </label>
    </div>
  )
}

