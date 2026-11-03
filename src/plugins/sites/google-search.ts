import {
  BookOpen,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Clock,
  Globe,
  History,
  Image,
  LayoutList,
  MapPin,
  Newspaper,
  Play,
  Quote,
  Search,
  ShoppingBag,
  Sparkles,
  TextSearch,
  Video,
} from "lucide-react"
import type { Command } from "@/core/types"
import { defineSite, navigate, openInNewTab, withParams } from "../site-kit"

/** www.google.com and country domains: google.fr, google.co.uk, google.com.au… */
export const isGoogleHost = (hostname: string) =>
  /^(www\.)?google\.(com|co\.[a-z]{2}|com\.[a-z]{2}|[a-z]{2})$/.test(hostname)

/** A Google results page with a query. */
export const isSearchPage = (url: URL) =>
  isGoogleHost(url.hostname) && url.pathname === "/search" && !!url.searchParams.get("q")?.trim()

// Params worth keeping when we rebuild a results URL. Drops tracking (ei, ved, sa…) and paging (start).
const KEEP = ["q", "hl", "gl", "lr", "safe", "udm", "tbm", "tbs"]

/** The results URL with only the params that matter, on the user's Google domain. */
export function cleanUrl(url: URL) {
  const next = new URL("/search", url.origin)
  for (const key of KEEP) {
    const value = url.searchParams.get(key)
    if (value) next.searchParams.set(key, value)
  }
  return next
}

/** "qdr:w,li:1" → ["qdr:w", "li:1"] */
export const tbsParts = (url: URL) => (url.searchParams.get("tbs") ?? "").split(",").filter(Boolean)

const withTbs = (url: URL, parts: string[]) => withParams(cleanUrl(url), { tbs: parts.join(",") || undefined })

export const TIME_RANGES = [
  { id: "h", title: "Past hour", icon: Clock },
  { id: "d", title: "Past 24 hours", icon: Clock, keywords: ["day", "today"] },
  { id: "w", title: "Past week", icon: CalendarDays },
  { id: "m", title: "Past month", icon: CalendarRange },
  { id: "y", title: "Past year", icon: CalendarClock },
] as const

type TimeRange = (typeof TIME_RANGES)[number]["id"]

/** The active time filter: a `qdr` range, "custom" for a date range, or undefined for any time. */
export function timeRange(url: URL): TimeRange | "custom" | undefined {
  const parts = tbsParts(url)
  if (parts.includes("cdr:1")) return "custom"
  const qdr = parts.find((part) => part.startsWith("qdr:"))?.slice(4)
  return TIME_RANGES.find((range) => range.id === qdr)?.id
}

const isTimePart = (part: string) => /^(qdr|cdr|cd_min|cd_max):/.test(part)

/** The results URL filtered to a time range, or to any time for `undefined`. */
export function withTimeRange(url: URL, range: TimeRange | undefined) {
  const parts = tbsParts(url).filter((part) => !isTimePart(part))
  return withTbs(url, range ? [`qdr:${range}`, ...parts] : parts)
}

export const isVerbatim = (url: URL) => tbsParts(url).includes("li:1")

export function withVerbatim(url: URL, on: boolean) {
  const parts = tbsParts(url).filter((part) => part !== "li:1")
  return withTbs(url, on ? [...parts, "li:1"] : parts)
}

// Google moved some tabs from `tbm` to `udm`; both still work and redirect to each other.
export const TABS = [
  { id: "web", title: "Web results", subtitle: "Without AI Overviews", params: { udm: "14" }, also: [], icon: TextSearch },
  { id: "images", title: "Images", params: { udm: "2" }, also: ["tbm=isch"], icon: Image },
  { id: "news", title: "News", params: { tbm: "nws" }, also: ["udm=12"], icon: Newspaper },
  { id: "videos", title: "Videos", params: { udm: "7" }, also: ["tbm=vid"], icon: Video },
  { id: "shopping", title: "Shopping", params: { udm: "28" }, also: ["tbm=shop"], icon: ShoppingBag },
] as const

type Tab = (typeof TABS)[number]["id"]

/** The results tab on screen, or undefined for "All". */
export function currentTab(url: URL): Tab | undefined {
  const udm = url.searchParams.get("udm")
  const tbm = url.searchParams.get("tbm")
  const current = [udm && `udm=${udm}`, tbm && `tbm=${tbm}`].filter(Boolean) as string[]
  return TABS.find((tab) => {
    const own = Object.entries(tab.params).map(([key, value]) => `${key}=${value}`)
    return [...own, ...tab.also].some((param) => current.includes(param))
  })?.id
}

/** The same search on another tab, or on "All" for `undefined`. */
export function withTab(url: URL, tab: Tab | undefined) {
  const params = TABS.find((t) => t.id === tab)?.params ?? {}
  return withParams(cleanUrl(url), { udm: undefined, tbm: undefined, ...params })
}

/** "example.com", "https://docs.example.com/guide/" → "example.com", "docs.example.com/guide". Undefined if not a domain. */
export function siteFrom(text: string) {
  const site = text.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "")
  if (!/^([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(site)) return undefined
  const [host, ...path] = site.split("/")
  return [host.toLowerCase(), ...path].join("/")
}

/** Replaces any `site:` filter in the query with this one. */
export const withSite = (query: string, site: string) =>
  `${query.replace(/(^|\s)site:\S+/gi, "").trim()} site:${site}`.trim()

const enc = encodeURIComponent

export default defineSite({
  id: "google-search",
  name: "Google Search",
  description: "Filter results by date, switch tabs, and run the same search elsewhere",
  url: "https://www.google.com",
  matches: isSearchPage,

  commands({ url }) {
    const q = url.searchParams.get("q")!.trim()
    const range = timeRange(url)
    const tab = currentTab(url)
    const current = (on: boolean) => (on ? "Current" : undefined)
    const rangeItem = ({ id, title, icon, ...rest }: (typeof TIME_RANGES)[number]) =>
      navigate(`time-${id}`, title, withTimeRange(url, id), {
        icon,
        keywords: ["time", "date", "recent", ...("keywords" in rest ? rest.keywords : [])],
        hint: current(range === id),
      })
    const anyTime = navigate("time-any", "Any time", withTimeRange(url, undefined), {
      icon: History,
      keywords: ["time", "date", "clear"],
      hint: current(!range),
    })
    const items: Command[] = []

    // Time filters: the most used at the top level, all of them under "Time range…".
    if (range) items.push(anyTime)
    items.push(
      ...TIME_RANGES.filter(({ id }) => id === "w" || id === "y").map(rangeItem),
      {
        id: "time-range",
        title: "Time range…",
        subtitle: range === "custom" ? "Custom range" : TIME_RANGES.find(({ id }) => id === range)?.title ?? "Any time",
        icon: CalendarRange,
        keywords: ["time", "date", "hour", "day", "week", "month", "year", "recent"],
        children: {
          placeholder: "Pick a time range…",
          items: () => [anyTime, ...TIME_RANGES.map(rangeItem)],
        },
      },
    )

    const verbatim = isVerbatim(url)
    items.push(
      verbatim
        ? navigate("verbatim-off", "Turn off verbatim", withVerbatim(url, false), { icon: Quote, subtitle: "Include synonyms and related terms" })
        : navigate("verbatim", "Verbatim results", withVerbatim(url, true), { icon: Quote, subtitle: "Exact words only", keywords: ["exact"] }),
    )

    // Other tabs, keeping the query.
    if (tab) items.push(navigate("tab-all", "All results", withTab(url, undefined), { icon: LayoutList, keywords: ["tab"] }))
    for (const { id, title, icon, ...rest } of TABS) {
      if (id === tab) continue
      const subtitle = "subtitle" in rest ? rest.subtitle : undefined
      items.push(navigate(`tab-${id}`, title, withTab(url, id), { icon, subtitle, keywords: ["tab"] }))
    }
    // Maps URLs API: https://developers.google.com/maps/documentation/urls/get-started
    items.push(navigate("tab-maps", "Maps", `${url.origin}/maps/search/?api=1&query=${enc(q)}`, { icon: MapPin, keywords: ["tab"] }))

    // The same query on other sites.
    const lang = /^[a-z]{2}/i.exec(url.searchParams.get("hl") ?? "")?.[0].toLowerCase() ?? "en"
    const elsewhere = { subtitle: q, keywords: ["search", "elsewhere"] }
    items.push(
      openInNewTab("duckduckgo", "Search on DuckDuckGo", `https://duckduckgo.com/?q=${enc(q)}`, { icon: Search, ...elsewhere }),
      openInNewTab("bing", "Search on Bing", `https://www.bing.com/search?q=${enc(q)}`, { icon: Globe, ...elsewhere }),
      openInNewTab("perplexity", "Ask Perplexity", `https://www.perplexity.ai/search?q=${enc(q)}`, { icon: Sparkles, ...elsewhere }),
      openInNewTab("wikipedia", "Search on Wikipedia", `https://${lang}.wikipedia.org/w/index.php?search=${enc(q)}`, { icon: BookOpen, ...elsewhere }),
      openInNewTab("youtube", "Search on YouTube", `https://www.youtube.com/results?search_query=${enc(q)}`, { icon: Play, ...elsewhere }),
    )
    return items
  },

  search({ url, query }) {
    const site = siteFrom(query)
    if (!site) return []
    const q = withSite(url.searchParams.get("q") ?? "", site)
    return [navigate("limit-site", `Limit to site “${site}”`, withParams(cleanUrl(url), { q }), { icon: Search, subtitle: q })]
  },
})
