import { describe, expect, it } from "vitest"
import { initialNavigation, navigate, type Navigation, type Page } from "./navigation"

const page = (title: string): Page => ({ title, items: () => [] })

const busy: Navigation = {
  session: 1,
  modeId: "commands",
  pages: [page("Windows")],
  query: "abc",
  selected: "tab-commands:close",
  notice: "Copied",
}

describe("navigate", () => {
  it("opens a fresh session in the mode", () => {
    expect(navigate(busy, { type: "open", mode: "tabs" })).toEqual({
      session: 2,
      modeId: "tabs",
      pages: [],
      query: "",
      selected: "",
      notice: undefined,
    })
  })

  it("switches mode, leaving nested lists and carrying a prefix's query", () => {
    const next = navigate(busy, { type: "switchMode", mode: "tabs" })
    expect(next).toMatchObject({ session: 1, modeId: "tabs", pages: [], query: "" })
    expect(navigate(initialNavigation, { type: "switchMode", mode: "commands", query: "dup" }).query).toBe("dup")
  })

  it("pushes and pops nested lists, clearing the query", () => {
    const pushed = navigate(busy, { type: "push", page: page("Move to") })
    expect(pushed.pages.map((p) => p.title)).toEqual(["Windows", "Move to"])
    expect(pushed.query).toBe("")
    expect(navigate(pushed, { type: "back" }).pages.map((p) => p.title)).toEqual(["Windows"])
  })

  it("resets the highlight and notice when the query changes", () => {
    expect(navigate(busy, { type: "query", query: "abcd" })).toMatchObject({
      query: "abcd",
      selected: "",
      notice: undefined,
    })
  })

  it("keeps the query when selecting or showing a notice", () => {
    expect(navigate(busy, { type: "select", id: "x" })).toMatchObject({ query: "abc", selected: "x" })
    expect(navigate(busy, { type: "notice", notice: "Done" })).toMatchObject({ query: "abc", notice: "Done" })
  })
})
