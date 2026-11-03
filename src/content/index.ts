/**
 * Content script. When the background worker relays a shortcut (⌘⇧P / ⌘⇧K,
 * see "commands" in the manifest), shows the palette in an iframe, which
 * isolates it from the page's CSS and scripts. The frame is created on first
 * use and then kept around, hidden, so reopening is instant.
 *
 * Built as a standalone IIFE (see vite.content.config.ts).
 */
import type {
  FallbackMessage,
  FromFrame,
  ModeId,
  OpenMessage,
  RegisterFrameMessage,
  ToFrame,
} from "@/shared/messages"

declare global {
  interface Window {
    __palette?: { dispose(): void }
  }
}

// If the extension was reloaded, an older copy of this script may still be
// running in the page. Replace it.
window.__palette?.dispose()

// Tags our messages to the frame, which ignores any without it (see src/background/frames.ts).
const token = crypto.randomUUID()
// getURL returns a per-session URL (use_dynamic_url), but the frame runs at the extension's origin.
const frameOrigin = `chrome-extension://${chrome.runtime.id}`
let host: HTMLElement | undefined
let frame: HTMLIFrameElement | undefined
let ready = false
let visible = false
let pendingMode: ModeId | undefined
let previousFocus: Element | null = null
let readyTimer: number | undefined

/** After an extension reload, this script is orphaned and the chrome APIs stop working. */
const alive = () => !!chrome.runtime?.id

function post(message: ToFrame) {
  frame?.contentWindow?.postMessage({ palette: token, ...message }, frameOrigin)
}

function createFrame() {
  host = document.createElement("palette-root")
  host.style.cssText = "all: initial; position: fixed; inset: 0; z-index: 2147483647; display: none;"
  const shadow = host.attachShadow({ mode: "closed" })
  frame = document.createElement("iframe")
  frame.allow = "clipboard-write"
  // A color-scheme mismatch with the page would make the frame opaque.
  frame.style.cssText =
    "all: initial; width: 100%; height: 100%; border: 0; color-scheme: normal; background: transparent;"
  shadow.append(frame)
  document.documentElement.append(host)
  // The frame claims the token as it loads, so register it first.
  const iframe = frame
  const message: RegisterFrameMessage = { type: "palette:register-frame", token }
  void chrome.runtime.sendMessage(message).then(() => {
    iframe.src = chrome.runtime.getURL("palette.html")
  })
}

function open(mode: ModeId) {
  if (!alive()) return
  if (!frame) createFrame()
  if (!visible) previousFocus = document.activeElement
  if (ready) post({ type: "open", mode })
  else {
    pendingMode = mode
    // Pages can block the frame (e.g. strict sandboxing). Fall back to the popup.
    clearTimeout(readyTimer)
    readyTimer = window.setTimeout(() => {
      if (ready) return
      const message: FallbackMessage = { type: "palette:fallback", mode }
      void chrome.runtime.sendMessage(message)
    }, 1500)
  }
}

function show() {
  if (!host || !frame) return
  visible = true
  host.style.display = "block"
  frame.focus()
  post({ type: "focus" })
}

function hide() {
  if (!host || !visible) return
  visible = false
  host.style.display = "none"
  if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true })
  previousFocus = null
}

function onFrameMessage(e: MessageEvent) {
  if (!frame || e.source !== frame.contentWindow || e.origin !== frameOrigin) return
  const data = e.data as FromFrame | undefined
  switch (data?.type) {
    case "ready":
      ready = true
      clearTimeout(readyTimer)
      if (pendingMode) post({ type: "open", mode: pendingMode })
      pendingMode = undefined
      break
    case "show":
      show()
      break
    case "close":
      hide()
      break
  }
}

function onRuntimeMessage(message: OpenMessage) {
  if (message?.type === "palette:open") open(message.mode)
}

function onVisibilityChange() {
  if (document.hidden) hide()
}

function dispose() {
  window.removeEventListener("message", onFrameMessage)
  document.removeEventListener("visibilitychange", onVisibilityChange)
  if (alive()) chrome.runtime.onMessage.removeListener(onRuntimeMessage)
  host?.remove()
  delete window.__palette
}

window.addEventListener("message", onFrameMessage)
document.addEventListener("visibilitychange", onVisibilityChange)
chrome.runtime.onMessage.addListener(onRuntimeMessage)
window.__palette = { dispose }
