<script setup lang="ts">
import { computed, defineAsyncComponent, onErrorCaptured, onMounted, onUnmounted, ref, watch, type Ref } from 'vue'
import CompactTrigger from './CompactTrigger.vue'
import { useMarket } from './market/useMarket'
import { intervals, type Interval } from '../../shared/settings'
import { formatLocalTime, formatPrice, priceDecimals } from './market/format'

const CandleChart = defineAsyncComponent(() => import('./CandleChart.vue'))
const props = defineProps<{ initialExpanded: boolean; initialInterval: Interval; initialCoin: string; visibility: Ref<boolean | undefined> }>()
const coin = ref(props.initialCoin)
const expanded = ref(props.initialExpanded)
const chartActive = computed(() => expanded.value && Boolean(props.visibility.value))
const { quote, history, status, candlesDelayed, restart, retryNow, syncHistory } = useMarket(chartActive, props.initialInterval, coin)
const { interval, rows, state, revision } = history
const currentBar = computed(() => rows.value.at(-1))
const chartFailed = ref(false)
let unsubscribe: (() => void) | undefined
let unsubscribeSettings: (() => void) | undefined
let resizing = false

async function resize(open: boolean) {
  if (resizing) return
  resizing = true
  try {
    expanded.value = await window.btcFloat.setExpanded(open)
    if (!expanded.value) chartFailed.value = false
  }
  catch (error) { console.error('浮窗尺寸调整失败', error) }
  finally { resizing = false }
}
function escape(event: KeyboardEvent) {
  if (expanded.value && event.key === 'Escape') void resize(false)
}
onMounted(() => {
  window.addEventListener('keydown', escape)
  unsubscribe = window.btcFloat.onPanelActivity(activity => {
    if (activity === 'resume') restart()
  })
  unsubscribeSettings = window.btcFloat.onSettingsChanged(settings => {
    if (coin.value !== settings.coin) {
      chartFailed.value = false
      coin.value = settings.coin
    }
  })
})
onUnmounted(() => {
  unsubscribe?.()
  unsubscribeSettings?.()
  window.removeEventListener('keydown', escape)
})
onErrorCaptured(error => {
  if (!chartActive.value) return
  console.error('图表渲染失败', error)
  chartFailed.value = true
  return false
})
const precision = computed(() => {
  let decimals = priceDecimals(quote.value?.price ?? 0)
  for (const bar of rows.value) {
    decimals = Math.max(decimals, ...[bar.open, bar.high, bar.low, bar.close].map(priceDecimals))
  }
  return decimals
})
const percentFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero'
})
const label = computed(() => ({
  live: '24h', connecting: '连接中', delayed: '行情延迟', reconnecting: '重连中', offline: '已离线'
})[status.value])
const quoteTitle = computed(() => quote.value ? `最近报价时间：${formatLocalTime(quote.value.time)}（本地时间）` : '暂未收到报价')
const displayedPrice = computed(() => quote.value?.price)
const price = computed(() => displayedPrice.value === undefined ? '—' : formatPrice(displayedPrice.value))
const priceDirection = ref('')
watch(displayedPrice, (current, previous) => {
  priceDirection.value = current === undefined || previous === undefined ? '' : current > previous ? 'up' : 'down'
})
const plotMessage = computed(() => {
  if (chartFailed.value) return '图表加载失败'
  if (status.value === 'offline') return rows.value.length ? '离线 · 保留上次 K 线' : '网络已离线'
  if (state.value === 'error') return '历史 K 线暂不可用'
  if (candlesDelayed.value) return 'K 线更新延迟'
  if (state.value === 'loading' && rows.value.length) return '正在同步 K 线…'
  return rows.value.length ? '' : '正在载入 K 线…'
})
const change = computed(() => quote.value ? percentFormat.format(quote.value.changePercent) + '%' : '—')
const changeDirection = computed(() => {
  const percent = quote.value?.changePercent ?? 0
  return percent > 0 ? 'up' : percent < 0 ? 'down' : ''
})

function closeWindow(): void {
  window.btcFloat.close()
}
</script>

<template>
  <main v-if="!expanded" class="widget" :aria-label="coin + ' 行情浮窗'">
    <div class="quote">
      <div class="symbol"><strong :title="coin">{{ coin }}</strong><span>/ USDT</span></div>
      <div :key="price" class="price" :class="priceDirection"
        :style="{ fontSize: price.length > 13 ? '10px' : price.length > 11 ? '12px' : undefined }"
        :aria-label="quote ? '最新价格 ' + price + ' USDT' : '价格暂无数据'">
        {{ price }}
      </div>
    </div>
    <div class="summary">
      <span class="status" :class="{ warning: status !== 'live' }" role="status" :title="quoteTitle">{{ label }}</span>
      <span class="change" :class="changeDirection" :aria-label="'24 小时涨跌幅 ' + change">{{ change }}</span>
    </div>
    <CompactTrigger @expand="resize(true)" />
    <button class="close" type="button" aria-label="隐藏浮窗" title="隐藏到系统托盘" @click="closeWindow">×</button>
  </main>
  <main v-else class="detail" :aria-label="coin + ' 行情详情'">
    <header class="detail-head">
      <div class="symbol"><strong>{{ coin }}</strong><span>/ USDT 永续</span></div>
      <div class="detail-controls">
        <span v-if="status !== 'live'" class="status warning" role="status" :title="quoteTitle">{{ label }}</span>
        <button v-if="status === 'reconnecting' || status === 'delayed'" type="button" @click="retryNow">重连</button>
        <button type="button" aria-label="收起 K 线" @click="resize(false)">收起</button>
      </div>
      <div class="detail-quote">
        <strong :key="price" class="price" :class="priceDirection" :title="quoteTitle">{{ price }}</strong>
        <span class="change" :class="changeDirection">24h {{ change }}</span>
      </div>
      <div class="extremes">
        <span>本根高 <b>{{ currentBar ? formatPrice(currentBar.high) : '—' }}</b></span>
        <span>本根低 <b>{{ currentBar ? formatPrice(currentBar.low) : '—' }}</b></span>
      </div>
    </header>
    <section class="plot" aria-label="K 线图">
      <CandleChart v-if="chartActive && !chartFailed" :key="coin" :coin="coin" :rows="rows" :revision="revision" :interval="interval" :precision="precision" />
      <div v-if="plotMessage" class="plot-status" :class="{ inline: rows.length && !chartFailed }" role="status">
        <span>{{ plotMessage }}</span>
        <button v-if="chartFailed" type="button" @click="chartFailed = false">重试</button>
        <button v-else-if="state === 'error' && status !== 'offline'" type="button" @click="syncHistory">重试</button>
      </div>
    </section>
    <footer class="periods" aria-label="K 线周期">
      <button v-for="period in intervals" :key="period" type="button" :aria-pressed="period === interval"
        @click="history.select(period)">{{ period }}</button>
      <span title="图表使用系统本地时间">{{ currentBar ? formatLocalTime(currentBar.time * 1000) : '本地时间' }}</span>
    </footer>
  </main>
</template>
