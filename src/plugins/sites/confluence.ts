import { Clock, Copy, FilePen, FilePlus, FileText, Hash, History, House, LayoutDashboard, Link, Search, SquarePen } from "lucide-react"
import type { Command } from "@/core/types"
import { copy, defineSite, hostIs, markdownLink, navigate } from "../site-kit"

/**
 * Space, page and view from a Confluence Cloud URL:
 * /wiki/spaces/KEY/pages/123456/Page+Title, /wiki/spaces/KEY/pages/edit-v2/123456,
 * /wiki/spaces/KEY/history/123456.
 */
export function parse(url: URL) {
  const [wiki, spaces, key, section, ...rest] = url.pathname.split("/").filter(Boolean)
  if (wiki !== "wiki" || spaces !== "spaces" || !key) return {}
  const space = safeDecode(key)
  if (section === "pages" && (rest[0] === "edit-v2" || rest[0] === "edit") && /^\d+$/.test(rest[1] ?? "")) {
    return { space, page: rest[1], view: "edit" as const }
  }
  if (section === "pages" && /^\d+$/.test(rest[0] ?? "")) {
    return { space, page: rest[0], slug: rest[1], view: "page" as const }
  }
  if (section === "history" && /^\d+$/.test(rest[0] ?? "")) {
    return { space, page: rest[0], slug: rest[1], view: "history" as const }
  }
  return { space }
}

/** "Release checklist - Platform Engineering - Confluence" → "Release checklist" */
export function cleanTitle(title = "") {
  const parts = title.split(" - ")
  if (parts.length < 3 || parts.at(-1) !== "Confluence") return undefined
  return parts.slice(0, -2).join(" - ").trim() || undefined
}

/** "Release+checklist" → "Release checklist" */
export function slugTitle(slug: string | undefined) {
  return slug ? safeDecode(slug.replace(/\+/g, " ")).trim() || undefined : undefined
}

function safeDecode(text: string) {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

export default defineSite({
  id: "confluence",
  name: "Confluence",
  description: "Edit pages, view page history, copy page links and jump to spaces",
  url: "https://www.atlassian.com/software/confluence",
  matches: (url) => hostIs(url, "atlassian.net") && /^\/wiki(\/|$)/.test(url.pathname),

  commands({ url, tab }) {
    const { space, page, slug, view } = parse(url)
    const wiki = (path: string) => `${url.origin}/wiki${path}`
    const items: Command[] = []

    if (space && page) {
      const key = encodeURIComponent(space)
      const title = cleanTitle(tab?.title) ?? slugTitle(slug) ?? `Page ${page}`
      const link = wiki(`/spaces/${key}/pages/${page}`)
      const subtitle = title
      if (view !== "edit") items.push(navigate("edit", "Edit page", wiki(`/spaces/${key}/pages/edit-v2/${page}`), { icon: SquarePen, subtitle }))
      if (view !== "page") items.push(navigate("view", "View page", link, { icon: FileText, subtitle }))
      if (view !== "history") items.push(navigate("history", "Page history", wiki(`/spaces/${key}/history/${page}`), { icon: History, subtitle }))
      items.push(
        copy("page-markdown", "Copy page as Markdown link", markdownLink(title, slug ? `${link}/${slug}` : link), { icon: Copy }),
        copy("page-link", "Copy page link", link, { icon: Link }),
        copy("page-id", "Copy page ID", page, { icon: Hash }),
        navigate("new-child", "Create child page", wiki(`/create-content/page?spaceKey=${key}&parentPageId=${page}`), { icon: FilePlus, subtitle }),
      )
    }
    if (space) {
      const key = encodeURIComponent(space)
      const subtitle = space
      items.push(
        navigate("space-overview", "Space overview", wiki(`/spaces/${key}/overview`), { icon: LayoutDashboard, subtitle }),
        navigate("new-page", "Create page", wiki(`/create-content/page?spaceKey=${key}`), { icon: FilePlus, subtitle }),
      )
    }
    items.push(
      navigate("home", "Home", wiki("/home"), { icon: House }),
      navigate("recent", "Recently visited", wiki("/recent/visited"), { icon: Clock }),
      navigate("drafts", "Drafts", wiki("/recent/draft"), { icon: FilePen }),
    )
    return items
  },

  search({ url, query }) {
    const { space } = parse(url)
    const q = query.trim()
    const search = (spaceKey?: string) =>
      `${url.origin}/wiki/search?text=${encodeURIComponent(q)}${spaceKey ? `&spaces=${encodeURIComponent(spaceKey)}` : ""}`
    return [
      ...(space ? [navigate("search-space", `Search “${q}” in ${space}`, search(space), { icon: Search })] : []),
      navigate("search-all", `Search Confluence for “${q}”`, search(), { icon: Search }),
    ]
  },
})
