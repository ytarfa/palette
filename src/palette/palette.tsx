import { Check, ChevronRight, SquareChevronRight } from "lucide-react"
import { useEffect, useEffectEvent, useMemo, useReducer, useRef, type KeyboardEvent } from "react"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandList } from "@/components/ui/command"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { formatShortcut, isModKey, matchesShortcut } from "@/core/keys"
import { COMMANDS, TABS } from "@/core/modes"
import type { Registry } from "@/core/registry"
import type { Awaitable, Command as Item, PaletteContext, RunResult } from "@/core/types"
import { cn } from "@/lib/utils"
import { closePalette, embedded, onHostMessage, paletteContext, post, takePendingMode } from "./host"
import { ItemRow } from "./item-row"
import { initialNavigation, navigate } from "./navigation"
import { groupBy, search } from "./search"
import { usePaletteItems } from "./use-items"

// Start reading the popup's mode before React mounts (StrictMode runs effects twice).
const pendingMode = embedded ? undefined : takePendingMode()

export function Palette({ registry }: { registry: Registry }) {
  const [{ session, modeId, pages, query, selected, notice }, dispatch] = useReducer(navigate, initialNavigation)
  const page = pages.at(-1)
  const { items, tab, loaded, reload } = usePaletteItems(registry, { session, modeId, page, query })

  const visible = useRef(!embedded)
  /** Holding ⌘⇧ and tapping P again walks the list; releasing ⌘ picks. */
  const cycling = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const mode = registry.mode(modeId)
  const ctx = paletteContext(tab, query)

  const results = useMemo(() => search(items, query), [items, query])
  // Groups come out ordered by their best match, since `results` is sorted.
  const groups = useMemo(() => groupBy(results), [results])
  // Typing, changing mode or opening a sub-list resets `selected`; fall back to the top item.
  const selectedItem = results.find((item) => item.id === selected) ?? results[0]

  // Only reveal the embedded frame once fresh items are rendered.
  useEffect(() => {
    if (embedded && loaded && !visible.current) {
      visible.current = true
      post({ type: "show" })
    }
  }, [session, loaded])

  function open(modeId: string) {
    clearTimeout(closeTimer.current)
    cycling.current = false
    dispatch({ type: "open", mode: modeId })
  }

  function close() {
    clearTimeout(closeTimer.current)
    cycling.current = false
    visible.current = false
    closePalette()
  }

  function switchMode(id: string) {
    cycling.current = false
    dispatch({ type: "switchMode", mode: id })
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
    dispatch({ type: "select", id: next.dataset.value ?? "" })
    next.scrollIntoView({ block: "nearest" })
  }

  async function perform(run: (ctx: PaletteContext) => Awaitable<RunResult>) {
    let result: RunResult = undefined
    try {
      result = await run(ctx)
    } catch (error) {
      console.error("[palette]", error)
    }
    if (result?.notice) dispatch({ type: "notice", notice: result.notice })
    if (result?.keepOpen) reload()
    // Leave a notice up long enough to read before closing.
    else if (result?.notice) closeTimer.current = setTimeout(close, 1000)
    else close()
  }

  function activate(item: Item) {
    cycling.current = false
    if (item.children) {
      const { placeholder, items } = item.children
      dispatch({ type: "push", page: { title: item.title, placeholder, items } })
    } else if (item.run) {
      void perform(item.run)
    }
  }

  function back() {
    dispatch({ type: "back" })
  }

  function onQueryChange(value: string) {
    const match = page ? undefined : registry.matchPrefix(value)
    if (match && match.mode.id !== modeId) dispatch({ type: "switchMode", mode: match.mode.id, query: match.rest })
    else dispatch({ type: "query", query: value })
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
        onValueChange={(id) => dispatch({ type: "select", id })}
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
          {loaded && <CommandEmpty>No results</CommandEmpty>}
          {groups.map(([group, list]) => (
            <CommandGroup
              key={group}
              heading={group || undefined}
            >
              {list.map((item) => (
                <ItemRow key={item.id} item={item} onSelect={() => activate(item)} />
              ))}
            </CommandGroup>
          ))}
        </CommandList>
        <footer className="flex items-center justify-between gap-4 border-t px-3 py-2 text-xs text-muted-foreground">
          {notice ? (
            <div className="flex min-w-0 items-center gap-1 text-foreground">
              <Check className="size-3 shrink-0" />
              <span className="truncate">{notice}</span>
            </div>
          ) : (
            <div className="flex min-w-0 items-center gap-1">
              <span>{mode.name}</span>
              {pages.map((p, i) => (
                <span key={i} className="flex min-w-0 items-center gap-1">
                  <ChevronRight className="size-3 shrink-0" />
                  <span className="truncate">{p.title}</span>
                </span>
              ))}
            </div>
          )}
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
