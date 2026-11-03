import { Camera, FileImage, GalleryVerticalEnd, Image, ImageDown } from "lucide-react"
import { definePlugin, type Command, type PaletteContext } from "@/core/types"
import { parseUrl, runInPage } from "./site-kit"

const GROUP = "Screenshot"

type Format = "png" | "jpg"
const MIME: Record<Format, string> = { png: "image/png", jpg: "image/jpeg" }
const JPG_QUALITY = 0.92

/**
 * Chrome allows about two `captureVisibleTab` calls per second
 * (MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND), so captures are spaced out.
 */
const CAPTURE_INTERVAL = 550
/** Chrome's largest canvas, in pixels (16,384²), and a side the JPEG encoder still accepts. */
const MAX_CANVAS_AREA = 268_435_456
const MAX_CANVAS_SIDE = 65_500

const pad = (n: number) => String(n).padStart(2, "0")

/** `<page title or host> 2026-11-03 14.05.png`, safe as a file name. */
export function screenshotFilename(tab: { title?: string; url?: string } | undefined, format: Format, date = new Date()): string {
  const clean = (text = "") =>
    Array.from(
      text
        .replace(/[\\/:*?"<>|]/g, " ")
        .replace(/\s+/g, " ")
        .replace(/^[\s.]+|[\s.]+$/g, ""),
    )
      .slice(0, 100)
      .join("")
      .trim()
  const name = clean(tab?.title) || clean(parseUrl(tab?.url)?.hostname) || "Screenshot"
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  const time = `${pad(date.getHours())}.${pad(date.getMinutes())}`
  return `${name} ${day} ${time}.${format}`
}

/** Tallest stitched image, in device pixels, for an image `width` pixels wide. */
export const maxCanvasHeight = (width: number) =>
  Math.min(MAX_CANVAS_SIDE, Math.floor(MAX_CANVAS_AREA / Math.max(1, width)))

export interface Slice {
  /** Where the slice starts on the page, in CSS pixels. */
  top: number
  height: number
}

/**
 * Viewport-sized slices covering the page, all in CSS pixels. The page is cut
 * off at `maxHeight`; `clamped` says so.
 */
export function planSlices(pageHeight: number, viewportHeight: number, maxHeight = Infinity) {
  const step = Math.max(1, viewportHeight)
  const height = Math.max(1, Math.min(pageHeight, maxHeight))
  const slices: Slice[] = []
  for (let top = 0; top < height; top += step) slices.push({ top, height: Math.min(step, height - top) })
  return { height, slices, clamped: pageHeight > height }
}

/**
 * Where a slice is in its capture (`sy`) and in the stitched image (`dy`), in
 * device pixels. The page may not scroll all the way to `slice.top` (the last
 * slice usually doesn't), hence `scrollTop`.
 */
export function slicePixels(slice: Slice, scrollTop: number, viewportHeight: number, scale: number) {
  const offset = Math.min(Math.max(0, slice.top - scrollTop), viewportHeight)
  const dy = Math.round(slice.top * scale)
  const sy = Math.round(offset * scale)
  const height = Math.round((slice.top + slice.height) * scale) - dy
  return { sy, dy, height: Math.max(0, Math.min(height, Math.ceil(viewportHeight * scale) - sy)) }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

let lastCapture = 0

/** A PNG or JPEG data URL of the tab's window, spaced out and retried to stay under Chrome's quota. */
async function captureTab(tab: chrome.tabs.Tab, format: "png" | "jpeg" = "png"): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    await sleep(lastCapture + CAPTURE_INTERVAL - Date.now())
    lastCapture = Date.now()
    try {
      return await chrome.tabs.captureVisibleTab(tab.windowId, { format, quality: Math.round(JPG_QUALITY * 100) })
    } catch (error) {
      if (attempt >= 3 || !String(error).includes("MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND")) throw error
    }
  }
}

/** A base64 data URL, like the ones `captureVisibleTab` returns, as a Blob. */
export function dataUrlToBlob(url: string): Blob {
  const [header, data] = url.split(",", 2)
  const type = /^data:([^;,]+)/.exec(header)?.[1] ?? ""
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type })
}

/** The visible part of the tab, without the palette. */
async function captureVisible(ctx: PaletteContext, format: Format): Promise<Blob> {
  await ctx.conceal?.()
  return dataUrlToBlob(await captureTab(ctx.tab!, format === "jpg" ? "jpeg" : "png"))
}

// The functions below run in the page, through `runInPage`: no outer variables.

interface PageState {
  x: number
  y: number
  /** Inline styles to put back: element, property, value, priority. */
  saved: [HTMLElement, string, string, string][]
  done: WeakSet<Element>
}

type PageWindow = { __paletteScreenshot?: PageState }

/** Measure the page and remember the scroll position. */
function preparePage() {
  const root = document.scrollingElement ?? document.documentElement
  const state: PageState = { x: scrollX, y: scrollY, saved: [], done: new WeakSet() }
  ;(window as PageWindow).__paletteScreenshot = state
  return {
    innerWidth,
    viewportWidth: root.clientWidth || innerWidth,
    viewportHeight: root.clientHeight || innerHeight,
    pageHeight: root.scrollHeight,
    dpr: devicePixelRatio,
  }
}

/**
 * Scroll to `top` and return where the page actually ended up. Sticky elements
 * are unstuck so they stay in place; fixed ones (headers, chat buttons) are
 * hidden after the first slice so they don't repeat, unless they cover the
 * whole viewport, like a background.
 */
async function scrollPage(top: number, hideFixed: boolean) {
  const state = (window as PageWindow).__paletteScreenshot
  if (!state) throw new Error("Page not prepared")
  window.scrollTo({ left: state.x, top, behavior: "instant" })
  const set = (el: HTMLElement, property: string, value: string) => {
    state.saved.push([el, property, el.style.getPropertyValue(property), el.style.getPropertyPriority(property)])
    el.style.setProperty(property, value, "important")
  }
  for (const el of document.body?.querySelectorAll<HTMLElement>("*") ?? []) {
    if (state.done.has(el) || !(el instanceof HTMLElement)) continue
    const { position } = getComputedStyle(el)
    if (position === "sticky") {
      state.done.add(el)
      set(el, "position", "relative")
      for (const side of ["top", "right", "bottom", "left"]) set(el, side, "auto")
    } else if (position === "fixed" && hideFixed) {
      state.done.add(el)
      const rect = el.getBoundingClientRect()
      if (rect.width < innerWidth * 0.9 || rect.height < innerHeight * 0.9) set(el, "opacity", "0")
    }
  }
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  await new Promise((resolve) => setTimeout(resolve, 50))
  return scrollY
}

/** Put the styles and scroll position back. */
function restorePage() {
  const w = window as PageWindow
  const state = w.__paletteScreenshot
  if (!state) return
  for (const [el, property, value, priority] of state.saved.reverse()) {
    if (value) el.style.setProperty(property, value, priority)
    else el.style.removeProperty(property)
  }
  window.scrollTo({ left: state.x, top: state.y, behavior: "instant" })
  delete w.__paletteScreenshot
}

/**
 * The whole page: scroll one viewport at a time, capture, and stitch. Only the
 * document scrolls; pages that scroll an inner element get the visible area.
 * Pages taller than the largest canvas are cut off.
 */
async function captureFullPage(ctx: PaletteContext, format: Format): Promise<Blob> {
  const tab = ctx.tab!
  await ctx.conceal?.()
  const page = await runInPage(ctx, preparePage)
  if (!page) throw new Error("Can't read the page")
  try {
    const { height, slices, clamped } = planSlices(
      page.pageHeight,
      page.viewportHeight,
      maxCanvasHeight(page.viewportWidth * page.dpr) / page.dpr,
    )
    if (clamped) console.warn(`[palette] screenshot cut off at ${height}px of ${page.pageHeight}px`)
    let canvas: OffscreenCanvas | undefined
    let context: OffscreenCanvasRenderingContext2D | null = null
    let bottom = 0
    for (const [index, slice] of slices.entries()) {
      const scrollTop = (await runInPage(ctx, scrollPage, slice.top, index > 0)) ?? slice.top
      // The page won't scroll (e.g. a dialog locked it): keep what we have.
      if (slice.top - scrollTop >= page.viewportHeight) break
      // captureVisibleTab captures whichever tab is showing: stop if the user switched.
      if (!(await chrome.tabs.get(tab.id!)).active) throw new Error("The tab is no longer showing")
      const image = await createImageBitmap(dataUrlToBlob(await captureTab(tab)))
      // The capture includes the scrollbars; measuring the scale handles zoom too.
      const scale = image.width / page.innerWidth
      const width = Math.round(page.viewportWidth * scale)
      if (!canvas) {
        canvas = new OffscreenCanvas(width, Math.min(Math.round(height * scale), maxCanvasHeight(width)))
        context = canvas.getContext("2d")
      }
      const { sy, dy, height: h } = slicePixels(slice, scrollTop, page.viewportHeight, scale)
      if (h > 0) context?.drawImage(image, 0, sy, width, h, 0, dy, width, h)
      bottom = Math.min(canvas.height, Math.max(bottom, dy + h))
      image.close()
    }
    if (!canvas || !bottom) throw new Error("Nothing captured")
    if (bottom < canvas.height) {
      const cropped = new OffscreenCanvas(canvas.width, bottom)
      cropped.getContext("2d")?.drawImage(canvas, 0, 0)
      canvas = cropped
    }
    return await canvas.convertToBlob({ type: MIME[format], quality: JPG_QUALITY })
  } finally {
    await runInPage(ctx, restorePage).catch((error) => console.error("[palette] restoring the page failed", error))
  }
}

/**
 * Copy a PNG. The write starts right away with a pending image, while the
 * palette still has focus; Chrome rejects clipboard writes from unfocused
 * documents.
 */
async function copyImage(capture: (ctx: PaletteContext, format: Format) => Promise<Blob>, ctx: PaletteContext) {
  const image = capture(ctx, "png")
  const written = navigator.clipboard.write([new ClipboardItem({ "image/png": image })])
  written.catch(() => {}) // Reported below, once the page is back to normal.
  await image
  await written
}

/** Download through an `<a download>` link, which doesn't need the downloads permission. */
function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

function saveFormats(capture: (ctx: PaletteContext, format: Format) => Promise<Blob>): Command["children"] {
  const save = (format: Format) => async (ctx: PaletteContext) =>
    download(await capture(ctx, format), screenshotFilename(ctx.tab, format))
  return {
    placeholder: "Choose a format…",
    items: () => [
      { id: "png", title: "PNG", subtitle: "Lossless", icon: FileImage, run: save("png") },
      { id: "jpg", title: "JPG", subtitle: "Smaller file", icon: Image, keywords: ["jpeg"], run: save("jpg") },
    ],
  }
}

/** Screenshots work on web pages: the content script, scripting and activeTab all need http(s). */
const onWebPage = (ctx: PaletteContext) => {
  const protocol = parseUrl(ctx.tab?.url)?.protocol
  return ctx.tab?.id != null && (protocol === "http:" || protocol === "https:")
}


const commands: Command[] = [
  {
    id: "copy-visible",
    title: "Copy screenshot",
    icon: Camera,
    keywords: ["capture", "image", "clipboard", "visible"],
    run: (ctx) => copyImage(captureVisible, ctx),
  },
  {
    id: "copy-full-page",
    title: "Copy full-page screenshot",
    icon: GalleryVerticalEnd,
    keywords: ["capture", "image", "clipboard", "whole", "entire", "scrolling"],
    run: (ctx) => copyImage(captureFullPage, ctx),
  },
  {
    id: "save-visible",
    title: "Save screenshot…",
    icon: ImageDown,
    keywords: ["capture", "image", "download", "png", "jpg", "visible"],
    children: saveFormats(captureVisible),
  },
  {
    id: "save-full-page",
    title: "Save full-page screenshot…",
    icon: ImageDown,
    keywords: ["capture", "image", "download", "png", "jpg", "whole", "entire", "scrolling"],
    children: saveFormats(captureFullPage),
  },
]

/** ⌘⇧K — screenshots of the current page, to the clipboard or a file. */
export default definePlugin({
  id: "screenshots",
  name: "Screenshots",
  description: "Copy a screenshot of the visible area or the whole page, or save it as an image",
  category: "general",
  commands: commands.map((command) => ({ ...command, group: GROUP, when: onWebPage })),
})
