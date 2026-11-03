import { Clock, Code, Copy, FilePlus, KeyRound, Link, MonitorDown, Pencil, Play, Presentation, StickyNote } from "lucide-react"
import type { Command } from "@/core/types"
import { copy, defineSite, markdownLink, navigate, openUrl } from "../site-kit"

/** First path segments of a file URL, e.g. /design/<key>/<name>. /file/ is the older form. */
const FILE_TYPES = new Set(["design", "file", "board", "proto", "slides"])

export interface FigmaFile {
  /** "design", "file", "board", "proto" or "slides". */
  type: string
  key: string
  /** Branch key, from /design/<key>/branch/<branchKey>/<name>. */
  branch?: string
  /** The name segment as it appears in the URL, e.g. "Checkout-flow". */
  slug?: string
  /** Selected node, e.g. "12-34". */
  node?: string
}

/** The file a figma.com URL points to, or undefined for the file browser, marketing pages, /design/new… */
export function parse(url: URL): FigmaFile | undefined {
  const [type, key, ...rest] = url.pathname.split("/").filter(Boolean)
  if (!FILE_TYPES.has(type) || !key || !/^[A-Za-z0-9]{10,}$/.test(key)) return undefined
  const branch = rest[0] === "branch" && rest[1] ? rest[1] : undefined
  const slug = branch ? rest[2] : rest[0]
  return { type, key, branch, slug, node: url.searchParams.get("node-id") || undefined }
}

const figma = (path: string) => `https://www.figma.com${path}`

/** A file URL without share params, keeping only `node-id` if given. */
export function fileUrl(file: FigmaFile, { type = file.type, node }: { type?: string; node?: string } = {}) {
  const path = [type, file.key, ...(file.branch ? ["branch", file.branch] : []), ...(file.slug ? [file.slug] : [])]
  return figma(`/${path.join("/")}`) + (node ? `?node-id=${encodeURIComponent(node)}` : "")
}

/** "Checkout flow – Figma" → "Checkout flow". Falls back to the URL's name segment. */
export function cleanTitle(title = "", slug = "") {
  const name = title.replace(/\s+[–—-]\s+(Figma|FigJam)(\s+\w+)?$/, "").trim()
  if (name && name !== title.trim()) return name
  try {
    return decodeURIComponent(slug).replace(/-/g, " ").trim() || title.trim()
  } catch {
    return slug.replace(/-/g, " ").trim() || title.trim()
  }
}

export default defineSite({
  id: "figma",
  name: "Figma",
  description: "Copy clean file and selection links, switch to Dev Mode, present prototypes",
  url: "https://www.figma.com",
  matches: (url) => url.hostname === "www.figma.com" || url.hostname === "figma.com",

  commands({ url, tab }) {
    const file = parse(url)
    const items: Command[] = []

    if (file) {
      const design = file.type === "design" || file.type === "file"
      const name = cleanTitle(tab?.title, file.slug) || file.key
      const link = fileUrl(file)
      if (file.node) {
        items.push(copy("copy-node-link", "Copy link to selection", fileUrl(file, { node: file.node }), { icon: Link, subtitle: `Node ${file.node}` }))
      }
      items.push(
        copy("copy-link", "Copy link", link, { icon: Link }),
        copy("copy-markdown", "Copy as Markdown link", markdownLink(name, link), { icon: Copy }),
        copy("copy-key", "Copy file key", file.key, { icon: KeyRound }),
      )
      if (design) {
        const dev = url.searchParams.get("m") === "dev"
        const devUrl = `${fileUrl(file, { node: file.node })}${file.node ? "&" : "?"}m=dev`
        items.push(
          dev
            ? navigate("design-mode", "Switch to Design mode", fileUrl(file, { node: file.node }), { icon: Pencil, subtitle: name })
            : navigate("dev-mode", "Switch to Dev Mode", devUrl, { icon: Code, subtitle: name }),
          navigate("prototype", "Present prototype", fileUrl(file, { type: "proto", node: file.node }), { icon: Play, subtitle: name }),
        )
      }
      if (file.type === "proto") {
        items.push(navigate("design-file", "Open design file", fileUrl(file, { type: "design", node: file.node }), { icon: Pencil, subtitle: name }))
      }
      if (design || file.type === "board") {
        const app = `figma://file/${file.key}${file.node ? `?node-id=${encodeURIComponent(file.node)}` : ""}`
        items.push({ id: "desktop-app", title: "Open in desktop app", subtitle: name, icon: MonitorDown, run: (ctx) => openUrl(ctx, app) })
      }
    }

    items.push(
      navigate("recents", "Recents", figma("/files/recents-and-sharing"), { icon: Clock }),
      navigate("new-design", "New design file", "https://figma.new", { icon: FilePlus }),
      navigate("new-board", "New FigJam board", "https://figjam.new", { icon: StickyNote }),
      navigate("new-slides", "New slide deck", figma("/slides/new"), { icon: Presentation }),
    )
    return items
  },
})
