<script setup lang="ts">
import { onMounted, onUnmounted, shallowRef, ref } from 'vue'
import { intervals, opacityOptions, popularCoins, isCoin, type FloatSettings, type SettingChange } from '../../shared/settings'

const settings = shallowRef<FloatSettings>()
const busy = ref(false)
const error = ref('')
const formRevision = ref(0)
let unsubscribe: (() => void) | undefined

function saveCoin(event: Event) {
  const input = event.target as HTMLInputElement
  const coin = input.value.trim().toUpperCase()
  if (!isCoin(coin)) {
    error.value = '请输入有效的币种代码，例如 BTC、ETH 或 SOL。'
    input.value = settings.value?.coin ?? 'BTC'
    return
  }
  input.value = coin
  if (coin !== settings.value?.coin) void save({ key: 'coin', value: coin })
}

async function load() {
  try {
    error.value = ''
    settings.value = await window.btcFloat.getSettings()
  } catch {
    error.value = '读取设置失败，请重试。'
  }
}

async function save(change: SettingChange) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    settings.value = await window.btcFloat.updateSettings(change)
  } catch {
    await load()
    formRevision.value++
    error.value = '保存失败，请重试。'
  } finally {
    busy.value = false
  }
}

onMounted(() => {
  unsubscribe = window.btcFloat.onSettingsChanged(current => { settings.value = current })
  void load()
})
onUnmounted(() => unsubscribe?.())
</script>

<template>
  <main class="settings">
    <h1>设置</h1>
    <fieldset v-if="settings" :key="formRevision" :disabled="busy" aria-label="浮窗设置">
      <label>
        <span>开机启动</span>
        <input type="checkbox" :checked="settings.openAtLogin"
          @change="save({ key: 'openAtLogin', value: ($event.target as HTMLInputElement).checked })" />
      </label>
      <label>
        <span>始终置顶</span>
        <input type="checkbox" :checked="settings.alwaysOnTop"
          @change="save({ key: 'alwaysOnTop', value: ($event.target as HTMLInputElement).checked })" />
      </label>
      <label>
        <span>窗口不透明度</span>
        <select :value="settings.opacity"
          @change="save({ key: 'opacity', value: Number(($event.target as HTMLSelectElement).value) as FloatSettings['opacity'] })">
          <option v-for="opacity in opacityOptions" :key="opacity" :value="opacity">{{ opacity }}%</option>
        </select>
      </label>
      <label>
        <span>币种</span>
        <input class="coin-input" type="text" list="coins" maxlength="20" :value="settings.coin"
          placeholder="BTC" title="请输入 Binance USDT 永续合约的币种代码" @change="saveCoin" @keydown.enter="($event.target as HTMLInputElement).blur()" />
        <datalist id="coins">
          <option v-for="coin in popularCoins" :key="coin" :value="coin" />
        </datalist>
      </label>
      <label>
        <span>默认 K 线周期</span>
        <select :value="settings.interval"
          @change="save({ key: 'interval', value: ($event.target as HTMLSelectElement).value as FloatSettings['interval'] })">
          <option v-for="interval in intervals" :key="interval" :value="interval">{{ interval }}</option>
        </select>
      </label>
      <label>
        <span>启动时显示</span>
        <select :value="String(settings.startExpanded)"
          @change="save({ key: 'startExpanded', value: ($event.target as HTMLSelectElement).value === 'true' })">
          <option value="false">简洁报价</option>
          <option value="true">K 线详情</option>
        </select>
      </label>
    </fieldset>
    <dl v-if="settings">
      <div><dt>行情源</dt><dd>Binance {{ settings.coin }}USDT 永续</dd></div>
      <div><dt>计价货币</dt><dd>USDT</dd></div>
    </dl>
    <p v-if="error" role="alert">{{ error }} <button v-if="!settings" type="button" @click="load">重新读取</button></p>
    <p v-else role="status">{{ !settings ? '正在读取设置…' : busy ? '正在保存…' : '币种自动保存并立即切换，默认周期和视图下次启动时生效。' }}</p>
  </main>
</template>

<style scoped>
.settings {
  height: 100vh;
  overflow: auto;
  padding: 15px 20px;
  background: #191d22;
  color: #d9dfe5;
  color-scheme: dark;
  font-size: 13px;
}
h1 { margin: 0 0 9px; font-size: 18px; }
fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
label, dl div {
  min-height: 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-bottom: 1px solid #303740;
}
input, select, button { font: inherit; accent-color: #a4b7c8; }
select, button, .coin-input { padding: 3px 5px; color: inherit; background: #262d35; border: 1px solid #434e59; border-radius: 4px; }
.coin-input { width: 120px; text-transform: uppercase; }
dl, dd { margin: 0; }
dd, p { color: #a6afb8; }
p { margin: 12px 0 0; font-size: 11px; }
p[role="alert"] { color: #e4a6a6; }
</style>
