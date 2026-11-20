import type { Candle, Interval, MarketSource, Quote } from './source'

const api = 'https://fapi.binance.com/fapi/v1'
const symbol = 'BTCUSDT'
const tickerStream = 'wss://fstream.binance.com/market/ws/btcusdt@ticker'

function numeric(value: unknown): number {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return NaN
  return Number(value)
}

function quote(price: unknown, percent: unknown, time: unknown): Quote {
  const result = { price: numeric(price), changePercent: numeric(percent), time: numeric(time) }
  if (!Number.isFinite(result.price) || result.price <= 0 || !Number.isFinite(result.changePercent)
    || !Number.isSafeInteger(result.time) || result.time <= 0) throw new Error('无效的行情报价')
  return result
}

async function request(path: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(api + path, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
    cache: 'no-store',
    credentials: 'omit'
  })
  if (!response.ok) throw new Error(`Binance HTTP ${response.status}`)
  return response.json()
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function candle(t: unknown, o: unknown, h: unknown, l: unknown, c: unknown, count: unknown): Candle {
  const [ms, open, high, low, close] = [t, o, h, l, c].map(numeric)
  if (!Number.isSafeInteger(ms) || ms <= 0 || ![open, high, low, close].every(n => Number.isFinite(n) && n > 0)
    || low > Math.min(open, close) || high < Math.max(open, close)) throw new Error('无效的 K 线数据')
  const trades = numeric(count)
  return { time: Math.floor(ms / 1000), open, high, low, close,
    trades: Number.isSafeInteger(trades) && trades >= 0 ? trades : undefined }
}

export const binance: MarketSource = {
  async getQuote(signal) {
    const data = await request('/ticker/24hr?symbol=' + symbol, signal)
    if (!record(data) || data.symbol !== symbol) throw new Error('报价交易对不匹配')
    return quote(data.lastPrice, data.priceChangePercent, data.closeTime)
  },

  async getCandles(interval, signal) {
    const rows = await request(`/klines?symbol=${symbol}&interval=${interval}&limit=120`, signal)
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('历史 K 线为空')
    return rows.map((row: unknown): Candle => {
      if (!Array.isArray(row)) throw new Error('无效的 K 线')
      return candle(row[0], row[1], row[2], row[3], row[4], row[8])
    })
  },

  subscribe(onQuote, onDisconnect, onCandle) {
    const socket = new WebSocket(tickerStream)
    let wanted: Interval | null = null
    let subscribed: Interval | null = null
    let timer: number | undefined
    let id = 0
    function syncSubscription() {
      if (socket.readyState !== WebSocket.OPEN || wanted === subscribed) return
      try {
        const send = (method: string, interval: Interval) => socket.send(JSON.stringify({
          method, params: ['btcusdt@kline_' + interval], id: ++id
        }))
        if (subscribed) send('UNSUBSCRIBE', subscribed)
        if (wanted) send('SUBSCRIBE', wanted)
        subscribed = wanted
      } catch { onDisconnect() }
    }
    socket.onopen = syncSubscription
    socket.onmessage = ({ data }) => {
      try {
        const item: unknown = JSON.parse(data)
        if (!record(item)) return
        if ('code' in item && 'id' in item) { onDisconnect(); return }
        if (item.s !== symbol) return
        if (item.e === '24hrTicker') onQuote(quote(item.c, item.P, item.C ?? item.E))
        const k = item.k
        if (item.e === 'kline' && wanted && record(k) && k.i === wanted && k.s === symbol) {
          const time = numeric(item.E)
          if (Number.isSafeInteger(time) && time > 0) onCandle(wanted, candle(k.t, k.o, k.h, k.l, k.c, k.n), time)
        }
      } catch {
        // 异常帧不覆盖上一笔有效行情，持续收不到有效帧由超时检测处理。
        return
      }
    }
    socket.onerror = socket.onclose = onDisconnect
    return {
      setInterval(interval) {
        if (wanted === interval) return
        wanted = interval
        window.clearTimeout(timer)
        timer = window.setTimeout(syncSubscription, 250)
      },
      close() {
        window.clearTimeout(timer)
        socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null
        socket.close()
      }
    }
  }
}
