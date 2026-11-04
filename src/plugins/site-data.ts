import { Braces, Cookie, Eraser, FileText, Terminal, X } from "lucide-react"
import { definePlugin, type Command, type PaletteContext } from "@/core/types"
import { hasTab, parseUrl, tabId } from "./browser"

const GROUP = "Site data"

function pageUrl(ctx: PaletteContext): URL | undefined {
  const url = parseUrl(ctx.tab?.url)
  return url && (url.protocol === "http:" || url.protocol === "https:") ? url : undefined
}

const isWebPage = (ctx: PaletteContext) => !!pageUrl(ctx)

/**
 * The origins to clear for a page: its own, plus the same host on the other
 * scheme. Storage is keyed by origin, so `http://example.com` and
 * `https://example.com` each have their own; cookies aren't split by scheme.
 */
export function siteOrigins(url: URL): [string, string] {
  const other = url.protocol === "https:" ? "http:" : "https:"
  return [url.origin, `${other}//${url.host}`]
}

/** `name=value; name2=value2`, as sent in a `Cookie` request header. */
export function cookieHeader(cookies: chrome.cookies.Cookie[]): string {
  return cookies.map((c) => (c.name ? `${c.name}=${c.value}` : c.value)).join("; ")
}

export const cookiesJson = (cookies: chrome.cookies.Cookie[]) => JSON.stringify(cookies, null, 2)

/**
 * A cookies.txt file, as read by curl (`-b`) and wget: one tab-separated line
 * per cookie. Domain cookies start with a dot and match subdomains; httpOnly
 * cookies get a `#HttpOnly_` prefix; session cookies expire at 0.
 */
export function cookiesTxt(cookies: chrome.cookies.Cookie[]): string {
  const lines = cookies.map((c) => {
    const subdomains = !c.hostOnly || c.domain.startsWith(".")
    const domain = subdomains && !c.domain.startsWith(".") ? `.${c.domain}` : c.domain
    const expires = c.session || c.expirationDate == null ? 0 : Math.floor(c.expirationDate)
    return [
      c.httpOnly ? `#HttpOnly_${domain}` : domain,
      subdomains ? "TRUE" : "FALSE",
      c.path,
      c.secure ? "TRUE" : "FALSE",
      expires,
      c.name,
      c.value,
    ].join("\t")
  })
  return ["# Netscape HTTP Cookie File", "", ...lines, ""].join("\n")
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

/** ⌘⇧K — clear or copy the current site's cookies and storage. */
export default definePlugin({
  id: "site-data",
  name: "Site data",
  description: "Clear cookies and storage for the current site, copy its cookies",
  category: "general",
  enabledByDefault: false,
  commands: [
    {
      id: "clear-site-data",
      title: "Clear cookies and site data",
      group: GROUP,
      icon: Eraser,
      keywords: ["cookies", "storage", "local storage", "indexeddb", "cache", "service worker", "reset", "log out"],
      when: isWebPage,
      children: {
        placeholder: "Clear this site's data?",
        items(ctx) {
          const url = pageUrl(ctx)!
          return [
            {
              id: "confirm",
              title: `Clear data for ${url.host} and reload`,
              subtitle: "Cookies, local storage, IndexedDB, cache storage, service workers",
              icon: Eraser,
              async run() {
                // For cookies, the origin filter matches the whole registrable
                // domain: on app.example.com this also clears example.com's cookies.
                await chrome.browsingData.remove(
                  { origins: siteOrigins(url) },
                  {
                    cookies: true,
                    localStorage: true,
                    indexedDB: true,
                    cacheStorage: true,
                    serviceWorkers: true,
                    fileSystems: true,
                    webSQL: true,
                  },
                )
                if (hasTab(ctx)) await chrome.tabs.reload(tabId(ctx))
              },
            },
            { id: "cancel", title: "Cancel", icon: X, run: () => {} },
          ]
        },
      },
    },
    {
      id: "copy-cookies",
      title: "Copy cookies",
      group: GROUP,
      icon: Cookie,
      keywords: ["curl", "export", "netscape", "header"],
      when: isWebPage,
      children: {
        placeholder: "Pick a format…",
        async items(ctx): Promise<Command[]> {
          const url = pageUrl(ctx)!
          // The cookies the browser would send to this URL, httpOnly included.
          const cookies = await chrome.cookies.getAll({ url: url.href })
          if (!cookies.length) return [{ id: "none", title: `No cookies for ${url.host}`, icon: Cookie }]
          const subtitle = plural(cookies.length, "cookie")
          const formats: Command[] = [
            { id: "header", title: "As a Cookie header", icon: Terminal, run: (ctx) => ctx.copy(cookieHeader(cookies)) },
            { id: "json", title: "As JSON", icon: Braces, run: (ctx) => ctx.copy(cookiesJson(cookies)) },
            {
              id: "netscape",
              title: "As cookies.txt (Netscape)",
              icon: FileText,
              keywords: ["curl", "wget"],
              run: (ctx) => ctx.copy(cookiesTxt(cookies)),
            },
          ]
          return formats.map((item) => ({ ...item, subtitle }))
        },
      },
    },
  ],
})
