export const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent)

interface Parsed {
  ctrl: boolean
  meta: boolean
  alt: boolean
  shift: boolean
  key: string
}

// Keys that can't be written literally inside "a+b".
const CHARS: Record<string, string> = { plus: "+", minus: "-", comma: "," }

function parse(shortcut: string): Parsed {
  const parts = shortcut.toLowerCase().split("+")
  const name = parts.pop() ?? ""
  const key = CHARS[name] ?? name
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

// Platform conventions: ⌃⌥⇧⌘ on macOS, Ctrl+Alt+Shift elsewhere.
const MODIFIER_ORDER = isMac
  ? ["ctrl", "alt", "shift", "mod", "meta"]
  : ["mod", "ctrl", "alt", "shift", "meta"]

// Named keys shown as symbols.
const KEYS: Record<string, string> = {
  backspace: "⌫",
  enter: "↵",
  escape: "Esc",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
}

/** "mod+backspace" → ["⌘", "⌫"] on macOS, ["Ctrl", "⌫"] elsewhere. */
export function formatShortcut(shortcut: string): string[] {
  const parts = shortcut.toLowerCase().split("+")
  const key = parts.pop() ?? ""
  const mods = MODIFIER_ORDER.filter((m) => parts.includes(m)).map((m) => SYMBOLS[m])
  return [...mods, KEYS[key] ?? CHARS[key] ?? key.toUpperCase()]
}

/** As one string, the way menus show it: "⇧⌘T" on macOS, "Ctrl+Shift+T" elsewhere. */
export function formatShortcutText(shortcut: string): string {
  return formatShortcut(shortcut).join(isMac ? "" : "+")
}
