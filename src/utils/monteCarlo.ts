import type { StockTicker } from '../data/stocks'
import type { LoadedDataset } from './historicalData'
import { computeReturnsFromPrices, pickTrailingWindow } from './historicalData'

export type Frequency = 'yearly' | 'monthly'

export type MonteCarloPathPoint = {
  step: number
  year: number
  value: number
}

export type MonteCarloPath = MonteCarloPathPoint[]

export type MonteCarloSummary = {
  simulations: number
  horizonYears: number
  endValues: number[]
  meanEnd: number
  medianEnd: number
  bestEnd: number
  worstEnd: number
  p5: number
  p95: number
}

export type MonteCarloResult = {
  paths: MonteCarloPath[]
  summary: MonteCarloSummary
  histogram: { bucket: number; count: number }[]
}

function randomNormal(mean: number, stdDev: number): number {
  if (stdDev <= 0) return mean
  let u = 0
  let v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
  return mean + stdDev * z
}

function getStepReturn(
  ticker: StockTicker,
  expectedReturns: Record<StockTicker, number> | undefined,
  volatilities: Record<StockTicker, number> | undefined,
  frequency: Frequency
): number {
  const annualMean = expectedReturns?.[ticker]
  const annualStd = volatilities?.[ticker]
  if (!Number.isFinite(annualMean) || !Number.isFinite(annualStd)) return 0
  const stepsPerYear = frequency === 'monthly' ? 12 : 1
  const safeMean = Number.isFinite(annualMean as number) ? (annualMean as number) : 0
  const safeStd = Number.isFinite(annualStd as number) ? (annualStd as number) : 0
  const stepMean = Math.pow(1 + safeMean, 1 / stepsPerYear) - 1
  const stepStd = safeStd / Math.sqrt(stepsPerYear)
  const rand = randomNormal(stepMean, stepStd)
  return rand
}

function applyInflation(realReturn: number, inflationRate: number, frequency: Frequency): number {
  if (inflationRate <= 0) return realReturn
  const stepsPerYear = frequency === 'monthly' ? 12 : 1
  const stepInflation = Math.pow(1 + inflationRate, 1 / stepsPerYear) - 1
  return (1 + realReturn) / (1 + stepInflation) - 1
}

function bootstrapCompoundedReturn(returns: number[], periods: number): number {
  if (!returns || returns.length === 0 || periods <= 0) return 0
  let acc = 1
  for (let i = 0; i < periods; i++) {
    const idx = Math.floor(Math.random() * returns.length)
    const r = returns[idx] ?? 0
    acc *= 1 + r
  }
  return acc - 1
}

function bootstrapStepReturn(args: {
  returns: number[]
  dataFrequency: 'daily' | 'monthly'
  simFrequency: Frequency
}): number {
  const { returns, dataFrequency, simFrequency } = args
  if (!returns || returns.length === 0) return 0

  // We assume the dataset returns are in the dataset's native frequency.
  // For a "yearly" simulation step we compound multiple dataset-returns.
  if (simFrequency === 'monthly') {
    if (dataFrequency === 'monthly') return bootstrapCompoundedReturn(returns, 1)
    // daily -> monthly: approximate 21 trading days
    return bootstrapCompoundedReturn(returns, 21)
  }

  // yearly step
  if (dataFrequency === 'monthly') return bootstrapCompoundedReturn(returns, 12)
  // daily -> yearly: approximate 252 trading days
  return bootstrapCompoundedReturn(returns, 252)
}

export function runMonteCarloSimulation(args: {
  startCapital: number
  years: number
  simulations: number
  tickers: StockTicker[]
  weights: Record<StockTicker, number>
  expectedReturns?: Record<StockTicker, number>
  volatilities?: Record<StockTicker, number>
  dataset?: LoadedDataset
  useHistoricalBootstrap?: boolean
  frequency?: Frequency
  rebalancing?: boolean
  monthlyContribution?: number
  inflationRate?: number
}): MonteCarloResult {
  const {
    startCapital,
    years,
    simulations,
    tickers,
    weights,
    expectedReturns,
    volatilities,
    dataset,
    useHistoricalBootstrap = true,
    frequency = 'yearly',
    rebalancing = true,
    monthlyContribution = 0,
    inflationRate = 0
  } = args

  if (tickers.length === 0 || simulations <= 0 || years <= 0 || !Number.isFinite(startCapital)) {
    return {
      paths: [],
      summary: {
        simulations: 0,
        horizonYears: years,
        endValues: [],
        meanEnd: 0,
        medianEnd: 0,
        bestEnd: 0,
        worstEnd: 0,
        p5: 0,
        p95: 0
      },
      histogram: []
    }
  }

  const weightSum = tickers.reduce((acc, t) => acc + (weights[t] ?? 0), 0)
  const stepsPerYear = frequency === 'monthly' ? 12 : 1
  const totalSteps = years * stepsPerYear
  const stepContribution = monthlyContribution > 0 ? (frequency === 'monthly' ? monthlyContribution : monthlyContribution * 12) : 0

  const computeTargetHoldings = (portfolioValue: number) => {
    if (weightSum <= 0) return { positions: tickers.reduce((acc, t) => ({ ...acc, [t]: 0 }), {} as Record<StockTicker, number>), cash: portfolioValue }
    if (weightSum <= 100) {
      const positions = tickers.reduce((acc, t) => {
        const w = weights[t] ?? 0
        acc[t] = (portfolioValue * (w / 100))
        return acc
      }, {} as Record<StockTicker, number>)
      const totalPositions = tickers.reduce((acc, t) => acc + (positions[t] ?? 0), 0)
      const cash = Math.max(0, portfolioValue - totalPositions)
      return { positions, cash }
    }
    // Wenn Gewichte >100, verteilen wir die Risikosteuerung proportional, ohne negative Cash-Logik
    const positions = tickers.reduce((acc, t) => {
      const w = weights[t] ?? 0
      acc[t] = (portfolioValue * (w / weightSum))
      return acc
    }, {} as Record<StockTicker, number>)
    return { positions, cash: 0 }
  }

  const returnsByTicker: Record<StockTicker, number[]> | null = (() => {
    if (!useHistoricalBootstrap || !dataset) return null
    const out: Record<StockTicker, number[]> = {} as any
    for (const t of tickers) {
      const s = dataset.series[t]
      if (!s) return null
      const window = pickTrailingWindow(s, years, dataset.frequency)
      out[t] = computeReturnsFromPrices(window)
    }
    return out
  })()

  const paths: MonteCarloPath[] = []
  const endValues: number[] = []

  for (let sim = 0; sim < simulations; sim++) {
    const path: MonteCarloPathPoint[] = []
    let portfolioValue = startCapital

    let cash = 0
    let positions: Record<StockTicker, number> = {} as any
    ;({ positions, cash } = computeTargetHoldings(portfolioValue))

    path.push({ step: 0, year: 0, value: portfolioValue })

    for (let step = 1; step <= totalSteps; step++) {
      const isYearBoundary = step % stepsPerYear === 0

      if (stepContribution > 0) {
        portfolioValue += stepContribution
        const perTickerAddition = stepContribution / tickers.length
        for (const t of tickers) {
          positions[t] += perTickerAddition
        }
      }

      for (const t of tickers) {
        const stepReturn = returnsByTicker
          ? bootstrapStepReturn({
              returns: returnsByTicker[t],
              dataFrequency: dataset?.frequency ?? 'monthly',
              simFrequency: frequency
            })
          : getStepReturn(t, expectedReturns, volatilities, frequency)
        const withInflation = applyInflation(stepReturn, inflationRate, frequency)
        positions[t] *= 1 + withInflation
      }

      portfolioValue = tickers.reduce((acc, t) => acc + positions[t], 0) + cash

      if (rebalancing && isYearBoundary) {
        const target = computeTargetHoldings(portfolioValue)
        positions = target.positions
        cash = target.cash
      }

      const year = step / stepsPerYear
      path.push({ step, year, value: portfolioValue })
    }

    paths.push(path)
    endValues.push(portfolioValue)
  }

  endValues.sort((a, b) => a - b)
  const n = endValues.length
  const meanEnd = endValues.reduce((acc, v) => acc + v, 0) / n
  const medianEnd = n % 2 === 1 ? endValues[(n - 1) / 2] : (endValues[n / 2 - 1] + endValues[n / 2]) / 2
  const bestEnd = endValues[n - 1]
  const worstEnd = endValues[0]
  const idx = (p: number) => Math.max(0, Math.min(n - 1, Math.round((p / 100) * (n - 1))))
  const p5 = endValues[idx(5)]
  const p95 = endValues[idx(95)]

  const bucketCount = 30
  const minV = worstEnd
  const maxV = bestEnd
  const range = maxV - minV || 1
  const bucketSize = range / bucketCount
  const counts = new Array(bucketCount).fill(0) as number[]
  for (const v of endValues) {
    const rawIndex = Math.floor((v - minV) / bucketSize)
    const index = Math.max(0, Math.min(bucketCount - 1, rawIndex))
    counts[index]++
  }
  const histogram = counts.map((c, i) => ({
    bucket: minV + i * bucketSize + bucketSize / 2,
    count: c
  }))

  return {
    paths,
    summary: {
      simulations: n,
      horizonYears: years,
      endValues,
      meanEnd,
      medianEnd,
      bestEnd,
      worstEnd,
      p5,
      p95
    },
    histogram
  }
}

