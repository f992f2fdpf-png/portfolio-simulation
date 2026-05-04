import type { StockTicker } from '../data/stocks'

export type PricePoint = { date: string; price: number }

export type PriceDatasetManifest = {
  datasets: { id: string; name: string; frequency: 'daily' | 'monthly'; file: string }[]
}

export type PriceDatasetFile = {
  meta: {
    frequency: 'daily' | 'monthly'
    currency?: string
    assets: string[]
    note?: string
  }
  prices: Record<string, [string, number][]>
}

export type LoadedDataset = {
  id: string
  name: string
  frequency: 'daily' | 'monthly'
  currency?: string
  note?: string
  assets: string[]
  series: Record<string, PricePoint[]>
}

export async function loadManifest(): Promise<PriceDatasetManifest> {
  const res = await fetch('/data/datasets.json', { cache: 'no-cache' })
  const text = await res.text()
  if (!res.ok) throw new Error(`Datasets-Manifest konnte nicht geladen werden (${res.status}).`)
  return JSON.parse(text) as PriceDatasetManifest
}

export async function loadDatasetById(datasetId: string): Promise<LoadedDataset> {
  const manifest = await loadManifest()
  const entry = manifest.datasets.find((d) => d.id === datasetId) ?? manifest.datasets[0]
  if (!entry) throw new Error('Kein Datensatz im Manifest gefunden.')

  const res = await fetch(entry.file, { cache: 'no-cache' })
  const text = await res.text()
  if (!res.ok) throw new Error(`Datensatz konnte nicht geladen werden (${res.status}).`)
  const file = JSON.parse(text) as PriceDatasetFile

  const series: Record<string, PricePoint[]> = {}
  for (const [asset, points] of Object.entries(file.prices ?? {})) {
    const cleaned = (points ?? [])
      .map(([date, price]) => ({ date, price: Number(price) }))
      .filter((p) => p.date && Number.isFinite(p.price) && p.price > 0)
      .sort((a, b) => (a.date < b.date ? -1 : 1))
    series[asset] = cleaned
  }

  return {
    id: entry.id,
    name: entry.name,
    frequency: file.meta?.frequency ?? entry.frequency,
    currency: file.meta?.currency,
    note: file.meta?.note,
    assets: file.meta?.assets ?? Object.keys(series),
    series
  }
}

export function computeReturnsFromPrices(pointsAsc: PricePoint[]): number[] {
  const out: number[] = []
  for (let i = 1; i < pointsAsc.length; i++) {
    const prev = pointsAsc[i - 1].price
    const cur = pointsAsc[i].price
    if (!Number.isFinite(prev) || !Number.isFinite(cur) || prev <= 0) continue
    out.push(cur / prev - 1)
  }
  return out
}

export function mean(arr: number[]) {
  if (arr.length === 0) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

export function std(arr: number[]) {
  if (arr.length < 2) return 0
  const m = mean(arr)
  const v = arr.reduce((acc, x) => acc + (x - m) * (x - m), 0) / (arr.length - 1)
  return Math.sqrt(v)
}

export function annualizeFromPeriodic(periodicReturns: number[], periodsPerYear: number) {
  const mu = mean(periodicReturns)
  const sigma = std(periodicReturns)
  const annualReturn = Math.pow(1 + mu, periodsPerYear) - 1
  const annualVol = sigma * Math.sqrt(periodsPerYear)
  return { annualReturn, annualVol }
}

export function pickTrailingWindow(pointsAsc: PricePoint[], years: number, frequency: 'daily' | 'monthly') {
  if (pointsAsc.length === 0) return pointsAsc
  const cutoff = new Date()
  cutoff.setFullYear(cutoff.getFullYear() - years)
  const cutoffIso = cutoff.toISOString().slice(0, 10)
  const filtered = pointsAsc.filter((p) => p.date >= cutoffIso)
  return filtered.length >= (frequency === 'monthly' ? years * 6 : years * 50) ? filtered : pointsAsc
}

export function toTicker(asset: string): StockTicker | null {
  return (asset as StockTicker) ?? null
}

export async function fetchLiveHistoricalData(ticker: string): Promise<PricePoint[]> {
  const res = await fetch(`/api/historical?symbol=${encodeURIComponent(ticker)}`)
  if (!res.ok) throw new Error(`Live-Daten für ${ticker} konnten nicht geladen werden (${res.status}).`)
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  
  return (data.series || [])
    .map((item: any) => ({
      date: item.time,
      price: Number(item.value)
    }))
    .filter((p: PricePoint) => p.date && Number.isFinite(p.price) && p.price > 0)
    .sort((a: PricePoint, b: PricePoint) => (a.date < b.date ? -1 : 1))
}

