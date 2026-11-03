/**
 * Plugins from other extensions (see packages/sdk). They register with the
 * background worker, the user approves them in the palette, and the palette
 * then asks them for items and to run commands over chrome.runtime messaging.
 *
 * Everything a plugin sends is untrusted: it's checked and trimmed here.
 */
import {
  PROTOCOL,
  type ItemData,
  type PluginStatus,
  type Registration,
  type SourceData,
  type ToPlugin,
} from "@palette/sdk"

export interface StoredPlugin extends Registration {
  /** The plugin's extension ID. */
  id: string
  status: PluginStatus
  updatedAt: number
}

/** Each plugin has its own key, so one plugin can't make the others' writes fail. */
const PREFIX = "externalPlugin:"
const MODES = ["tabs", "commands"]

/** Limits on what a plugin may store, before it's approved or not. */
export const MAX_ICON = 16_000
export const MAX_REGISTRATION = 256_000

const key = (id: string) => PREFIX + id

async function readPlugins(): Promise<Record<string, StoredPlugin>> {
  const all = await chrome.storage.local.get(null)
  return Object.fromEntries(
    Object.entries(all)
      .filter(([k]) => k.startsWith(PREFIX))
      .map(([k, plugin]) => [k.slice(PREFIX.length), plugin as StoredPlugin]),
  )
}

// Sources call getPlugins() on every keystroke, so the list is kept in memory
// until storage changes.
let cache: Promise<StoredPlugin[]> | undefined
let watching = false

export function getPlugins(): Promise<StoredPlugin[]> {
  if (!watching) {
    watching = true
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && Object.keys(changes).some((k) => k.startsWith(PREFIX))) cache = undefined
    })
  }
  if (!cache) {
    const read = readPlugins().then(Object.values)
    cache = read
    read.catch(() => {
      if (cache === read) cache = undefined
    })
  }
  return cache
}

async function update(fn: (plugins: Record<string, StoredPlugin>) => void) {
  const before = await readPlugins()
  const plugins = structuredClone(before)
  fn(plugins)
  const removed = Object.keys(before).filter((id) => !(id in plugins))
  const changed = Object.entries(plugins).filter(([id, p]) => JSON.stringify(p) !== JSON.stringify(before[id]))
  try {
    if (removed.length) await chrome.storage.local.remove(removed.map(key))
    if (changed.length) await chrome.storage.local.set(Object.fromEntries(changed.map(([id, p]) => [key(id), p])))
  } finally {
    cache = undefined
  }
  await updateBadge()
}

/** Store a registration. New plugins wait for approval; re-registering keeps the decision. */
export async function savePlugin(id: string, registration: Registration): Promise<PluginStatus> {
  let status: PluginStatus = "pending"
  await update((plugins) => {
    status = plugins[id]?.status ?? "pending"
    plugins[id] = { ...registration, id, status, updatedAt: Date.now() }
  })
  return status
}

export const setStatus = (id: string, status: PluginStatus) =>
  update((plugins) => {
    if (plugins[id]) plugins[id].status = status
  })

export const removePlugin = (id: string) =>
  update((plugins) => {
    delete plugins[id]
  })

/** Count of plugins waiting for approval, on the toolbar icon. */
export async function updateBadge() {
  const pending = (await getPlugins()).filter((p) => p.status === "pending").length
  await chrome.action.setBadgeText({ text: pending ? String(pending) : "" })
}

/** Send a request to a plugin. Slow or missing plugins fail instead of holding up the palette. */
export async function request<T>(pluginId: string, message: DistributiveOmit<ToPlugin, "palette">, timeout = 1500): Promise<T> {
  const reply = await Promise.race([
    chrome.runtime.sendMessage(pluginId, { palette: PROTOCOL, ...message }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Plugin timed out")), timeout)),
  ])
  if (reply && typeof reply === "object" && "error" in reply) throw new Error(String(reply.error))
  return reply as T
}

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never

// Validation

const text = (value: unknown, max: number) =>
  typeof value === "string" && value.trim() ? value.slice(0, max) : undefined

/** Icons may only be inline images or files from the plugin itself, so they can't track the user. */
function icon(value: unknown, pluginId: string) {
  // Dropped rather than cut: a cut data: URL is a broken image.
  if (typeof value === "string" && value.length > MAX_ICON) return undefined
  const url = text(value, MAX_ICON)
  if (url?.startsWith("data:image/") || url?.startsWith(`chrome-extension://${pluginId}/`)) return url
  return undefined
}

export function cleanItem(raw: unknown, pluginId: string): ItemData | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const item = raw as Record<string, unknown>
  const id = text(item.id, 200)
  const title = text(item.title, 200)
  if (!id || !title) return undefined
  return {
    id,
    title,
    subtitle: text(item.subtitle, 300),
    icon: icon(item.icon, pluginId),
    keywords: Array.isArray(item.keywords)
      ? item.keywords.slice(0, 20).map((k) => text(k, 100)).filter((k) => k !== undefined)
      : undefined,
    group: text(item.group, 60),
    hint: text(item.hint, 40),
    shortcut: text(item.shortcut, 40),
    alwaysShow: item.alwaysShow === true,
    hasChildren: item.hasChildren === true,
    childrenPlaceholder: text(item.childrenPlaceholder, 100),
  }
}

export function cleanItems(raw: unknown, pluginId: string): ItemData[] {
  if (!Array.isArray(raw)) return []
  return raw
    .slice(0, 500)
    .map((item) => cleanItem(item, pluginId))
    .filter((item) => item !== undefined)
}

/** Why a registration is too large to store, if it is. Checked before cleaning it. */
export function registrationError(raw: unknown): string | undefined {
  let size: number
  try {
    size = new TextEncoder().encode(JSON.stringify(raw) ?? "").length
  } catch {
    return "Invalid registration"
  }
  if (size > MAX_REGISTRATION) {
    return `Registration is too large (${Math.ceil(size / 1000)} KB, the limit is ${MAX_REGISTRATION / 1000} KB)`
  }
  const commands = (raw as { commands?: unknown } | null)?.commands
  for (const command of Array.isArray(commands) ? commands : []) {
    const { id, icon } = (command ?? {}) as Record<string, unknown>
    if (typeof icon === "string" && icon.length > MAX_ICON) {
      return `Icon of command “${String(id).slice(0, 100)}” is too large (the limit is ${MAX_ICON / 1000} KB)`
    }
  }
  return undefined
}

export function cleanRegistration(raw: unknown, pluginId: string): Registration | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const plugin = raw as Record<string, unknown>
  const name = text(plugin.name, 60)
  if (!name) return undefined
  const sources: SourceData[] = Array.isArray(plugin.sources)
    ? plugin.sources
        .slice(0, 20)
        .map((s: Record<string, unknown>) => ({
          id: text(s?.id, 100) ?? "",
          mode: s?.mode as SourceData["mode"],
          dynamic: s?.dynamic === true,
        }))
        .filter((s) => s.id && MODES.includes(s.mode))
    : []
  return {
    name,
    description: text(plugin.description, 200),
    commands: cleanItems(plugin.commands, pluginId),
    sources,
  }
}
