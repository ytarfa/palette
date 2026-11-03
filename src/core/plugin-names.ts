/**
 * Plugins from other extensions can't pass for Palette's own plugins: their
 * items always carry the plugin's name, and that name and their group
 * headings can't take or mimic a built-in plugin, mode or group name.
 */
import { COMMANDS, TABS } from "./modes"
import type { Plugin } from "./types"

/** Headings only built-in sources use, so they can't be read from `commands` up front. */
const SOURCE_GROUPS = ["Plugin requests", "Web"]

/** Letters from other scripts that look like Latin ones, after lowercasing. */
const LOOKALIKES: Record<string, string> = {
  а: "a", в: "b", е: "e", к: "k", м: "m", н: "h", о: "o", р: "p", с: "c", т: "t", у: "y", х: "x",
  і: "i", ј: "j", ѕ: "s", ԁ: "d", ӏ: "i", ɡ: "g",
  α: "a", β: "b", ε: "e", η: "n", ι: "i", κ: "k", ν: "v", ο: "o", ρ: "p", τ: "t", υ: "u", χ: "x",
  "0": "o", "1": "i", l: "i", "|": "i", "!": "i",
}

/**
 * What a name looks like: case, accents, spacing, punctuation, invisible
 * characters, look-alike letters and a trailing "s" don't count.
 */
export function fold(name: string): string {
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\p{M}/gu, "")
    .replace(/./gu, (c) => LOOKALIKES[c] ?? c)
    .replace(/[^\p{L}\p{N}]/gu, "")
    .replace(/rn/g, "m")
    .replace(/vv/g, "w")
    .replace(/s$/, "")
}

/** Folded names of the built-in plugins, their modes and their group headings. */
export function builtInNames(plugins: Plugin[]): Set<string> {
  const modes = [TABS, COMMANDS, ...plugins.flatMap((p) => p.modes ?? [])]
  const names = [
    ...SOURCE_GROUPS,
    ...modes.map((m) => m.name),
    ...plugins.flatMap((p) => [p.name, ...(p.commands ?? []).map((c) => c.group)]),
  ]
  return new Set(names.filter((name) => name !== undefined).map(fold))
}

/** A plugin's name as shown: marked as a plugin if it looks like a built-in name, or like nothing. */
export function pluginName(name: string, reserved: Set<string>): string {
  const folded = fold(name)
  return !folded || reserved.has(folded) ? `${name} (plugin)` : name
}

/** Group heading for a plugin's item: its name, then its own group unless that is a built-in name. */
export function pluginGroup(name: string, group: string | undefined, reserved: Set<string>): string {
  const folded = group && fold(group)
  if (!folded || folded === fold(name) || reserved.has(folded)) return name
  return `${name} · ${group}`
}
