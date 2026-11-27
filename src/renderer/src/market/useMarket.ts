import { computed, onMounted, onUnmounted, ref, shallowRef, watch, type Ref } from 'vue'
import { createBinance } from './binance'
import { createCandleHistory } from './candleHistory'
import type { Interval, MarketSource, MarketStream, Quote } from './source'

type Status = 'connecting' | 'live' | 'delayed' | 'reconnecting' | 'offline'
const staleAfter = 10_000
const retryAfterSilence = 30_000
const restInterval = 30_000

export function useMarket(chartActive: Readonly<Ref<boolean>>, initialInterval: Interval, coin: Readonly<Ref<string>>) {
  const source = computed<MarketSource>(() => createBinance(coin.value))
  const quote = shallowRef<Quote | null>(null)
  const history = createCandleHistory(source, initialInterval)
  const status = ref<Status>('connecting')
  const candlesDelayed = ref(false)
  let stream: MarketStream | undefined
  let retry: number | undefined
  let healthTimer: number | undefined
  let healthDeadline = Infinity
  let request: AbortController | undefined
  let generation = 0
  let attempts = 0
  let openedAt = 0
  let candleWatchStarted = 0
  let lastQuoteAt = 0
  let lastQuoteEvent = 0
  let lastCandleAt = 0
  let lastQuoteRest = -Infinity
  let lastHistoryRest = -Infinity
  let lastManualRetry = -Infinity
  let started = false
  let needsInitialHistory = true

  function accept(update: Quote) {
    // 推送和 REST 可能乱序返回，报价始终按交易所时间前进。
    if (!quote.value || update.time > quote.value.time) quote.value = update
  }

  async function syncQuote() {
    if (request || !started || !navigator.onLine) return
    const controller = new AbortController()
    request = controller
    lastQuoteRest = Date.now()
    try {
      const update = await source.value.getQuote(controller.signal)
      if (!controller.signal.aborted) accept(update)
    } catch {
      // 保留上次报价，等待推送或下一轮 REST。
    } finally {
      if (request === controller) {
        request = undefined
        checkHealth()
      }
    }
  }

  function syncHistory() {
    if (!started || !navigator.onLine) return
    needsInitialHistory = false
    lastHistoryRest = Date.now()
    void history.load()
  }

  function clearTransport() {
    generation++
    window.clearTimeout(retry)
    window.clearTimeout(healthTimer)
    retry = healthTimer = undefined
    healthDeadline = Infinity
    const previous = stream
    stream = undefined
    previous?.close()
  }

  function cancelRequests() {
    request?.abort()
    request = undefined
    history.cancel()
  }

  function reconnect() {
    clearTransport()
    if (!started || !navigator.onLine) return
    status.value = 'reconnecting'
    const base = 1_000 * 2 ** Math.min(attempts++, 5)
    const delay = Math.min(30_000, Math.round(base * (1 + Math.random() * 0.2)))
    retry = window.setTimeout(connect, delay)
    checkHealth()
  }

  function checkHealth() {
    if (!started || !navigator.onLine) return
    const now = Date.now()
    let deadline = Infinity
    if (stream) {
      const quoteSeen = lastQuoteAt || openedAt
      const candleSeen = lastCandleAt || candleWatchStarted
      const quoteAge = now - quoteSeen
      const candleAge = chartActive.value ? now - candleSeen : 0
      if (quoteAge >= retryAfterSilence || candleAge >= retryAfterSilence) {
        reconnect()
        return
      }
      if (quoteAge >= staleAfter) status.value = 'delayed'
      else if (lastQuoteAt) status.value = 'live'
      candlesDelayed.value = candleAge >= staleAfter
      if (status.value === 'live' && (!chartActive.value || (lastCandleAt && !candlesDelayed.value))) attempts = 0
      deadline = quoteSeen + (quoteAge < staleAfter ? staleAfter : retryAfterSilence)
      if (chartActive.value) {
        deadline = Math.min(deadline, candleSeen + (candleAge < staleAfter ? staleAfter : retryAfterSilence))
      }
    } else {
      candlesDelayed.value = chartActive.value && status.value === 'reconnecting'
    }

    if (status.value !== 'live' && !request) {
      if (now - lastQuoteRest >= restInterval) void syncQuote()
      else deadline = Math.min(deadline, lastQuoteRest + restInterval)
    }
    if (chartActive.value && (candlesDelayed.value || history.state.value === 'error')) {
      if (now - lastHistoryRest >= restInterval) syncHistory()
      deadline = Math.min(deadline, lastHistoryRest + restInterval)
    }

    // 有新数据时优先沿用已经安排的检查，避免每次推送都重建定时器。
    if (deadline >= healthDeadline) return
    window.clearTimeout(healthTimer)
    healthDeadline = deadline
    healthTimer = window.setTimeout(() => {
      healthTimer = undefined
      healthDeadline = Infinity
      checkHealth()
    }, Math.max(1, deadline - now))
  }

  function connect() {
    retry = undefined
    if (!started || stream || !navigator.onLine) return
    const current = ++generation
    openedAt = candleWatchStarted = Date.now()
    lastQuoteAt = lastQuoteEvent = lastCandleAt = 0
    try {
      const connection = source.value.subscribe(update => {
        const now = Date.now()
        if (generation !== current || update.time <= lastQuoteEvent || now - update.time >= staleAfter) return
        if (!lastQuoteAt && attempts > 0 && chartActive.value) syncHistory()
        lastQuoteEvent = update.time
        lastQuoteAt = now
        accept(update)
        checkHealth()
      }, () => {
        if (generation === current) reconnect()
      }, (period, bar, eventTime) => {
        const now = Date.now()
        if (generation !== current || !chartActive.value || period !== history.interval.value
          || now - eventTime >= staleAfter) return
        lastCandleAt = now
        history.update(period, bar, eventTime)
        checkHealth()
      })
      if (generation !== current) {
        connection.close()
        return
      }
      stream = connection
      if (chartActive.value) stream.setInterval(history.interval.value)
      checkHealth()
    } catch {
      if (generation === current) reconnect()
    }
  }

  function offline() {
    clearTransport()
    cancelRequests()
    status.value = 'offline'
    candlesDelayed.value = false
  }

  function restart() {
    if (!started) return
    if (!navigator.onLine) {
      offline()
      return
    }
    clearTransport()
    cancelRequests()
    attempts = 0
    status.value = 'connecting'
    candlesDelayed.value = false
    void syncQuote()
    if (chartActive.value || needsInitialHistory) syncHistory()
    connect()
  }

  function retryNow() {
    const now = Date.now()
    if (now - lastManualRetry < 2_000) return
    lastManualRetry = now
    restart()
  }

  watch([chartActive, history.interval], ([active]) => {
    candleWatchStarted = Date.now()
    lastCandleAt = 0
    stream?.setInterval(active ? history.interval.value : null)
    if (active) syncHistory()
    checkHealth()
  })
  watch(history.state, checkHealth)
  watch(coin, () => {
    clearTransport()
    cancelRequests()
    quote.value = null
    history.reset()
    needsInitialHistory = true
    lastQuoteRest = lastHistoryRest = lastManualRetry = -Infinity
    restart()
  }, { flush: 'sync' })

  onMounted(() => {
    started = true
    window.addEventListener('online', restart)
    window.addEventListener('offline', offline)
    restart()
  })

  onUnmounted(() => {
    started = false
    window.removeEventListener('online', restart)
    window.removeEventListener('offline', offline)
    clearTransport()
    cancelRequests()
  })

  return { quote, history, status, candlesDelayed, restart, retryNow, syncHistory }
}
