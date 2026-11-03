/**
 * Add commands to Palette from your own Chrome extension. Call
 * `definePalettePlugin` once, at the top level of your service worker.
 *
 * Palette asks the user to approve a plugin before showing its commands.
 */
import {
  PALETTE_ID,
  PROTOCOL,
  type Effect,
  type ItemData,
  type ModeId,
  type RegisterResponse,
  type Registration,
  type TabInfo,
  type ToPalette,
  type ToPlugin,
} from "./protocol.js"

export * from "./protocol.js"

type Awaitable<T> = T | Promise<T>

export interface Context {
  /** The current search text. */
  query: string
  /** The tab the palette was opened from. */
  tab?: TabInfo
}

export interface Item extends Omit<ItemData, "hasChildren" | "childrenPlaceholder"> {
  /** Return an `Effect` to copy text, open a URL or keep the palette open. */
  run?(ctx: Context): Awaitable<Effect | void>
  /** Open a nested list instead of running. */
  children?: {
    placeholder?: string
    items(ctx: Context): Awaitable<Item[]>
  }
}

export interface Source {
  id: string
  mode: ModeId
  /** Re-run `items` on every keystroke. */
  dynamic?: boolean
  items(ctx: Context): Awaitable<Item[]>
}

export interface PluginDefinition {
  name: string
  /** Shown when Palette asks the user to approve the plugin. */
  description?: string
  /** Static commands, listed under ⌘⇧K. */
  commands?: Item[]
  /** Items computed when the palette opens, or as the user types. */
  sources?: Source[]
  /** Override Palette's extension ID, e.g. for a development build. */
  paletteId?: string
}

export interface PalettePlugin {
  /** Send the registration again, e.g. after your commands change. */
  register(): Promise<RegisterResponse | undefined>
  unregister(): Promise<void>
}

export function definePalettePlugin(definition: PluginDefinition): PalettePlugin {
  const paletteId = definition.paletteId ?? PALETTE_ID
  const commands = definition.commands ?? []
  const sources = definition.sources ?? []
  // Items handed out by sources and children, so `run` can find them again.
  // If the service worker restarted in between, they're rebuilt (see `find`).
  const handed = new Map<string, Item>()

  const send = async (message: ToPalette) => {
    try {
      return await chrome.runtime.sendMessage<ToPalette, RegisterResponse>(paletteId, message)
    } catch {
      return undefined // Palette isn't installed or is disabled.
    }
  }

  const register = () =>
    send({
      palette: PROTOCOL,
      type: "register",
      plugin: {
        name: definition.name,
        description: definition.description,
        commands: commands.map(toData),
        sources: sources.map(({ id, mode, dynamic }) => ({ id, mode, dynamic })),
      } satisfies Registration,
    })

  const hand = (items: Item[]) => {
    for (const item of items) handed.set(item.id, item)
    return { items: items.map(toData) }
  }

  async function find(
    message: Extract<ToPlugin, { type: "run" | "children" }>,
    ctx: Context,
  ): Promise<Item | undefined> {
    const id = message.id
    const known = commands.find((c) => c.id === id) ?? handed.get(id)
    if (known) return known
    if (message.type === "run" && message.source) {
      const source = sources.find((s) => s.id === message.source)
      return (await source?.items(ctx))?.find((i) => i.id === id)
    }
    if (message.type === "run" && message.parent) {
      const parent = await find({ ...message, id: message.parent, parent: undefined }, ctx)
      return (await parent?.children?.items(ctx))?.find((i) => i.id === id)
    }
    return undefined
  }

  async function handle(message: ToPlugin) {
    const ctx: Context = { query: message.query, tab: message.tab }
    switch (message.type) {
      case "items": {
        const source = sources.find((s) => s.id === message.source)
        return hand(source ? await source.items(ctx) : [])
      }
      case "children": {
        const item = await find(message, ctx)
        return hand((await item?.children?.items(ctx)) ?? [])
      }
      case "run": {
        const item = await find(message, ctx)
        if (!item?.run) throw new Error(`Unknown command: ${message.id}`)
        return { effect: (await item.run(ctx)) ?? undefined }
      }
    }
  }

  chrome.runtime.onMessageExternal.addListener((message: ToPlugin, sender, sendResponse) => {
    if (sender.id !== paletteId || message?.palette !== PROTOCOL) return
    handle(message).then(sendResponse, (error) => sendResponse({ error: String(error) }))
    return true // Respond asynchronously.
  })

  // Register when installed or updated, and on browser start in case Palette
  // was installed after this extension.
  chrome.runtime.onInstalled.addListener(() => void register())
  chrome.runtime.onStartup.addListener(() => void register())

  return {
    register,
    async unregister() {
      await send({ palette: PROTOCOL, type: "unregister" })
    },
  }
}

function toData({ run: _run, children, ...item }: Item): ItemData {
  return children
    ? { ...item, hasChildren: true, childrenPlaceholder: children.placeholder }
    : item
}
