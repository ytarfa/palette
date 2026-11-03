/**
 * Test helpers for site plugins. See src/plugins/sites/github.test.ts.
 *
 *   const chrome = mockChrome()
 *   const items = await commandsFor(github, "https://github.com/acme/web/pull/1", { title: "…" })
 *   await run(items, "pr-files")
 *   expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: "…" })
 */
import { vi } from "vitest"
import type { Command, PaletteContext, Plugin } from "@/core/types"

/** Stub the chrome.* APIs plugins use. Returns the mocks to assert on. */
export function mockChrome() {
  const chrome = {
    tabs: { update: vi.fn(async () => ({})), create: vi.fn(async () => ({})) },
    scripting: { executeScript: vi.fn(async () => [{ result: undefined }]) },
    runtime: { getURL: (path: string) => `chrome-extension://test${path}` },
  }
  vi.stubGlobal("chrome", chrome)
  return chrome
}

interface Options {
  title?: string
  query?: string
}

/** A palette context for a tab (id 1) on `url`. Copied text is collected in `copied`. */
export function context(url: string, { title = "", query = "" }: Options = {}) {
  const copied: string[] = []
  const ctx: PaletteContext & { copied: string[] } = {
    tab: { id: 1, windowId: 1, index: 0, url, title, active: true } as chrome.tabs.Tab,
    query,
    copy: async (text) => void copied.push(text),
    copied,
  }
  return ctx
}

async function items(plugin: Plugin, dynamic: boolean, ctx: PaletteContext): Promise<Command[]> {
  const sources = (plugin.sources ?? []).filter((s) => s.mode === "commands" && !!s.dynamic === dynamic)
  const all = await Promise.all(sources.map((s) => s.items(ctx)))
  const commands = dynamic ? [] : (plugin.commands ?? [])
  return [...all.flat(), ...commands].filter((item) => !item.when || item.when(ctx))
}

/** The plugin's ⌘⇧K items on `url` with an empty query. */
export const commandsFor = (plugin: Plugin, url: string, options: Options = {}) =>
  items(plugin, false, context(url, options))

/** The plugin's query-dependent items on `url` for `query`. */
export const searchFor = (plugin: Plugin, url: string, query: string, options: Options = {}) =>
  items(plugin, true, context(url, { ...options, query }))

export const titles = (items: Command[]) => items.map((item) => item.title)

/** Run the item with this id. Returns the context, so `ctx.copied` can be checked. */
export async function run(items: Command[], id: string, ctx = context("https://example.com")) {
  const item = items.find((i) => i.id === id)
  if (!item?.run) throw new Error(`No runnable item "${id}" in: ${items.map((i) => i.id).join(", ")}`)
  await item.run(ctx)
  return ctx
}
