export type StockTicker = string

export type StockInfo = {
  ticker: StockTicker
  name: string
  color: string
}

export const STOCKS: Record<StockTicker, StockInfo> = {
  AAPL: {
    ticker: 'AAPL',
    name: 'Apple',
    color: '#2563eb'
  },
  MSFT: {
    ticker: 'MSFT',
    name: 'Microsoft',
    color: '#06b6d4'
  },
  GOOGL: {
    ticker: 'GOOGL',
    name: 'Alphabet (Google)',
    color: '#10b981'
  },

  SPY: {
    ticker: 'SPY',
    name: 'SPDR S&P 500 ETF',
    color: '#0ea5e9'
  },
  IEF: {
    ticker: 'IEF',
    name: 'iShares 7-10 Year Treasury Bond ETF',
    color: '#fb923c'
  },
  GLD: {
    ticker: 'GLD',
    name: 'SPDR Gold Shares',
    color: '#facc15'
  }
}

