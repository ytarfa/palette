import type { LucideIcon } from "lucide-react"

/**
 * The plugin API. Everything the palette shows — tabs, commands, web search —
 * is contributed by a plugin. See `src/plugins` for examples.
 */

type Awaitable<T> = T | Promise<T>

/** A Lucide icon component, or an image URL (e.g. a favicon). */
export type Icon = LucideIcon | string

export interface PaletteContext {
  /** The tab that was active when the palette opened. */
  tab: chrome.tabs.Tab | undefined
  /** The current search text, without any mode prefix. */
  query: string
  /** Copy text to the clipboard. Works in both the in-page and popup palette. */
  copy(text: string): Promise<void>
}

/** Return `{ keepOpen: true }` to keep the palette open; items are then reloaded. */
export type RunResult = void | { keepOpen?: boolean }

export interface Command {
  /** Unique within its source. */
  id: string
  title: string
  subtitle?: string
  icon?: Icon
  /** Extra words to match on when searching. */
  keywords?: string[]
  /** Group heading. Items with the same group are listed together. */
  group?: string
  /** Muted text on the right, e.g. "Pinned". */
  hint?: string
  /** Show regardless of the query, e.g. "Search the web for …" fallbacks. */
  alwaysShow?: boolean
  /** Hide the command unless this returns true. */
  when?(ctx: PaletteContext): boolean
  run?(ctx: PaletteContext): Awaitable<RunResult>
  /**
   * Drill down into a nested list instead of running, like a VS Code quick pick.
   * Backspace on an empty query (or Escape) goes back.
   */
  children?: {
    placeholder?: string
    items(ctx: PaletteContext): Awaitable<Command[]>
  }
  /** Secondary actions on the highlighted item, triggered by their shortcut. */
  actions?: CommandAction[]
}

export interface CommandAction {
  id: string
  title: string
  /** e.g. "mod+backspace". `mod` is ⌘ on macOS and Ctrl elsewhere. */
  shortcut: string
  run(ctx: PaletteContext): Awaitable<RunResult>
}

export interface Mode {
  id: string
  name: string
  placeholder: string
  /** Typing this at the start of the query switches to the mode, like ">" in VS Code. */
  prefix?: string
  /** Shortcut that switches to this mode while the palette is focused. */
  shortcut?: string
}

export interface Source {
  /** Mode the items show up in. */
  mode: string
  /**
   * Re-run `items` whenever the query changes. Leave off for sources that
   * return everything up front and let the palette do the fuzzy filtering.
   */
  dynamic?: boolean
  items(ctx: PaletteContext): Awaitable<Command[]>
}

export interface Plugin {
  id: string
  name: string
  modes?: Mode[]
  /** Static commands, listed in the "commands" mode (⌘K). */
  commands?: Command[]
  /** Item providers for any mode. */
  sources?: Source[]
}

export function definePlugin(plugin: Plugin): Plugin {
  return plugin
}
