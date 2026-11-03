/**
 * The palette page runs in two places:
 * - embedded: in an iframe the content script injects into the page
 * - popup: as the toolbar popup, used on pages without a content script
 */
import {
  PENDING_MODE_KEY,
  type ClaimFrameMessage,
  type FromFrame,
  type ModeId,
  type ToFrame,
} from "@/shared/messages"

export const embedded = window.parent !== window

/** Tags the content script's messages. Never sent back: the parent window is the page's. */
let token: string | undefined

/**
 * Whether to run at all. Any page can embed palette.html, so a frame only runs
 * if the background hands it the token its tab's content script registered
 * (see src/background/frames.ts).
 */
export const trusted: Promise<boolean> = embedded
  ? chrome.runtime.sendMessage({ type: "palette:claim-frame" } satisfies ClaimFrameMessage).then(
      (claimed: unknown) => {
        token = typeof claimed === "string" ? claimed : undefined
        return !!token
      },
      () => false,
    )
  : Promise.resolve(true)

export function post(message: FromFrame) {
  if (embedded && token) window.parent.postMessage(message, "*")
}

export function closePalette() {
  if (embedded) post({ type: "close" })
  else window.close()
}

export function onHostMessage(listener: (message: ToFrame) => void) {
  const handler = (e: MessageEvent) => {
    if (!token || e.source !== window.parent || e.data?.palette !== token) return
    listener(e.data as ToFrame)
  }
  window.addEventListener("message", handler)
  return () => window.removeEventListener("message", handler)
}

/** Mode the popup was asked to open in by the background worker. */
export async function takePendingMode(): Promise<ModeId | undefined> {
  const { [PENDING_MODE_KEY]: mode } = await chrome.storage.session.get(PENDING_MODE_KEY)
  await chrome.storage.session.remove(PENDING_MODE_KEY)
  return mode as ModeId | undefined
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // The page's permissions policy can block the async clipboard API in frames.
    const textarea = document.createElement("textarea")
    textarea.value = text
    document.body.append(textarea)
    textarea.select()
    document.execCommand("copy")
    textarea.remove()
  }
}
