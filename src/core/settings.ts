/**
 * User settings, synced across devices with chrome.storage.sync.
 * For now: which plugins are turned on.
 */
import type { Plugin } from "./types"

const KEY = "settings"

export interface Settings {
  /** Plugin id → on/off, for plugins the user has toggled. Others use their default. */
  plugins: Record<string, boolean>
}

const DEFAULTS: Settings = { plugins: {} }

export async function getSettings(): Promise<Settings> {
  const { [KEY]: stored } = await chrome.storage.sync.get(KEY)
  return { ...DEFAULTS, ...(stored as Partial<Settings> | undefined) }
}

export async function setPluginEnabled(id: string, enabled: boolean) {
  const settings = await getSettings()
  await chrome.storage.sync.set({ [KEY]: { ...settings, plugins: { ...settings.plugins, [id]: enabled } } })
}

export function isEnabled(plugin: Plugin, settings: Settings): boolean {
  if (plugin.category === "core") return true
  return settings.plugins[plugin.id] ?? plugin.enabledByDefault ?? true
}

export function onSettingsChanged(listener: (settings: Settings) => void) {
  const handler = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === "sync" && KEY in changes) void getSettings().then(listener)
  }
  chrome.storage.onChanged.addListener(handler)
  return () => chrome.storage.onChanged.removeListener(handler)
}
