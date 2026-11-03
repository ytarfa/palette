import { BookOpenText, Moon, Printer } from "lucide-react"
import { definePlugin, type PaletteContext } from "@/core/types"
import { parseUrl, runInPage } from "./site-kit"

const GROUP = "View"

/** Custom element hosting the reader overlay; the dark-mode CSS leaves it alone. */
export const READER_TAG = "palette-reader"
/** The `<style>` element that turns dark mode on. */
export const DARK_MODE_ID = "palette-dark-mode"
/** Lets the palette overlay close before `window.print()` snapshots the page. */
export const PRINT_DELAY = 150

const isWebPage = (ctx: PaletteContext) => {
  const url = parseUrl(ctx.tab?.url)
  return url?.protocol === "http:" || url?.protocol === "https:"
}

// ---------------------------------------------------------------------------
// Reader view

/** What the reader overlay shows. `content` is Readability's HTML, sanitized again in the page. */
export interface ReaderArticle {
  title?: string
  byline?: string
  content: string
  dir?: string
  lang?: string
}

/** "Jane Doe", "Example News" → "Jane Doe · Example News", without blanks or repeats. */
export function bylineOf(...parts: (string | null | undefined)[]): string | undefined {
  const unique = [...new Set(parts.map((part) => part?.trim()).filter(Boolean))]
  return unique.length ? unique.join(" · ") : undefined
}

/**
 * The page's main article, extracted with Readability. A `<base>` makes
 * relative links and images resolve against the page's URL rather than the
 * palette's.
 */
export async function extractArticle(html: string, url: string): Promise<ReaderArticle | null> {
  const doc = new DOMParser().parseFromString(html, "text/html")
  const existing = doc.querySelector("base[href]")
  if (existing) {
    existing.setAttribute("href", new URL(existing.getAttribute("href")!, url).href)
  } else {
    const base = doc.createElement("base")
    base.setAttribute("href", url)
    doc.head.prepend(base)
  }
  // Loaded on demand: only this command needs it.
  const { Readability } = await import("@mozilla/readability")
  const article = new Readability(doc).parse()
  if (!article?.content) return null
  return {
    title: article.title?.trim() || undefined,
    byline: bylineOf(article.byline, article.siteName),
    content: article.content,
    dir: article.dir ?? undefined,
    lang: article.lang ?? undefined,
  }
}

export const READER_CSS = `
.scroller {
  --bg: #fbfaf7; --fg: #1f1f21; --muted: #6b6b70; --link: #0b57d0; --rule: #e2dfd8; --code: #f0ede6;
  position: fixed; inset: 0; overflow-y: auto; overscroll-behavior: contain;
  background: var(--bg); color: var(--fg); color-scheme: light; outline: none;
  -webkit-font-smoothing: antialiased;
}
@media (prefers-color-scheme: dark) {
  .scroller {
    --bg: #1c1c1e; --fg: #e4e4e6; --muted: #9a9aa0; --link: #8ab4f8; --rule: #3a3a3d; --code: #2a2a2d;
    color-scheme: dark;
  }
}
.close {
  position: fixed; top: 16px; right: 20px; width: 36px; height: 36px; border: 0; border-radius: 50%;
  background: transparent; color: var(--muted); font: 24px/1 system-ui, sans-serif; cursor: pointer;
}
.close:hover { background: var(--code); color: var(--fg); }
article {
  box-sizing: border-box; max-width: calc(70ch + 48px); margin: 0 auto; padding: 72px 24px 128px;
  font: 400 19px/1.7 Charter, "Bitstream Charter", "Sitka Text", Cambria, Georgia, serif;
  overflow-wrap: break-word;
}
header { margin-bottom: 2.4em; padding-bottom: 1.4em; border-bottom: 1px solid var(--rule); }
h1, h2, h3, h4, h5, h6 { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; line-height: 1.25; }
header h1 { margin: 0 0 0.5em; font-size: 2.1em; font-weight: 700; letter-spacing: -0.015em; }
.byline { margin: 0; font: 15px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--muted); }
.content h1, .content h2, .content h3, .content h4, .content h5, .content h6 { margin: 1.8em 0 0.6em; }
.content h1 { font-size: 1.6em; } .content h2 { font-size: 1.35em; } .content h3 { font-size: 1.15em; }
.content h4, .content h5, .content h6 { font-size: 1em; }
p, ul, ol, dl, blockquote, pre, table { margin: 0 0 1.2em; }
ul, ol { padding-left: 1.5em; }
li { margin: 0.3em 0; }
a { color: var(--link); text-decoration-thickness: 1px; text-underline-offset: 0.15em; }
img, video, svg { max-width: 100%; height: auto; }
iframe { display: block; max-width: 100%; border: 0; }
figure { margin: 1.6em 0; }
figcaption { margin-top: 0.6em; font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--muted); }
blockquote { margin-left: 0; padding-left: 1.2em; border-left: 3px solid var(--rule); color: var(--muted); }
code, pre, kbd, samp { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.85em; }
:not(pre) > code { padding: 0.1em 0.35em; border-radius: 4px; background: var(--code); }
pre { padding: 1em 1.2em; border-radius: 8px; background: var(--code); overflow-x: auto; line-height: 1.5; }
pre code { font-size: inherit; }
table { display: block; max-width: 100%; overflow-x: auto; border-collapse: collapse; font-size: 0.9em; }
th, td { padding: 0.4em 0.7em; border: 1px solid var(--rule); text-align: left; vertical-align: top; }
hr { margin: 2.4em 0; border: 0; border-top: 1px solid var(--rule); }
.empty { margin-top: 30vh; text-align: center; font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--muted); }
`

// The functions below run in the page. They're serialized by executeScript,
// so they can only use their arguments.

/** Close the reader if it's open (returns null), else return the page's HTML. */
function closeReaderOrGetHtml(tag: string): string | null {
  const host = document.querySelector(tag)
  if (!host) return document.documentElement.outerHTML
  host.dispatchEvent(new Event("palette:close"))
  host.remove()
  return null
}

/** Show the article over the page, in a shadow root. Escape, the × button or running the command again closes it. */
function openReader(tag: string, article: ReaderArticle | null, css: string) {
  document.querySelector(tag)?.dispatchEvent(new Event("palette:close"))
  const root = document.documentElement
  const host = document.createElement(tag)
  host.style.cssText = "all: initial; position: fixed; inset: 0; z-index: 2147483646;"
  const shadow = host.attachShadow({ mode: "open" })
  const style = document.createElement("style")
  style.textContent = css
  const scroller = document.createElement("div")
  scroller.className = "scroller"
  scroller.tabIndex = -1
  const closeButton = document.createElement("button")
  closeButton.type = "button"
  closeButton.className = "close"
  closeButton.title = "Close reader view (Esc)"
  closeButton.textContent = "×"
  const main = document.createElement("article")

  if (article) {
    if (article.dir) main.dir = article.dir
    if (article.lang) main.lang = article.lang
    const header = document.createElement("header")
    const title = document.createElement("h1")
    title.textContent = article.title || document.title
    header.append(title)
    if (article.byline) {
      const byline = document.createElement("p")
      byline.className = "byline"
      byline.textContent = article.byline
      header.append(byline)
    }
    // Parsed inert in a template, then cleaned before it's attached.
    const template = document.createElement("template")
    template.innerHTML = article.content
    const content = template.content
    content.querySelectorAll("script, style, link, meta, base, object, embed, frame, frameset, noscript").forEach((el) => el.remove())
    content.querySelectorAll("*").forEach((el) => {
      for (const { name, value } of [...el.attributes]) {
        // Browsers ignore whitespace and control characters in URLs: "java\nscript:".
        const url = value.replace(/[^\x21-\x7e]/g, "").toLowerCase()
        if (name.startsWith("on") || name === "srcdoc" || url.startsWith("javascript:") || url.startsWith("vbscript:")) {
          el.removeAttribute(name)
        }
      }
    })
    const body = document.createElement("div")
    body.className = "content"
    body.append(content)
    main.append(header, body)
  } else {
    const empty = document.createElement("p")
    empty.className = "empty"
    empty.textContent = "No article found on this page."
    main.append(empty)
  }
  scroller.append(closeButton, main)
  shadow.append(style, scroller)

  // Lock page scrolling, keeping whatever inline overflow was there.
  const locked = [root, document.body].filter((el): el is HTMLElement => !!el).map((el) => {
    const previous = [el.style.getPropertyValue("overflow"), el.style.getPropertyPriority("overflow")] as const
    el.style.setProperty("overflow", "hidden", "important")
    return () => el.style.setProperty("overflow", ...previous)
  })
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return
    e.preventDefault()
    e.stopImmediatePropagation()
    close()
  }
  const close = () => {
    window.removeEventListener("keydown", onKey, true)
    host.remove()
    locked.forEach((unlock) => unlock())
  }
  host.addEventListener("palette:close", close)
  closeButton.addEventListener("click", close)
  window.addEventListener("keydown", onKey, true)
  root.append(host)
  // Once the palette has closed and handed focus back, so arrows and space scroll the article.
  setTimeout(() => scroller.focus({ preventScroll: true }), 150)
}

async function toggleReader(ctx: PaletteContext) {
  const html = await runInPage(ctx, closeReaderOrGetHtml, READER_TAG)
  if (typeof html !== "string") return
  const article = await extractArticle(html, ctx.tab!.url!)
  await runInPage(ctx, openReader, READER_TAG, article, READER_CSS)
}

// ---------------------------------------------------------------------------
// Dark mode

const INVERT = "invert(1) hue-rotate(180deg)"
/** Re-inverted so they look normal. Background images only when set inline. */
const MEDIA = `img, video, canvas, iframe, embed, object, svg image, [style*="url("]`

/**
 * Inverts the page, then inverts media back. Media inside media (an image in
 * a background-image block) would be flipped twice, so it's reset. Fullscreen
 * elements sit outside the inverted page. The palette and reader view keep
 * their own colors.
 */
export const DARK_MODE_CSS = `
html { filter: ${INVERT} !important; }
:is(${MEDIA}), palette-root, ${READER_TAG} { filter: ${INVERT} !important; }
:is(${MEDIA}) :is(${MEDIA}) { filter: none !important; }
:fullscreen, :fullscreen :is(${MEDIA}) { filter: none !important; }
`

/**
 * Add or remove the dark-mode stylesheet. It lives in the page, so it stays
 * on after the palette closes (until reload). Pages that are already dark
 * get inverted to light, which is a way to get a light page too.
 */
function toggleDarkMode(id: string, css: string) {
  const existing = document.getElementById(id)
  if (existing) return void existing.remove()
  // An inverted page needs a background to invert: without one, the
  // white canvas shows through untouched.
  const background = (el: Element | null) => {
    const color = el ? getComputedStyle(el).backgroundColor : ""
    return color && color !== "transparent" && color !== "rgba(0, 0, 0, 0)" ? color : undefined
  }
  const html = document.documentElement
  const fill = background(html) ? undefined : (background(document.body) ?? "#fff")
  const style = document.createElement("style")
  style.id = id
  style.textContent = css + (fill ? `html { background-color: ${fill} !important; }` : "")
  ;(document.head ?? html).append(style)
}

// ---------------------------------------------------------------------------
// Print

/** Print after a delay, so the palette's overlay is gone by then. */
function printLater(delay: number) {
  setTimeout(() => window.print(), delay)
}

/** ⌘⇧K — change how the current page looks. */
export default definePlugin({
  id: "page-view",
  name: "Page view",
  description: "Reader view, dark mode on any page, print or save as PDF",
  category: "general",
  commands: [
    {
      id: "reader-view",
      title: "Toggle reader view",
      group: GROUP,
      icon: BookOpenText,
      keywords: ["reader mode", "article", "readability", "distraction free", "clean"],
      when: isWebPage,
      run: toggleReader,
    },
    {
      id: "dark-mode",
      title: "Toggle dark mode",
      group: GROUP,
      icon: Moon,
      keywords: ["night", "invert", "theme", "dark reader"],
      when: isWebPage,
      run: async (ctx) => void (await runInPage(ctx, toggleDarkMode, DARK_MODE_ID, DARK_MODE_CSS)),
    },
    {
      id: "print",
      title: "Print or save as PDF",
      group: GROUP,
      icon: Printer,
      keywords: ["pdf", "export", "save"],
      when: isWebPage,
      run: async (ctx) => void (await runInPage(ctx, printLater, PRINT_DELAY)),
    },
  ],
})
