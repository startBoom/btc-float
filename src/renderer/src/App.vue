<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue'
import CompactTrigger from './CompactTrigger.vue'
import { useMarket } from './market/useMarket'
import type { Interval } from './market/source'

const CandleChart = defineAsyncComponent(() => import('./CandleChart.vue'))
const periods: Interval[] = ['1m', '5m', '15m', '1h']
const expanded = ref(false)
const { quote, history, status } = useMarket(expanded)
const { interval, rows, state, revision } = history
const currentBar = computed(() => rows.value.at(-1))
let resizing = false

async function resize(open: boolean) {
  if (resizing) return
  resizing = true
  try { expanded.value = await window.btcFloat.setExpanded(open) }
  catch (error) { console.error('浮窗尺寸调整失败', error) }
  finally { resizing = false }
}
function escape(event: KeyboardEvent) {
  if (expanded.value && event.key === 'Escape') void resize(false)
}
onMounted(() => {
  void resize(false)
  window.addEventListener('keydown', escape)
})
onUnmounted(() => window.removeEventListener('keydown', escape))
const priceFormat = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const percentFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero'
})
const label = computed(() => ({
  live: '24h', connecting: '连接中', delayed: '行情延迟', reconnecting: '重连中', offline: '已离线'
})[status.value])
const priceDirection = ref('')
watch(() => quote.value?.price, (price, previous) => {
  priceDirection.value = price === undefined || previous === undefined ? '' : price > previous ? 'up' : 'down'
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
  <main v-if="!expanded" class="widget" aria-label="BTC 行情浮窗">
    <div class="quote">
      <div class="symbol"><strong>BTC</strong><span>/ USDT</span></div>
      <div :key="quote?.price" class="price" :class="priceDirection" :aria-label="quote ? '最新价格 ' + quote.price + ' USDT' : '价格暂无数据'">
        {{ quote ? priceFormat.format(quote.price) : '—' }}
      </div>
    </div>
    <div class="summary">
      <span class="status">{{ label }}</span>
      <span class="change" :class="changeDirection" :aria-label="'24 小时涨跌幅 ' + change">{{ change }}</span>
    </div>
    <CompactTrigger @expand="resize(true)" />
    <button class="close" type="button" aria-label="关闭浮窗" title="关闭浮窗" @click="closeWindow">×</button>
  </main>
  <main v-else class="detail" aria-label="BTC 行情详情">
    <header class="detail-head">
      <div class="symbol"><strong>BTC</strong><span>/ USDT 永续</span></div>
      <div class="detail-controls">
        <span v-if="status !== 'live'" class="status">{{ label }}</span>
        <button type="button" aria-label="收起 K 线" @click="resize(false)">收起</button>
      </div>
      <div class="detail-quote">
        <strong :key="quote?.price" class="price" :class="priceDirection">{{ quote ? priceFormat.format(quote.price) : '—' }}</strong>
        <span class="change" :class="changeDirection">24h {{ change }}</span>
      </div>
      <div class="extremes">
        <span>本根高 <b>{{ currentBar ? priceFormat.format(currentBar.high) : '—' }}</b></span>
        <span>本根低 <b>{{ currentBar ? priceFormat.format(currentBar.low) : '—' }}</b></span>
      </div>
    </header>
    <section class="plot">
      <CandleChart :rows="rows" :revision="revision" :interval="interval" />
      <div v-if="!rows.length || state === 'error'" class="plot-status" :class="{ inline: rows.length }" role="status">
        <span>{{ state === 'error' ? '历史数据暂不可用' : status === 'offline' ? '网络已离线' : '正在载入 K 线…' }}</span>
        <button v-if="state === 'error'" type="button" @click="history.load">重试</button>
      </div>
    </section>
    <footer class="periods" aria-label="K 线周期">
      <button v-for="period in periods" :key="period" type="button" :aria-pressed="period === interval"
        @click="history.select(period)">{{ period }}</button>
      <span title="图表时间使用协调世界时">UTC</span>
    </footer>
  </main>
</template>
