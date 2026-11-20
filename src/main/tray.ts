import { Menu, Tray, type MenuItemConstructorOptions } from 'electron'
import { opacityOptions, type FloatSettings, type SettingChange } from '../shared/settings'
import icon from './tray.png?asset'

interface TrayActions {
  show: () => void
  hide: () => void
  isVisible: () => boolean
  openSettings: () => void
  update: (change: SettingChange) => void
  quit: () => void
}

export function createTray(actions: TrayActions) {
  const tray = new Tray(icon)
  tray.setToolTip('BTC Float')
  tray.on('click', actions.show)

  function refresh(settings: FloatSettings) {
    const visible = actions.isVisible()
    const opacityMenu = opacityOptions.map((opacity): MenuItemConstructorOptions => ({
      label: `${opacity}%`,
      type: 'radio',
      checked: settings.opacity === opacity,
      click: () => actions.update({ key: 'opacity', value: opacity }),
    }))
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '显示浮窗', enabled: !visible, click: actions.show },
      { label: '隐藏浮窗', enabled: visible, click: actions.hide },
      { type: 'separator' },
      { label: '开机启动', type: 'checkbox', checked: settings.openAtLogin,
        click: item => actions.update({ key: 'openAtLogin', value: item.checked }) },
      { label: '窗口不透明度', submenu: opacityMenu },
      { label: '设置…', click: actions.openSettings },
      { type: 'separator' },
      { label: '退出 BTC Float', click: actions.quit },
    ]))
  }

  return { refresh, destroy: () => tray.destroy() }
}
