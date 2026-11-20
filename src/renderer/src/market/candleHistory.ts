import { ref, shallowRef } from 'vue'
import type { Candle, Interval, MarketSource } from './source'

function fewerTrades(bar: Candle, previous?: Candle) {
  return previous?.time === bar.time && previous.trades !== undefined && bar.trades !== undefined
    && bar.trades < previous.trades
}

export function createCandleHistory(source: MarketSource) {
  const interval = ref<Interval>('1m')
  const rows = shallowRef<Candle[]>([])
  const revision = ref(0)
  const state = ref<'loading' | 'ready' | 'error'>('loading')
  let request: AbortController | undefined
  const pending = new Map<number, Candle>()
  let latestEvent = 0

  function cancel() {
    request?.abort()
    request = undefined
    pending.clear()
  }

  async function load() {
    cancel()
    const controller = new AbortController()
    request = controller
    const tail = rows.value.at(-1)
    if (tail) pending.set(tail.time, tail)
    state.value = 'loading'
    try {
      const history = await source.getCandles(interval.value, controller.signal)
      if (controller.signal.aborted) return
      // 请求期间可能跨过一根或多根 K 线。按开盘时间合并，以最新推送更新尾部。
      const combined = new Map(history.map(row => [row.time, row]))
      for (const [time, bar] of pending) {
        const snapshot = combined.get(time)
        if (time >= history[0].time && !fewerTrades(bar, snapshot)
          && (bar !== tail || !snapshot || fewerTrades(snapshot, bar))) combined.set(time, bar)
      }
      rows.value = [...combined.values()].sort((a, b) => a.time - b.time).slice(-120)
      revision.value++
      state.value = 'ready'
    } catch {
      if (!controller.signal.aborted) state.value = 'error'
    } finally {
      if (request === controller) { request = undefined; pending.clear() }
    }
  }

  function select(value: Interval) {
    if (interval.value === value) return
    interval.value = value
    rows.value = []
    latestEvent = 0
    revision.value++
    void load()
  }

  function update(period: Interval, bar: Candle, eventTime: number) {
    const last = rows.value.at(-1)
    if (period !== interval.value || eventTime < latestEvent || (last && last.time > bar.time) || fewerTrades(bar, last)) return
    latestEvent = eventTime
    if (request) pending.set(bar.time, bar)
    const keep = last?.time === bar.time ? rows.value.slice(0, -1) : rows.value.slice(-119)
    rows.value = [...keep, bar]
  }
  return { interval, rows, revision, state, load, select, update, cancel }
}
