import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { context, titles } from "@/test/site"
import tabCleanup, { staleTabs, timeAgo } from "./tab-cleanup"

const NOW = Date.UTC(2026, 10, 3, 12)
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

const tab = (id: number, ageMs: number | undefined, extra: Partial<chrome.tabs.Tab> = {}) =>
  ({
    id,
    windowId: 1,
    index: id,
    title: `Tab ${id}`,
    url: `https://example.com/${id}`,
    active: false,
    pinned: false,
    lastAccessed: ageMs == null ? undefined : NOW - ageMs,
    ...extra,
  }) as chrome.tabs.Tab

const ids = (items: { id?: string | number }[]) => items.map((i) => i.id)

describe("staleTabs", () => {
  it("keeps tabs unused for at least the age, oldest first", () => {
    const tabs = [tab(1, 2 * DAY), tab(2, HOUR), tab(3, 5 * DAY), tab(4, DAY)]
    expect(ids(staleTabs(tabs, NOW, DAY))).toEqual([3, 1, 4])
  })

  it("never picks pinned, active, audible tabs or ones without lastAccessed", () => {
    const tabs = [
      tab(1, 9 * DAY, { pinned: true }),
      tab(2, 9 * DAY, { active: true, windowId: 2 }),
      tab(3, 9 * DAY, { audible: true }),
      tab(4, undefined),
      tab(5, 9 * DAY),
    ]
    expect(ids(staleTabs(tabs, NOW, DAY))).toEqual([5])
  })
})

describe("timeAgo", () => {
  it.each([
    [0, "just now"],
    [30 * 1000, "just now"],
    [5 * 60 * 1000, "5 minutes ago"],
    [HOUR, "1 hour ago"],
    [3 * HOUR, "3 hours ago"],
    [DAY, "1 day ago"],
    [3 * DAY, "3 days ago"],
    [7 * DAY, "1 week ago"],
    [20 * DAY, "2 weeks ago"],
    [45 * DAY, "1 month ago"],
    [400 * DAY, "1 year ago"],
    [-HOUR, "just now"],
  ])("%i ms → %s", (age, text) => {
    expect(timeAgo(NOW - age, NOW)).toBe(text)
  })
})

describe("tab cleanup commands", () => {
  let chrome: { tabs: Record<string, ReturnType<typeof vi.fn>>; windows: Record<string, ReturnType<typeof vi.fn>> }
  let open: chrome.tabs.Tab[]

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW })
    open = [tab(1, 0, { active: true }), tab(2, 2 * DAY), tab(3, 10 * DAY), tab(4, 40 * DAY, { pinned: true })]
    chrome = {
      tabs: {
        query: vi.fn(async () => open),
        remove: vi.fn(async () => {}),
        update: vi.fn(async () => ({})),
      },
      windows: { update: vi.fn(async () => ({})) },
    }
    vi.stubGlobal("chrome", { ...chrome, runtime: { getURL: (path: string) => `chrome-extension://test${path}` } })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const command = (id: string) => tabCleanup.commands!.find((c) => c.id === id)!
  const children = (id: string) => command(id).children!.items(context("https://example.com"))

  it("has a day, week and month command, month off by default", () => {
    expect(ids(tabCleanup.commands!)).toEqual(["close-unused-day", "close-unused-week", "close-unused-month"])
    expect(tabCleanup.commands!.map((c) => c.enabledByDefault)).toEqual([true, true, false])
    expect(tabCleanup.commands!.every((c) => c.group === "Tabs")).toBe(true)
  })

  it("previews the tabs to close, oldest first", async () => {
    const items = await children("close-unused-day")
    expect(titles(items)).toEqual(["Close 2 tabs", "Tab 3", "Tab 2"])
    expect(items[1]).toMatchObject({ subtitle: "example.com/3", hint: "1 week ago" })
    expect(items[2].hint).toBe("2 days ago")
    expect(titles(await children("close-unused-week"))).toEqual(["Close 1 tab", "Tab 3"])
  })

  it("closes the previewed tabs", async () => {
    const items = await children("close-unused-day")
    await items[0].run!(context("https://example.com"))
    expect(chrome.tabs.remove).toHaveBeenCalledWith([3, 2])
  })

  it("skips tabs used since the preview", async () => {
    const items = await children("close-unused-day")
    open = [tab(1, 0, { active: true }), tab(2, 0), tab(3, 10 * DAY)]
    await items[0].run!(context("https://example.com"))
    expect(chrome.tabs.remove).toHaveBeenCalledWith([3])
  })

  it("focuses a previewed tab", async () => {
    const items = await children("close-unused-day")
    await items[1].run!(context("https://example.com"))
    expect(chrome.tabs.update).toHaveBeenCalledWith(3, { active: true })
    expect(chrome.windows.update).toHaveBeenCalledWith(1, { focused: true })
    expect(chrome.tabs.remove).not.toHaveBeenCalled()
  })

  it("says so when nothing matches", async () => {
    const items = await children("close-unused-month")
    expect(titles(items)).toEqual(["No tabs older than a month"])
    expect(items[0].run).toBeUndefined()
  })
})
