import { AppWindow, Copy, Fingerprint, Link, Maximize2 } from "lucide-react"
import type { Command } from "@/core/types"
import { copy, defineSite, markdownLink, navigate, openUrl } from "../site-kit"

const ID = /^[0-9a-f]{32}$/i

/** A 32-character page, database or view ID, from either the plain or the dashed UUID form. */
function toId(value: string | null | undefined) {
  const id = value?.replace(/-/g, "").toLowerCase()
  return id && ID.test(id) ? id : undefined
}

/** "0123456789abcdef0123456789abcdef" → "01234567-89ab-cdef-0123-456789abcdef" */
export const toUuid = (id: string) =>
  `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`

const isNotionSo = (url: URL) => url.hostname === "www.notion.so" || url.hostname === "notion.so"

/**
 * The page in the URL, and the one opened in a peek or side view (`p=`).
 * `/acme/Roadmap-0123…` or `/0123…`; `v=` is a database view.
 */
export function parse(url: URL) {
  const last = url.pathname.split("/").filter(Boolean).pop() ?? ""
  const match = last.match(/(?:^|-)([0-9a-f]{32})$/i)
  const page = match ? match[1].toLowerCase() : undefined
  if (!page) return {}
  return { page, view: toId(url.searchParams.get("v")), peek: toId(url.searchParams.get("p")) }
}

/** Origin for links: published pages keep their notion.site host, the app uses www.notion.so. */
const originOf = (url: URL) => (isNotionSo(url) ? "https://www.notion.so" : url.origin)

/**
 * The link to share for what's on screen, without tracking params (`pvs`, `pm`, `source`…).
 * A peeked page links to itself; a database keeps its view.
 */
export function cleanLink(url: URL) {
  const { page, view, peek } = parse(url)
  if (!page) return undefined
  const origin = originOf(url)
  if (peek) return `${origin}/${peek}`
  const link = new URL(origin + url.pathname)
  if (view) link.searchParams.set("v", view)
  // A link to a block on the page.
  if (/^#[0-9a-f]{32}$/i.test(url.hash)) link.hash = url.hash
  return link.toString()
}

/** "(2) Q3 Roadmap | Notion" → "Q3 Roadmap" */
export function cleanTitle(title = "") {
  return title.replace(/^\(\d+\+?\)\s*/, "").replace(/\s+[|·–—-]\s+Notion$/, "").trim()
}

export default defineSite({
  id: "notion",
  name: "Notion",
  description: "Copy clean page links, page IDs and Markdown links, open pages in the desktop app",
  url: "https://www.notion.so",
  matches: (url) => url.protocol === "https:" && (isNotionSo(url) || url.hostname.endsWith(".notion.site")),

  commands({ url, tab }) {
    const { page, peek } = parse(url)
    const link = cleanLink(url)
    if (!page || !link) return []

    const id = peek ?? page
    const items: Command[] = []
    if (peek) {
      items.push(navigate("full-page", "Open as full page", link, { icon: Maximize2, subtitle: "Peeked page" }))
    }
    items.push(copy("copy-link", "Copy clean link", link, { icon: Link }))
    // The tab title is the page behind the peek, so only offer it for the page itself.
    const title = cleanTitle(tab?.title)
    if (!peek && title) {
      items.push(copy("copy-markdown", "Copy as Markdown link", markdownLink(title, link), { icon: Copy }))
    }
    items.push(
      copy("copy-id", "Copy page ID", id, { icon: Fingerprint, keywords: ["uuid"] }),
      copy("copy-uuid", "Copy page ID as UUID", toUuid(id), { icon: Fingerprint, keywords: ["uuid", "api"] }),
    )
    if (isNotionSo(url)) {
      // Same link with the notion:// scheme. Opened in the current tab: Chrome hands it to the app and stays on the page.
      const appUrl = link.replace(/^https:/, "notion:")
      items.push({
        id: "open-app",
        title: "Open in desktop app",
        subtitle: appUrl,
        icon: AppWindow,
        run: (ctx) => openUrl(ctx, appUrl),
      })
    }
    return items
  },
})
