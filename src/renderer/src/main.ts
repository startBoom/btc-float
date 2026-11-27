import { createApp, ref } from 'vue'
import App from './App.vue'
import Settings from './Settings.vue'
import './style.css'

if (location.hash === '#settings') {
  createApp(Settings).mount('#app')
} else {
  const visibility = ref<boolean>()
  const unsubscribe = window.btcFloat.onPanelActivity(activity => {
    if (activity !== 'resume') visibility.value = activity === 'shown'
  })
  void window.btcFloat.getPanelState().then(({ expanded, visible, interval, coin }) => {
    visibility.value ??= visible
    const app = createApp(App, { initialExpanded: expanded, initialInterval: interval, initialCoin: coin, visibility })
    app.onUnmount(unsubscribe)
    app.mount('#app')
  }).catch((error: unknown) => {
    unsubscribe()
    console.error('读取浮窗状态失败', error)
    const root = document.getElementById('app')
    if (root) root.textContent = '浮窗加载失败'
  })
}
