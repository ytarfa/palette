import shortcuts from "@/config/shortcuts.json"
import { isMac } from "./keys"
import { COMMANDS, TABS } from "./modes"
import { isCommandEnabled, isEnabled, type Settings } from "./settings"
import type { Command, Mode, PaletteContext, Plugin, Source } from "./types"

export interface Registry {
  plugins: Plugin[]
  modes: Mode[]
  mode(id: string): Mode
  /** If the query starts with a mode prefix (e.g. ">"), the mode and the rest of the query. */
  matchPrefix(query: string): { mode: Mode; rest: string } | undefined
  /** Sources for a mode, from plugins turned on in `settings`. */
  sources(modeId: string, settings: Settings): Source[]
}

export function createRegistry(plugins: Plugin[]): Registry {
  const modes: Mode[] = [TABS, COMMANDS, ...plugins.flatMap((p) => p.modes ?? [])]
  const sources = plugins.flatMap((plugin) => {
    const own = (plugin.sources ?? []).map((source) => ({ plugin, source: namespaced(plugin, source), toggleable: false }))
    const commands = plugin.commands ?? []
    if (!commands.length) return own
    const source = namespaced(plugin, { mode: COMMANDS.id, items: () => commands })
    return [...own, { plugin, source, toggleable: true }]
  })

  return {
    plugins,
    modes,
    mode: (id) => modes.find((m) => m.id === id) ?? TABS,
    matchPrefix(query) {
      const mode = modes.find((m) => m.prefix && query.startsWith(m.prefix))
      return mode && { mode, rest: query.slice(mode.prefix!.length).trimStart() }
    },
    sources: (modeId, settings) =>
      sources
        .filter(({ plugin, source }) => source.mode === modeId && isEnabled(plugin, settings))
        .map(({ source, toggleable }) => (toggleable ? onlyEnabled(source, settings) : source)),
  }
}

/**
 * Shortcuts by command id ("plugin:command"), from src/config/shortcuts.json.
 * Values are either one shortcut, or `{ mac, other }` when platforms differ.
 */
type ShortcutConfig = Record<string, string | { mac?: string; other?: string }>

function configuredShortcut(id: string): string | undefined {
  const entry = (shortcuts as ShortcutConfig)[id]
  if (typeof entry === "string") return entry
  return isMac ? entry?.mac : entry?.other
}

/** Prefix ids with the plugin id so plugins can't collide, apply `when`, fill in shortcuts. */
function namespaced(plugin: Plugin, source: Source): Source {
  return {
    ...source,
    async items(ctx) {
      const items = await source.items(ctx)
      return items
        .filter((item) => !item.when || item.when(ctx))
        .map((item) => {
          const id = `${plugin.id}:${item.id}`
          return { ...item, id, shortcut: item.shortcut ?? configuredShortcut(id) }
        })
    },
  }
}

/** Drop static commands the user turned off in settings. */
function onlyEnabled(source: Source, settings: Settings): Source {
  return {
    ...source,
    async items(ctx) {
      const items = await source.items(ctx)
      return items.filter((item) => isCommandEnabled(item.id, item, settings))
    },
  }
}

/** Load items from several sources. A failing plugin is logged and skipped. */
export async function collect(sources: Source[], ctx: PaletteContext): Promise<Command[]> {
  const results = await Promise.all(
    sources.map(async (source) => {
      try {
        return await source.items(ctx)
      } catch (error) {
        console.error("[palette] source failed", error)
        return []
      }
    }),
  )
  return results.flat()
}
