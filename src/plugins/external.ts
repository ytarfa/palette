import { Blocks, Puzzle, ShieldCheck } from "lucide-react"
import type { Effect, ItemData, ItemsResponse, RunResponse } from "@palette/sdk"
import {
  cleanItems,
  getPlugins,
  removePlugin,
  request,
  setStatus,
  shared,
  type StoredPlugin,
} from "@/core/external"
import { TABS } from "@/core/modes"
import { builtInNames, pluginGroup, pluginName } from "@/core/plugin-names"
import { definePlugin, type Command, type Plugin, type PaletteContext, type RunResult } from "@/core/types"

/** Folded names plugins can't use, set from the built-in plugins in ./index.ts. */
let reserved = new Set<string>()

export function reserveBuiltInNames(plugins: Plugin[]) {
  reserved = builtInNames(plugins)
}

/** Longest text a plugin can copy, so a command can't fill the clipboard with a hidden payload. */
export const MAX_COPY = 100_000

/**
 * A notice when plugins are waiting for approval. Approving happens only in
 * settings, where the extension ID is shown, so nothing here runs on plugin
 * text: the title and keywords are fixed, and Enter just opens settings.
 */
export const pluginRequests = definePlugin({
  id: "plugin-requests",
  name: "Plugin requests",
  category: "core",
  sources: [
    {
      mode: "commands",
      async items() {
        const pending = (await getPlugins()).filter((p) => p.status === "pending").length
        if (!pending) return []
        return [
          {
            id: "review",
            title: pending === 1 ? "1 plugin is waiting for approval" : `${pending} plugins are waiting for approval`,
            subtitle: "Open settings to review",
            group: "Palette",
            icon: ShieldCheck,
            keywords: ["plugin", "request", "approve", "extensions"],
            run: () => chrome.runtime.openOptionsPage(),
          },
        ]
      },
    },
  ],
})

/** Items from approved plugin extensions, plus "Manage plugins…". */
export const externalPlugins = definePlugin({
  id: "external",
  name: "Plugins",
  category: "core",
  commands: [
    {
      id: "manage",
      title: "Manage plugins…",
      group: "Palette",
      icon: Blocks,
      keywords: ["extensions", "addons"],
      children: {
        placeholder: "Plugins from other extensions…",
        async items() {
          const plugins = await getPlugins()
          if (!plugins.length) return [{ id: "none", title: "No plugins installed", icon: Puzzle }]
          return plugins.map((plugin) => ({
            id: plugin.id,
            title: pluginName(plugin.name, reserved),
            subtitle: plugin.description,
            icon: Puzzle,
            hint: { allowed: "On", denied: "Blocked", pending: "Waiting for approval" }[plugin.status],
            // Turning a plugin off is fine from here; allowing one happens in settings.
            async run() {
              if (plugin.status !== "allowed") return chrome.runtime.openOptionsPage()
              await setStatus(plugin.id, "denied")
              return { keepOpen: true }
            },
            actions: [
              {
                id: "remove",
                title: "Remove",
                shortcut: "mod+backspace",
                async run() {
                  await removePlugin(plugin.id)
                  return { keepOpen: true }
                },
              },
            ],
          }))
        },
      },
    },
  ],
  sources: (["tabs", "commands"] as const).flatMap((mode) => [
    { mode, items: (ctx: PaletteContext) => load(mode, false, ctx) },
    { mode, dynamic: true, items: (ctx: PaletteContext) => load(mode, true, ctx) },
  ]),
})

async function load(mode: string, dynamic: boolean, ctx: PaletteContext): Promise<Command[]> {
  const plugins = (await getPlugins()).filter((p) => p.status === "allowed")
  const results = await Promise.allSettled(
    plugins.flatMap((plugin) => {
      const statics =
        mode === "commands" && !dynamic
          ? [Promise.resolve(plugin.commands.map((item) => toCommand(plugin, item, {}, mode)))]
          : []
      // Without query access, a dynamic source is asked once like a static one:
      // it would only get empty queries, and asking on every keystroke would
      // still tell it when and how much the user types.
      const fetched = plugin.sources
        .filter((s) => s.mode === mode && (!!s.dynamic && plugin.access?.query === true) === dynamic)
        .map(async (source) => {
          const reply = await request<ItemsResponse>(plugin.id, {
            type: "items",
            source: source.id,
            ...shared(plugin.access, ctx),
          })
          return cleanItems(reply?.items, plugin.id).map((item) =>
            toCommand(plugin, item, { source: source.id }, mode),
          )
        })
      return [...statics, ...fetched]
    }),
  )
  for (const result of results) {
    if (result.status === "rejected") console.warn("[palette] plugin failed", result.reason)
  }
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []))
}

/**
 * Wrap a plugin's item. Running it or opening its children asks the plugin over messaging.
 * The group heading always names the plugin, and in tabs mode a badge does too, so its
 * items can't pass for built-in commands or real tabs.
 */
function toCommand(
  plugin: StoredPlugin,
  item: ItemData,
  origin: { source?: string; parent?: string },
  mode: string,
): Command {
  const name = pluginName(plugin.name, reserved)
  return {
    id: `${plugin.id}:${item.id}`,
    title: item.title,
    subtitle: item.subtitle,
    icon: item.icon ?? Puzzle,
    keywords: [...(item.keywords ?? []), name],
    group: pluginGroup(name, item.group, reserved),
    hint: item.hint,
    badge: mode === TABS.id ? name : undefined,
    shortcut: item.shortcut,
    alwaysShow: item.alwaysShow,
    children: item.hasChildren
      ? {
          placeholder: item.childrenPlaceholder,
          async items(ctx) {
            const reply = await request<ItemsResponse>(plugin.id, {
              type: "children",
              id: item.id,
              ...shared(plugin.access, ctx),
            })
            return cleanItems(reply?.items, plugin.id).map((child) =>
              toCommand(plugin, child, { parent: item.id }, mode),
            )
          },
        }
      : undefined,
    async run(ctx) {
      const reply = await request<RunResponse>(
        plugin.id,
        { type: "run", id: item.id, ...origin, ...shared(plugin.access, ctx) },
        10_000,
      )
      return applyEffect(ctx, reply?.effect, name)
    },
  }
}

async function applyEffect(ctx: PaletteContext, effect: Effect | undefined, name: string): Promise<RunResult> {
  if (!effect || typeof effect !== "object") return
  let notice: string | undefined
  if (typeof effect.copy === "string" && effect.copy.length > MAX_COPY) {
    console.warn("[palette] plugin copy too long, skipped", name)
  } else if (typeof effect.copy === "string") {
    await ctx.copy(effect.copy)
    notice = `Copied by ${name}`
  }
  if (typeof effect.open === "string" && /^https?:\/\//i.test(effect.open)) {
    if (effect.newTab || ctx.tab?.id == null) await chrome.tabs.create({ url: effect.open })
    else await chrome.tabs.update(ctx.tab.id, { url: effect.open })
  }
  return { keepOpen: effect.keepOpen === true, notice }
}
