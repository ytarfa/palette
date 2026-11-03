/**
 * Pairs each in-page palette frame with the content script that created it.
 *
 * Web pages can embed palette.html themselves and postMessage it, so the frame
 * only obeys messages tagged with a secret token. The content script registers
 * the token here before loading the frame, and the frame claims it from here.
 * The token never appears in the frame's URL or in anything the page can see.
 *
 * Kept in session storage, which content scripts can't read, since the worker
 * can be stopped between the two messages.
 */
const key = (tabId: number) => `paletteFrame:${tabId}`

export async function registerFrame(tabId: number, token: string) {
  await chrome.storage.session.set({ [key(tabId)]: token })
}

/** The token registered for this tab, handed out once. */
export async function claimFrame(tabId: number): Promise<string | undefined> {
  const { [key(tabId)]: token } = await chrome.storage.session.get(key(tabId))
  await chrome.storage.session.remove(key(tabId))
  return typeof token === "string" ? token : undefined
}

export async function forgetFrame(tabId: number) {
  await chrome.storage.session.remove(key(tabId))
}
