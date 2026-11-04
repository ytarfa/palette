import { describe, expect, it } from "vitest"
import type { Command } from "@/core/types"
import { groupBy, search } from "./search"

const item = (id: string, title: string, extra: Partial<Command> = {}): Command => ({ id, title, ...extra })

describe("search", () => {
  const items = [
    item("close-dupes", "Close duplicate tabs"),
    item("dupe", "Duplicate tab"),
    item("web", "Search the web", { alwaysShow: true }),
    item("zoom", "Zoom in"),
  ]

  it("returns everything for an empty query", () => {
    expect(search(items, "  ")).toBe(items)
  })

  it("ranks title matches first and keeps alwaysShow items last", () => {
    expect(search(items, "dupl").map((i) => i.id)).toEqual(["dupe", "close-dupes", "web"])
  })
})

describe("groupBy", () => {
  it("groups in first-seen order", () => {
    const groups = groupBy([item("a", "A", { group: "Tab" }), item("b", "B"), item("c", "C", { group: "Tab" })])
    expect(groups.map(([group, list]) => [group, list.map((i) => i.id)])).toEqual([
      ["Tab", ["a", "c"]],
      ["", ["b"]],
    ])
  })
})
