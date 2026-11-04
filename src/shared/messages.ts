/** Messages between the background worker, the content script and the palette frame. */

export type ModeId = string

/** background → content script */
export interface OpenMessage {
  type: "palette:open"
  mode: ModeId
}

/**
 * Messages to the background worker, by type: what each one carries and what
 * it answers. The background handles each type in one place (see
 * src/background/index.ts); send them with `sendToBackground`.
 */
export interface BackgroundRequests {
  /** content script → background, when the in-page palette can't load */
  "palette:fallback": { request: { mode: ModeId }; response: void }
  /** content script → background, before it creates the palette frame */
  "palette:register-frame": { request: { token: string }; response: void }
  /** palette frame → background. The response is the token its content script registered, if any. */
  "palette:claim-frame": { request: object; response: string | undefined }
}

export type BackgroundRequestType = keyof BackgroundRequests

export type BackgroundMessage<T extends BackgroundRequestType = BackgroundRequestType> = {
  [K in T]: { type: K } & BackgroundRequests[K]["request"]
}[T]

export type BackgroundResponse<T extends BackgroundRequestType> = BackgroundRequests[T]["response"]

export function sendToBackground<T extends BackgroundRequestType>(
  message: BackgroundMessage<T>,
): Promise<BackgroundResponse<T>> {
  return chrome.runtime.sendMessage(message)
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
