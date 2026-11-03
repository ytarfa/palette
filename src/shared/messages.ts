/** Messages between the background worker, the content script and the palette frame. */

export type ModeId = string

/** background → content script */
export interface OpenMessage {
  type: "palette:open"
  mode: ModeId
}

/** content script → background, when the in-page palette can't load */
export interface FallbackMessage {
  type: "palette:fallback"
  mode: ModeId
}

/** content script → palette frame (window.postMessage) */
export type ToFrame =
  | { type: "open"; mode: ModeId }
  | { type: "focus" }

/** palette frame → content script (window.postMessage) */
export type FromFrame =
  | { type: "ready" }
  | { type: "show" }
  | { type: "close" }

/** Key in chrome.storage.session telling the popup which mode to open in. */
export const PENDING_MODE_KEY = "pendingMode"
