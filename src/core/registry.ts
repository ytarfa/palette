import { COMMANDS, TABS } from "./modes"
import type { Command, Mode, PaletteContext, Plugin, Source } from "./types"

export interface Registry {
  modes: Mode[]
  mode(id: string): Mode
  /** If the query starts with a mode prefix (e.g. ">"), the mode and the rest of the query. */
  matchPrefix(query: string): { mode: Mode; rest: string } | undefined
  sources(modeId: string): Source[]
}

export function createRegistry(plugins: Plugin[]): Registry {
  const modes: Mode[] = [TABS, COMMANDS, ...plugins.flatMap((p) => p.modes ?? [])]
  const sources: Source[] = plugins.flatMap((plugin) => {
    const own = plugin.sources ?? []
    const commands = plugin.commands ?? []
    const all = commands.length
      ? [...own, { mode: COMMANDS.id, items: () => commands }]
      : own
    return all.map((source) => namespaced(plugin, source))
  })

  return {
    modes,
    mode: (id) => modes.find((m) => m.id === id) ?? TABS,
    matchPrefix(query) {
      const mode = modes.find((m) => m.prefix && query.startsWith(m.prefix))
      return mode && { mode, rest: query.slice(mode.prefix!.length).trimStart() }
    },
    sources: (modeId) => sources.filter((s) => s.mode === modeId),
  }
}

/** Prefix ids with the plugin id so plugins can't collide, and apply `when`. */
function namespaced(plugin: Plugin, source: Source): Source {
  return {
    ...source,
    async items(ctx) {
      const items = await source.items(ctx)
      return items
        .filter((item) => !item.when || item.when(ctx))
        .map((item) => ({ ...item, id: `${plugin.id}:${item.id}` }))
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
