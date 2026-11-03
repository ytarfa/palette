/**
 * Checks requests that arrive from Palette's extension ID before a plugin acts
 * on them. Until Palette is on the Chrome Web Store its ID comes from a public
 * manifest key, so another unpacked extension can claim it and send anything.
 */
import { PROTOCOL, type TabInfo, type ToPlugin } from "./protocol.js"

// Palette keeps item ids to 200 characters and source ids to 100.
const MAX_ID = 200
const MAX_QUERY = 10_000
const MAX_TITLE = 10_000
const MAX_URL = 100_000

type Fields = Record<string, unknown>

const isObject = (value: unknown): value is Fields =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isText = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length <= max

const isId = (value: unknown): value is string => isText(value, MAX_ID) && value !== ""

const optional = <T>(value: unknown, check: (value: unknown) => value is T): value is T | undefined =>
  value === undefined || check(value)

const isInteger = (value: unknown): value is number => Number.isSafeInteger(value)
const isUrl = (value: unknown): value is string => isText(value, MAX_URL)
const isTitle = (value: unknown): value is string => isText(value, MAX_TITLE)

/** A copy of the tab with only the documented fields, or `false` if any is malformed. */
function parseTab(value: unknown): TabInfo | undefined | false {
  if (value === undefined) return undefined
  if (!isObject(value)) return false
  const { id, windowId, url, title } = value
  if (!optional(id, isInteger) || !optional(windowId, isInteger)) return false
  if (!optional(url, isUrl) || !optional(title, isTitle)) return false
  return { id, windowId, url, title }
}

/**
 * A copy of the request with only the documented fields, or `undefined` if it
 * isn't one. Unknown fields are left out rather than rejected, so Palette can
 * add some without breaking older plugins.
 */
export function parseRequest(message: unknown): ToPlugin | undefined {
  if (!isObject(message) || message.palette !== PROTOCOL) return undefined
  if (!isText(message.query, MAX_QUERY)) return undefined
  const tab = parseTab(message.tab)
  if (tab === false) return undefined
  const base = { palette: PROTOCOL as typeof PROTOCOL, query: message.query, tab }
  switch (message.type) {
    case "items":
      return isId(message.source) ? { ...base, type: "items", source: message.source } : undefined
    case "children":
      return isId(message.id) ? { ...base, type: "children", id: message.id } : undefined
    case "run": {
      const { id, source, parent } = message
      if (!isId(id) || !optional(source, isId) || !optional(parent, isId)) return undefined
      return { ...base, type: "run", id, source, parent }
    }
    default:
      return undefined
  }
}
