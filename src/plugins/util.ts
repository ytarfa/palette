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

export async function focusTab(tab: chrome.tabs.Tab) {
  await chrome.tabs.update(tab.id!, { active: true })
  await chrome.windows.update(tab.windowId, { focused: true })
}
