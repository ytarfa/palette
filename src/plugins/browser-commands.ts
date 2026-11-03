import {
  AppWindow,
  Bookmark,
  Download,
  EyeOff,
  History,
  Keyboard,
  PanelTopClose,
  Puzzle,
  Settings,
} from "lucide-react"
import { definePlugin, type Command } from "@/core/types"

const page = (id: string, title: string, url: string, icon: Command["icon"]): Command => ({
  id,
  title,
  group: "Browser",
  icon,
  run: () => void chrome.tabs.create({ url }),
})

/** ⌘⇧K — windows and browser pages. */
export default definePlugin({
  id: "browser-commands",
  name: "Browser commands",
  commands: [
    {
      id: "new-window",
      title: "New window",
      group: "Window",
      icon: AppWindow,
      run: () => void chrome.windows.create({}),
    },
    {
      id: "new-incognito",
      title: "New incognito window",
      group: "Window",
      icon: EyeOff,
      keywords: ["private"],
      run: () => void chrome.windows.create({ incognito: true }),
    },
    {
      id: "close-window",
      title: "Close window",
      group: "Window",
      icon: PanelTopClose,
      when: (ctx) => ctx.tab != null,
      run: (ctx) => chrome.windows.remove(ctx.tab!.windowId),
    },
    page("history", "Open history", "chrome://history", History),
    page("downloads", "Open downloads", "chrome://downloads", Download),
    page("bookmarks", "Open bookmarks", "chrome://bookmarks", Bookmark),
    page("extensions", "Open extensions", "chrome://extensions", Puzzle),
    page("settings", "Open settings", "chrome://settings", Settings),
    page("shortcuts", "Configure Palette shortcuts", "chrome://extensions/shortcuts", Keyboard),
  ],
})
