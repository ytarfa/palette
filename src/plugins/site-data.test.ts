import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Command } from "@/core/types"
import { commandsFor, context, mockChrome, run, titles } from "@/test/site"
import siteData, { cookieHeader, cookiesJson, cookiesTxt, siteOrigins } from "./site-data"

function cookie(overrides: Partial<chrome.cookies.Cookie>): chrome.cookies.Cookie {
  return {
    name: "sid",
    value: "abc",
    domain: "example.com",
    hostOnly: true,
    path: "/",
    secure: false,
    httpOnly: false,
    session: true,
    sameSite: "lax",
    storeId: "0",
    ...overrides,
  } as chrome.cookies.Cookie
}

const COOKIES = [
  cookie({ name: "sid", value: "abc", httpOnly: true, secure: true }),
  cookie({
    name: "theme",
    value: "dark",
    domain: ".example.com",
    hostOnly: false,
    path: "/app",
    session: false,
    expirationDate: 1893456000.75,
  }),
]

let api: ReturnType<typeof mockChrome> & {
  tabs: { reload: ReturnType<typeof vi.fn> }
  cookies: { getAll: ReturnType<typeof vi.fn> }
  browsingData: { remove: ReturnType<typeof vi.fn> }
}
beforeEach(() => {
  const base = mockChrome()
  api = Object.assign(base, {
    tabs: { ...base.tabs, reload: vi.fn(async () => {}) },
    cookies: { getAll: vi.fn(async () => COOKIES) },
    browsingData: { remove: vi.fn(async () => {}) },
  })
  vi.stubGlobal("chrome", api)
})

async function children(url: string, id: string): Promise<Command[]> {
  const item = (await commandsFor(siteData, url)).find((i) => i.id === id)
  return item!.children!.items(context(url))
}

describe("formatters", () => {
  it("builds a Cookie header", () => {
    expect(cookieHeader(COOKIES)).toBe("sid=abc; theme=dark")
    expect(cookieHeader([cookie({ name: "", value: "bare" })])).toBe("bare")
    expect(cookieHeader([])).toBe("")
  })

  it("pretty-prints the cookie objects as JSON", () => {
    expect(JSON.parse(cookiesJson(COOKIES))).toEqual(COOKIES)
    expect(cookiesJson(COOKIES)).toContain('\n  {\n    "name": "sid"')
  })

  it("writes a Netscape cookies.txt", () => {
    expect(cookiesTxt(COOKIES).split("\n")).toEqual([
      "# Netscape HTTP Cookie File",
      "",
      "#HttpOnly_example.com\tFALSE\t/\tTRUE\t0\tsid\tabc",
      ".example.com\tTRUE\t/app\tFALSE\t1893456000\ttheme\tdark",
      "",
    ])
  })

  it("marks domain cookies as matching subdomains, with a leading dot", () => {
    const line = cookiesTxt([cookie({ domain: "example.com", hostOnly: false })]).split("\n")[2]
    expect(line.split("\t").slice(0, 2)).toEqual([".example.com", "TRUE"])
  })
})

describe("siteOrigins", () => {
  it("includes the same host on both schemes", () => {
    expect(siteOrigins(new URL("https://app.example.com/a?b"))).toEqual([
      "https://app.example.com",
      "http://app.example.com",
    ])
    expect(siteOrigins(new URL("http://localhost:3000/"))).toEqual(["http://localhost:3000", "https://localhost:3000"])
  })
})

describe("site data", () => {
  it("only shows on http(s) pages", async () => {
    expect(await commandsFor(siteData, "chrome://settings")).toEqual([])
    expect(await commandsFor(siteData, "file:///tmp/a.html")).toEqual([])
    const items = await commandsFor(siteData, "https://example.com/")
    expect(titles(items)).toEqual(["Clear cookies and site data", "Copy cookies"])
    expect(items.every((i) => i.group === "Site data")).toBe(true)
  })

  it("asks before clearing, then clears both schemes and reloads", async () => {
    const url = "https://app.example.com/dashboard"
    const items = await children(url, "clear-site-data")
    expect(titles(items)).toEqual(["Clear data for app.example.com and reload", "Cancel"])
    expect(api.browsingData.remove).not.toHaveBeenCalled()

    await run(items, "cancel", context(url))
    expect(api.browsingData.remove).not.toHaveBeenCalled()

    await run(items, "confirm", context(url))
    expect(api.browsingData.remove).toHaveBeenCalledWith(
      { origins: ["https://app.example.com", "http://app.example.com"] },
      {
        cookies: true,
        localStorage: true,
        indexedDB: true,
        cacheStorage: true,
        serviceWorkers: true,
        fileSystems: true,
        webSQL: true,
      },
    )
    expect(api.tabs.reload).toHaveBeenCalledWith(1)
  })

  it("copies cookies in each format", async () => {
    const url = "https://example.com/app/page"
    const items = await children(url, "copy-cookies")
    expect(api.cookies.getAll).toHaveBeenCalledWith({ url })
    expect(titles(items)).toEqual(["As a Cookie header", "As JSON", "As cookies.txt (Netscape)"])
    expect(items.every((i) => i.subtitle === "2 cookies")).toBe(true)

    expect((await run(items, "header")).copied).toEqual(["sid=abc; theme=dark"])
    expect((await run(items, "json")).copied).toEqual([cookiesJson(COOKIES)])
    expect((await run(items, "netscape")).copied).toEqual([cookiesTxt(COOKIES)])
  })

  it("says so when there are no cookies", async () => {
    api.cookies.getAll.mockResolvedValueOnce([])
    const items = await children("http://localhost:3000/", "copy-cookies")
    expect(titles(items)).toEqual(["No cookies for localhost:3000"])
    expect(items[0].run).toBeUndefined()
  })
})
