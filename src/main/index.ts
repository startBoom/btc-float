import { app, BrowserWindow, ipcMain, screen, shell, type Rectangle } from 'electron'
import { join } from 'node:path'
import { closeWindowChannel, expandWindowChannel, moveWindowChannel } from '../shared/window'

// 56 个逻辑像素可容纳 Windows 在不同 DPI 显示器间移动时施加的最小高度。
const panelSize = { width: 180, height: 56 }
const margin = 16
let panel: BrowserWindow | null = null
let compactBounds: Rectangle | null = null

function fitBounds(bounds: Rectangle, area: Rectangle): Rectangle {
  const width = Math.min(bounds.width, area.width)
  const height = Math.min(bounds.height, area.height)
  const x = Math.max(area.x, Math.min(bounds.x, area.x + area.width - width))
  const y = Math.max(area.y, Math.min(bounds.y, area.y + area.height - height))
  return { x, y, width, height }
}

function setExpanded(expanded: boolean): boolean {
  if (!panel || expanded === Boolean(compactBounds)) return Boolean(compactBounds)
  // 分数 DPI 下 getBounds() 可能向外取整。固定收起尺寸，避免反复展开后逐次增宽。
  const anchor = compactBounds ?? { ...panel.getBounds(), ...panelSize }
  const area = screen.getDisplayMatching(anchor).bounds
  const target = expanded
    ? { x: anchor.x + anchor.width - 380, y: anchor.y + anchor.height - 300, width: 380, height: 300 }
    : anchor
  panel.setBounds(fitBounds(target, area))
  compactBounds = expanded ? anchor : null
  return expanded
}

// Electron 的工作区和窗口坐标均为逻辑像素，可直接用于不同缩放比例的显示器。
function keepPanelVisible(): void {
  if (!panel) return
  const bounds = panel.getBounds()
  // 用户可以把浮窗放在任务栏上，校正位置时使用整块屏幕的边界。
  const area = screen.getDisplayMatching(bounds).bounds
  const { x, y } = fitBounds(bounds, area)
  if (x !== bounds.x || y !== bounds.y) panel.setPosition(x, y)
}

async function createPanel(): Promise<void> {
  const area = screen.getPrimaryDisplay().workArea
  const bounds = {
    ...panelSize,
    x: area.x + Math.max(0, area.width - panelSize.width - margin),
    y: area.y + Math.max(0, area.height - panelSize.height - margin)
  }
  const win = new BrowserWindow({
    ...bounds,
    title: 'BTC Float',
    frame: false,
    thickFrame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    skipTaskbar: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  panel = win
  win.setAlwaysOnTop(true, 'pop-up-menu')
  win.removeMenu()
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://www.tradingview.com/')) {
      void shell.openExternal(url).catch(error => console.warn('无法打开图表来源', error))
    }
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event) => event.preventDefault())
  win.once('ready-to-show', () => {
    // Windows 创建无边框窗口时可能增加边距，在首次显示前校准实际尺寸。
    win.setBounds(bounds)
    win.showInactive()
  })
  win.once('closed', () => { panel = null })

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (!app.isPackaged && devUrl) await win.loadURL(devUrl)
  else await win.loadFile(join(__dirname, '../renderer/index.html'))
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => panel?.show())
  app.on('window-all-closed', () => app.quit())
  app.whenReady().then(async () => {
    ipcMain.on(closeWindowChannel, (event) => {
      if (panel && event.senderFrame === panel.webContents.mainFrame) panel.close()
    })
    ipcMain.handle(expandWindowChannel, (event, expanded: unknown) => {
      if (!panel || event.senderFrame !== panel.webContents.mainFrame || typeof expanded !== 'boolean') return false
      return setExpanded(expanded)
    })
    ipcMain.on(moveWindowChannel, (event, x: number, y: number) => {
      if (!panel || compactBounds || event.senderFrame !== panel.webContents.mainFrame) return
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > panelSize.width || y > panelSize.height) return
      const cursor = screen.getCursorScreenPoint()
      panel.setPosition(Math.round(cursor.x - x), Math.round(cursor.y - y))
    })
    screen.on('display-removed', keepPanelVisible)
    screen.on('display-metrics-changed', keepPanelVisible)
    await createPanel()
  }).catch((error: unknown) => {
    console.error('BTC Float 启动失败', error)
    app.exit(1)
  })
}
