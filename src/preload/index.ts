import { contextBridge, ipcRenderer } from 'electron'
import { closeWindowChannel, expandWindowChannel, moveWindowChannel, type FloatWindowApi } from '../shared/window'

const api: FloatWindowApi = {
  close: () => ipcRenderer.send(closeWindowChannel),
  setExpanded: expanded => ipcRenderer.invoke(expandWindowChannel, expanded),
  dragFrom: (x, y) => ipcRenderer.send(moveWindowChannel, x, y)
}
contextBridge.exposeInMainWorld('btcFloat', api)
