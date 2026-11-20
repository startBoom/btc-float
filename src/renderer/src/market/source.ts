export interface Quote {
  price: number
  changePercent: number
  time: number // Unix 毫秒，来自交易所
}

export type Interval = '1m' | '5m' | '15m' | '1h'

export interface Candle {
  time: number // 开盘时间，Unix 秒
  open: number
  high: number
  low: number
  close: number
  trades?: number
}

export interface MarketSource {
  getQuote(signal: AbortSignal): Promise<Quote>
  getCandles(interval: Interval, signal: AbortSignal): Promise<Candle[]>
  subscribe(onQuote: (quote: Quote) => void, onDisconnect: () => void,
    onCandle: (interval: Interval, candle: Candle, eventTime: number) => void): MarketStream
}

export interface MarketStream {
  close(): void
  setInterval(interval: Interval | null): void
}
