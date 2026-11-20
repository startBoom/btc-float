import { contextBridge, ipcRenderer } from 'electron'
import type { FloatSettings } from '../shared/settings'
import {
  closeWindowChannel, expandWindowChannel, moveWindowChannel, getPanelStateChannel,
  panelActivityChannel, getSettingsChannel, updateSettingsChannel, settingsChangedChannel,
  type FloatWindowApi, type PanelActivity,
} from '../shared/window'

const api: FloatWindowApi = {
  close: () => ipcRenderer.send(closeWindowChannel),
  setExpanded: expanded => ipcRenderer.invoke(expandWindowChannel, expanded),
  dragFrom: (x, y) => ipcRenderer.send(moveWindowChannel, x, y),
  getPanelState: () => ipcRenderer.invoke(getPanelStateChannel),
  onPanelActivity: listener => {
    const forward = (_event: Electron.IpcRendererEvent, activity: PanelActivity) => listener(activity)
    ipcRenderer.on(panelActivityChannel, forward)
    return () => { ipcRenderer.removeListener(panelActivityChannel, forward) }
  },
  getSettings: () => ipcRenderer.invoke(getSettingsChannel),
  updateSettings: change => ipcRenderer.invoke(updateSettingsChannel, change),
  onSettingsChanged: listener => {
    const forward = (_event: Electron.IpcRendererEvent, settings: FloatSettings) => listener(settings)
    ipcRenderer.on(settingsChangedChannel, forward)
    return () => { ipcRenderer.removeListener(settingsChangedChannel, forward) }
  },
}
contextBridge.exposeInMainWorld('btcFloat', api)
