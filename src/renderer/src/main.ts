import { createApp } from 'vue'
import App from './App.vue'
import Settings from './Settings.vue'
import './style.css'

if (location.hash === '#settings') {
  createApp(Settings).mount('#app')
} else {
  void window.btcFloat.getPanelState().then(({ expanded, interval }) => {
    createApp(App, { initialExpanded: expanded, initialInterval: interval }).mount('#app')
  }).catch((error: unknown) => {
    console.error('读取浮窗状态失败', error)
    const root = document.getElementById('app')
    if (root) root.textContent = '浮窗加载失败'
  })
}
