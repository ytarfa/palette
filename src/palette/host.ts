/**
 * The palette page runs in two places:
 * - embedded: in an iframe the content script injects into the page
 * - popup: as the toolbar popup, used on pages without a content script
 */
import { PENDING_MODE_KEY, type FromFrame, type ModeId, type ToFrame } from "@/shared/messages"

export const embedded = window.parent !== window

const token = location.hash.slice(1)

export function post(message: FromFrame) {
  if (embedded) window.parent.postMessage({ palette: token, ...message }, "*")
}

export function closePalette() {
  if (embedded) post({ type: "close" })
  else window.close()
}

/** See `PaletteContext.conceal`. Gives up waiting after a second, e.g. if the page is frozen. */
export function concealPalette(): Promise<void> {
  if (!embedded) return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => {
      off()
      clearTimeout(timer)
      resolve()
    }
    const off = onHostMessage((message) => {
      if (message.type === "concealed") done()
    })
    const timer = setTimeout(done, 1000)
    post({ type: "conceal" })
  })
}

export function onHostMessage(listener: (message: ToFrame) => void) {
  const handler = (e: MessageEvent) => {
    if (e.source !== window.parent || e.data?.palette !== token) return
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
