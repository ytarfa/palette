/**
 * Service worker. Routes the extension shortcuts to the in-page palette, and
 * falls back to the toolbar popup on pages content scripts can't run on
 * (chrome://, the Web Store, the new tab page).
 */
import { PROTOCOL, type RegisterResponse, type ToPalette } from "@palette/sdk"
import { cleanRegistration, registrationError, removePlugin, savePlugin, updateBadge } from "@/core/external"
import {
  PENDING_MODE_KEY,
  type ClaimFrameMessage,
  type FallbackMessage,
  type ModeId,
  type OpenMessage,
  type RegisterFrameMessage,
} from "@/shared/messages"
import { claimFrame, forgetFrame, registerFrame } from "./frames"

const COMMAND_MODES: Record<string, ModeId> = {
  "open-tabs": "tabs",
  "open-commands": "commands",
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

chrome.runtime.onMessage.addListener(
  (message: FallbackMessage | RegisterFrameMessage | ClaimFrameMessage, sender, sendResponse) => {
    if (message?.type === "palette:fallback") void openPopup(message.mode)
    const tabId = sender.tab?.id
    if (tabId == null) return
    if (message?.type === "palette:register-frame") {
      void registerFrame(tabId, message.token).then(() => sendResponse(true))
      return true
    }
    if (message?.type === "palette:claim-frame") {
      void claimFrame(tabId).then(sendResponse)
      return true
    }
  },
)

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
