import { Copy, Eye, FileDown, FilePlus, FolderOpen, Link } from "lucide-react"
import type { Command } from "@/core/types"
import { copy, defineSite, markdownLink, navigate, openUrl } from "../site-kit"

type Kind = "document" | "spreadsheets" | "presentation"

const EDITORS: Record<Kind, { noun: string; plural: string; suffix: string }> = {
  document: { noun: "document", plural: "documents", suffix: "Google Docs" },
  spreadsheets: { noun: "spreadsheet", plural: "spreadsheets", suffix: "Google Sheets" },
  presentation: { noun: "presentation", plural: "presentations", suffix: "Google Slides" },
}

/**
 * Editor, file id, signed-in account and sheet from a docs.google.com URL, e.g.
 * /document/d/<id>/edit, /spreadsheets/u/1/d/<id>/edit#gid=123.
 */
export function parse(url: URL) {
  const match = url.pathname.match(/^\/(document|spreadsheets|presentation)(?:\/u\/(\d+))?\/d\/([\w-]+)/)
  // /d/e/<id>/pub is a published copy, which can't be exported or copied.
  if (!match || match[3] === "e") return undefined
  const [, kind, account, id] = match
  const gid = new URLSearchParams(url.hash.slice(1)).get("gid") ?? url.searchParams.get("gid") ?? undefined
  return { kind: kind as Kind, id, account, gid: kind === "spreadsheets" ? gid : undefined }
}

/** "Q3 planning - Google Docs" → "Q3 planning" */
export function cleanTitle(title = "") {
  return title.replace(/\s+-\s+Google (Docs|Sheets|Slides)$/, "").trim()
}

/** Edit link without the account, `usp=` and other params. Sheets keep the `#gid=`. */
export function cleanLink(file: NonNullable<ReturnType<typeof parse>>) {
  const link = `https://docs.google.com/${file.kind}/d/${file.id}/edit`
  return file.gid ? `${link}#gid=${file.gid}` : link
}

interface Format {
  format: string
  title: string
  subtitle: string
  /** Export only the current sheet. */
  sheet?: boolean
}

const FORMATS: Record<Kind, Format[]> = {
  document: [
    { format: "pdf", title: "PDF", subtitle: ".pdf" },
    { format: "docx", title: "Microsoft Word", subtitle: ".docx" },
    { format: "md", title: "Markdown", subtitle: ".md" },
    { format: "txt", title: "Plain text", subtitle: ".txt" },
    { format: "odt", title: "OpenDocument", subtitle: ".odt" },
    { format: "rtf", title: "Rich text", subtitle: ".rtf" },
    { format: "epub", title: "EPUB", subtitle: ".epub" },
    { format: "html", title: "Web page", subtitle: ".html, zipped" },
  ],
  spreadsheets: [
    { format: "xlsx", title: "Microsoft Excel", subtitle: ".xlsx" },
    { format: "pdf", title: "PDF", subtitle: ".pdf" },
    { format: "csv", title: "CSV", subtitle: ".csv", sheet: true },
    { format: "tsv", title: "TSV", subtitle: ".tsv", sheet: true },
    { format: "ods", title: "OpenDocument", subtitle: ".ods" },
  ],
  presentation: [
    { format: "pptx", title: "Microsoft PowerPoint", subtitle: ".pptx" },
    { format: "pdf", title: "PDF", subtitle: ".pdf" },
    { format: "odp", title: "OpenDocument", subtitle: ".odp" },
    { format: "txt", title: "Plain text", subtitle: ".txt" },
  ],
}

/** The file served as an attachment: opening it in the current tab downloads without leaving the page. */
function download(id: string, title: string, url: string, subtitle: string): Command {
  return { id, title, subtitle, icon: FileDown, keywords: ["export", "download"], run: (ctx) => openUrl(ctx, url) }
}

export default defineSite({
  id: "google-docs",
  name: "Google Docs",
  description: "Download documents, spreadsheets and slides in any format, make a copy, copy clean links",
  url: "https://docs.google.com",
  matches: (url) => url.hostname === "docs.google.com" && !!parse(url),

  commands({ url, tab }) {
    const file = parse(url)
    if (!file) return []
    const { kind, id, account, gid } = file
    const { noun, plural, suffix } = EDITORS[kind]
    const home = `https://docs.google.com/${kind}${account ? `/u/${account}` : ""}`
    const base = `${home}/d/${id}`
    const name = cleanTitle(tab?.title) || `Untitled ${noun}`
    const link = cleanLink(file)

    const exportUrl = ({ format, sheet }: Format) =>
      `${base}/export?format=${format}${sheet && gid ? `&gid=${gid}` : ""}`
    const subtitleFor = (f: Format) => (f.sheet ? `${f.subtitle}, ${gid ? "current sheet" : "first sheet"}` : f.subtitle)
    const formats = FORMATS[kind]
    const top = kind === "spreadsheets" ? ["xlsx", "csv"] : ["pdf"]

    return [
      ...formats
        .filter((f) => top.includes(f.format))
        .map((f) => download(`download-${f.format}`, `Download as ${f.title}`, exportUrl(f), subtitleFor(f))),
      {
        id: "download",
        title: "Download as…",
        subtitle: formats.map((f) => f.title).join(", "),
        icon: FileDown,
        keywords: ["export", "format"],
        children: {
          placeholder: "Pick a format…",
          items: () => formats.map((f) => download(`download-${f.format}`, f.title, exportUrl(f), subtitleFor(f))),
        },
      },
      copy("copy-link", "Copy link", link, { icon: Link, keywords: ["url", "share"] }),
      copy("copy-markdown", "Copy as Markdown link", markdownLink(name, link), { icon: Copy }),
      navigate("make-copy", "Make a copy", `${base}/copy`, { icon: Copy, subtitle: name, keywords: ["duplicate"] }),
      navigate("preview", "Preview", `${base}/preview`, { icon: Eye, subtitle: "Read-only, without the editor" }),
      navigate("new", `New ${noun}`, `${home}/create`, { icon: FilePlus, subtitle: suffix }),
      navigate("home", `All ${plural}`, `${home}/`, { icon: FolderOpen, subtitle: suffix }),
    ]
  },
})
