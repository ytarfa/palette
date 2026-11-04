import { defaultFilter } from "cmdk"
import type { Command as Item } from "@/core/types"

// Scoring the title on its own lets "dupl" prefer "Duplicate tab" over "Close duplicate tabs".
const score = (item: Item, search: string) =>
  defaultFilter(item.title, search, [item.subtitle ?? "", ...(item.keywords ?? [])])

/**
 * Filter and sort here rather than in cmdk: cmdk sorts by moving DOM nodes,
 * which goes wrong when items arrive asynchronously (dynamic and plugin items).
 * `alwaysShow` items stay, after the matches.
 */
export function search(items: Item[], query: string): Item[] {
  const q = query.trim()
  if (!q) return items
  return items
    .map((item) => ({ item, score: item.alwaysShow ? 0 : score(item, q) }))
    .filter(({ item, score }) => item.alwaysShow || score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item)
}

/** Group items by `group`, keeping first-seen order. Ungrouped items use "". */
export function groupBy(items: Item[]): [string, Item[]][] {
  const groups = new Map<string, Item[]>()
  for (const item of items) {
    const key = item.group ?? ""
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return [...groups]
}
