import { app } from 'electron'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  defaultPreferences, intervals, opacityOptions, isCoin,
  type FloatPreferences, type FloatSettings, type SettingChange,
} from '../shared/settings'

function normalize(raw: unknown): FloatPreferences {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Partial<FloatPreferences>
  return {
    alwaysOnTop: typeof value.alwaysOnTop === 'boolean' ? value.alwaysOnTop : defaultPreferences.alwaysOnTop,
    opacity: value.opacity !== undefined && opacityOptions.includes(value.opacity) ? value.opacity : defaultPreferences.opacity,
    interval: value.interval !== undefined && intervals.includes(value.interval) ? value.interval : defaultPreferences.interval,
    coin: isCoin(value.coin) ? value.coin : defaultPreferences.coin,
    startExpanded: typeof value.startExpanded === 'boolean' ? value.startExpanded : defaultPreferences.startExpanded,
  }
}

export function createSettingsStore() {
  const directory = app.getPath('userData')
  const file = join(directory, 'settings.json')
  const loginItem = {
    name: app.isPackaged ? 'BTC Float' : 'BTC Float (dev)',
    path: process.execPath,
    args: app.isPackaged ? [] : [`"${app.getAppPath()}"`],
  }
  let preferences = { ...defaultPreferences }
  try {
    preferences = normalize(JSON.parse(readFileSync(file, 'utf8')))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('读取设置失败，采用默认值', error)
  }

  function get(): FloatSettings {
    const login = app.getLoginItemSettings(loginItem)
    const enabled = login.launchItems.some(item => item.name === loginItem.name && item.scope === 'user' && item.enabled)
    return { ...preferences, openAtLogin: login.openAtLogin && enabled }
  }

  function update(raw: unknown): FloatSettings {
    if (!raw || typeof raw !== 'object') throw new Error('设置参数无效')
    const { key, value } = raw as SettingChange
    if (key === 'openAtLogin') {
      if (typeof value !== 'boolean') throw new Error('自启动设置无效')
      app.setLoginItemSettings({ ...loginItem, openAtLogin: value })
      const current = get()
      if (current.openAtLogin !== value) throw new Error('Windows 未应用自启动设置')
      return current
    }

    if (typeof key !== 'string' || !Object.hasOwn(defaultPreferences, key)) throw new Error('设置项无效')
    const next = normalize({ ...preferences, [key]: value })
    if (next[key] !== value) throw new Error('设置值无效')
    if (preferences[key] !== value) {
      mkdirSync(directory, { recursive: true })
      // 先写入临时文件，避免进程意外终止时留下半截 JSON。
      const temporary = `${file}.tmp`
      writeFileSync(temporary, JSON.stringify(next, null, 2), 'utf8')
      renameSync(temporary, file)
      preferences = next
    }
    return get()
  }

  return { get, update }
}
