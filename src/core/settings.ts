/**
 * User settings, synced across devices with chrome.storage.sync.
 * For now: which plugins, and which of their commands, are turned on.
 */
import type { Command, Plugin } from "./types"

const KEY = "settings"

export interface Settings {
  /** Plugin id → on/off, for plugins the user has toggled. Others use their default. */
  plugins: Record<string, boolean>
  /** Command id ("plugin:command") → on/off, for commands the user has toggled. */
  commands: Record<string, boolean>
}

const DEFAULTS: Settings = { plugins: {}, commands: {} }

export async function getSettings(): Promise<Settings> {
  const { [KEY]: stored } = await chrome.storage.sync.get(KEY)
  return { ...DEFAULTS, ...(stored as Partial<Settings> | undefined) }
}

export async function setPluginEnabled(id: string, enabled: boolean) {
  const settings = await getSettings()
  await chrome.storage.sync.set({ [KEY]: { ...settings, plugins: { ...settings.plugins, [id]: enabled } } })
}

export async function setCommandEnabled(id: string, enabled: boolean) {
  const settings = await getSettings()
  await chrome.storage.sync.set({ [KEY]: { ...settings, commands: { ...settings.commands, [id]: enabled } } })
}

export function isEnabled(plugin: Plugin, settings: Settings): boolean {
  if (plugin.category === "core") return true
  return settings.plugins[plugin.id] ?? plugin.enabledByDefault ?? true
}

/** Whether one of a plugin's static `commands` is on. `id` is "plugin:command". */
export function isCommandEnabled(id: string, command: Command, settings: Settings): boolean {
  return settings.commands[id] ?? command.enabledByDefault ?? true
}

export function onSettingsChanged(listener: (settings: Settings) => void) {
  const handler = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === "sync" && KEY in changes) void getSettings().then(listener)
  }
  chrome.storage.onChanged.addListener(handler)
  return () => chrome.storage.onChanged.removeListener(handler)
}
