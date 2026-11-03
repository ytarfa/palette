export const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent)

const MODIFIERS = ["mod", "ctrl", "meta", "alt", "shift"] as const

interface Parsed {
  ctrl: boolean
  meta: boolean
  alt: boolean
  shift: boolean
  key: string
}

function parse(shortcut: string): Parsed {
  const parts = shortcut.toLowerCase().split("+")
  const key = parts.pop() ?? ""
  const has = (m: string) => parts.includes(m)
  return {
    ctrl: has("ctrl") || (!isMac && has("mod")),
    meta: has("meta") || (isMac && has("mod")),
    alt: has("alt"),
    shift: has("shift"),
    key,
  }
}

/** Does the keyboard event match a shortcut like "mod+shift+k"? */
export function matchesShortcut(e: KeyboardEvent, shortcut: string): boolean {
  const s = parse(shortcut)
  if (e.ctrlKey !== s.ctrl || e.metaKey !== s.meta) return false
  if (e.altKey !== s.alt || e.shiftKey !== s.shift) return false
  // `code` keeps letters stable when Alt/Shift change `key` (⌥P types "π").
  const code = e.code.toLowerCase()
  return (
    e.key.toLowerCase() === s.key ||
    code === `key${s.key}` ||
    code === `digit${s.key}`
  )
}

/** Is this keydown/keyup for the key that `mod` maps to? */
export function isModKey(e: KeyboardEvent): boolean {
  return e.key === (isMac ? "Meta" : "Control")
}

const SYMBOLS: Record<string, string> = isMac
  ? { mod: "⌘", meta: "⌘", ctrl: "⌃", alt: "⌥", shift: "⇧" }
  : { mod: "Ctrl", meta: "Win", ctrl: "Ctrl", alt: "Alt", shift: "Shift" }

const KEYS: Record<string, string> = {
  backspace: "⌫",
  enter: "↵",
  escape: "Esc",
  arrowup: "↑",
  arrowdown: "↓",
}

/** "mod+backspace" → ["⌘", "⌫"] on macOS, ["Ctrl", "⌫"] elsewhere. */
export function formatShortcut(shortcut: string): string[] {
  const parts = shortcut.toLowerCase().split("+")
  const key = parts.pop() ?? ""
  const mods = MODIFIERS.filter((m) => parts.includes(m)).map((m) => SYMBOLS[m])
  return [...mods, KEYS[key] ?? key.toUpperCase()]
}
