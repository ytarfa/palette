import { CalendarClock, ListX } from "lucide-react"
import { definePlugin, type Command } from "@/core/types"
import { favicon, focusTab, shortUrl } from "./browser"

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY
const MONTH = 30 * DAY
const YEAR = 365 * DAY

/**
 * Tabs not used for at least `maxAge` ms, oldest first. Never pinned, audible
 * or active tabs (in any window). Note `lastAccessed` is when the tab was last
 * used, not when it was opened.
 */
export function staleTabs(tabs: chrome.tabs.Tab[], now: number, maxAge: number): chrome.tabs.Tab[] {
  return tabs
    .filter(
      (t) => t.id != null && t.lastAccessed != null && !t.pinned && !t.active && !t.audible && now - t.lastAccessed >= maxAge,
    )
    .sort((a, b) => a.lastAccessed! - b.lastAccessed!)
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", YEAR],
  ["month", MONTH],
  ["week", WEEK],
  ["day", DAY],
  ["hour", HOUR],
  ["minute", MINUTE],
]
const relative = new Intl.RelativeTimeFormat("en", { numeric: "always" })

/** `then` relative to `now`, e.g. "3 days ago". */
export function timeAgo(then: number, now: number): string {
  const elapsed = Math.max(0, now - then)
  const unit = UNITS.find(([, ms]) => elapsed >= ms)
  if (!unit) return "just now"
  return relative.format(-Math.floor(elapsed / unit[1]), unit[0])
}

/** A "Close tabs not used in a …" command, previewing the tabs it would close. */
function closeUnused(id: string, period: string, maxAge: number, enabledByDefault = true): Command {
  return {
    id,
    title: `Close tabs not used in a ${period}`,
    group: "Tabs",
    icon: CalendarClock,
    keywords: ["stale", "old", "inactive", "cleanup"],
    enabledByDefault,
    children: {
      placeholder: "Tabs that will be closed…",
      async items() {
        const now = Date.now()
        const tabs = staleTabs(await chrome.tabs.query({}), now, maxAge)
        if (!tabs.length) return [{ id: "none", title: `No tabs older than a ${period}` }]
        const ids = new Set(tabs.map((t) => t.id!))
        return [
          {
            id: "close",
            title: `Close ${tabs.length} ${tabs.length === 1 ? "tab" : "tabs"}`,
            icon: ListX,
            async run() {
              // Re-check, in case one was used or closed since the preview.
              const still = staleTabs(await chrome.tabs.query({}), Date.now(), maxAge)
              await chrome.tabs.remove(still.filter((t) => ids.has(t.id!)).map((t) => t.id!))
            },
          },
          ...tabs.map((tab) => ({
            id: String(tab.id),
            title: tab.title || shortUrl(tab.url) || "Untitled",
            subtitle: shortUrl(tab.url),
            icon: favicon(tab.url),
            keywords: [shortUrl(tab.url)],
            hint: timeAgo(tab.lastAccessed!, now),
            run: () => focusTab(tab),
          })),
        ]
      },
    },
  }
}

/** ⌘⇧K — close tabs you haven't used in a day, week or month. */
export default definePlugin({
  id: "tab-cleanup",
  name: "Tab cleanup",
  description: "Close tabs you haven't used in a while",
  category: "general",
  commands: [
    closeUnused("close-unused-day", "day", DAY),
    closeUnused("close-unused-week", "week", WEEK),
    closeUnused("close-unused-month", "month", MONTH, false),
  ],
})
