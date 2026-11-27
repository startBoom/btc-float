<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { CandlestickSeries, ColorType, createChart, type IChartApi, type ISeriesApi, type Time, type UTCTimestamp } from 'lightweight-charts'
import type { Candle, Interval } from './market/source'
import { formatLocalTime } from './market/format'

const props = defineProps<{ rows: Candle[]; revision: number; interval: Interval; coin: string; precision: number }>()
const host = ref<HTMLDivElement>()
let chart: IChartApi | undefined
let series: ISeriesApi<'Candlestick'> | undefined
let lastRevision = -1
let displayedInterval: Interval | undefined
let lastTime = 0
let appended = 0
let positioned = false

function point(bar: Candle) { return { ...bar, time: bar.time as UTCTimestamp } }

function render() {
  if (!chart || !series) return
  const last = props.rows.at(-1)
  const reset = displayedInterval !== props.interval
  if (reset) positioned = false
  const tailIndex = last?.time === lastTime ? props.rows.length - 1 : props.rows.findIndex(bar => bar.time === lastTime)
  if (reset || lastRevision !== props.revision || appended >= 120 || tailIndex < 0) {
    series.setData(props.rows.map(point))
    // 只在首次有数据或切换周期时定位，盘中更新保留用户的缩放与浏览位置。
    if (!positioned && props.rows.length > 1) {
      chart.timeScale().setVisibleLogicalRange({ from: Math.max(-1, props.rows.length - 42), to: props.rows.length + 2 })
      positioned = true
    }
    appended = 0
  } else {
    // Vue 可能合并多次行情更新，按顺序补上所有新蜡烛。
    for (let index = tailIndex; index < props.rows.length; index++) series.update(point(props.rows[index]))
    appended += props.rows.length - tailIndex - 1
  }
  lastTime = last?.time ?? 0
  lastRevision = props.revision
  displayedInterval = props.interval
}

onMounted(() => {
  if (!host.value) return
  const style = getComputedStyle(host.value)
  const rise = style.getPropertyValue('--rise').trim()
  const fall = style.getPropertyValue('--fall').trim()
  chart = createChart(host.value, {
    autoSize: true,
    layout: { background: { type: ColorType.Solid, color: '#191d22' }, textColor: '#9aa3ab',
      fontFamily: '"Segoe UI", sans-serif', fontSize: 10, attributionLogo: true },
    grid: { vertLines: { visible: false }, horzLines: { color: '#272d33' } },
    rightPriceScale: { borderVisible: false },
    timeScale: {
      timeVisible: true, secondsVisible: false, borderVisible: false, tickMarkMaxCharacterLength: 16,
      tickMarkFormatter: (time: Time) => typeof time === 'number' ? formatLocalTime(time * 1000) : null
    },
    localization: {
      locale: 'zh-CN',
      timeFormatter: (time: Time) => typeof time === 'number' ? formatLocalTime(time * 1000) : String(time)
    }
  })
  series = chart.addSeries(CandlestickSeries, {
    upColor: rise, downColor: fall, wickUpColor: rise, wickDownColor: fall,
    borderVisible: false, priceLineWidth: 1, priceFormat: { type: 'price', precision: props.precision, minMove: 10 ** -props.precision }
  })
  render()
})
watch([() => props.rows, () => props.revision, () => props.interval], render)
watch(() => props.precision, precision => series?.applyOptions({
  priceFormat: { type: 'price', precision, minMove: 10 ** -precision }
}))
onUnmounted(() => chart?.remove())
</script>

<template>
  <div ref="host" class="chart-host" role="img" :aria-label="coin + 'USDT ' + interval + ' 蜡烛图，时间为本地时间'" />
</template>
