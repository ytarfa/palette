/**
 * Helpers for site plugins: commands that show up at the top of ⌘⇧K while
 * you're on a given website. Each site is one file in ./sites, registered
 * automatically, and can be turned on or off in settings.
 *
 * Prefer working from the tab's URL and title: no extra permissions, and it
 * doesn't break when the site changes its HTML. Use `runInPage` only when the
 * information isn't in the URL.
 */
import { definePlugin, type Command, type Icon, type PaletteContext, type Plugin } from "@/core/types"

type Awaitable<T> = T | Promise<T>

export interface SiteContext extends PaletteContext {
  /** The current tab's URL, parsed. */
  url: URL
}

export interface SiteDefinition {
  id: string
  /** Shown in settings, and the group heading in the palette. */
  name: string
  /** One line for the settings page, e.g. "Jump to issues, copy pull request links". */
  description: string
  /** Home page, e.g. "https://github.com". Used for the site's icon in settings. */
  url: string
  /** Is this URL on the site? */
  matches(url: URL): boolean
  /** Commands while on the site. */
  commands(ctx: SiteContext): Awaitable<Command[]>
  /** Extra items built from the typed query, e.g. "Search “…” on GitHub". Always shown. */
  search?(ctx: SiteContext): Awaitable<Command[]>
  /** Off until turned on in settings. Defaults to true. */
  enabledByDefault?: boolean
}

export function defineSite(site: SiteDefinition): Plugin {
  const withUrl = (ctx: PaletteContext): SiteContext | undefined => {
    const url = parseUrl(ctx.tab?.url)
    return url && site.matches(url) ? { ...ctx, url } : undefined
  }
  const grouped = (item: Command): Command => ({
    ...item,
    group: item.group ?? site.name,
    keywords: [...(item.keywords ?? []), site.name],
  })

  return definePlugin({
    id: site.id,
    name: site.name,
    description: site.description,
    url: site.url,
    category: "site",
    enabledByDefault: site.enabledByDefault,
    sources: [
      {
        mode: "commands",
        async items(ctx) {
          const siteCtx = withUrl(ctx)
          return siteCtx ? (await site.commands(siteCtx)).map(grouped) : []
        },
      },
      {
        mode: "commands",
        dynamic: true,
        async items(ctx) {
          const siteCtx = withUrl(ctx)
          if (!siteCtx || !site.search || !ctx.query.trim()) return []
          return (await site.search(siteCtx)).map((item) => ({ ...grouped(item), alwaysShow: true }))
        },
      },
    ],
  })
}

interface ItemOptions {
  icon?: Icon
  subtitle?: string
  keywords?: string[]
  hint?: string
  group?: string
}

/** Go to a URL in the current tab. ⌘↵ opens it in a new tab instead. */
export function navigate(id: string, title: string, url: string, options: ItemOptions = {}): Command {
  return {
    id,
    title,
    ...options,
    run: (ctx) => openUrl(ctx, url),
    actions: [
      {
        id: "new-tab",
        title: "New tab",
        shortcut: "mod+enter",
        run: () => void chrome.tabs.create({ url }),
      },
    ],
  }
}

/** Open a URL in a new tab, e.g. an external tool. */
export function openInNewTab(id: string, title: string, url: string, options: ItemOptions = {}): Command {
  return { id, title, ...options, run: () => void chrome.tabs.create({ url }) }
}

/** Copy text. The text is shown as the subtitle unless one is given. */
export function copy(id: string, title: string, value: string, options: ItemOptions = {}): Command {
  return { id, title, subtitle: value, ...options, run: (ctx) => ctx.copy(value) }
}

export async function openUrl(ctx: PaletteContext, url: string) {
  if (ctx.tab?.id != null) await chrome.tabs.update(ctx.tab.id, { url })
  else await chrome.tabs.create({ url })
}

export const markdownLink = (text: string, url: string) => `[${text.replace(/[[\]]/g, "\\$&")}](${url})`

export function parseUrl(url: string | undefined): URL | undefined {
  if (!url) return undefined
  try {
    return new URL(url)
  } catch {
    return undefined
  }
}

/** Is the host one of these, or a subdomain of one? `hostIs(url, "atlassian.net")` */
export function hostIs(url: URL, ...hosts: string[]): boolean {
  return hosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
}

/** A copy of `url` with search params set (or removed, for `undefined`). */
export function withParams(url: URL | string, params: Record<string, string | undefined>): string {
  const next = new URL(url)
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) next.searchParams.delete(key)
    else next.searchParams.set(key, value)
  }
  return next.toString()
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
  if (ctx.tab?.id == null) return undefined
  const [result] = await chrome.scripting.executeScript({ target: { tabId: ctx.tab.id }, func, args })
  return result?.result as Awaited<Result> | undefined
}
