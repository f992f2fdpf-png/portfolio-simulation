export function formatCurrency(amount: number, digits = 0) {
  const safe = Number.isFinite(amount) ? amount : 0
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(safe)
}

export function formatPercent(value: number, digits = 2) {
  const safe = Number.isFinite(value) ? value : 0
  return `${safe.toFixed(digits)}%`
}

