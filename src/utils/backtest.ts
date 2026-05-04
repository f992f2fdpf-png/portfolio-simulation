import type { StockTicker } from '../data/stocks'
import type { LoadedDataset, PricePoint } from './historicalData'
import { computeReturnsFromPrices, pickTrailingWindow } from './historicalData'

export type BacktestPoint = { year: number; value: number }

function normalizeWeights(tickers: StockTicker[], weights: Record<StockTicker, number>) {
  const sum = tickers.reduce((acc, t) => acc + (weights[t] ?? 0), 0)
  if (sum <= 0) return tickers.reduce((acc, t) => ({ ...acc, [t]: 0 }), {} as Record<StockTicker, number>)
  const factor = 100 / sum
  const out: Record<StockTicker, number> = {} as any
  for (const t of tickers) out[t] = (weights[t] ?? 0) * factor
  return out
}

function indexByDate(pointsAsc: PricePoint[]) {
  const m = new Map<string, number>()
  for (const p of pointsAsc) m.set(p.date, p.price)
  return m
}

export function computeBacktestSeries(args: {
  dataset: LoadedDataset
  tickers: StockTicker[]
  weights: Record<StockTicker, number>
  startCapital: number
  years: number
  rebalancing: boolean
}): BacktestPoint[] {
  const { dataset, tickers, weights, startCapital, years, rebalancing } = args
  if (tickers.length === 0) return [{ year: 0, value: 0 }]

  const freq = dataset.frequency
  const norm = normalizeWeights(tickers, weights)

  const seriesPerTicker: Record<StockTicker, PricePoint[]> = {} as any
  for (const t of tickers) {
    const s = dataset.series[t]
    if (!s || s.length < 2) return [{ year: 0, value: 0 }]
    seriesPerTicker[t] = pickTrailingWindow(s, years, freq)
  }

  // Align all tickers by common dates (intersection).
  const dateSets = tickers.map((t) => new Set(seriesPerTicker[t].map((p) => p.date)))
  const commonDates = seriesPerTicker[tickers[0]]
    .map((p) => p.date)
    .filter((d) => dateSets.every((s) => s.has(d)))
    .sort()

  if (commonDates.length < 2) return [{ year: 0, value: 0 }]

  const priceByTicker = tickers.reduce((acc, t) => {
    acc[t] = indexByDate(seriesPerTicker[t])
    return acc
  }, {} as Record<StockTicker, Map<string, number>>)

  let positions: Record<StockTicker, number> = {} as any
  for (const t of tickers) positions[t] = startCapital * (norm[t] ?? 0) / 100

  const pointsPerYear = freq === 'monthly' ? 12 : 252
  const out: BacktestPoint[] = [{ year: 0, value: startCapital }]

  for (let i = 1; i < commonDates.length; i++) {
    const prevDate = commonDates[i - 1]
    const curDate = commonDates[i]

    for (const t of tickers) {
      const prevP = priceByTicker[t].get(prevDate)
      const curP = priceByTicker[t].get(curDate)
      if (!prevP || !curP || prevP <= 0) continue
      const r = curP / prevP - 1
      positions[t] *= 1 + r
    }

    const portfolioValue = tickers.reduce((acc, t) => acc + positions[t], 0)

    // rebalance at year boundaries (approx.)
    if (rebalancing && i % pointsPerYear === 0) {
      for (const t of tickers) positions[t] = portfolioValue * (norm[t] ?? 0) / 100
    }

    const year = i / pointsPerYear
    out.push({ year, value: portfolioValue })
  }

  // compress to whole years for display
  const compressed: BacktestPoint[] = []
  for (let y = 0; y <= years; y++) {
    const idx = Math.min(out.length - 1, Math.round(y * pointsPerYear))
    compressed.push({ year: y, value: out[idx].value })
  }
  return compressed
}

export function computePerAssetReturnSeries(args: {
  dataset: LoadedDataset
  tickers: StockTicker[]
  years: number
}): Record<StockTicker, number[]> {
  const { dataset, tickers, years } = args
  const out: Record<StockTicker, number[]> = {} as any
  for (const t of tickers) {
    const s = dataset.series[t]
    if (!s) {
      out[t] = []
      continue
    }
    const window = pickTrailingWindow(s, years, dataset.frequency)
    out[t] = computeReturnsFromPrices(window)
  }
  return out
}

