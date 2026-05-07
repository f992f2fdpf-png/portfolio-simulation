import React, { useEffect, useMemo, useState } from 'react'
import { STOCKS, type StockTicker } from './data/stocks'
import DarkModeToggle from './components/DarkModeToggle'
import PortfolioAnalyticsTab from './components/PortfolioAnalyticsTab'
import PortfolioStressTestTab from './components/PortfolioStressTestTab'
import PortfolioExecutionTab from './components/PortfolioExecutionTab'
import StockPicker from './components/StockPicker'
import WeightSliders from './components/WeightSliders'
import InvestmentSettings from './components/InvestmentSettings'
import PortfolioChart from './components/PortfolioChart'
import SavedPortfolioCompareChart from './components/SavedPortfolioCompareChart'
import ResultsSummary from './components/ResultsSummary'
import { computePortfolioSeries, computePortfolioTotals } from './utils/portfolio'
import { formatCurrency, formatPercent } from './utils/format'
import { useLocalStorageState } from './hooks/useLocalStorageState'
import MonteCarloControls from './components/MonteCarloControls'
import ReturnVolInputs from './components/ReturnVolInputs'
import { runMonteCarloSimulation } from './utils/monteCarlo'
import { MonteCarloPathsChart, MonteCarloHistogram, MonteCarloSummaryStats } from './components/MonteCarloCharts'
import { loadDatasetById, loadManifest, annualizeFromPeriodic, fetchLiveHistoricalData } from './utils/historicalData'
import { computeBacktestSeries, computePerAssetReturnSeries } from './utils/backtest'

type SavedPortfolio = {
  id: string
  name: string
  createdAt: number
  selectedTickers: StockTicker[]
  weights: Record<StockTicker, number | null>
  startCapital: number
  years: number
  endCapital?: number
  totalGain?: number
  percentReturn?: number
}

const STORAGE_KEYS = {
  theme: 'portfolio-sim:theme',
  saved: 'portfolio-sim:saved-portfolios'
} as const

export default function App() {
  const [dynamicStocks, setDynamicStocks] = useLocalStorageState<Record<StockTicker, any>>('portfolio-sim:custom-stocks', STOCKS)
  const defaultTickers: StockTicker[] = []
  const [selectedTickers, setSelectedTickers] = useState<StockTicker[]>(defaultTickers)
  const [weights, setWeights] = useState<Record<StockTicker, number | null>>(() => {
    return {} as any
  })

  const [startCapital, setStartCapital] = useState<number>(1000)
  const [years, setYears] = useState<number>(10)
  const [lookbackYears, setLookbackYears] = useState<number>(10)

  const [simulations, setSimulations] = useState<number>(2000)
  const [frequency, setFrequency] = useState<'yearly' | 'monthly'>('yearly')
  const [rebalancing, setRebalancing] = useState<boolean>(true)
  const [monthlyContribution, setMonthlyContribution] = useState<number>(0)
  const [inflationRate, setInflationRate] = useState<number>(2)

  const [expectedReturns, setExpectedReturns] = useState<Record<StockTicker, number>>({} as any)
  const [volatilities, setVolatilities] = useState<Record<StockTicker, number>>({} as any)

  const [customExpectedReturns, setCustomExpectedReturns] = useState<Record<StockTicker, number>>({} as any)
  const [customVolatilities, setCustomVolatilities] = useState<Record<StockTicker, number>>({} as any)

  const effectiveExpectedReturns = useMemo(() => {
    const effective: Record<StockTicker, number> = {} as any
    for (const ticker of selectedTickers) {
      const base = expectedReturns[ticker]
      const custom = customExpectedReturns[ticker]
      effective[ticker] = Number.isFinite(custom)
        ? custom
        : Number.isFinite(base)
          ? base
          : 0
    }
    return effective
  }, [selectedTickers, expectedReturns, customExpectedReturns])

  const effectiveVolatilities = useMemo(() => {
    const effective: Record<StockTicker, number> = {} as any
    for (const ticker of selectedTickers) {
      const base = volatilities[ticker]
      const custom = customVolatilities[ticker]
      effective[ticker] = Number.isFinite(custom)
        ? custom
        : Number.isFinite(base)
          ? base
          : 0
    }
    return effective
  }, [selectedTickers, volatilities, customVolatilities])

  const [datasetId, setDatasetId] = useLocalStorageState<string>('portfolio-sim:dataset-id', 'sample-monthly')
  const [datasetName, setDatasetName] = useState<string>('—')
  const [datasetNote, setDatasetNote] = useState<string | null>(null)
  const [datasetFrequency, setDatasetFrequency] = useState<'daily' | 'monthly'>('monthly')
  const [datasetAssets, setDatasetAssets] = useState<string[]>([])
  const [datasetSeries, setDatasetSeries] = useState<any>(null)
  const [datasetError, setDatasetError] = useState<string | null>(null)
  const [datasetsList, setDatasetsList] = useState<{ id: string; name: string }[]>([])

  const [theme, setTheme] = useLocalStorageState<'dark' | 'light'>(
    STORAGE_KEYS.theme,
    'light'
  )

  const [savedPortfolios, setSavedPortfolios] = useLocalStorageState<SavedPortfolio[]>(
    STORAGE_KEYS.saved,
    []
  )
  const [portfolioName, setPortfolioName] = useState('Mein Portfolio')
  const [status, setStatus] = useState<string | null>(null)
  const [dataStatus, setDataStatus] = useState<string | null>(null)
  const [failedTickers, setFailedTickers] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<'simulation' | 'quant' | 'analytics' | 'stresstest' | 'execution'>('simulation')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    let cancelled = false
      ; (async () => {
        try {
          const m = await loadManifest()
          if (cancelled) return
          setDatasetsList(m.datasets.map((d) => ({ id: d.id, name: d.name })))
        } catch (e: any) {
          if (cancelled) return
          setDatasetsList([])
        }
      })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
      ; (async () => {
        setDatasetError(null)
        setDataStatus('Lade lokalen Datensatz…')
        try {
          const ds = await loadDatasetById(datasetId)
          if (cancelled) return
          setDatasetName(ds.name)
          setDatasetNote(ds.note ?? null)
          setDatasetFrequency(ds.frequency)
          setDatasetAssets(ds.assets)
          setDatasetSeries(ds.series)
          setDataStatus(`Datensatz geladen: ${ds.name}`)
          setTimeout(() => setDataStatus(null), 2500)
        } catch (e: any) {
          if (cancelled) return
          setDatasetError(String(e?.message ?? e))
          setDatasetSeries(null)
          setDataStatus(null)
        }
      })()
    return () => {
      cancelled = true
    }
  }, [datasetId])

  // Effect for dynamic fetching of live data
  useEffect(() => {
    if (selectedTickers.length === 0) return

    let active = true
    const toFetch = selectedTickers.filter(t => !datasetSeries || !datasetSeries[t])

    if (toFetch.length > 0) {
      setDataStatus('Lade Live-Daten für ' + toFetch.join(', ') + '...')
      const fetchMissing = async () => {
        const newSeries = datasetSeries ? { ...datasetSeries } : {}
        let updated = false
        const newAssets = new Set(datasetAssets)
        for (const t of toFetch) {
          try {
            const series = await fetchLiveHistoricalData(t)
            newSeries[t] = series
            newAssets.add(t)
            updated = true
          } catch (e) {
            console.error('Failed fetching', t, e)
            setFailedTickers(prev => {
              const next = new Set(prev)
              next.add(t)
              return next
            })
          }
        }
        if (active && updated) {
          setDatasetSeries(newSeries)
          setDatasetAssets(Array.from(newAssets))
          setDataStatus('Live-Daten geladen!')
          setTimeout(() => setDataStatus(null), 2500)
        }
      }
      fetchMissing()
    }

    return () => { active = false }
  }, [selectedTickers, datasetSeries, datasetAssets])

  const selectedStocks = useMemo(() => {
    return selectedTickers
      .map((ticker) => dynamicStocks[ticker] || { ticker, name: ticker, color: '#2563eb' })
      .filter(Boolean)
  }, [selectedTickers, dynamicStocks])

  // Persist only "selectedTickers + weights", but keep weights consistent with selection.
  const setSelection = (nextTickers: StockTicker[]) => {
    const unique = Array.from(new Set(nextTickers))
    if (unique.length === 0) {
      setSelectedTickers([])
      setWeights({} as any)
      return
    }
    const nextWeights: Record<StockTicker, number> = {} as any
    for (const t of unique) nextWeights[t] = 0
    setSelectedTickers(unique)
    setWeights(nextWeights)
  }

  const normalizeSelectedWeights = (tickers: StockTicker[], raw: Record<StockTicker, number>) => {
    const sum = tickers.reduce((acc, t) => acc + (raw[t] ?? 0), 0)
    if (sum <= 0) {
      return tickers.reduce((acc, t) => {
        acc[t] = 0
        return acc
      }, {} as Record<StockTicker, number>)
    }
    const factor = 100 / sum
    const next = tickers.reduce((acc, t) => {
      acc[t] = (raw[t] ?? 0) * factor
      return acc
    }, {} as Record<StockTicker, number>)
    // small drift fix
    const fixedSum = tickers.reduce((acc, t) => acc + (next[t] ?? 0), 0)
    const diff = 100 - fixedSum
    const last = tickers[tickers.length - 1]
    if (last) next[last] = (next[last] ?? 0) + diff
    return next
  }

  const onWeightChange = (ticker: StockTicker, nextWeightPercent: number | null) => {
    if (!selectedTickers.includes(ticker)) return
    if (nextWeightPercent === null || !Number.isFinite(nextWeightPercent)) {
      setWeights((prev) => ({ ...prev, [ticker]: null }))
      return
    }

    const sanitized = Math.min(100, Math.max(0, nextWeightPercent))

    setWeights((prev) => {
      const otherTotal = selectedTickers.reduce((acc, t) => {
        if (t === ticker) return acc
        const w = prev[t]
        return acc + (Number.isFinite(w as number) ? (w as number) : 0)
      }, 0)

      const maxAllowed = Math.max(0, 100 - otherTotal)
      const finalWeight = Math.min(sanitized, maxAllowed)
      return { ...prev, [ticker]: finalWeight }
    })
  }

  // Wir normalisieren nicht automatisch, damit Eingaben wie 20 nicht auf 100 skaliert werden.
  const onWeightsCommit = () => {
    // noop: Optionaler späterer Commit könnte hier formale Validierung ausführen.
  }

  const onCustomExpectedReturnChange = (ticker: StockTicker, nextValue: number | null) => {
    setCustomExpectedReturns((prev) => {
      const next = { ...prev }
      if (nextValue === null || !Number.isFinite(nextValue)) {
        delete next[ticker]
      } else {
        next[ticker] = nextValue
      }
      return next
    })
  }

  const onCustomVolatilityChange = (ticker: StockTicker, nextValue: number | null) => {
    setCustomVolatilities((prev) => {
      const next = { ...prev }
      if (nextValue === null || !Number.isFinite(nextValue)) {
        delete next[ticker]
      } else {
        next[ticker] = nextValue
      }
      return next
    })
  }

  const resetCustomParams = () => {
    setCustomExpectedReturns({} as any)
    setCustomVolatilities({} as any)
  }

  const numericWeights = useMemo(() => {
    const normalized: Record<StockTicker, number> = {} as any
    for (const ticker of selectedTickers) {
      const value = weights[ticker]
      normalized[ticker] = Number.isFinite(value as number) ? (value as number) : 0
    }
    return normalized
  }, [selectedTickers, weights])

  const weightSum = useMemo(() => {
    return selectedTickers.reduce((acc, t) => acc + (numericWeights[t] ?? 0), 0)
  }, [selectedTickers, numericWeights])

  const portfolioSeries = useMemo(() => {
    const tickers = selectedTickers
    const safeStart = Number.isFinite(startCapital) ? Math.max(0, startCapital) : 0
    const safeYears = years
    return computePortfolioSeries({
      startCapital: safeStart,
      years: safeYears,
      weights: numericWeights,
      tickers,
      expectedReturns: effectiveExpectedReturns
    })
  }, [startCapital, years, selectedTickers, numericWeights, effectiveExpectedReturns])

  const totals = useMemo(() => {
    return computePortfolioTotals({
      startCapital: Number.isFinite(startCapital) ? startCapital : 0,
      years,
      weights: numericWeights,
      tickers: selectedTickers,
      expectedReturns: effectiveExpectedReturns
    })
  }, [startCapital, years, selectedTickers, numericWeights, effectiveExpectedReturns])

  const savedCompareSeries = useMemo(() => {
    if (!savedPortfolios || savedPortfolios.length === 0) return []

    const colorPalette = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']

    return savedPortfolios.map((p, idx) => {
      const weightsSafe: Record<StockTicker, number> = {} as any
      for (const t of p.selectedTickers) {
        const w = p.weights[t]
        weightsSafe[t] = Number.isFinite(w as number) ? (w as number) : 0
      }

      const series = computePortfolioSeries({
        startCapital: Number.isFinite(p.startCapital) ? p.startCapital : 0,
        years: p.years,
        weights: weightsSafe,
        tickers: p.selectedTickers,
        expectedReturns: effectiveExpectedReturns
      })

      return {
        id: p.id,
        name: p.name,
        color: colorPalette[idx % colorPalette.length],
        values: series.map((point) => ({ year: point.year, value: point.value }))
      }
    })
  }, [savedPortfolios, effectiveExpectedReturns])

  const backtestSeries = useMemo(() => {
    if (!datasetSeries) return null
    return computeBacktestSeries({
      dataset: {
        id: datasetId,
        name: datasetName,
        frequency: datasetFrequency,
        assets: datasetAssets,
        series: datasetSeries
      },
      tickers: selectedTickers,
      weights: numericWeights,
      startCapital: Number.isFinite(startCapital) ? Math.max(0, startCapital) : 0,
      years: lookbackYears,
      rebalancing
    })
  }, [datasetSeries, datasetId, datasetName, datasetFrequency, datasetAssets, selectedTickers, weights, startCapital, lookbackYears, rebalancing])

  const histStats = useMemo(() => {
    if (!datasetSeries) return null
    const ds = {
      id: datasetId,
      name: datasetName,
      frequency: datasetFrequency,
      assets: datasetAssets,
      series: datasetSeries
    }
    const perAsset = computePerAssetReturnSeries({ dataset: ds as any, tickers: selectedTickers, years: lookbackYears })
    const periodsPerYear = datasetFrequency === 'monthly' ? 12 : 252
    const nextR: Record<StockTicker, number> = {} as any
    const nextV: Record<StockTicker, number> = {} as any
    for (const t of selectedTickers) {
      const r = perAsset[t] ?? []
      const { annualReturn, annualVol } = annualizeFromPeriodic(r, periodsPerYear)
      nextR[t] = annualReturn
      nextV[t] = annualVol
    }
    return { expected: nextR, vols: nextV }
  }, [datasetSeries, datasetId, datasetName, datasetFrequency, datasetAssets, selectedTickers, lookbackYears])

  useEffect(() => {
    if (!histStats) return
    setExpectedReturns(histStats.expected)
    setVolatilities(histStats.vols)
  }, [histStats])

  const useHistoricalBootstrap =
    Object.keys(customExpectedReturns).length === 0 &&
    Object.keys(customVolatilities).length === 0

  const monteCarlo = useMemo(() => {
    const safeStart = Number.isFinite(startCapital) ? Math.max(0, startCapital) : 0
    if (selectedTickers.length === 0 || safeStart <= 0 || years <= 0 || weightSum <= 0) {
      return null
    }
    return runMonteCarloSimulation({
      startCapital: safeStart,
      years,
      simulations,
      tickers: selectedTickers,
      weights: numericWeights,
      expectedReturns: effectiveExpectedReturns,
      volatilities: effectiveVolatilities,
      dataset: datasetSeries
        ? ({
          id: datasetId,
          name: datasetName,
          frequency: datasetFrequency,
          assets: datasetAssets,
          series: datasetSeries
        } as any)
        : undefined,
      useHistoricalBootstrap,
      frequency,
      rebalancing,
      monthlyContribution,
      inflationRate: inflationRate / 100
    })
  }, [
    startCapital,
    years,
    simulations,
    selectedTickers,
    weights,
    effectiveExpectedReturns,
    effectiveVolatilities,
    datasetSeries,
    datasetId,
    datasetName,
    datasetFrequency,
    datasetAssets,
    frequency,
    rebalancing,
    monthlyContribution,
    inflationRate
  ])

  const monteCarloMeanSeries = useMemo(() => {
    if (!monteCarlo || monteCarlo.paths.length === 0) return null
    const paths = monteCarlo.paths
    const len = Math.max(...paths.map((p) => p.length))
    if (!Number.isFinite(len) || len <= 0) return null

    const series: { year: number; value: number }[] = []
    for (let i = 0; i < len; i++) {
      let sum = 0
      let count = 0
      let year = 0
      for (const p of paths) {
        const pt = p[Math.min(i, p.length - 1)]
        if (!pt) continue
        const v = pt.value
        if (!Number.isFinite(v)) continue
        sum += v
        count++
        year = pt.year
      }
      if (count > 0) series.push({ year, value: sum / count })
    }
    return series
  }, [monteCarlo])

  const monteCarloMedianSeries = useMemo(() => {
    if (!monteCarlo || monteCarlo.paths.length === 0) return null
    const paths = monteCarlo.paths
    const len = Math.max(...paths.map((p) => p.length))
    if (!Number.isFinite(len) || len <= 0) return null

    const series: { year: number; value: number }[] = []
    for (let i = 0; i < len; i++) {
      const values: number[] = []
      let year = 0
      for (const p of paths) {
        const pt = p[Math.min(i, p.length - 1)]
        if (!pt) continue
        const v = pt.value
        if (!Number.isFinite(v)) continue
        values.push(v)
        year = pt.year
      }
      if (values.length === 0) continue
      values.sort((a, b) => a - b)
      const n = values.length
      const median = n % 2 === 1 ? values[(n - 1) / 2] : (values[n / 2 - 1] + values[n / 2]) / 2
      series.push({ year, value: median })
    }
    return series
  }, [monteCarlo])

  const monteCarloAverageTotals = useMemo(() => {
    const safeStart = Number.isFinite(startCapital) ? Math.max(0, startCapital) : 0
    if (!monteCarlo?.summary || monteCarlo.summary.simulations === 0 || safeStart <= 0) return null
    const endCapital = monteCarlo.summary.meanEnd
    const totalGain = endCapital - safeStart
    const percentReturn = safeStart > 0 ? (endCapital / safeStart - 1) * 100 : 0
    return { endCapital, totalGain, percentReturn }
  }, [monteCarlo, startCapital])

  const handleSave = () => {
    const name = portfolioName.trim()
    if (!name) {
      setStatus('Bitte einen Namen eingeben.')
      return
    }
    if (selectedTickers.length === 0) {
      setStatus('Bitte zuerst Aktien auswählen.')
      return
    }
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const snapshotTotals = monteCarloAverageTotals ?? totals

    const entry: SavedPortfolio = {
      id,
      name,
      createdAt: Date.now(),
      selectedTickers,
      weights: numericWeights,
      startCapital,
      years,
      endCapital: snapshotTotals?.endCapital,
      totalGain: snapshotTotals?.totalGain,
      percentReturn: snapshotTotals?.percentReturn
    }
    setSavedPortfolios((prev) => [entry, ...prev].slice(0, 20))
    setStatus('Portfolio gespeichert.')
    setTimeout(() => setStatus(null), 2000)
  }

  const handleLoad = (entry: SavedPortfolio) => {
    const tickers = entry.selectedTickers
    if (!tickers || tickers.length === 0) return
    setSelection(tickers)
    const normalized = (() => {
      const raw = entry.weights as Record<StockTicker, number>
      const sum = tickers.reduce((acc, t) => acc + (raw[t] ?? 0), 0)
      if (sum <= 0) {
        const each = 100 / tickers.length
        return tickers.reduce((acc, t) => {
          acc[t] = each
          return acc
        }, {} as Record<StockTicker, number>)
      }
      const factor = 100 / sum
      return tickers.reduce((acc, t) => {
        acc[t] = (raw[t] ?? 0) * factor
        return acc
      }, {} as Record<StockTicker, number>)
    })()

    setWeights(normalized)
    setStartCapital(Number.isFinite(entry.startCapital) ? entry.startCapital : 0)
    setYears(Number.isFinite(entry.years) ? entry.years : 10)
    setStatus(`Geladen: ${entry.name}`)
    setTimeout(() => setStatus(null), 2000)
  }

  const handleDelete = (id: string) => {
    setSavedPortfolios((prev) => prev.filter((p) => p.id !== id))
    setStatus('Portfolio gelöscht.')
    setTimeout(() => setStatus(null), 2000)
  }

  const disclaimer =
    'Hinweis: Historische Daten ersetzen keine Finanzberatung. Ergebnisse sind Modellannahmen und keine Garantie.'

  return (
    <div className="app">
      <header className="appHeader">
        <div className="appHeaderLeft">
          <h1 className="appTitle">Portfolio-Simulator</h1>
          <p className="appSubtitle" style={{ marginBottom: '12px' }}>Simulation mit Zinseszins auf Basis durchschnittlicher 10-Jahres-Renditen.</p>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button 
              className={activeTab === 'simulation' ? 'primaryButton' : 'smallButton'} 
              onClick={() => setActiveTab('simulation')}
            >
              🏗 Portfolio Simulation
            </button>
            <button 
              className={activeTab === 'analytics' ? 'primaryButton' : 'smallButton'} 
              onClick={() => setActiveTab('analytics')}
            >
              📡 Markt- & Risikoanalyse
            </button>
            <button 
              className={activeTab === 'stresstest' ? 'primaryButton' : 'smallButton'} 
              onClick={() => setActiveTab('stresstest')}
            >
              🔥 Stresstests & KPIs
            </button>
            <button 
              className={activeTab === 'execution' ? 'primaryButton' : 'smallButton'} 
              onClick={() => setActiveTab('execution')}
            >
              🚀 Ausführung & Out-of-Sample
            </button>
          </div>
        </div>
        <div className="appHeaderRight">
          <DarkModeToggle theme={theme} setTheme={setTheme} />
        </div>
      </header>

      {activeTab === 'simulation' && (
      <main className="layout">
        <section className="card controlsCard">
          <h2 className="cardTitle">Einstellungen</h2>

          <StockPicker
            stocks={selectedStocks}
            allStocks={dynamicStocks}
            selectedTickers={selectedTickers}
            onChangeSelection={(next) => setSelection(next)}
            onAddStock={(s) => setDynamicStocks((prev: Record<StockTicker, any>) => ({ ...prev, [s.ticker]: s }))}
          />

          <div className="sectionSpacer" />

          <WeightSliders
            tickers={selectedTickers}
            weights={weights}
            stockReturns={dynamicStocks}
            onWeightChange={onWeightChange}
            onWeightsCommit={onWeightsCommit}
          />

          <div className="sectionSpacer" />

          <InvestmentSettings
            startCapital={startCapital}
            setStartCapital={setStartCapital}
            years={years}
            setYears={setYears}
            lookbackYears={lookbackYears}
            setLookbackYears={setLookbackYears}
          />

          <div className="sectionSpacer" />

          {dataStatus && (
            <div className="status" style={{ marginBottom: 16 }}>
              {dataStatus}
            </div>
          )}

          <MonteCarloControls
            simulations={simulations}
            setSimulations={setSimulations}
            frequency={frequency}
            setFrequency={setFrequency}
            rebalancing={rebalancing}
            setRebalancing={setRebalancing}
            monthlyContribution={monthlyContribution}
            setMonthlyContribution={setMonthlyContribution}
            inflationRate={inflationRate}
            setInflationRate={setInflationRate}
          />

          <div className="sectionSpacer" />

          <ReturnVolInputs
            tickers={selectedTickers}
            stockReturns={dynamicStocks}
            baseExpectedReturns={expectedReturns}
            baseVolatilities={volatilities}
            customExpectedReturns={customExpectedReturns}
            customVolatilities={customVolatilities}
            onCustomExpectedReturnChange={onCustomExpectedReturnChange}
            onCustomVolatilityChange={onCustomVolatilityChange}
            onResetCustom={resetCustomParams}
            failedTickers={failedTickers}
          />

          <div className="sectionSpacer" />

          <div className="saveBlock">
            <div className="saveRow">
              <label className="label" htmlFor="portfolioName">
                Speichernamen
              </label>
              <input
                id="portfolioName"
                className="textInput"
                value={portfolioName}
                onChange={(e) => setPortfolioName(e.target.value)}
                placeholder="z. B. Langfrist-Plan"
              />
            </div>
            <button className="primaryButton" onClick={handleSave}>
              Portfolio speichern
            </button>
          </div>

          {savedPortfolios.length > 0 && (
            <div className="savedList">
              <h3 className="subTitle">Gespeicherte Portfolios</h3>
              <div className="savedItems">
                {savedPortfolios.map((p) => (
                  <div key={p.id} className="savedItem">
                    <div className="savedItemMain">
                      <div className="savedItemName">{p.name}</div>
                      <div className="savedItemMeta">
                        {p.years} Jahre · {formatCurrency(p.startCapital)} ·{' '}
                        {(() => {
                          const percent = Number.isFinite(p.percentReturn as number)
                            ? (p.percentReturn as number)
                            : p.startCapital > 0 && Number.isFinite(p.endCapital as number)
                              ? (((p.endCapital as number) / p.startCapital - 1) * 100)
                              : 0

                          return (
                            <span style={{ color: percent >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                              {formatPercent(percent, 2)}
                            </span>
                          )
                        })()}
                      </div>
                    </div>
                    <div className="savedItemActions">
                      <button className="smallButton" onClick={() => handleLoad(p)}>
                        Laden
                      </button>
                      <button className="smallButton danger" onClick={() => handleDelete(p.id)}>
                        Löschen
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {status && <div className="status">{status}</div>}

          <p className="disclaimer">{disclaimer}</p>
        </section>

        <section className="card resultsCard">
          <h2 className="cardTitle">Ergebnis</h2>

          {selectedTickers.length === 0 ? (
            <div className="emptyState">
              Wähle mindestens eine Aktie aus, um eine Simulation zu sehen.
            </div>
          ) : (
            <>
              {monteCarloAverageTotals ? (
                <ResultsSummary totals={monteCarloAverageTotals} />
              ) : (
                <div className="emptyState">
                  Bitte einen lokalen Datensatz laden (offline) – dann werden Monte-Carlo &amp; Kennzahlen berechnet.
                </div>
              )}

              <div className="sectionSpacerLarge" />

              <h3 className="subTitle">Monte-Carlo Durchschnittspfad</h3>
              <div className="tableHint" style={{ marginBottom: 10 }}>
                Durchschnittlicher Verlauf über alle Simulationen (pro Zeitpunkt als Mittelwert).
              </div>
              <div className="chartWrap">
                <PortfolioChart
                  series={
                    monteCarloMeanSeries ??
                    monteCarloMedianSeries ??
                    [{ year: 0, value: Number.isFinite(startCapital) ? startCapital : 0 }]
                  }
                  tickers={selectedTickers}
                  stockReturns={dynamicStocks}
                />
              </div>

              <div className="sectionSpacerLarge" />

              <h3 className="subTitle">Monte-Carlo-Szenarien</h3>
              <MonteCarloSummaryStats summary={monteCarlo ? monteCarlo.summary : null} />

              <div className="chartWrap" style={{ marginTop: 16 }}>
                <MonteCarloPathsChart paths={monteCarlo ? monteCarlo.paths : []} />
              </div>

              <div className="chartWrap" style={{ marginTop: 24 }}>
                <MonteCarloHistogram histogram={monteCarlo ? monteCarlo.histogram : []} />
              </div>

              {savedCompareSeries.length > 0 && (
                <>
                  <div className="sectionSpacerLarge" />
                  <h3 className="subTitle">Gespeicherte Portfolios: Vergleich (Pfad + Durchschnitt)</h3>
                  <SavedPortfolioCompareChart series={savedCompareSeries} />
                </>
              )}
            </>
          )}
        </section>
      </main>
      )}

      {activeTab === 'analytics' && (
        <main style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
          <PortfolioAnalyticsTab 
            selectedTickers={selectedTickers} 
            weights={weights} 
            datasetSeries={datasetSeries} 
            theme={theme}
          />
        </main>
      )}

      {activeTab === 'stresstest' && (
        <main style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
          <PortfolioStressTestTab
            selectedTickers={selectedTickers}
            weights={weights}
            datasetSeries={datasetSeries}
            theme={theme}
          />
        </main>
      )}

      {activeTab === 'execution' && (
        <main style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
          <PortfolioExecutionTab
            selectedTickers={selectedTickers}
            weights={weights}
            datasetSeries={datasetSeries}
            theme={theme}
          />
        </main>
      )}
    </div>
  )
}

