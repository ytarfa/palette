import { Archive, Code, CornerLeftUp, Eraser, Globe, History, House, Link, Search, Type } from "lucide-react"
import { COMMANDS } from "@/core/modes"
import { definePlugin, type Command, type PaletteContext } from "@/core/types"
import { copy, hostIs, navigate, openInNewTab, openUrl, parseUrl } from "./site-kit"

const GROUP = "Page"

/** Click IDs and campaign tags that are safe to drop on any site. Compared lowercase. */
const TRACKING_PARAMS = new Set([
  "fbclid", // Facebook
  "gclid", // Google Ads
  "gclsrc",
  "dclid", // Google Display & Video
  "gbraid", // Google Ads (iOS)
  "wbraid",
  "srsltid", // Google Merchant Center
  "_gl", // Google Analytics cross-domain linker
  "msclkid", // Microsoft Ads
  "mc_cid", // Mailchimp
  "mc_eid",
  "igshid", // Instagram
  "igsh",
  "_hsenc", // HubSpot
  "_hsmi",
  "__hstc",
  "__hssc",
  "__hsfp",
  "mkt_tok", // Marketo
  "ref_src", // X / Twitter
  "twclid",
  "yclid", // Yandex
  "ttclid", // TikTok
  "li_fat_id", // LinkedIn
])

/** `si` is a share-tracking ID on these hosts, but can mean anything elsewhere. */
const SHARE_ID_HOSTS = ["youtube.com", "youtu.be", "spotify.com"]

function paramName(pair: string): string {
  const raw = pair.split("=")[0].replace(/\+/g, " ")
  try {
    return decodeURIComponent(raw).toLowerCase()
  } catch {
    return raw.toLowerCase()
  }
}

function isTracking(name: string, url: URL): boolean {
  if (name.startsWith("utm_")) return true
  if (name === "si") return hostIs(url, ...SHARE_ID_HOSTS)
  return TRACKING_PARAMS.has(name)
}

/**
 * The URL without tracking parameters (`utm_*`, `fbclid`, `gclid`, …). Other
 * parameters keep their order and exact encoding, and the hash is kept.
 * Returns `url` unchanged when there's nothing to remove.
 */
export function removeTrackingParams(url: string): string {
  const parsed = parseUrl(url)
  if (!parsed?.search) return url
  const pairs = parsed.search.slice(1).split("&")
  const kept = pairs.filter((pair) => !pair || !isTracking(paramName(pair), parsed))
  if (kept.length === pairs.length) return url
  const query = kept.filter(Boolean).join("&")
  parsed.search = query ? `?${query}` : ""
  return parsed.toString()
}

export const hasTrackingParams = (url: string) => removeTrackingParams(url) !== url

/** One level up: the last path segment dropped, without query or hash. */
export function parentUrl(url: URL): string | undefined {
  const segments = url.pathname.split("/").filter(Boolean)
  if (!segments.length) return undefined
  return `${url.origin}/${segments.slice(0, -1).join("/")}`
}

/** The URL to look up or archive: no tracking parameters, no hash. */
function archivableUrl(url: URL): string {
  const clean = new URL(removeTrackingParams(url.href))
  clean.hash = ""
  return clean.href
}

export const waybackUrl = (url: URL) => `https://web.archive.org/web/*/${archivableUrl(url)}`
export const waybackSaveUrl = (url: URL) => `https://web.archive.org/save/${archivableUrl(url)}`

/** The site for `site:` searches; "www." is dropped so subdomains match too. */
export const searchHost = (url: URL) => url.hostname.replace(/^www\./, "")

function pageUrl(ctx: PaletteContext): URL | undefined {
  const url = parseUrl(ctx.tab?.url)
  return url && (url.protocol === "http:" || url.protocol === "https:") ? url : undefined
}

function commands(ctx: PaletteContext): Command[] {
  const url = pageUrl(ctx)
  if (!url) return []
  const items: Command[] = []

  const clean = removeTrackingParams(url.href)
  if (clean !== url.href) {
    items.push(
      copy("copy-clean-url", "Copy URL without tracking", clean, {
        icon: Link,
        keywords: ["clean", "utm", "strip", "parameters"],
      }),
      {
        id: "remove-tracking",
        title: "Remove tracking parameters",
        subtitle: clean,
        icon: Eraser,
        keywords: ["clean", "utm", "strip", "url"],
        run: (ctx) => openUrl(ctx, clean),
      },
    )
  }

  const parent = parentUrl(url)
  const root = `${url.origin}/`
  // With a single segment, the parent is the root: only list "Go to site root".
  if (parent && parent !== root) {
    items.push(navigate("up", "Go up one level", parent, { icon: CornerLeftUp, keywords: ["parent"] }))
  }
  if (url.href !== root) {
    items.push(navigate("root", "Go to site root", root, { icon: House, keywords: ["home"] }))
  }

  items.push(
    openInNewTab("wayback", "Open in the Wayback Machine", waybackUrl(url), {
      icon: History,
      keywords: ["archive", "internet archive", "snapshots"],
    }),
    openInNewTab("wayback-save", "Save to the Wayback Machine", waybackSaveUrl(url), {
      icon: Archive,
      keywords: ["archive", "internet archive", "snapshot"],
    }),
    openInNewTab("view-source", "View page source", `view-source:${url.href}`, {
      icon: Code,
      keywords: ["html"],
    }),
  )

  const title = ctx.tab?.title?.trim()
  if (title) items.push(copy("copy-title", "Copy page title", title, { icon: Type }))
  items.push(copy("copy-domain", "Copy domain", url.hostname, { icon: Globe, keywords: ["host"] }))

  return items.map((item) => ({ ...item, group: GROUP }))
}

function search(ctx: PaletteContext): Command[] {
  const url = pageUrl(ctx)
  const query = ctx.query.trim()
  if (!url || !query) return []
  const host = searchHost(url)
  return [
    {
      id: "search-site",
      title: `Search “${query}” on ${host}`,
      group: GROUP,
      icon: Search,
      alwaysShow: true,
      run: () => chrome.search.query({ text: `site:${host} ${query}`, disposition: "NEW_TAB" }),
    },
  ]
}

/** ⌘⇧K — tools for whatever page you're on. */
export default definePlugin({
  id: "page-tools",
  name: "Page tools",
  description: "Remove tracking parameters, go up a level, open in the Wayback Machine, search the site",
  category: "general",
  sources: [
    { mode: COMMANDS.id, items: commands },
    { mode: COMMANDS.id, dynamic: true, items: search },
  ],
})
