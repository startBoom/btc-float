import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  powerMonitor,
  screen,
  shell,
  type Rectangle,
} from 'electron';
import { join } from 'node:path';
import {
  closeWindowChannel,
  expandWindowChannel,
  getPanelStateChannel,
  getSettingsChannel,
  moveWindowChannel,
  panelActivityChannel,
  settingsChangedChannel,
  updateSettingsChannel,
  type PanelActivity,
} from '../shared/window';
import type { FloatPreferences } from '../shared/settings';
import { createSettingsStore } from './settings';
import { createTray } from './tray';

// 56 个逻辑像素可容纳 Windows 在不同 DPI 显示器间移动时施加的最小高度。
const panelSize = { width: 160, height: 56 };
const margin = 16;
let panel: BrowserWindow | null = null;
let compactBounds: Rectangle | null = null;
let settingsWindow: BrowserWindow | null = null;
let settings: ReturnType<typeof createSettingsStore>;
let tray: ReturnType<typeof createTray>;
let quitting = false;

function sendPanelActivity(activity: PanelActivity): void {
  if (panel && !panel.webContents.isDestroyed()) panel.webContents.send(panelActivityChannel, activity);
}

function applyPreferences(preferences: FloatPreferences): void {
  panel?.setAlwaysOnTop(preferences.alwaysOnTop, 'pop-up-menu');
  panel?.setOpacity(preferences.opacity / 100);
}

function updateSettings(change: unknown) {
  const current = settings.update(change);
  applyPreferences(current);
  tray.refresh(current);
  settingsWindow?.webContents.send(settingsChangedChannel, current);
  return current;
}

function loadRenderer(win: BrowserWindow, page = ''): Promise<void> {
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (!app.isPackaged && devUrl) {
    const url = new URL(devUrl);
    url.hash = page;
    return win.loadURL(url.href);
  }
  return win.loadFile(join(__dirname, '../renderer/index.html'), { hash: page });
}

async function openSettings(): Promise<void> {
  if (settingsWindow) {
    if (settingsWindow.isVisible()) settingsWindow.focus();
    return;
  }
  const win = new BrowserWindow({
    title: 'BTC Float 设置',
    width: 370,
    height: 390,
    useContentSize: true,
    autoHideMenuBar: true,
    backgroundColor: '#191d22',
    resizable: false,
    maximizable: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  settingsWindow = win;
  win.removeMenu();
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.once('ready-to-show', () => win.show());
  win.once('closed', () => { settingsWindow = null; });
  try {
    await loadRenderer(win, 'settings');
  } catch (error) {
    if (win.isDestroyed()) return;
    win.destroy();
    throw error;
  }
}

function fitBounds(bounds: Rectangle, area: Rectangle): Rectangle {
  const width = Math.min(bounds.width, area.width);
  const height = Math.min(bounds.height, area.height);
  const x = Math.max(area.x, Math.min(bounds.x, area.x + area.width - width));
  const y = Math.max(area.y, Math.min(bounds.y, area.y + area.height - height));
  return { x, y, width, height };
}

function setExpanded(expanded: boolean): boolean {
  if (!panel || expanded === Boolean(compactBounds))
    return Boolean(compactBounds);
  // 分数 DPI 下 getBounds() 可能向外取整。固定收起尺寸，避免反复展开后逐次增宽。
  const anchor = compactBounds ?? { ...panel.getBounds(), ...panelSize };
  const display = screen.getDisplayMatching(anchor);
  const area = expanded ? display.workArea : display.bounds;
  const target = expanded
    ? {
        x: anchor.x + anchor.width - 380,
        y: anchor.y + anchor.height - 300,
        width: 380,
        height: 300,
      }
    : anchor;
  panel.setBounds(fitBounds(target, area));
  compactBounds = expanded ? anchor : null;
  return expanded;
}

// Electron 的工作区和窗口坐标均为逻辑像素，可直接用于不同缩放比例的显示器。
function keepPanelVisible(): void {
  if (!panel) return;
  const bounds = panel.getBounds();
  // 用户可以把浮窗放在任务栏上，校正位置时使用整块屏幕的边界。
  const display = screen.getDisplayMatching(bounds);
  const area = compactBounds ? display.workArea : display.bounds;
  const { x, y } = fitBounds(bounds, area);
  if (x !== bounds.x || y !== bounds.y) panel.setPosition(x, y);
}

async function createPanel(): Promise<void> {
  const area = screen.getPrimaryDisplay().workArea;
  const bounds = {
    ...panelSize,
    x: area.x + Math.max(0, area.width - panelSize.width - margin),
    y: area.y + Math.max(0, area.height - panelSize.height - margin),
  };
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
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  panel = win;
  const preferences = settings.get();
  applyPreferences(preferences);
  if (preferences.startExpanded) {
    win.setBounds(bounds);
    setExpanded(true);
  }
  win.removeMenu();
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://www.tradingview.com/')) {
      void shell
        .openExternal(url)
        .catch((error) => console.warn('无法打开图表来源', error));
    }
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.once('ready-to-show', () => {
    // Windows 创建无边框窗口时可能增加边距，在首次显示前校准实际尺寸。
    if (!compactBounds) win.setBounds(bounds);
    win.showInactive();
  });
  win.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    win.hide();
  });
  win.on('show', () => {
    sendPanelActivity('shown');
    tray.refresh(settings.get());
  });
  win.on('hide', () => {
    sendPanelActivity('hidden');
    tray.refresh(settings.get());
  });
  win.once('closed', () => {
    panel = null;
  });

  await loadRenderer(win);
}

if (process.platform === 'win32' && app.isPackaged) app.setAppUserModelId('com.startboom.btcfloat');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => panel?.show());
  app.on('before-quit', () => { quitting = true; });
  app.on('will-quit', () => tray?.destroy());
  app
    .whenReady()
    .then(async () => {
      settings = createSettingsStore();
      tray = createTray({
        show: () => panel?.show(),
        hide: () => panel?.hide(),
        isVisible: () => panel?.isVisible() ?? false,
        openSettings: () => {
          void openSettings().catch(error => {
            console.error('打开设置失败', error);
            dialog.showErrorBox('BTC Float', '无法打开设置窗口。');
          });
        },
        update: change => {
          try {
            updateSettings(change);
          } catch (error) {
            console.error('保存设置失败', error);
            tray.refresh(settings.get());
            dialog.showErrorBox('BTC Float', '无法保存设置，请重试。');
          }
        },
        quit: () => app.quit(),
      });
      tray.refresh(settings.get());
      ipcMain.handle(getPanelStateChannel, (event) => {
        if (!panel || event.senderFrame !== panel.webContents.mainFrame)
          throw new Error('无权读取浮窗状态');
        return { expanded: Boolean(compactBounds), visible: panel.isVisible(), interval: settings.get().interval };
      });
      ipcMain.handle(getSettingsChannel, (event) => {
        if (!settingsWindow || event.senderFrame !== settingsWindow.webContents.mainFrame)
          throw new Error('无权读取设置');
        return settings.get();
      });
      ipcMain.handle(updateSettingsChannel, (event, change: unknown) => {
        if (!settingsWindow || event.senderFrame !== settingsWindow.webContents.mainFrame)
          throw new Error('无权修改设置');
        return updateSettings(change);
      });
      ipcMain.on(closeWindowChannel, (event) => {
        if (panel && event.senderFrame === panel.webContents.mainFrame)
          panel.close();
      });
      ipcMain.handle(expandWindowChannel, (event, expanded: unknown) => {
        if (
          !panel ||
          event.senderFrame !== panel.webContents.mainFrame ||
          typeof expanded !== 'boolean'
        )
          return false;
        return setExpanded(expanded);
      });
      ipcMain.on(moveWindowChannel, (event, x: number, y: number) => {
        if (
          !panel ||
          compactBounds ||
          event.senderFrame !== panel.webContents.mainFrame
        )
          return;
        if (
          !Number.isFinite(x) ||
          !Number.isFinite(y) ||
          x < 0 ||
          y < 0 ||
          x > panelSize.width ||
          y > panelSize.height
        )
          return;
        const cursor = screen.getCursorScreenPoint();
        panel.setPosition(Math.round(cursor.x - x), Math.round(cursor.y - y));
      });
      screen.on('display-removed', keepPanelVisible);
      screen.on('display-metrics-changed', keepPanelVisible);
      powerMonitor.on('resume', () => sendPanelActivity('resume'));
      await createPanel();
    })
    .catch((error: unknown) => {
      console.error('BTC Float 启动失败', error);
      app.exit(1);
    });
}
