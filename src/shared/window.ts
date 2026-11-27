import type { FloatPreferences, FloatSettings, SettingChange } from './settings'

export const closeWindowChannel = 'btc-float:close'
export const expandWindowChannel = 'btc-float:expand'
export const moveWindowChannel = 'btc-float:move'
export const getPanelStateChannel = 'btc-float:panel-state'
export const panelActivityChannel = 'btc-float:panel-activity'
export const getSettingsChannel = 'btc-float:get-settings'
export const updateSettingsChannel = 'btc-float:update-settings'
export const settingsChangedChannel = 'btc-float:settings-changed'

export type PanelActivity = 'shown' | 'hidden' | 'resume'

export interface FloatWindowApi {
  close(): void
  setExpanded(expanded: boolean): Promise<boolean>
  dragFrom(relativeX: number, relativeY: number): void
  getPanelState(): Promise<{ expanded: boolean; visible: boolean; interval: FloatPreferences['interval']; coin: string }>
  onPanelActivity(listener: (activity: PanelActivity) => void): () => void
  getSettings(): Promise<FloatSettings>
  updateSettings(change: SettingChange): Promise<FloatSettings>
  onSettingsChanged(listener: (settings: FloatSettings) => void): () => void
}
