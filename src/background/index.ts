/**
 * Service worker. Routes the extension shortcuts to the in-page palette, and
 * falls back to the toolbar popup on pages content scripts can't run on
 * (chrome://, the Web Store, the new tab page).
 */
import { PENDING_MODE_KEY, type FallbackMessage, type ModeId, type OpenMessage } from "@/shared/messages"

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

chrome.runtime.onMessage.addListener((message: FallbackMessage) => {
  if (message?.type === "palette:fallback") void openPopup(message.mode)
})

// Tabs opened before install (or before an extension reload) don't have the
// content script yet. Inject it so ⌘P / ⌘K work without reloading every tab.
chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] })
  for (const tab of tabs) {
    if (tab.id == null || tab.discarded) continue
    chrome.scripting
      .executeScript({ target: { tabId: tab.id }, files: ["content.js"] })
      .catch(() => {})
  }
})
