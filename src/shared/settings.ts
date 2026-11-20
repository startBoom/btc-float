export const intervals = ['1m', '5m', '15m', '1h'] as const;
export type Interval = (typeof intervals)[number];

export const opacityOptions = [100, 90, 80, 70, 60] as const;

export const defaultPreferences = {
  alwaysOnTop: true,
  opacity: 100 as (typeof opacityOptions)[number],
  interval: '15m' as Interval,
  startExpanded: false,
};

export type FloatPreferences = typeof defaultPreferences;
export type FloatSettings = FloatPreferences & { openAtLogin: boolean };
export type SettingChange = {
  [Key in keyof FloatSettings]: { key: Key; value: FloatSettings[Key] };
}[keyof FloatSettings];
