/**
 * Plugins from other extensions (see packages/sdk). They register with the
 * background worker, the user approves them in settings, and the palette
 * then asks them for items and to run commands over chrome.runtime messaging.
 *
 * Everything a plugin sends is untrusted: it's checked and trimmed here.
 */
import {
  PROTOCOL,
  type ItemData,
  type ModeId,
  type PluginAccess,
  type PluginStatus,
  type Registration,
  type SourceData,
  type TabInfo,
  type ToPlugin,
} from "@palette/sdk"
import type { PaletteContext } from "./types"

export interface StoredPlugin extends Registration {
  /** The plugin's extension ID. */
  id: string
  status: PluginStatus
  updatedAt: number
  /** What the user saw when they allowed it. Missing on plugins stored before this was recorded. */
  approved?: Approval
}

/** What a plugin can see. Growing any of it needs the user's approval again. */
export interface Capabilities {
  /** Modes its sources list items in. */
  modes: ModeId[]
  /** Whether any source is asked on every keystroke. */
  dynamic: boolean
  /** How much of the current tab it sees. Missing on approvals recorded before access existed. */
  tab?: TabAccess
  /** Whether it sees what the user types. */
  query?: boolean
}

type TabAccess = NonNullable<PluginAccess["tab"]>

export interface Approval extends Capabilities {
  name: string
}

export const capabilities = (registration: Registration): Capabilities => ({
  modes: [...new Set(registration.sources.map((s) => s.mode))].sort(),
  dynamic: registration.sources.some((s) => s.dynamic),
  tab: registration.access?.tab ?? "none",
  query: registration.access?.query === true,
})

/** Whether `next` can do something `approved` couldn't. */
export const exceeds = (next: Capabilities, approved: Capabilities) =>
  next.modes.some((mode) => !approved.modes.includes(mode)) ||
  (next.dynamic && !approved.dynamic) ||
  TAB_ACCESS.indexOf(next.tab ?? "none") > TAB_ACCESS.indexOf(approved.tab ?? "none") ||
  (next.query === true && approved.query !== true)

const approval = (registration: Registration): Approval => ({ name: registration.name, ...capabilities(registration) })

/**
 * The status after a plugin registers again. Allowed plugins go back to
 * pending if they rename themselves or ask for more than the user approved.
 */
export function nextStatus(stored: StoredPlugin | undefined, registration: Registration): PluginStatus {
  if (stored?.status !== "allowed") return stored?.status ?? "pending"
  const approved = stored.approved ?? approval(stored)
  const changed = registration.name !== approved.name || exceeds(capabilities(registration), approved)
  return changed ? "pending" : "allowed"
}

/** Each plugin has its own key, so one plugin can't make the others' writes fail. */
const PREFIX = "externalPlugin:"
const MODES = ["tabs", "commands"]
/** From least to most. */
const TAB_ACCESS = ["none", "origin", "url"]

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

/**
 * Store a registration. New plugins wait for approval; re-registering keeps
 * the decision, unless the plugin asks for more than it was allowed (see `nextStatus`).
 */
export async function savePlugin(id: string, registration: Registration): Promise<PluginStatus> {
  let status: PluginStatus = "pending"
  await update((plugins) => {
    const stored = plugins[id]
    status = nextStatus(stored, registration)
    const approved = status === "allowed" ? (stored.approved ?? approval(stored)) : undefined
    plugins[id] = { ...registration, id, status, updatedAt: Date.now(), approved }
  })
  return status
}

/** Allowing a plugin records what the user approved, so registering with more asks again. */
export const setStatus = (id: string, status: PluginStatus) =>
  update((plugins) => {
    const plugin = plugins[id]
    if (!plugin) return
    plugin.status = status
    plugin.approved = status === "allowed" ? approval(plugin) : undefined
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

// Access

/** The query and tab to send a plugin, limited to what it declared. Anything else gets nothing. */
export function shared(access: PluginAccess | undefined, { tab, query }: Pick<PaletteContext, "tab" | "query">) {
  return { query: access?.query === true ? query : "", tab: tabInfo(tab, access) }
}

export function tabInfo(tab: chrome.tabs.Tab | undefined, access: PluginAccess | undefined): TabInfo | undefined {
  if (!tab) return undefined
  const origin = originOf(tab.url)
  if (access?.tab === "url") return { origin, id: tab.id, windowId: tab.windowId, url: tab.url, title: tab.title }
  if (access?.tab === "origin") return origin ? { origin } : undefined
  return undefined
}

/** `https://example.com` for web pages. Pages without one (`chrome://`, `file://`, `data:`) give nothing. */
function originOf(url: string | undefined) {
  try {
    const origin = new URL(url ?? "").origin
    return origin === "null" ? undefined : origin
  } catch {
    return undefined
  }
}

const TAB_TEXT: Record<string, string> = {
  origin: "the current tab's site",
  url: "the current tab's address and title",
}

/** What a plugin sees, in words, for the approval prompt and the settings page. */
export function describeAccess(access: PluginAccess | undefined) {
  const seen = [TAB_TEXT[access?.tab ?? "none"], access?.query ? "what you type in the palette" : undefined]
  const parts = seen.filter((part) => part !== undefined)
  return parts.length ? `Sees ${parts.join(", and ")}` : "Doesn't see your tabs or what you type"
}

// Validation

/**
 * Control characters, bidi marks, embeddings, overrides and isolates, and
 * zero-width characters. Plugins could use them to disguise their name or
 * hide text, so they're removed from every string a plugin sends.
 */
// oxlint-disable-next-line no-control-regex
const HIDDEN = /[\u0000-\u001F\u007F-\u009F؜​-‏‪-‮⁠⁦-⁩﻿]/g

const text = (value: unknown, max: number) => {
  const clean = typeof value === "string" ? value.replace(HIDDEN, "").trim() : ""
  return clean ? clean.slice(0, max) : undefined
}

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
  const access = (plugin.access && typeof plugin.access === "object" ? plugin.access : {}) as Record<string, unknown>
  return {
    name,
    description: text(plugin.description, 200),
    commands: cleanItems(plugin.commands, pluginId),
    sources,
    access: {
      tab: TAB_ACCESS.includes(access.tab as string) ? (access.tab as PluginAccess["tab"]) : "none",
      query: access.query === true,
    },
  }
}
