import { useEffect, useEffectEvent, useMemo, useState } from "react"
import { collect, type Registry } from "@/core/registry"
import { getSettings, type Settings } from "@/core/settings"
import type { Command as Item } from "@/core/types"
import { paletteContext } from "./host"
import type { Page } from "./navigation"

interface Where {
  session: number
  modeId: string
  page: Page | undefined
  query: string
}

/**
 * The items to show: from the open nested list, or from the mode's sources.
 * Static items load on open, mode/page change and `reload()`; dynamic items
 * reload as the query changes.
 */
export function usePaletteItems(registry: Registry, { session, modeId, page, query }: Where) {
  const [loadedSession, setLoadedSession] = useState(0)
  const [reloads, setReloads] = useState(0)
  const [tab, setTab] = useState<chrome.tabs.Tab>()
  const [settings, setSettings] = useState<Settings>()
  const [staticItems, setStaticItems] = useState<Item[]>([])
  const [dynamicItems, setDynamicItems] = useState<Item[]>([])

  const currentQuery = useEffectEvent(() => query)

  useEffect(() => {
    if (!session) return
    const abort = new AbortController()
    void (async () => {
      const [[active], settings] = await Promise.all([
        chrome.tabs.query({ active: true, currentWindow: true }),
        getSettings(),
      ])
      const ctx = paletteContext(active, currentQuery())
      const next = page
        ? await page.items(ctx)
        : await collect(registry.sources(modeId, settings).filter((s) => !s.dynamic), ctx)
      if (abort.signal.aborted) return
      setTab(active)
      setSettings(settings)
      setStaticItems(next)
      setLoadedSession(session)
    })().catch((error) => console.error("[palette]", error))
    return () => abort.abort()
  }, [session, modeId, page, reloads, registry])

  useEffect(() => {
    if (!session || page || !settings) return
    const abort = new AbortController()
    const sources = registry.sources(modeId, settings).filter((s) => s.dynamic)
    void collect(sources, paletteContext(tab, query)).then((next) => {
      if (!abort.signal.aborted) setDynamicItems(next)
    })
    return () => abort.abort()
  }, [session, modeId, page, query, tab, settings, registry])

  const items = useMemo(
    () => (page ? staticItems : [...staticItems, ...dynamicItems]),
    [page, staticItems, dynamicItems],
  )

  return {
    items,
    /** The tab that was active when the items loaded. */
    tab,
    /** Whether this session's items have loaded. */
    loaded: session > 0 && loadedSession === session,
    reload: () => setReloads((n) => n + 1),
  }
}
