/**
 * Browser helpers shared by plugins: the current tab, opening URLs, running
 * code in the page. Site plugins get these through ./site-kit too.
 */
import type { PaletteContext } from "@/core/types"

/** Whether the palette opened over a tab. Use as a command's `when`. */
export const hasTab = (ctx: PaletteContext) => ctx.tab?.id != null

/** The current tab's id. Only call it from commands guarded by `hasTab`. */
export function tabId(ctx: PaletteContext): number {
  const id = ctx.tab?.id
  if (id == null) throw new Error("No current tab")
  return id
}

/** Go to a URL in the current tab, or in a new one with `newTab` (or when there's no tab). */
export async function openUrl(ctx: PaletteContext, url: string, { newTab = false } = {}) {
  if (!newTab && hasTab(ctx)) await chrome.tabs.update(tabId(ctx), { url })
  else await chrome.tabs.create({ url })
}

export async function focusTab(tab: chrome.tabs.Tab) {
  await chrome.tabs.update(tab.id!, { active: true })
  await chrome.windows.update(tab.windowId, { focused: true })
}

/**
 * Run a function in the page and return its result, for information that
 * isn't in the URL. The function is serialized: it can't use outer variables,
 * only its `args`.
 */
export async function runInPage<Args extends unknown[], Result>(
  ctx: PaletteContext,
  func: (...args: Args) => Result,
  ...args: Args
): Promise<Awaited<Result> | undefined> {
  if (!hasTab(ctx)) return undefined
  const [result] = await chrome.scripting.executeScript({ target: { tabId: tabId(ctx) }, func, args })
  return result?.result as Awaited<Result> | undefined
}

export function parseUrl(url: string | undefined): URL | undefined {
  if (!url) return undefined
  try {
    return new URL(url)
  } catch {
    return undefined
  }
}

/** Favicon for a page URL, served by Chrome (needs the "favicon" permission). */
export function favicon(pageUrl: string | undefined, size = 32): string | undefined {
  if (!pageUrl) return undefined
  const url = new URL(chrome.runtime.getURL("/_favicon/"))
  url.searchParams.set("pageUrl", pageUrl)
  url.searchParams.set("size", String(size))
  return url.toString()
}

/** "https://github.com/foo/bar?x=1" → "github.com/foo/bar" */
export function shortUrl(url: string | undefined): string {
  if (!url) return ""
  try {
    const u = new URL(url)
    if (u.protocol === "http:" || u.protocol === "https:") {
      return (u.host + u.pathname).replace(/\/$/, "")
    }
    return url
  } catch {
    return url
  }
}
