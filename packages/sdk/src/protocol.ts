/**
 * Messages between Palette and plugin extensions. Everything here is plain
 * JSON, because it goes through chrome.runtime messaging.
 *
 * Plugins send `ToPalette` messages to Palette's extension ID. Palette sends
 * `ToPlugin` messages back to the plugin's ID, with `chrome.runtime.sendMessage`.
 */

/** Bumped on breaking changes. Every message carries it as `palette`. */
export const PROTOCOL = 1

/**
 * Palette's extension ID when loaded unpacked (pinned by the manifest `key`).
 * TODO: switch to the Chrome Web Store ID once published.
 */
export const PALETTE_ID = "jcjopjoglbklaejmahmfnhmanfoomnpk"

/** Built-in modes: ⌘⇧P lists "tabs", ⌘⇧K lists "commands". */
export type ModeId = "tabs" | "commands"

export interface ItemData {
  /** Unique within the plugin. */
  id: string
  title: string
  subtitle?: string
  /**
   * A `data:image/...` URL, or a `chrome-extension://<your id>/...` URL listed
   * in your manifest's web_accessible_resources for Palette's ID.
   */
  icon?: string
  /** Extra words to match on when searching. */
  keywords?: string[]
  /** Group heading. Defaults to the plugin's name. */
  group?: string
  /** Muted text on the right. */
  hint?: string
  /** Shortcut shown next to the item, e.g. "mod+shift+u". Display only. */
  shortcut?: string
  /** Show regardless of the query. */
  alwaysShow?: boolean
  /** Picking the item opens a nested list, fetched with a "children" request. */
  hasChildren?: boolean
  childrenPlaceholder?: string
}

export interface SourceData {
  id: string
  mode: ModeId
  /**
   * Ask again on every keystroke. Otherwise asked once when the palette opens.
   * Needs `access.query`: without it, Palette treats the source as static.
   */
  dynamic?: boolean
}

/**
 * What Palette sends with each request. Ask only for what you need: the user
 * sees this when approving the plugin. By default, plugins see neither.
 */
export interface PluginAccess {
  /**
   * The tab the palette was opened from. "origin" sends only the site, e.g.
   * `https://example.com`. "url" adds the full address, title and tab IDs.
   * Defaults to "none".
   */
  tab?: "none" | "origin" | "url"
  /** What the user types in the palette. Without it, `query` is always empty. */
  query?: boolean
}

export interface Registration {
  name: string
  description?: string
  /** Static commands, listed under ⌘⇧K. */
  commands: ItemData[]
  sources: SourceData[]
  access?: PluginAccess
}

/** The tab the palette was opened from, as much as `access.tab` allows. */
export interface TabInfo {
  /** The site, e.g. `https://example.com`. Sent with "origin" and "url" access. */
  origin?: string
  /** The rest is sent with "url" access only. */
  id?: number
  windowId?: number
  url?: string
  title?: string
}

/** What Palette should do after a command runs. Plugins can't touch the clipboard from a service worker, so Palette does it. */
export interface Effect {
  /** Copy this text to the clipboard. */
  copy?: string
  /** Open an http(s) URL, in the current tab unless `newTab`. */
  open?: string
  newTab?: boolean
  /** Keep the palette open and reload its items. */
  keepOpen?: boolean
}

export type PluginStatus = "pending" | "allowed" | "denied"

// Plugin → Palette

export type ToPalette =
  | { palette: typeof PROTOCOL; type: "register"; plugin: Registration }
  | { palette: typeof PROTOCOL; type: "unregister" }

export type RegisterResponse = { ok: true; status: PluginStatus } | { ok: false; error: string }

// Palette → plugin

interface Request {
  palette: typeof PROTOCOL
  /** Empty unless the plugin declared `access.query`. */
  query: string
  /** Missing unless the plugin declared `access.tab`. */
  tab?: TabInfo
}

export type ToPlugin =
  | (Request & { type: "items"; source: string })
  | (Request & { type: "children"; id: string })
  /** `source` or `parent` says where the item came from, in case the plugin has to rebuild it. */
  | (Request & { type: "run"; id: string; source?: string; parent?: string })

export interface ItemsResponse {
  items: ItemData[]
}

export interface RunResponse {
  effect?: Effect
}
