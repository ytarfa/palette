import { beforeEach, describe, expect, it } from "vitest"
import { commandsFor, context, mockChrome, run, searchFor, titles } from "@/test/site"
import google, { currentTab, isSearchPage, siteFrom, timeRange, withSite } from "./google-search"

const SEARCH = "https://www.google.com/search?q=rust+async+traits&sca_esv=abc123&ei=XyZ&ved=0ahUKEwj&start=10"
const UK = "https://www.google.co.uk/search?q=bank+holidays+2026&tbs=qdr:m,li:1&hl=en-GB"
const TITLE = "rust async traits - Google Search"

const find = (items: Awaited<ReturnType<typeof commandsFor>>, id: string) => {
  const item = items.find((i) => i.id === id)
  if (!item) throw new Error(`No item "${id}" in: ${items.map((i) => i.id).join(", ")}`)
  return item
}

let chrome: ReturnType<typeof mockChrome>
beforeEach(() => {
  chrome = mockChrome()
})

describe("google-search", () => {
  it("matches results pages on Google domains", () => {
    for (const url of [
      SEARCH,
      UK,
      "https://google.com/search?q=weather",
      "https://www.google.fr/search?q=m%C3%A9t%C3%A9o",
      "https://www.google.com.au/search?q=footy",
      "https://www.google.ca/search?q=poutine&udm=2",
    ]) {
      expect(isSearchPage(new URL(url)), url).toBe(true)
    }
  })

  it("rejects other Google products, lookalikes and pages without a query", async () => {
    for (const url of [
      "https://docs.google.com/search?q=budget",
      "https://mail.google.com/mail/u/0/#search/invoice",
      "https://www.google.com.evil.io/search?q=login",
      "https://evilgoogle.com/search?q=login",
      "https://www.google.company/search?q=login",
      "https://www.google.com/",
      "https://www.google.com/maps/search/coffee",
      "https://www.google.com/search?q=",
      "https://www.bing.com/search?q=rust",
    ]) {
      expect(isSearchPage(new URL(url)), url).toBe(false)
    }
    expect(await commandsFor(google, "https://docs.google.com/document/d/1abc/edit")).toEqual([])
  })

  it("reads the time range and tab from the URL", () => {
    expect(timeRange(new URL(SEARCH))).toBeUndefined()
    expect(timeRange(new URL(UK))).toBe("m")
    expect(timeRange(new URL("https://www.google.com/search?q=x&tbs=cdr:1,cd_min:1/1/2025,cd_max:6/30/2025"))).toBe("custom")
    expect(currentTab(new URL(SEARCH))).toBeUndefined()
    expect(currentTab(new URL("https://www.google.com/search?q=x&udm=2"))).toBe("images")
    expect(currentTab(new URL("https://www.google.com/search?q=x&tbm=isch"))).toBe("images")
    expect(currentTab(new URL("https://www.google.com/search?q=x&tbm=nws"))).toBe("news")
    expect(currentTab(new URL("https://www.google.com/search?q=x&udm=14"))).toBe("web")
  })

  it("lists time filters first, then verbatim, tabs and other engines", async () => {
    const items = await commandsFor(google, SEARCH, { title: TITLE })
    expect(titles(items)).toEqual([
      "Past week",
      "Past year",
      "Time range…",
      "Verbatim results",
      "Web results",
      "Images",
      "News",
      "Videos",
      "Shopping",
      "Maps",
      "Search on DuckDuckGo",
      "Search on Bing",
      "Ask Perplexity",
      "Search on Wikipedia",
      "Search on YouTube",
    ])
    expect(items.every((i) => i.group === "Google Search")).toBe(true)
  })

  it("filters by time, dropping tracking and paging params", async () => {
    const items = await commandsFor(google, SEARCH)
    await run(items, "time-w")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: "https://www.google.com/search?q=rust+async+traits&tbs=qdr%3Aw" })
    await find(items, "time-w").actions![0].run(context(SEARCH))
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "https://www.google.com/search?q=rust+async+traits&tbs=qdr%3Aw" })
  })

  it("marks the active time range and offers to clear it, keeping verbatim and the domain", async () => {
    const items = await commandsFor(google, UK)
    expect(titles(items).slice(0, 4)).toEqual(["Any time", "Past week", "Past year", "Time range…"])
    expect(find(items, "time-range").subtitle).toBe("Past month")

    const ranges = await find(items, "time-range").children!.items(context(UK))
    expect(titles(ranges)).toEqual(["Any time", "Past hour", "Past 24 hours", "Past week", "Past month", "Past year"])
    expect(ranges.filter((i) => i.hint === "Current").map((i) => i.title)).toEqual(["Past month"])

    await run(items, "time-any")
    expect(chrome.tabs.update).toHaveBeenLastCalledWith(1, {
      url: "https://www.google.co.uk/search?q=bank+holidays+2026&hl=en-GB&tbs=li%3A1",
    })
    await run(ranges, "time-y")
    expect(chrome.tabs.update).toHaveBeenLastCalledWith(1, {
      url: "https://www.google.co.uk/search?q=bank+holidays+2026&hl=en-GB&tbs=qdr%3Ay%2Cli%3A1",
    })
  })

  it("toggles verbatim", async () => {
    await run(await commandsFor(google, SEARCH), "verbatim")
    expect(chrome.tabs.update).toHaveBeenLastCalledWith(1, { url: "https://www.google.com/search?q=rust+async+traits&tbs=li%3A1" })

    const items = await commandsFor(google, UK)
    expect(titles(items)).toContain("Turn off verbatim")
    await run(items, "verbatim-off")
    expect(chrome.tabs.update).toHaveBeenLastCalledWith(1, {
      url: "https://www.google.co.uk/search?q=bank+holidays+2026&hl=en-GB&tbs=qdr%3Am",
    })
  })

  it("switches tabs, keeping the query and filters", async () => {
    const items = await commandsFor(google, UK)
    const base = "https://www.google.co.uk/search?q=bank+holidays+2026&hl=en-GB&tbs=qdr%3Am%2Cli%3A1"
    expect(find(items, "tab-web").subtitle).toBe("Without AI Overviews")
    await run(items, "tab-web")
    expect(chrome.tabs.update).toHaveBeenLastCalledWith(1, { url: `${base}&udm=14` })
    await run(items, "tab-news")
    expect(chrome.tabs.update).toHaveBeenLastCalledWith(1, { url: `${base}&tbm=nws` })
    await run(items, "tab-maps")
    expect(chrome.tabs.update).toHaveBeenLastCalledWith(1, {
      url: "https://www.google.co.uk/maps/search/?api=1&query=bank%20holidays%202026",
    })
  })

  it("hides the current tab and offers to go back to all results", async () => {
    const images = "https://www.google.com/search?q=aurora+borealis&udm=2&tbs=qdr:w"
    const items = await commandsFor(google, images)
    expect(titles(items)).not.toContain("Images")
    expect(titles(items)).toContain("All results")
    await run(items, "tab-all")
    expect(chrome.tabs.update).toHaveBeenLastCalledWith(1, { url: "https://www.google.com/search?q=aurora+borealis&tbs=qdr%3Aw" })
    await run(items, "tab-news")
    expect(chrome.tabs.update).toHaveBeenLastCalledWith(1, { url: "https://www.google.com/search?q=aurora+borealis&tbs=qdr%3Aw&tbm=nws" })
  })

  it("runs the same query on other sites in a new tab", async () => {
    const items = await commandsFor(google, SEARCH)
    await run(items, "duckduckgo")
    expect(chrome.tabs.create).toHaveBeenLastCalledWith({ url: "https://duckduckgo.com/?q=rust%20async%20traits" })
    await run(items, "youtube")
    expect(chrome.tabs.create).toHaveBeenLastCalledWith({ url: "https://www.youtube.com/results?search_query=rust%20async%20traits" })
    await run(items, "wikipedia")
    expect(chrome.tabs.create).toHaveBeenLastCalledWith({ url: "https://en.wikipedia.org/w/index.php?search=rust%20async%20traits" })
    expect(chrome.tabs.update).not.toHaveBeenCalled()

    await run(await commandsFor(google, "https://www.google.fr/search?q=m%C3%A9t%C3%A9o&hl=fr"), "wikipedia")
    expect(chrome.tabs.create).toHaveBeenLastCalledWith({ url: "https://fr.wikipedia.org/w/index.php?search=m%C3%A9t%C3%A9o" })
  })

  it("parses typed domains and adds a site: filter", () => {
    expect(siteFrom("github.com")).toBe("github.com")
    expect(siteFrom("https://Docs.Python.org/3/")).toBe("docs.python.org/3")
    expect(siteFrom("async traits")).toBeUndefined()
    expect(siteFrom("rust")).toBeUndefined()
    expect(withSite("rust async traits", "reddit.com")).toBe("rust async traits site:reddit.com")
    expect(withSite("rust site:github.com async", "reddit.com")).toBe("rust async site:reddit.com")
  })

  it("offers to limit the search to a typed site", async () => {
    const items = await searchFor(google, SEARCH, "reddit.com")
    expect(titles(items)).toEqual(["Limit to site “reddit.com”"])
    expect(items[0].subtitle).toBe("rust async traits site:reddit.com")
    expect(items.every((i) => i.alwaysShow)).toBe(true)
    await run(items, "limit-site")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, {
      url: "https://www.google.com/search?q=rust+async+traits+site%3Areddit.com",
    })
    expect(await searchFor(google, SEARCH, "lifetimes")).toEqual([])
    expect(await searchFor(google, SEARCH, "  ")).toEqual([])
  })
})
