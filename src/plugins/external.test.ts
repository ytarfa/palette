import { beforeEach, describe, expect, it, vi } from "vitest"
import type { PaletteContext } from "@/core/types"
import { context, mockChrome } from "@/test/site"
import { externalPlugins, MAX_COPY } from "./external"
// Registers the built-in plugins, whose names plugin items can't use.
import "./index"

let replies: Record<string, unknown>

type Listener = (changes: Record<string, unknown>, area: string) => void
/** Storage listeners outlive each test's chrome mock, like the plugin list cache they clear. */
const listeners: Listener[] = []

/** One allowed plugin, answering each request type with `replies[type]`. */
function installPlugin(name: string, commands: unknown[] = []) {
  const plugin = { id: "ext", name, status: "allowed", commands, sources: [{ id: "s", mode: "tabs" }] }
  const chrome = Object.assign(mockChrome(), {
    storage: {
      local: { get: vi.fn(async () => ({ "externalPlugin:ext": plugin })) },
      onChanged: { addListener: (listener: Listener) => listeners.push(listener) },
    },
  })
  chrome.runtime = Object.assign(chrome.runtime, {
    sendMessage: vi.fn(async (_id: string, message: { type: string }) => replies[message.type]),
  })
  for (const listener of listeners) listener({ "externalPlugin:ext": {} }, "local")
  return chrome
}

async function items(mode: string, ctx: PaletteContext = context("https://example.com")) {
  const sources = (externalPlugins.sources ?? []).filter((s) => s.mode === mode && !s.dynamic)
  return (await Promise.all(sources.map((s) => s.items(ctx)))).flat()
}

beforeEach(() => {
  replies = {}
})

describe("plugin items", () => {
  it("are grouped under the plugin's name", async () => {
    installPlugin("Snippets", [
      { id: "a", title: "Email signature" },
      { id: "b", title: "Address", group: "Personal" },
      { id: "c", title: "Close tab", group: "Tab" },
    ])
    expect((await items("commands")).map((i) => i.group)).toEqual(["Snippets", "Snippets · Personal", "Snippets"])
  })

  it("can't use a built-in plugin's name", async () => {
    installPlugin("GitHub", [{ id: "a", title: "Open pull requests", group: "GitHub" }])
    const [item] = await items("commands")
    expect(item.group).toBe("GitHub (plugin)")
    expect(item.keywords).toContain("GitHub (plugin)")
  })

  it("carry a badge in tabs mode, unlike real tabs", async () => {
    installPlugin("Tabs")
    replies.items = { items: [{ id: "gmail", title: "Gmail", hint: "Pinned", icon: "data:image/png;base64,AA" }] }
    const [item] = await items("tabs")
    expect(item).toMatchObject({ title: "Gmail", group: "Tabs (plugin)", badge: "Tabs (plugin)" })
  })

  it("have no badge in commands mode", async () => {
    installPlugin("Snippets", [{ id: "a", title: "Email signature" }])
    const [item] = await items("commands")
    expect(item.badge).toBeUndefined()
  })
})

describe("copy effect", () => {
  it("copies and says which plugin did", async () => {
    installPlugin("Snippets", [{ id: "a", title: "Email signature" }])
    replies.run = { effect: { copy: "Best, Sam" } }
    const [item] = await items("commands")
    const ctx = context("https://example.com")
    expect(await item.run!(ctx)).toEqual({ keepOpen: false, notice: "Copied by Snippets" })
    expect(ctx.copied).toEqual(["Best, Sam"])
  })

  it("skips text over the size limit", async () => {
    installPlugin("Snippets", [{ id: "a", title: "Email signature" }])
    replies.run = { effect: { copy: "x".repeat(MAX_COPY + 1) } }
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const [item] = await items("commands")
    const ctx = context("https://example.com")
    expect(await item.run!(ctx)).toEqual({ keepOpen: false, notice: undefined })
    expect(ctx.copied).toEqual([])
  })
})
