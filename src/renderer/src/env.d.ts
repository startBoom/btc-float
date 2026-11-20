import type { FloatWindowApi } from '../../shared/window'

declare global {
  interface Window {
    btcFloat: FloatWindowApi
  }
}
