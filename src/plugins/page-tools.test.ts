import { beforeEach, describe, expect, it, vi } from "vitest"
import { commandsFor, context, mockChrome, run, searchFor, titles } from "@/test/site"
import pageTools, { hasTrackingParams, parentUrl, removeTrackingParams } from "./page-tools"

let chrome: ReturnType<typeof mockChrome> & { search: { query: ReturnType<typeof vi.fn> } }
beforeEach(() => {
  chrome = Object.assign(mockChrome(), { search: { query: vi.fn(async () => {}) } })
})

const ids = (items: { id: string }[]) => items.map((i) => i.id)

describe("removeTrackingParams", () => {
  it("removes utm_* and click IDs", () => {
    expect(removeTrackingParams("https://example.com/a?utm_source=x&utm_medium=email&utm_campaign=y")).toBe(
      "https://example.com/a",
    )
    expect(removeTrackingParams("https://example.com/?fbclid=abc")).toBe("https://example.com/")
    for (const name of ["gclid", "dclid", "msclkid", "mc_cid", "mc_eid", "igshid", "_hsenc", "_hsmi", "ref_src", "yclid", "twclid"]) {
      expect(removeTrackingParams(`https://example.com/p?${name}=1`)).toBe("https://example.com/p")
    }
  })

  it("keeps other parameters in order, with their encoding, and the hash", () => {
    expect(
      removeTrackingParams("https://shop.example.com/search?q=red+shoes&utm_source=news&page=2&gclid=x&sort=a%20b#reviews"),
    ).toBe("https://shop.example.com/search?q=red+shoes&page=2&sort=a%20b#reviews")
    expect(removeTrackingParams("https://example.com/?b=2&a=1&fbclid=z&c")).toBe("https://example.com/?b=2&a=1&c")
  })

  it("matches names case-insensitively and when percent-encoded", () => {
    expect(removeTrackingParams("https://example.com/?UTM_Source=x&id=1")).toBe("https://example.com/?id=1")
    expect(removeTrackingParams("https://example.com/?utm%5Fsource=x&id=1")).toBe("https://example.com/?id=1")
  })

  it("only removes `si` on YouTube and Spotify", () => {
    expect(removeTrackingParams("https://youtu.be/dQw4w9WgXcQ?si=abc&t=42")).toBe("https://youtu.be/dQw4w9WgXcQ?t=42")
    expect(removeTrackingParams("https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=abc")).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    )
    expect(removeTrackingParams("https://open.spotify.com/track/123?si=abc")).toBe("https://open.spotify.com/track/123")
    expect(removeTrackingParams("https://example.com/units?si=metric")).toBe("https://example.com/units?si=metric")
  })

  it("leaves URLs without tracking parameters untouched", () => {
    const untouched = [
      "https://example.com/",
      "https://example.com/path?q=1&page=2#top",
      "https://example.com/?utm=1&source=x&ref=home&clid=3", // look-alikes
      "https://example.com/?my_utm_source=x&fbclid_copy=1",
      "https://example.com/?a=%E2%9C%93&b=x+y",
      "https://example.com/#utm_source=x", // in the hash, not the query
      "not a url",
      "",
    ]
    for (const url of untouched) {
      expect(removeTrackingParams(url)).toBe(url)
      expect(hasTrackingParams(url)).toBe(false)
    }
  })

  it("drops the ? when nothing is left, and stray empty pairs", () => {
    expect(removeTrackingParams("https://example.com/a?&utm_source=x&#h")).toBe("https://example.com/a#h")
  })
})

describe("parentUrl", () => {
  it("drops the last segment, the query and the hash", () => {
    expect(parentUrl(new URL("https://example.com/docs/guide/intro?x=1#a"))).toBe("https://example.com/docs/guide")
    expect(parentUrl(new URL("https://example.com/docs/guide/"))).toBe("https://example.com/docs")
    expect(parentUrl(new URL("http://localhost:3000/a"))).toBe("http://localhost:3000/")
    expect(parentUrl(new URL("https://example.com/?q=1"))).toBeUndefined()
  })
})

describe("page tools", () => {
  it("only runs on http(s) pages", async () => {
    expect(await commandsFor(pageTools, "chrome://settings")).toEqual([])
    expect(await commandsFor(pageTools, "file:///Users/me/a.html")).toEqual([])
    expect(await commandsFor(pageTools, "chrome-extension://abc/options.html")).toEqual([])
    expect(await searchFor(pageTools, "chrome://settings", "x")).toEqual([])
  })

  it("lists every command on a deep page with tracking parameters", async () => {
    const items = await commandsFor(pageTools, "https://example.com/blog/2024/post?utm_source=x&id=7#c", {
      title: "A post",
    })
    expect(titles(items)).toEqual([
      "Copy URL without tracking",
      "Remove tracking parameters",
      "Go up one level",
      "Go to site root",
      "Open in the Wayback Machine",
      "Save to the Wayback Machine",
      "View page source",
      "Copy page title",
      "Copy domain",
    ])
    expect(items.every((i) => i.group === "Page")).toBe(true)
  })

  it("hides commands that don't apply", async () => {
    const root = ids(await commandsFor(pageTools, "https://example.com/"))
    expect(root).not.toContain("copy-clean-url")
    expect(root).not.toContain("remove-tracking")
    expect(root).not.toContain("up")
    expect(root).not.toContain("root")
    expect(root).not.toContain("copy-title") // no title

    // One segment: the parent is the root, so only "Go to site root".
    const shallow = ids(await commandsFor(pageTools, "https://example.com/about"))
    expect(shallow).not.toContain("up")
    expect(shallow).toContain("root")

    // At the root with a query: root is still useful.
    expect(ids(await commandsFor(pageTools, "https://example.com/?q=1"))).toContain("root")
  })

  it("copies and removes tracking parameters", async () => {
    const url = "https://example.com/a?id=7&utm_source=x#c"
    const items = await commandsFor(pageTools, url)
    const { copied } = await run(items, "copy-clean-url", context(url))
    expect(copied).toEqual(["https://example.com/a?id=7#c"])
    await run(items, "remove-tracking", context(url))
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: "https://example.com/a?id=7#c" })
  })

  it("goes up a level and to the root", async () => {
    const url = "https://example.com/docs/guide/intro?x=1"
    const items = await commandsFor(pageTools, url)
    await run(items, "up", context(url))
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: "https://example.com/docs/guide" })
    await run(items, "root", context(url))
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: "https://example.com/" })
  })

  it("opens the Wayback Machine and the page source in new tabs", async () => {
    const url = "https://example.com/a?id=7&fbclid=x#c"
    const items = await commandsFor(pageTools, url)
    await run(items, "wayback", context(url))
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "https://web.archive.org/web/*/https://example.com/a?id=7" })
    await run(items, "wayback-save", context(url))
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "https://web.archive.org/save/https://example.com/a?id=7" })
    await run(items, "view-source", context(url))
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: `view-source:${url}` })
  })

  it("copies the title and the domain", async () => {
    const url = "https://docs.example.com:8443/a"
    const items = await commandsFor(pageTools, url, { title: "  Docs  " })
    expect((await run(items, "copy-title", context(url))).copied).toEqual(["Docs"])
    expect((await run(items, "copy-domain", context(url))).copied).toEqual(["docs.example.com"])
  })

  it("searches the site with the default search engine", async () => {
    const items = await searchFor(pageTools, "https://www.example.com/a", " pricing plans ")
    expect(titles(items)).toEqual(["Search “pricing plans” on example.com"])
    expect(items[0].alwaysShow).toBe(true)
    await run(items, "search-site")
    expect(chrome.search.query).toHaveBeenCalledWith({ text: "site:example.com pricing plans", disposition: "NEW_TAB" })

    const sub = await searchFor(pageTools, "https://docs.example.com/", "api")
    expect(titles(sub)).toEqual(["Search “api” on docs.example.com"])

    expect(await searchFor(pageTools, "https://example.com", "  ")).toEqual([])
  })
})
