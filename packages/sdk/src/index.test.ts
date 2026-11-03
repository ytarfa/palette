import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { definePalettePlugin, PALETTE_ID, PROTOCOL, type Context } from "./index.js"
import { parseRequest } from "./request.js"

type Listener = (message: unknown, sender: { id?: string }, sendResponse: (r: unknown) => void) => unknown

let listener: Listener
beforeEach(() => {
  vi.stubGlobal("chrome", {
    runtime: {
      onMessageExternal: { addListener: (fn: Listener) => (listener = fn) },
      onInstalled: { addListener: () => {} },
      onStartup: { addListener: () => {} },
      sendMessage: async () => undefined,
    },
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const request = (fields: Record<string, unknown>) => ({ palette: PROTOCOL, query: "", ...fields })

describe("parseRequest", () => {
  it("accepts the documented requests", () => {
    const tab = { origin: "https://example.com", id: 1, windowId: 2, url: "https://example.com/", title: "Example" }
    expect(parseRequest(request({ type: "items", source: "s", tab }))).toEqual(
      request({ type: "items", source: "s", tab }),
    )
    expect(parseRequest(request({ type: "children", id: "a" }))).toMatchObject({ type: "children", id: "a" })
    expect(parseRequest(request({ type: "run", id: "a", source: "s", parent: "p" }))).toMatchObject({
      type: "run",
      id: "a",
      source: "s",
      parent: "p",
    })
  })

  it("keeps only the documented fields", () => {
    const parsed = parseRequest(
      request({ type: "run", id: "a", extra: 1, tab: { id: 1, url: "https://example.com/", cookies: "x" } }),
    )
    expect(parsed).not.toHaveProperty("extra")
    expect(parsed?.tab).toEqual({ id: 1, windowId: undefined, url: "https://example.com/", title: undefined })
  })

  it("drops malformed requests", () => {
    const malformed: unknown[] = [
      undefined,
      null,
      "run",
      [],
      { type: "run", id: "a", query: "" },
      request({ palette: 2, type: "run", id: "a" }),
      request({ type: "eval", id: "a" }),
      request({ type: "run" }),
      request({ type: "run", id: "" }),
      request({ type: "run", id: 1 }),
      request({ type: "run", id: { toString: () => "a" } }),
      request({ type: "run", id: "a", source: 1 }),
      request({ type: "run", id: "a", parent: null }),
      request({ type: "items" }),
      request({ type: "children" }),
      request({ type: "run", id: "a", query: undefined }),
      request({ type: "run", id: "a", query: ["a"] }),
      request({ type: "run", id: "a", tab: null }),
      request({ type: "run", id: "a", tab: "https://example.com/" }),
      request({ type: "run", id: "a", tab: [] }),
      request({ type: "run", id: "a", tab: { id: "1" } }),
      request({ type: "run", id: "a", tab: { id: 1.5 } }),
      request({ type: "run", id: "a", tab: { windowId: Number.NaN } }),
      request({ type: "run", id: "a", tab: { url: 1 } }),
      request({ type: "run", id: "a", tab: { origin: 1 } }),
      request({ type: "run", id: "a", tab: { title: {} } }),
    ]
    for (const message of malformed) expect(parseRequest(message), JSON.stringify(message)).toBeUndefined()
  })

  it("drops oversized fields", () => {
    expect(parseRequest(request({ type: "run", id: "a".repeat(201) }))).toBeUndefined()
    expect(parseRequest(request({ type: "items", source: "s".repeat(201) }))).toBeUndefined()
    expect(parseRequest(request({ type: "run", id: "a", query: "q".repeat(10_001) }))).toBeUndefined()
    expect(parseRequest(request({ type: "run", id: "a", tab: { url: "u".repeat(100_001) } }))).toBeUndefined()
    expect(parseRequest(request({ type: "run", id: "a", tab: { title: "t".repeat(10_001) } }))).toBeUndefined()
    expect(parseRequest(request({ type: "run", id: "a".repeat(200), query: "q".repeat(10_000) }))).toBeDefined()
  })
})

describe("definePalettePlugin", () => {
  const send = (message: unknown, sender = { id: PALETTE_ID }) => {
    let sendResponse!: (response: unknown) => void
    const response = new Promise((resolve) => (sendResponse = resolve))
    return { async: listener(message, sender, sendResponse), response }
  }

  it("answers requests from Palette with a cleaned context", async () => {
    const run = vi.fn((_ctx: Context) => ({ copy: "hi" }))
    definePalettePlugin({ name: "Test", commands: [{ id: "a", title: "A", run }] })
    const tab = { id: 1, url: "https://example.com/", secret: "x" }
    const { async, response } = send(request({ type: "run", id: "a", query: "q", tab }))
    expect(async).toBe(true)
    expect(await response).toEqual({ effect: { copy: "hi" } })
    expect(run.mock.calls[0][0]).toEqual({ query: "q", tab: { id: 1, url: "https://example.com/" } })
    expect(run.mock.calls[0][0].tab).not.toHaveProperty("secret")
  })

  it("ignores other senders and malformed requests without running anything", () => {
    const items = vi.fn(() => [])
    const run = vi.fn()
    definePalettePlugin({ name: "Test", commands: [{ id: "a", title: "A", run }], sources: [{ id: "s", mode: "commands", items }] })
    const sendResponse = vi.fn()
    expect(listener(request({ type: "run", id: "a" }), { id: "someone-else" }, sendResponse)).toBeUndefined()
    expect(listener(request({ type: "run", id: 1 }), { id: PALETTE_ID }, sendResponse)).toBeUndefined()
    expect(listener(request({ type: "items", source: "s", tab: "x" }), { id: PALETTE_ID }, sendResponse)).toBeUndefined()
    expect(listener(null, { id: PALETTE_ID }, sendResponse)).toBeUndefined()
    expect(sendResponse).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
    expect(items).not.toHaveBeenCalled()
  })

  it("honors the paletteId override", async () => {
    definePalettePlugin({ name: "Test", paletteId: "dev", commands: [{ id: "a", title: "A", run: () => {} }] })
    expect(send(request({ type: "run", id: "a" })).async).toBeUndefined()
    expect(await send(request({ type: "run", id: "a" }), { id: "dev" }).response).toEqual({ effect: undefined })
  })

  it("reports unknown commands as an error", async () => {
    definePalettePlugin({ name: "Test" })
    expect(await send(request({ type: "run", id: "missing" })).response).toEqual({
      error: "Error: Unknown command: missing",
    })
  })
})
