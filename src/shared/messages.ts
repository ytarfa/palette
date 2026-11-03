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

/** content script → background, before it creates the palette frame */
export interface RegisterFrameMessage {
  type: "palette:register-frame"
  token: string
}

/** palette frame → background. The response is the token its content script registered, if any. */
export interface ClaimFrameMessage {
  type: "palette:claim-frame"
}

/** content script → palette frame (window.postMessage), tagged with the frame token */
export type ToFrame =
  | { type: "open"; mode: ModeId }
  | { type: "focus" }
  /** Reply to "conceal", once the page has repainted without the palette. */
  | { type: "concealed" }

/** palette frame → content script (window.postMessage) */
export type FromFrame =
  | { type: "ready" }
  | { type: "show" }
  | { type: "close" }
  /** Make the palette invisible but keep it focused, e.g. for a screenshot. Undone on close. */
  | { type: "conceal" }

/** Key in chrome.storage.session telling the popup which mode to open in. */
export const PENDING_MODE_KEY = "pendingMode"
