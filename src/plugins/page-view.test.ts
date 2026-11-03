import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { commandsFor, context, mockChrome, run, titles } from "@/test/site"
import pageView, { bylineOf, DARK_MODE_CSS, DARK_MODE_ID, extractArticle, PRINT_DELAY, READER_CSS, READER_TAG } from "./page-view"

const parsed = vi.hoisted(() => ({
  value: null as null | Record<string, string | null>,
  docs: [] as unknown[],
}))
vi.mock("@mozilla/readability", () => ({
  Readability: class {
    constructor(doc: unknown) {
      parsed.docs.push(doc)
    }
    parse = () => parsed.value
  },
}))

/** Just enough of a parsed Document for `extractArticle`. */
function fakeDocument(baseHref?: string) {
  const attrs = new Map<string, string>()
  const existing = baseHref && {
    getAttribute: () => baseHref,
    setAttribute: (name: string, value: string) => void attrs.set(name, value),
  }
  return {
    attrs,
    querySelector: () => existing || null,
    createElement: () => ({ setAttribute: (name: string, value: string) => void attrs.set(name, value) }),
    head: { prepend: vi.fn() },
  }
}

const PAGE = "https://example.com/blog/post?id=1"
const ARTICLE = {
  title: " A post ",
  byline: "Jane Doe",
  siteName: "Example Blog",
  content: "<div><p>Hello</p></div>",
  dir: "ltr",
  lang: "en",
}

let chrome: ReturnType<typeof mockChrome>
let doc: ReturnType<typeof fakeDocument>
beforeEach(() => {
  chrome = mockChrome()
  doc = fakeDocument()
  vi.stubGlobal("DOMParser", class {
    parseFromString = () => doc
  })
  parsed.value = ARTICLE
  parsed.docs = []
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const lastCall = () =>
  (chrome.scripting.executeScript.mock.lastCall as unknown as [{ func: (...args: unknown[]) => unknown; args: unknown[] }])[0]

describe("page view", () => {
  it("lists its commands on web pages only", async () => {
    const items = await commandsFor(pageView, PAGE)
    expect(titles(items)).toEqual(["Toggle reader view", "Toggle dark mode", "Print or save as PDF"])
    expect(items.map((i) => i.id)).toEqual(["reader-view", "dark-mode", "print"])
    expect(items.every((i) => i.group === "View")).toBe(true)
    expect(await commandsFor(pageView, "http://localhost:5173/")).toHaveLength(3)
    for (const url of ["chrome://extensions/", "about:blank", "file:///tmp/a.html", "chrome-extension://abc/options.html"]) {
      expect(await commandsFor(pageView, url)).toEqual([])
    }
  })

  it("closes an open reader view without parsing the page again", async () => {
    chrome.scripting.executeScript.mockResolvedValueOnce([{ result: null }] as never)
    await run(pageView.commands!, "reader-view", context(PAGE))
    expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(1)
    expect(lastCall().args).toEqual([READER_TAG])
    expect(parsed.docs).toEqual([])
  })

  it("extracts the article and shows it in the page", async () => {
    chrome.scripting.executeScript.mockResolvedValueOnce([{ result: "<html><body>…</body></html>" }] as never)
    await run(pageView.commands!, "reader-view", context(PAGE))
    expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(2)
    expect(lastCall().args).toEqual([
      READER_TAG,
      { title: "A post", byline: "Jane Doe · Example Blog", content: ARTICLE.content, dir: "ltr", lang: "en" },
      READER_CSS,
    ])
    expect(parsed.docs).toEqual([doc])
  })

  it("shows a message when there's no article", async () => {
    parsed.value = null
    chrome.scripting.executeScript.mockResolvedValueOnce([{ result: "<html></html>" }] as never)
    await run(pageView.commands!, "reader-view", context(PAGE))
    expect(lastCall().args).toEqual([READER_TAG, null, READER_CSS])
  })

  it("does nothing when the page can't be read", async () => {
    await run(pageView.commands!, "reader-view", context(PAGE))
    expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(1)
  })

  it("toggles the dark-mode stylesheet in the page", async () => {
    await run(pageView.commands!, "dark-mode", context(PAGE))
    expect(chrome.scripting.executeScript).toHaveBeenCalledWith(
      expect.objectContaining({ target: { tabId: 1 }, args: [DARK_MODE_ID, DARK_MODE_CSS] }),
    )
  })

  it("prints only after the palette has had time to close", async () => {
    await run(pageView.commands!, "print", context(PAGE))
    const { func, args } = lastCall()
    expect(args).toEqual([PRINT_DELAY])

    vi.useFakeTimers()
    const print = vi.fn()
    vi.stubGlobal("window", { print })
    func(...args)
    expect(print).not.toHaveBeenCalled()
    vi.advanceTimersByTime(PRINT_DELAY)
    expect(print).toHaveBeenCalledOnce()
  })
})

describe("extractArticle", () => {
  it("resolves links against the page URL", async () => {
    await extractArticle("<html></html>", PAGE)
    expect(doc.head.prepend).toHaveBeenCalledOnce()
    expect(doc.attrs.get("href")).toBe(PAGE)
  })

  it("keeps the page's own <base>, made absolute", async () => {
    doc = fakeDocument("../static/")
    await extractArticle("<html></html>", PAGE)
    expect(doc.head.prepend).not.toHaveBeenCalled()
    expect(doc.attrs.get("href")).toBe("https://example.com/static/")
  })

  it("drops empty fields", async () => {
    parsed.value = { title: "", byline: null, siteName: null, content: "<p>x</p>", dir: null, lang: null }
    expect(await extractArticle("<html></html>", PAGE)).toEqual({ content: "<p>x</p>" })
    parsed.value = { title: "T", byline: null, siteName: null, content: "", dir: null, lang: null }
    expect(await extractArticle("<html></html>", PAGE)).toBeNull()
  })
})

describe("bylineOf", () => {
  it("joins author and site, skipping blanks and repeats", () => {
    expect(bylineOf("Jane Doe", "Example News")).toBe("Jane Doe · Example News")
    expect(bylineOf(" Example News ", "Example News")).toBe("Example News")
    expect(bylineOf(null, "  ", undefined)).toBeUndefined()
  })
})

describe("styles", () => {
  it("inverts the page and turns media, the palette and the reader back", () => {
    expect(DARK_MODE_CSS).toContain("html { filter: invert(1) hue-rotate(180deg) !important; }")
    const reinverted = DARK_MODE_CSS.split("\n").find((line) => line.startsWith(":is("))!
    for (const selector of ["img", "video", "canvas", "iframe", "svg image", '[style*="url("]', "palette-root", READER_TAG]) {
      expect(reinverted).toContain(selector)
    }
    expect(DARK_MODE_CSS).toContain(":fullscreen")
  })

  it("sets a readable column with light and dark colors", () => {
    expect(READER_CSS).toContain("70ch")
    expect(READER_CSS).toContain("@media (prefers-color-scheme: dark)")
  })
})
