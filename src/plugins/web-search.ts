import { Globe, Search } from "lucide-react"
import { COMMANDS, TABS } from "@/core/modes"
import { definePlugin, type Command, type PaletteContext } from "@/core/types"
import { openUrl } from "./browser"

/** Looks like something the user wants to visit rather than search for. */
function asUrl(query: string): string | undefined {
  if (/\s/.test(query)) return undefined
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(query)) return query
  if (/^(localhost|[\w-]+(\.[\w-]+)+)(:\d+)?(\/.*)?$/i.test(query)) return `https://${query}`
  return undefined
}

function fallbacks(ctx: PaletteContext): Command[] {
  const query = ctx.query.trim()
  if (!query) return []
  const url = asUrl(query)
  const items: Command[] = [
    {
      id: "search",
      title: `Search “${query}”`,
      group: "Web",
      icon: Search,
      alwaysShow: true,
      run: () => chrome.search.query({ text: query, disposition: "NEW_TAB" }),
    },
  ]
  if (url) {
    items.unshift({
      id: "open",
      title: `Open ${url}`,
      group: "Web",
      icon: Globe,
      alwaysShow: true,
      run: () => openUrl(ctx, url, { newTab: true }),
    })
  }
  return items
}

/** Fallbacks for any query: open it as a URL or search with the default engine. */
export default definePlugin({
  id: "web-search",
  name: "Web search",
  description: "Open what you type as an address, or search for it with your default search engine",
  category: "general",
  sources: [
    { mode: TABS.id, dynamic: true, items: fallbacks },
    { mode: COMMANDS.id, dynamic: true, items: fallbacks },
  ],
})
