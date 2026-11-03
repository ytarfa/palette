import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Copy,
  CopyPlus,
  Link,
  ListX,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  RotateCw,
  Undo2,
  Volume2,
  VolumeX,
  X,
  ZoomIn,
  ZoomOut,
  AppWindow,
  Scan,
} from "lucide-react"
import { definePlugin, type PaletteContext } from "@/core/types"
import { favicon, focusTab } from "./util"

const tabId = (ctx: PaletteContext) => ctx.tab!.id!
const hasTab = (ctx: PaletteContext) => ctx.tab?.id != null

async function zoomBy(ctx: PaletteContext, delta: number) {
  const zoom = await chrome.tabs.getZoom(tabId(ctx))
  await chrome.tabs.setZoom(tabId(ctx), Math.min(5, Math.max(0.25, zoom + delta)))
}

/** ⌘⇧K — everyday actions on the current tab. */
export default definePlugin({
  id: "tab-commands",
  name: "Tab commands",
  commands: [
    {
      id: "new",
      title: "New tab",
      group: "Tab",
      icon: Plus,
      run: () => void chrome.tabs.create({}),
    },
    {
      id: "close",
      title: "Close tab",
      group: "Tab",
      icon: X,
      when: hasTab,
      run: (ctx) => chrome.tabs.remove(tabId(ctx)),
    },
    {
      id: "reopen",
      title: "Reopen closed tab",
      group: "Tab",
      icon: Undo2,
      keywords: ["restore", "undo"],
      run: () => void chrome.sessions.restore(),
    },
    {
      id: "duplicate",
      title: "Duplicate tab",
      group: "Tab",
      icon: CopyPlus,
      when: hasTab,
      run: (ctx) => void chrome.tabs.duplicate(tabId(ctx)),
    },
    {
      id: "reload",
      title: "Reload tab",
      group: "Tab",
      icon: RotateCw,
      when: hasTab,
      run: (ctx) => chrome.tabs.reload(tabId(ctx)),
    },
    {
      id: "hard-reload",
      title: "Hard reload tab",
      subtitle: "Bypass the cache",
      group: "Tab",
      icon: RefreshCw,
      when: hasTab,
      run: (ctx) => chrome.tabs.reload(tabId(ctx), { bypassCache: true }),
    },
    {
      id: "pin",
      title: "Pin tab",
      group: "Tab",
      icon: Pin,
      when: (ctx) => hasTab(ctx) && !ctx.tab!.pinned,
      run: (ctx) => void chrome.tabs.update(tabId(ctx), { pinned: true }),
    },
    {
      id: "unpin",
      title: "Unpin tab",
      group: "Tab",
      icon: PinOff,
      when: (ctx) => hasTab(ctx) && !!ctx.tab!.pinned,
      run: (ctx) => void chrome.tabs.update(tabId(ctx), { pinned: false }),
    },
    {
      id: "mute",
      title: "Mute tab",
      group: "Tab",
      icon: VolumeX,
      when: (ctx) => hasTab(ctx) && !ctx.tab!.mutedInfo?.muted,
      run: (ctx) => void chrome.tabs.update(tabId(ctx), { muted: true }),
    },
    {
      id: "unmute",
      title: "Unmute tab",
      group: "Tab",
      icon: Volume2,
      when: (ctx) => hasTab(ctx) && !!ctx.tab!.mutedInfo?.muted,
      run: (ctx) => void chrome.tabs.update(tabId(ctx), { muted: false }),
    },
    {
      id: "close-others",
      title: "Close other tabs",
      group: "Tab",
      icon: ListX,
      when: hasTab,
      async run(ctx) {
        const tabs = await chrome.tabs.query({ windowId: ctx.tab!.windowId, pinned: false })
        await chrome.tabs.remove(tabs.filter((t) => t.id !== ctx.tab!.id).map((t) => t.id!))
      },
    },
    {
      id: "close-right",
      title: "Close tabs to the right",
      group: "Tab",
      icon: ListX,
      when: hasTab,
      async run(ctx) {
        const tabs = await chrome.tabs.query({ windowId: ctx.tab!.windowId })
        await chrome.tabs.remove(tabs.filter((t) => t.index > ctx.tab!.index).map((t) => t.id!))
      },
    },
    {
      id: "close-duplicates",
      title: "Close duplicate tabs",
      group: "Tab",
      icon: ListX,
      keywords: ["dedupe"],
      async run(ctx) {
        const seen = new Set<string>()
        const dupes: number[] = []
        // Visit the current tab first so it's the copy that survives.
        const all = await chrome.tabs.query({})
        const tabs = [...all.filter((t) => t.id === ctx.tab?.id), ...all.filter((t) => t.id !== ctx.tab?.id)]
        for (const tab of tabs) {
          const url = tab.url?.split("#")[0] ?? ""
          if (seen.has(url)) dupes.push(tab.id!)
          else seen.add(url)
        }
        await chrome.tabs.remove(dupes)
      },
    },
    {
      id: "move-new-window",
      title: "Move tab to new window",
      group: "Tab",
      icon: ArrowUpRight,
      when: hasTab,
      run: (ctx) => void chrome.windows.create({ tabId: tabId(ctx) }),
    },
    {
      id: "move-to-window",
      title: "Move tab to window…",
      group: "Tab",
      icon: AppWindow,
      when: hasTab,
      children: {
        placeholder: "Pick a window…",
        async items(ctx) {
          const windows = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] })
          return windows
            .filter((w) => w.id !== ctx.tab!.windowId)
            .map((w) => {
              const active = w.tabs?.find((t) => t.active)
              return {
                id: String(w.id),
                title: active?.title ?? "Window",
                subtitle: `${w.tabs?.length ?? 0} tabs`,
                icon: favicon(active?.url),
                async run() {
                  const moved = await chrome.tabs.move(tabId(ctx), { windowId: w.id!, index: -1 })
                  await focusTab(moved)
                },
              }
            })
        },
      },
    },
    {
      id: "back",
      title: "Go back",
      group: "Page",
      icon: ArrowLeft,
      when: hasTab,
      run: (ctx) => chrome.tabs.goBack(tabId(ctx)),
    },
    {
      id: "forward",
      title: "Go forward",
      group: "Page",
      icon: ArrowRight,
      when: hasTab,
      run: (ctx) => chrome.tabs.goForward(tabId(ctx)),
    },
    {
      id: "copy-url",
      title: "Copy URL",
      group: "Page",
      icon: Link,
      when: hasTab,
      run: (ctx) => ctx.copy(ctx.tab!.url ?? ""),
    },
    {
      id: "copy-markdown",
      title: "Copy as Markdown link",
      group: "Page",
      icon: Copy,
      when: hasTab,
      run: (ctx) => ctx.copy(`[${ctx.tab!.title}](${ctx.tab!.url})`),
    },
    {
      id: "zoom-in",
      title: "Zoom in",
      group: "Page",
      icon: ZoomIn,
      when: hasTab,
      run: (ctx) => zoomBy(ctx, 0.1),
    },
    {
      id: "zoom-out",
      title: "Zoom out",
      group: "Page",
      icon: ZoomOut,
      when: hasTab,
      run: (ctx) => zoomBy(ctx, -0.1),
    },
    {
      id: "zoom-reset",
      title: "Reset zoom",
      group: "Page",
      icon: Scan,
      when: hasTab,
      run: (ctx) => chrome.tabs.setZoom(tabId(ctx), 0),
    },
  ],
})
