import { Readability } from "@mozilla/readability"
import { FileText, TextQuote } from "lucide-react"
import TurndownService from "turndown"
import { definePlugin, type PaletteContext } from "@/core/types"
import { removeTrackingParams } from "./page-tools"
import { markdownLink, parseUrl, runInPage } from "./site-kit"

const GROUP = "Copy"

/** Up to this many words, a text fragment matches the selection exactly. */
const MAX_EXACT_WORDS = 10
/** Otherwise, it matches from the first few words to the last few. */
const EDGE_WORDS = 4

/**
 * Percent-encode a text fragment term. `-`, `,` and `&` are syntax in the
 * directive; parentheses are encoded so the URL is safe in a Markdown link.
 */
const encodeTerm = (term: string) =>
  encodeURIComponent(term).replace(/[-()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)

/**
 * A text fragment directive (`:~:text=…`) that highlights `selection`, or
 * undefined if it's blank. Short selections are matched exactly; longer ones,
 * or ones that span several blocks, with the `start,end` form.
 * https://wicg.github.io/scroll-to-text-fragment/
 */
export function textFragment(selection: string): string | undefined {
  // Each term has to be within one block, and Selection.toString() puts line
  // breaks (or tabs, for table cells) between blocks.
  const lines = selection
    .split(/[\r\n\t]+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
  if (!lines.length) return undefined
  const first = lines[0].split(" ")
  if (lines.length === 1 && first.length <= MAX_EXACT_WORDS) return `:~:text=${encodeTerm(lines[0])}`

  const start = first.slice(0, EDGE_WORDS).join(" ")
  const last = lines.length === 1 ? first.slice(EDGE_WORDS) : lines[lines.length - 1].split(" ")
  // `end` matches its first occurrence after `start`: add words until that's the end of the selection.
  const text = lines.join(" ")
  let count = Math.min(EDGE_WORDS, last.length)
  let end = last.slice(-count).join(" ")
  while (count < last.length && text.indexOf(end, start.length) < text.length - end.length) {
    end = last.slice(-++count).join(" ")
  }
  return `:~:text=${encodeTerm(start)},${encodeTerm(end)}`
}

/** The page URL without tracking parameters, its hash replaced by a text fragment for `selection`. */
export function quoteUrl(url: string, selection: string): string {
  const base = removeTrackingParams(url).split("#")[0]
  const fragment = textFragment(selection)
  return fragment ? `${base}#${fragment}` : base
}

/** `selection` as a Markdown quote, followed by a link to the page. */
export function formatQuote(selection: string, title: string, url: string): string {
  const lines = selection
    .replace(/\r\n?/g, "\n")
    .trim()
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line, i, all) => line || all[i - 1]) // one blank line at most
    .map((line) => (line ? `> ${line}` : ">"))
  return [...lines, ">", `> — ${markdownLink(title, quoteUrl(url, selection))}`].join("\n")
}

/** `url` resolved against `base`, if it uses one of `protocols`. */
function absoluteUrl(url: string | null, base: string, protocols: string[]): string | undefined {
  if (!url?.trim()) return undefined
  try {
    const resolved = new URL(url.trim(), base)
    return protocols.includes(resolved.protocol) ? resolved.href : undefined
  } catch {
    return undefined
  }
}

const LINK_PROTOCOLS = ["http:", "https:", "mailto:", "tel:", "ftp:"]
const IMAGE_PROTOCOLS = ["http:", "https:"]
const REMOVED_TAGS = new Set(["script", "style", "noscript", "template", "iframe", "svg", "canvas"])

/** Like Turndown's own escaping for link destinations and titles. */
const destination = (url: string) => url.replace(/[<>()]/g, "\\$&")
const titlePart = (title: string | null) => {
  const clean = title?.replace(/(\n+\s*)+/g, "\n").replace(/"/g, '\\"')
  return clean ? ` "${clean}"` : ""
}

/** "language-js" (Prism, highlight.js) or "highlight-source-js" (GitHub) on the block or its parent. */
function codeLanguage(node: HTMLElement): string {
  const classes = `${node.className} ${(node.parentNode as HTMLElement | null)?.className ?? ""}`
  return /(?:language|lang|highlight-source)-([\w+#-]+)/.exec(classes)?.[1] ?? ""
}

/**
 * Convert HTML to Markdown. Links and images are made absolute against
 * `baseUrl`; `javascript:` links become plain text, and `data:` images are dropped.
 */
export function htmlToMarkdown(html: string, baseUrl: string): string {
  const service = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    hr: "---",
  })
  service.remove((node) => REMOVED_TAGS.has(node.nodeName.toLowerCase()))
  service.addRule("absoluteLink", {
    filter: (node) => node.nodeName === "A" && node.hasAttribute("href"),
    replacement(content, node) {
      const href = absoluteUrl((node as HTMLElement).getAttribute("href"), baseUrl, LINK_PROTOCOLS)
      if (!href || !content.trim()) return content
      return `[${content}](${destination(href)}${titlePart((node as HTMLElement).getAttribute("title"))})`
    },
  })
  service.addRule("absoluteImage", {
    filter: "img",
    replacement(_content, node) {
      const img = node as HTMLElement
      const src = absoluteUrl(img.getAttribute("src"), baseUrl, IMAGE_PROTOCOLS)
      if (!src) return ""
      const alt = service.escape(img.getAttribute("alt")?.replace(/\s+/g, " ").trim() ?? "")
      return `![${alt}](${destination(src)}${titlePart(img.getAttribute("title"))})`
    },
  })
  // Turndown only fences <pre><code>; many sites highlight code in a bare <pre>.
  service.addRule("bareCodeBlock", {
    filter: (node) => node.nodeName === "PRE" && node.firstChild?.nodeName !== "CODE",
    replacement(_content, node) {
      const code = (node.textContent ?? "").replace(/\n$/, "")
      const longestRun = Math.max(0, ...(code.match(/`+/g) ?? []).map((run) => run.length))
      const fence = "`".repeat(Math.max(3, longestRun + 1))
      return `\n\n${fence}${codeLanguage(node as HTMLElement)}\n${code}\n${fence}\n\n`
    },
  })
  return service.turndown(html).trim()
}

/** The page as a Markdown document: a title, the source, then the content. */
export function markdownDocument(title: string, url: string, markdown: string): string {
  return `# ${title.replace(/\s+/g, " ").trim()}\n\nSource: <${url}>\n\n${markdown.trim()}\n`
}

/** The main content of a page (Readability), or its whole body if that finds nothing. */
function extractContent(html: string, baseUrl: string): { title?: string; html: string } {
  const doc = new DOMParser().parseFromString(html, "text/html")
  // The parsed document's URL is the palette's: resolve relative links against the page instead.
  const base = doc.createElement("base")
  base.setAttribute("href", baseUrl)
  doc.head.prepend(base)
  try {
    // Readability modifies the document it parses; keep the original for the fallback.
    const article = new Readability(doc.cloneNode(true) as Document).parse()
    if (article?.content && article.textContent?.trim()) {
      return { title: article.title?.trim() || undefined, html: article.content }
    }
  } catch (error) {
    console.warn("[palette] Readability failed", error)
  }
  return { html: doc.body?.innerHTML ?? "" }
}

function isWebPage(ctx: PaletteContext): boolean {
  const url = parseUrl(ctx.tab?.url)
  return url?.protocol === "http:" || url?.protocol === "https:"
}

const pageTitle = (ctx: PaletteContext) => ctx.tab?.title?.trim() || parseUrl(ctx.tab?.url)?.hostname || ""

/** ⌘⇧K — copy the selection as a Markdown quote with a link back, or the page as Markdown. */
export default definePlugin({
  id: "copy-content",
  name: "Copy page content",
  description: "Copy the selection as a quote with a link, or the page as Markdown",
  category: "general",
  commands: [
    {
      id: "copy-quote",
      title: "Copy selection as quote",
      subtitle: "Markdown, with a link to the highlighted text",
      group: GROUP,
      icon: TextQuote,
      keywords: ["blockquote", "cite", "highlight", "text fragment", "markdown"],
      when: isWebPage,
      async run(ctx) {
        // The selection lives in the page, so it survives the palette taking focus.
        const selection = await runInPage(ctx, () => window.getSelection()?.toString() ?? "")
        // Nothing selected: leave the clipboard alone, and stay open so that's noticeable.
        if (!selection?.trim()) return { keepOpen: true }
        await ctx.copy(formatQuote(selection, pageTitle(ctx), ctx.tab!.url!))
      },
    },
    {
      id: "copy-markdown",
      title: "Copy page as Markdown",
      subtitle: "The main content, without menus and ads",
      group: GROUP,
      icon: FileText,
      keywords: ["readability", "reader", "article", "text", "llm"],
      when: isWebPage,
      async run(ctx) {
        const page = await runInPage(ctx, () => ({
          html: document.documentElement.outerHTML,
          baseUrl: document.baseURI,
        }))
        if (!page) return
        const { title, html } = extractContent(page.html, page.baseUrl)
        const markdown = htmlToMarkdown(html, page.baseUrl)
        await ctx.copy(markdownDocument(title || pageTitle(ctx), removeTrackingParams(ctx.tab!.url!), markdown))
      },
    },
  ],
})
