import { contextBridge, ipcRenderer } from 'electron'
import type { FloatSettings } from '../shared/settings'
import {
  closeWindowChannel, expandWindowChannel, moveWindowChannel, getPanelStateChannel,
  getSettingsChannel, updateSettingsChannel, settingsChangedChannel, type FloatWindowApi,
} from '../shared/window'

const api: FloatWindowApi = {
  close: () => ipcRenderer.send(closeWindowChannel),
  setExpanded: expanded => ipcRenderer.invoke(expandWindowChannel, expanded),
  dragFrom: (x, y) => ipcRenderer.send(moveWindowChannel, x, y),
  getPanelState: () => ipcRenderer.invoke(getPanelStateChannel),
  getSettings: () => ipcRenderer.invoke(getSettingsChannel),
  updateSettings: change => ipcRenderer.invoke(updateSettingsChannel, change),
  onSettingsChanged: listener => {
    const forward = (_event: Electron.IpcRendererEvent, settings: FloatSettings) => listener(settings)
    ipcRenderer.on(settingsChangedChannel, forward)
    return () => { ipcRenderer.removeListener(settingsChangedChannel, forward) }
  },
}
contextBridge.exposeInMainWorld('btcFloat', api)
