import { onMounted, onUnmounted, ref, shallowRef, watch, type Ref } from 'vue'
import { binance } from './binance'
import { createCandleHistory } from './candleHistory'
import type { MarketSource, MarketStream, Quote } from './source'

type Status = 'connecting' | 'live' | 'delayed' | 'reconnecting' | 'offline'
const staleAfter = 10_000
const retryAfterSilence = 30_000

export function useMarket(expanded: Ref<boolean>, source: MarketSource = binance) {
  const quote = shallowRef<Quote | null>(null)
  const history = createCandleHistory(source)
  const status = ref<Status>('connecting')
  let stream: MarketStream | undefined
  let retry: number | undefined
  let watchdog: number | undefined
  let request: AbortController | undefined
  let attempts = 0
  let lastStream = 0
  let lastRest = 0
  let lastCandle = 0
  let stopped = false

  function accept(update: Quote) {
    // 较慢返回的 REST 快照和乱序推送都不能让价格倒退。
    if (!quote.value || update.time > quote.value.time) quote.value = update
  }

  async function syncRest() {
    if (request || stopped || !navigator.onLine) return
    const controller = new AbortController()
    request = controller
    lastRest = Date.now()
    const { signal } = controller
    try {
      const update = await source.getQuote(signal)
      if (!signal.aborted) accept(update)
    } catch {
      // REST 不可用时继续等待推送，必要时由看门狗重试。
    }
    if (request === controller) request = undefined
  }

  function clearConnection() {
    window.clearTimeout(retry)
    retry = undefined
    stream?.close()
    stream = undefined
  }

  function reconnect() {
    clearConnection()
    if (stopped || !navigator.onLine) {
      status.value = 'offline'
      return
    }
    status.value = 'reconnecting'
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempts++, 5))
    retry = window.setTimeout(connect, delay)
  }

  function connect() {
    retry = undefined
    if (stopped || stream || !navigator.onLine) return
    lastStream = Date.now()
    lastCandle = lastStream
    try {
      stream = source.subscribe(update => {
        if (quote.value && update.time < quote.value.time) return
        accept(update)
        if (Date.now() - update.time > staleAfter) {
          status.value = 'delayed'
          return
        }
        lastStream = Date.now()
        if (attempts > 0) {
          void history.load()
          void syncRest()
        }
        attempts = 0
        status.value = expanded.value && Date.now() - lastCandle >= staleAfter ? 'delayed' : 'live'
      }, reconnect, (period, bar, eventTime) => {
        if (expanded.value && period === history.interval.value) {
          if (Date.now() - eventTime <= staleAfter) lastCandle = Date.now()
          history.update(period, bar, eventTime)
        }
      })
      if (expanded.value) stream.setInterval(history.interval.value)
    } catch {
      reconnect()
    }
  }

  function online() {
    if (stream) return
    window.clearTimeout(retry)
    status.value = 'connecting'
    void syncRest()
    void history.load()
    connect()
  }

  function offline() {
    clearConnection()
    request?.abort()
    request = undefined
    history.cancel()
    status.value = 'offline'
  }

  watch([expanded, history.interval], ([open], [wasOpen]) => {
    lastCandle = Date.now()
    stream?.setInterval(open ? history.interval.value : null)
    if (open && !wasOpen) void history.load()
  }, { flush: 'sync' })

  onMounted(() => {
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    if (navigator.onLine) online()
    else offline()
    watchdog = window.setInterval(() => {
      if (!navigator.onLine) return
      const now = Date.now()
      const silence = now - (expanded.value ? Math.min(lastCandle, lastStream) : lastStream)
      if (stream && silence >= retryAfterSilence) reconnect()
      else if (stream && silence >= staleAfter) status.value = 'delayed'
      if (now - lastRest >= 30_000 && (status.value !== 'live' || history.state.value === 'error')) {
        void syncRest()
        if (expanded.value || history.state.value === 'error') void history.load()
      }
    }, 1_000)
  })

  onUnmounted(() => {
    stopped = true
    window.removeEventListener('online', online)
    window.removeEventListener('offline', offline)
    window.clearInterval(watchdog)
    clearConnection()
    request?.abort()
    history.cancel()
  })
  return { quote, history, status }
}
