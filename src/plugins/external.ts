import { Blocks, Puzzle, ShieldCheck } from "lucide-react"
import type { Effect, ItemData, ItemsResponse, RunResponse, TabInfo } from "@palette/sdk"
import {
  cleanItems,
  getPlugins,
  removePlugin,
  request,
  setStatus,
  type StoredPlugin,
} from "@/core/external"
import { definePlugin, type Command, type PaletteContext, type RunResult } from "@/core/types"

/** Approval requests from newly installed plugin extensions, at the top of ⌘⇧K. */
export const pluginRequests = definePlugin({
  id: "plugin-requests",
  name: "Plugin requests",
  sources: [
    {
      mode: "commands",
      async items() {
        const pending = (await getPlugins()).filter((p) => p.status === "pending")
        return pending.map((plugin) => ({
          id: plugin.id,
          title: `Allow “${plugin.name}” to add commands`,
          subtitle: "It will see the current tab's title and address",
          group: "Plugin requests",
          icon: ShieldCheck,
          keywords: [plugin.name, plugin.description ?? "", "plugin"],
          async run() {
            await setStatus(plugin.id, "allowed")
            return { keepOpen: true }
          },
          actions: [
            {
              id: "deny",
              title: "Block",
              shortcut: "mod+backspace",
              async run() {
                await setStatus(plugin.id, "denied")
                return { keepOpen: true }
              },
            },
          ],
        }))
      },
    },
  ],
})

/** Items from approved plugin extensions, plus "Manage plugins…". */
export const externalPlugins = definePlugin({
  id: "external",
  name: "Plugins",
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
            title: plugin.name,
            subtitle: plugin.description,
            icon: Puzzle,
            hint: { allowed: "On", denied: "Blocked", pending: "Waiting for approval" }[plugin.status],
            async run() {
              await setStatus(plugin.id, plugin.status === "allowed" ? "denied" : "allowed")
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
          ? [Promise.resolve(plugin.commands.map((item) => toCommand(plugin, item, {})))]
          : []
      const fetched = plugin.sources
        .filter((s) => s.mode === mode && !!s.dynamic === dynamic)
        .map(async (source) => {
          const reply = await request<ItemsResponse>(plugin.id, {
            type: "items",
            source: source.id,
            query: ctx.query,
            tab: tabInfo(ctx),
          })
          return cleanItems(reply?.items, plugin.id).map((item) =>
            toCommand(plugin, item, { source: source.id }),
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

/** Wrap a plugin's item. Running it or opening its children asks the plugin over messaging. */
function toCommand(
  plugin: StoredPlugin,
  item: ItemData,
  origin: { source?: string; parent?: string },
): Command {
  return {
    id: `${plugin.id}:${item.id}`,
    title: item.title,
    subtitle: item.subtitle,
    icon: item.icon ?? Puzzle,
    keywords: [...(item.keywords ?? []), plugin.name],
    group: item.group ?? plugin.name,
    hint: item.hint,
    shortcut: item.shortcut,
    alwaysShow: item.alwaysShow,
    children: item.hasChildren
      ? {
          placeholder: item.childrenPlaceholder,
          async items(ctx) {
            const reply = await request<ItemsResponse>(plugin.id, {
              type: "children",
              id: item.id,
              query: ctx.query,
              tab: tabInfo(ctx),
            })
            return cleanItems(reply?.items, plugin.id).map((child) =>
              toCommand(plugin, child, { parent: item.id }),
            )
          },
        }
      : undefined,
    async run(ctx) {
      const reply = await request<RunResponse>(
        plugin.id,
        { type: "run", id: item.id, ...origin, query: ctx.query, tab: tabInfo(ctx) },
        10_000,
      )
      return applyEffect(ctx, reply?.effect)
    },
  }
}

const tabInfo = ({ tab }: PaletteContext): TabInfo | undefined =>
  tab && { id: tab.id, windowId: tab.windowId, url: tab.url, title: tab.title }

async function applyEffect(ctx: PaletteContext, effect: Effect | undefined): Promise<RunResult> {
  if (!effect || typeof effect !== "object") return
  if (typeof effect.copy === "string") await ctx.copy(effect.copy)
  if (typeof effect.open === "string" && /^https?:\/\//i.test(effect.open)) {
    if (effect.newTab || ctx.tab?.id == null) await chrome.tabs.create({ url: effect.open })
    else await chrome.tabs.update(ctx.tab.id, { url: effect.open })
  }
  return effect.keepOpen ? { keepOpen: true } : undefined
}
