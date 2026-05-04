import type { StockTicker } from '../data/stocks'

export type PortfolioSeriesPoint = {
  year: number
  value: number
}

function computeInvestedCapital(startCapital: number, tickers: StockTicker[], weights: Record<StockTicker, number>) {
  const totalWeight = tickers.reduce((acc, t) => acc + (weights[t] ?? 0), 0)
  const invested = tickers.reduce((acc, t) => acc + startCapital * ((weights[t] ?? 0) / 100), 0)
  const cash = totalWeight >= 100 ? 0 : startCapital * (1 - totalWeight / 100)
  return { totalWeight, invested, cash }
}

export function computePortfolioSeries(args: {
  startCapital: number
  years: number
  tickers: StockTicker[]
  weights: Record<StockTicker, number>
  expectedReturns: Record<StockTicker, number>
}): PortfolioSeriesPoint[] {
  const { startCapital, years, tickers, weights, expectedReturns } = args
  if (tickers.length === 0) return [{ year: 0, value: 0 }]

  const { totalWeight, invested, cash } = computeInvestedCapital(startCapital, tickers, weights)
  const series: PortfolioSeriesPoint[] = []
  const allLoaded = tickers.every((t) => Number.isFinite(expectedReturns[t]))

  for (let year = 0; year <= years; year++) {
    if (!allLoaded) {
      series.push({ year, value: year === 0 ? startCapital : NaN })
      continue
    }

    const investedValue = tickers.reduce((acc, t) => {
      const w = (weights[t] ?? 0) / 100
      const r = expectedReturns[t]
      return acc + startCapital * w * Math.pow(1 + r, year)
    }, 0)

    const totalValue = investedValue + cash
    series.push({ year, value: totalValue })
  }

  return series
}

export function computePortfolioTotals(args: {
  startCapital: number
  years: number
  tickers: StockTicker[]
  weights: Record<StockTicker, number>
  expectedReturns: Record<StockTicker, number>
}): {
  endCapital: number
  totalGain: number
  percentReturn: number
} {
  const { startCapital, years, tickers, weights, expectedReturns } = args
  if (tickers.length === 0) {
    return { endCapital: 0, totalGain: 0, percentReturn: 0 }
  }

  const { totalWeight, cash } = computeInvestedCapital(startCapital, tickers, weights)
  const allLoaded = tickers.every((t) => Number.isFinite(expectedReturns[t]))
  if (!allLoaded) return { endCapital: 0, totalGain: 0, percentReturn: 0 }

  const investedEnd = tickers.reduce((acc, t) => {
    const w = (weights[t] ?? 0) / 100
    const r = expectedReturns[t]
    return acc + startCapital * w * Math.pow(1 + r, years)
  }, 0)

  const endCapital = investedEnd + cash
  const totalGain = endCapital - startCapital
  const percentReturn = startCapital > 0 ? (endCapital / startCapital - 1) * 100 : 0
  return { endCapital, totalGain, percentReturn }
}

