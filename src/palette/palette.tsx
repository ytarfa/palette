import { defaultFilter } from "cmdk"
import { ChevronRight, Globe, SquareChevronRight } from "lucide-react"
import { useEffect, useEffectEvent, useMemo, useRef, useState, type KeyboardEvent } from "react"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { formatShortcut, formatShortcutText, isModKey, matchesShortcut } from "@/core/keys"
import { COMMANDS, TABS } from "@/core/modes"
import { collect, type Registry } from "@/core/registry"
import type { Command as Item, Icon, PaletteContext, RunResult } from "@/core/types"
import { cn } from "@/lib/utils"
import { closePalette, copyText, embedded, onHostMessage, post, takePendingMode } from "./host"

/** A nested list pushed by an item with `children`. */
interface Page {
  title: string
  placeholder?: string
  items: NonNullable<Item["children"]>["items"]
}

// Start reading the popup's mode before React mounts (StrictMode runs effects twice).
const pendingMode = embedded ? undefined : takePendingMode()

// Scoring the title on its own lets "dupl" prefer "Duplicate tab" over "Close duplicate tabs".
const score = (item: Item, search: string) =>
  defaultFilter(item.title, search, [item.subtitle ?? "", ...(item.keywords ?? [])])

/**
 * Filter and sort here rather than in cmdk: cmdk sorts by moving DOM nodes,
 * which goes wrong when items arrive asynchronously (dynamic and plugin items).
 * `alwaysShow` items stay, after the matches.
 */
function search(items: Item[], query: string): Item[] {
  const q = query.trim()
  if (!q) return items
  return items
    .map((item) => ({ item, score: item.alwaysShow ? 0 : score(item, q) }))
    .filter(({ item, score }) => item.alwaysShow || score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item)
}

export function Palette({ registry }: { registry: Registry }) {
  /** Bumps every time the palette opens; resets cmdk and reloads items. */
  const [session, setSession] = useState(0)
  const [loadedSession, setLoadedSession] = useState(0)
  const [reloads, setReloads] = useState(0)
  const [modeId, setModeId] = useState(TABS.id)
  const [pages, setPages] = useState<Page[]>([])
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState("")
  const [tab, setTab] = useState<chrome.tabs.Tab>()
  const [staticItems, setStaticItems] = useState<Item[]>([])
  const [dynamicItems, setDynamicItems] = useState<Item[]>([])

  const visible = useRef(!embedded)
  /** Holding ⌘⇧ and tapping P again walks the list; releasing ⌘ picks. */
  const cycling = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const mode = registry.mode(modeId)
  const page = pages.at(-1)
  const ctx: PaletteContext = { tab, query, copy: copyText }

  const items = useMemo(
    () => (page ? staticItems : [...staticItems, ...dynamicItems]),
    [page, staticItems, dynamicItems],
  )
  const results = useMemo(() => search(items, query), [items, query])
  // Groups come out ordered by their best match, since `results` is sorted.
  const groups = useMemo(() => groupBy(results), [results])
  // Typing, changing mode or opening a sub-list resets `selected`; fall back to the top item.
  const selectedItem = results.find((item) => item.id === selected) ?? results[0]

  const currentQuery = useEffectEvent(() => query)

  // Static items: loaded on open, mode/page change, and after `keepOpen` runs.
  useEffect(() => {
    if (!session) return
    const abort = new AbortController()
    void (async () => {
      const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
      const ctx: PaletteContext = { tab: active, query: currentQuery(), copy: copyText }
      const next = page
        ? await page.items(ctx)
        : await collect(registry.sources(modeId).filter((s) => !s.dynamic), ctx)
      if (abort.signal.aborted) return
      setTab(active)
      setStaticItems(next)
      setLoadedSession(session)
    })().catch((error) => console.error("[palette]", error))
    return () => abort.abort()
  }, [session, modeId, page, reloads, registry])

  // Dynamic items: reloaded as the query changes.
  useEffect(() => {
    if (!session || page) return
    const abort = new AbortController()
    const sources = registry.sources(modeId).filter((s) => s.dynamic)
    void collect(sources, { tab, query, copy: copyText }).then((next) => {
      if (!abort.signal.aborted) setDynamicItems(next)
    })
    return () => abort.abort()
  }, [session, modeId, page, query, tab, registry])

  // Only reveal the embedded frame once fresh items are rendered.
  useEffect(() => {
    if (embedded && session && loadedSession === session && !visible.current) {
      visible.current = true
      post({ type: "show" })
    }
  }, [session, loadedSession])

  /** New query, new results: highlight the top one again. */
  function changeQuery(value: string) {
    setQuery(value)
    setSelected("")
  }

  function open(modeId: string) {
    cycling.current = false
    setModeId(modeId)
    setPages([])
    changeQuery("")
    setSession((s) => s + 1)
  }

  function close() {
    cycling.current = false
    visible.current = false
    closePalette()
  }

  function switchMode(id: string) {
    cycling.current = false
    setModeId(id)
    setPages([])
    changeQuery("")
  }

  /** ⌘⇧P / ⌘⇧K while open: same mode cycles (tabs) or toggles closed; other mode switches. */
  function onModeShortcut(id: string) {
    if (id !== modeId || page) return switchMode(id)
    if (id !== TABS.id) return close()
    selectNext()
    cycling.current = true
  }

  function selectNext() {
    const els = [...(listRef.current?.querySelectorAll<HTMLElement>("[cmdk-item]") ?? [])]
    if (!els.length) return
    const index = els.findIndex((el) => el.dataset.selected === "true")
    const next = els[(index + 1) % els.length]
    setSelected(next.dataset.value ?? "")
    next.scrollIntoView({ block: "nearest" })
  }

  async function perform(run: (ctx: PaletteContext) => RunResult | Promise<RunResult>) {
    let result: RunResult = undefined
    try {
      result = await run(ctx)
    } catch (error) {
      console.error("[palette]", error)
    }
    if (result?.keepOpen) setReloads((n) => n + 1)
    else close()
  }

  function activate(item: Item) {
    cycling.current = false
    if (item.children) {
      const { placeholder, items } = item.children
      setPages((pages) => [...pages, { title: item.title, placeholder, items }])
      changeQuery("")
    } else if (item.run) {
      void perform(item.run)
    }
  }

  function back() {
    setPages((pages) => pages.slice(0, -1))
    changeQuery("")
  }

  function onQueryChange(value: string) {
    const match = page ? undefined : registry.matchPrefix(value)
    if (match && match.mode.id !== modeId) {
      setModeId(match.mode.id)
      changeQuery(match.rest)
    } else {
      changeQuery(value)
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    const event = e.nativeEvent
    if (isModKey(event)) return
    const modeHit = registry.modes.find((m) => m.shortcut && matchesShortcut(event, m.shortcut))
    if (modeHit) {
      e.preventDefault()
      return onModeShortcut(modeHit.id)
    }
    cycling.current = false

    const action = selectedItem?.actions?.find((a) => matchesShortcut(event, a.shortcut))
    if (action) {
      e.preventDefault()
      return void perform(action.run)
    }
    if (e.key === "Escape") {
      e.preventDefault()
      return pages.length ? back() : close()
    }
    if (e.key === "Backspace" && !query && !e.metaKey && !e.ctrlKey && !e.altKey) {
      if (pages.length) back()
      else if (modeId !== TABS.id) switchMode(TABS.id)
    }
  }

  // The background asks to open while we're already showing: treat it like the shortcut.
  const onOpenRequest = useEffectEvent((mode: string) => {
    if (embedded && visible.current) onModeShortcut(mode)
    else open(mode)
  })

  const onKeyUp = useEffectEvent((e: globalThis.KeyboardEvent) => {
    if (!cycling.current || !isModKey(e)) return
    cycling.current = false
    if (selectedItem) activate(selectedItem)
  })

  useEffect(() => {
    if (!embedded) {
      void pendingMode?.then((mode) => onOpenRequest(mode ?? TABS.id))
      return
    }
    const off = onHostMessage((message) => {
      if (message.type === "focus") inputRef.current?.focus()
      if (message.type === "open") onOpenRequest(message.mode)
    })
    post({ type: "ready" })
    return off
  }, [])

  useEffect(() => {
    window.addEventListener("keyup", onKeyUp)
    return () => window.removeEventListener("keyup", onKeyUp)
  }, [])

  return (
    <div
      key={session}
      className={cn(
        embedded &&
          "fixed inset-0 flex items-start justify-center bg-black/15 pt-[12vh] duration-150 animate-in fade-in-0 dark:bg-black/40",
      )}
      onMouseDown={(e) => {
        if (embedded && e.target === e.currentTarget) close()
      }}
    >
      <Command
        shouldFilter={false}
        value={selectedItem?.id ?? ""}
        onValueChange={setSelected}
        onKeyDown={onKeyDown}
        vimBindings={false}
        loop
        className={cn(
          "h-auto p-0",
          embedded
            ? "w-[640px] max-w-[calc(100vw-2rem)] border shadow-2xl duration-150 animate-in fade-in-0 zoom-in-[0.98] slide-in-from-top-1"
            : "w-full rounded-none!",
        )}
      >
        <CommandInput
          ref={inputRef}
          autoFocus
          value={query}
          onValueChange={onQueryChange}
          placeholder={page?.placeholder ?? mode.placeholder}
          icon={
            modeId === COMMANDS.id && !page ? (
              <SquareChevronRight className="size-4 shrink-0 opacity-50" />
            ) : undefined
          }
        />
        <CommandList
          ref={listRef}
          className={cn("p-1", embedded ? "max-h-[min(420px,60vh)]" : "h-[360px] max-h-none")}
        >
          {loadedSession === session && <CommandEmpty>No results</CommandEmpty>}
          {groups.map(([group, list]) => (
            <CommandGroup
              key={group}
              heading={group || undefined}
            >
              {list.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.id}
                  onSelect={() => activate(item)}
                  className="gap-2.5 py-2"
                >
                  <ItemIcon icon={item.icon} />
                  <span className="max-w-[65%] shrink-0 truncate">{item.title}</span>
                  {item.subtitle && (
                    <span className="min-w-0 truncate text-xs text-muted-foreground">
                      {item.subtitle}
                    </span>
                  )}
                  {item.hint && (
                    <CommandShortcut className="tracking-normal">{item.hint}</CommandShortcut>
                  )}
                  {item.shortcut && <CommandShortcut>{formatShortcutText(item.shortcut)}</CommandShortcut>}
                  {item.children && (
                    <ChevronRight
                      data-slot="command-shortcut"
                      className="ml-auto text-muted-foreground"
                    />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
        <footer className="flex items-center justify-between gap-4 border-t px-3 py-2 text-xs text-muted-foreground">
          <div className="flex min-w-0 items-center gap-1">
            <span>{mode.name}</span>
            {pages.map((p, i) => (
              <span key={i} className="flex min-w-0 items-center gap-1">
                <ChevronRight className="size-3 shrink-0" />
                <span className="truncate">{p.title}</span>
              </span>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {selectedItem?.actions?.map((action) => (
              <Hint key={action.id} label={action.title} shortcut={action.shortcut} />
            ))}
            {selectedItem && <Hint label={selectedItem.children ? "Open" : "Select"} shortcut="enter" />}
          </div>
        </footer>
      </Command>
    </div>
  )
}

function ItemIcon({ icon }: { icon?: Icon }) {
  const [failed, setFailed] = useState(false)
  if (!icon) return <span className="size-4 shrink-0" />
  if (typeof icon !== "string") {
    const Component = icon
    return <Component className="text-muted-foreground" />
  }
  if (failed) return <Globe className="text-muted-foreground" />
  return (
    <img src={icon} alt="" className="size-4 shrink-0 rounded-[3px]" onError={() => setFailed(true)} />
  )
}

function Hint({ label, shortcut }: { label: string; shortcut: string }) {
  return (
    <span className="flex items-center gap-1.5">
      {label}
      <KbdGroup>
        {formatShortcut(shortcut).map((key) => (
          <Kbd key={key}>{key}</Kbd>
        ))}
      </KbdGroup>
    </span>
  )
}

/** Group items by `group`, keeping first-seen order. Ungrouped items use "". */
function groupBy(items: Item[]): [string, Item[]][] {
  const groups = new Map<string, Item[]>()
  for (const item of items) {
    const key = item.group ?? ""
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return [...groups]
}
