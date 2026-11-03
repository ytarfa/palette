import { beforeEach, describe, expect, it } from "vitest"
import { commandsFor, context, mockChrome, run, titles } from "@/test/site"
import figma, { cleanTitle, parse } from "./figma"

const KEY = "Xk2pQ9rTbN4mW7vLcY3sHd"
const BASE = `https://www.figma.com/design/${KEY}/Checkout-flow`
const DESIGN = `${BASE}?node-id=12-34&t=aB3dEfGh1JkLmN0p-4`
const TITLE = "Checkout flow – Figma"

let chrome: ReturnType<typeof mockChrome>
beforeEach(() => {
  chrome = mockChrome()
})

describe("figma", () => {
  it("only runs on figma.com", async () => {
    expect(await commandsFor(figma, "https://www.figma.com.evil.com/design/abc")).toEqual([])
    expect(await commandsFor(figma, "https://evil-figma.com/files/recents-and-sharing")).toEqual([])
    expect(await commandsFor(figma, "https://example.com")).toEqual([])
    expect(await commandsFor(figma, "https://figma.com/files/recents-and-sharing")).not.toEqual([])
  })

  it("parses design, FigJam, prototype and Slides URLs", () => {
    expect(parse(new URL(DESIGN))).toEqual({ type: "design", key: KEY, branch: undefined, slug: "Checkout-flow", node: "12-34" })
    expect(parse(new URL(`https://www.figma.com/file/${KEY}/Old-file`))?.type).toBe("file")
    expect(parse(new URL(`https://www.figma.com/board/${KEY}/Retro?node-id=0-1`))?.type).toBe("board")
    expect(parse(new URL(`https://www.figma.com/proto/${KEY}/Checkout-flow?node-id=1-2&scaling=min-zoom`))?.node).toBe("1-2")
    expect(parse(new URL(`https://www.figma.com/slides/${KEY}/Q3-review`))?.type).toBe("slides")
    expect(parse(new URL(`https://www.figma.com/design/${KEY}/branch/Br4nchK3yAbC12/Checkout-flow`))).toMatchObject({ branch: "Br4nchK3yAbC12", slug: "Checkout-flow" })
    expect(parse(new URL("https://www.figma.com/slides/"))).toBeUndefined()
    expect(parse(new URL("https://www.figma.com/slides/new"))).toBeUndefined()
    expect(parse(new URL("https://www.figma.com/files/recents-and-sharing"))).toBeUndefined()
  })

  it("cleans the tab title", () => {
    expect(cleanTitle(TITLE)).toBe("Checkout flow")
    expect(cleanTitle("Sprint retro – FigJam")).toBe("Sprint retro")
    expect(cleanTitle("", "Checkout-flow")).toBe("Checkout flow")
  })

  it("lists commands for the selection and file first", async () => {
    const items = await commandsFor(figma, DESIGN, { title: TITLE })
    expect(titles(items)).toEqual([
      "Copy link to selection", "Copy link", "Copy as Markdown link", "Copy file key", "Switch to Dev Mode",
      "Present prototype", "Open in desktop app", "Recents", "New design file", "New FigJam board", "New slide deck",
    ])
    expect(items.every((i) => i.group === "Figma")).toBe(true)
  })

  it("copies clean links without share params", async () => {
    const items = await commandsFor(figma, DESIGN, { title: TITLE })
    expect((await run(items, "copy-node-link")).copied).toEqual([`${BASE}?node-id=12-34`])
    expect((await run(items, "copy-link")).copied).toEqual([BASE])
    expect((await run(items, "copy-markdown")).copied).toEqual([`[Checkout flow](${BASE})`])
    expect((await run(items, "copy-key")).copied).toEqual([KEY])
  })

  it("switches between Dev Mode and Design mode", async () => {
    await run(await commandsFor(figma, DESIGN), "dev-mode")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: `${BASE}?node-id=12-34&m=dev` })
    const dev = await commandsFor(figma, `${BASE}?node-id=12-34&m=dev`)
    expect(titles(dev)).not.toContain("Switch to Dev Mode")
    await run(dev, "design-mode")
    expect(chrome.tabs.update).toHaveBeenLastCalledWith(1, { url: `${BASE}?node-id=12-34` })
  })

  it("presents the prototype from the selected frame, in a new tab with ⌘↵", async () => {
    const items = await commandsFor(figma, DESIGN)
    const proto = `https://www.figma.com/proto/${KEY}/Checkout-flow?node-id=12-34`
    await run(items, "prototype")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: proto })
    await items.find((i) => i.id === "prototype")!.actions![0].run(context(DESIGN))
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: proto })
  })

  it("opens the desktop app", async () => {
    await run(await commandsFor(figma, DESIGN), "desktop-app", context(DESIGN))
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: `figma://file/${KEY}?node-id=12-34` })
  })

  it("goes back to the design file from a prototype", async () => {
    const items = await commandsFor(figma, `https://www.figma.com/proto/${KEY}/Checkout-flow?node-id=1-2&t=x9&scaling=min-zoom`)
    expect(titles(items)).not.toContain("Present prototype")
    await run(items, "design-file")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: `${BASE}?node-id=1-2` })
  })

  it("has no Dev Mode or prototype for FigJam boards", async () => {
    const board = `https://www.figma.com/board/${KEY}/Sprint-retro`
    const items = await commandsFor(figma, board, { title: "Sprint retro – FigJam" })
    expect(titles(items).slice(0, 4)).toEqual(["Copy link", "Copy as Markdown link", "Copy file key", "Open in desktop app"])
    expect((await run(items, "copy-markdown")).copied).toEqual([`[Sprint retro](${board})`])
  })

  it("only lists site-wide pages outside a file", async () => {
    const items = await commandsFor(figma, "https://www.figma.com/files/recents-and-sharing?fuid=1234567890")
    expect(titles(items)).toEqual(["Recents", "New design file", "New FigJam board", "New slide deck"])
    await run(items, "new-design")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: "https://figma.new" })
  })
})
