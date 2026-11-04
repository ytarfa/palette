/**
 * Service worker. Routes the extension shortcuts to the in-page palette, and
 * falls back to the toolbar popup on pages content scripts can't run on
 * (chrome://, the Web Store, the new tab page).
 */
import { PROTOCOL, type RegisterResponse, type ToPalette } from "@palette/sdk"
import { cleanRegistration, registrationError, removePlugin, savePlugin, updateBadge } from "@/core/external"
import { COMMANDS, TABS } from "@/core/modes"
import type { Awaitable } from "@/core/types"
import {
  PENDING_MODE_KEY,
  type BackgroundMessage,
  type BackgroundRequestType,
  type BackgroundResponse,
  type ModeId,
  type OpenMessage,
} from "@/shared/messages"
import { claimFrame, forgetFrame, registerFrame } from "./frames"

const COMMAND_MODES: Record<string, ModeId> = {
  "open-tabs": TABS.id,
  "open-commands": COMMANDS.id,
}

async function openPalette(mode: ModeId, tab?: chrome.tabs.Tab) {
  if (tab?.id != null) {
    try {
      const message: OpenMessage = { type: "palette:open", mode }
      await chrome.tabs.sendMessage(tab.id, message)
      return
    } catch {
      // No content script in this tab. Use the popup.
    }
  }
  await openPopup(mode)
}

async function openPopup(mode: ModeId) {
  await chrome.storage.session.set({ [PENDING_MODE_KEY]: mode })
  await chrome.action.openPopup()
}

chrome.commands.onCommand.addListener((command, tab) => {
  const mode = COMMAND_MODES[command]
  if (mode) void openPalette(mode, tab)
})

/** One handler per message type. A handler's return value is the reply. */
type Handlers = {
  [T in BackgroundRequestType]: (
    message: BackgroundMessage<T>,
    sender: chrome.runtime.MessageSender,
  ) => Awaitable<BackgroundResponse<T>>
}

/** The sender's tab. Frame messages only make sense from a tab. */
function senderTab(sender: chrome.runtime.MessageSender): number {
  const tabId = sender.tab?.id
  if (tabId == null) throw new Error("Not sent from a tab")
  return tabId
}

const handlers: Handlers = {
  "palette:fallback": ({ mode }) => openPopup(mode),
  "palette:register-frame": ({ token }, sender) => registerFrame(senderTab(sender), token),
  "palette:claim-frame": (_, sender) => claimFrame(senderTab(sender)),
}

chrome.runtime.onMessage.addListener((message: BackgroundMessage | undefined, sender, sendResponse) => {
  const type = message?.type
  if (!type || !Object.hasOwn(handlers, type)) return
  const handler = handlers[type] as (message: BackgroundMessage, sender: chrome.runtime.MessageSender) => unknown
  Promise.resolve()
    .then(() => handler(message, sender))
    .then(sendResponse, (error: unknown) => {
      console.error("[palette]", type, error)
      sendResponse(undefined)
    })
  return true
})

chrome.tabs.onRemoved.addListener((tabId) => void forgetFrame(tabId))

// Tabs opened before install (or before an extension reload) don't have the
// content script yet. Inject it so they get the in-page palette instead of the popup.
chrome.runtime.onInstalled.addListener(async () => {
  void updateBadge()
  const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] })
  for (const tab of tabs) {
    if (tab.id == null || tab.discarded) continue
    chrome.scripting
      .executeScript({ target: { tabId: tab.id }, files: ["content.js"] })
      .catch(() => {})
  }
})

// Plugins from other extensions register here (see packages/sdk). They stay
// "pending" until the user approves them in settings.
chrome.runtime.onMessageExternal.addListener((message: ToPalette, sender, sendResponse) => {
  const pluginId = sender.id
  if (!pluginId || message?.palette !== PROTOCOL) return
  void (async (): Promise<RegisterResponse> => {
    if (message.type === "unregister") {
      await removePlugin(pluginId)
      return { ok: true, status: "denied" }
    }
    if (message.type !== "register") return { ok: false, error: "Invalid registration" }
    const error = registrationError(message.plugin)
    if (error) return { ok: false, error }
    const registration = cleanRegistration(message.plugin, pluginId)
    if (!registration) return { ok: false, error: "Invalid registration" }
    return { ok: true, status: await savePlugin(pluginId, registration) }
  })()
    // A failed storage write (e.g. over quota) still gets an answer.
    .catch((e: unknown): RegisterResponse => ({ ok: false, error: `Couldn't save the plugin: ${String(e)}` }))
    .then(sendResponse)
  return true
})

chrome.runtime.onStartup.addListener(() => void updateBadge())
