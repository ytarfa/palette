import { TABS } from "@/core/modes"
import { definePlugin } from "@/core/types"
import { favicon, focusTab, shortUrl } from "./util"

/** ⌘P — fuzzy search open tabs across windows, most recently used first. */
export default definePlugin({
  id: "tabs",
  name: "Tabs",
  sources: [
    {
      mode: TABS.id,
      async items(ctx) {
        const tabs = await chrome.tabs.query({})
        const current = ctx.tab?.id
        // Most recently used first; the current tab goes last so ↵ jumps back.
        tabs.sort((a, b) => {
          if (a.id === current) return 1
          if (b.id === current) return -1
          return (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0)
        })
        return tabs.map((tab) => ({
          id: String(tab.id),
          title: tab.title || shortUrl(tab.url) || "Untitled",
          subtitle: shortUrl(tab.url),
          icon: favicon(tab.url),
          keywords: [shortUrl(tab.url)],
          hint: tab.id === current ? "Current" : tab.audible ? "Playing" : tab.pinned ? "Pinned" : undefined,
          run: () => focusTab(tab),
          actions: [
            {
              id: "close",
              title: "Close tab",
              shortcut: "mod+backspace",
              async run() {
                await chrome.tabs.remove(tab.id!)
                return { keepOpen: tab.id !== current }
              },
            },
          ],
        }))
      },
    },
  ],
})
