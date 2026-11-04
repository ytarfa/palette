/**
 * Where the palette is: which mode, which nested lists are open, what's typed
 * and highlighted. Every change goes through `navigate`, so moving around
 * always resets the query, highlight and notice the same way.
 */
import { TABS } from "@/core/modes"
import type { Command as Item } from "@/core/types"

/** A nested list pushed by an item with `children`. */
export interface Page {
  title: string
  placeholder?: string
  items: NonNullable<Item["children"]>["items"]
}

export interface Navigation {
  /** Bumps every time the palette opens; resets cmdk and reloads items. */
  session: number
  modeId: string
  pages: Page[]
  query: string
  /** Id of the highlighted item. "" means the top one. */
  selected: string
  /** Feedback from the last run, e.g. "Copied by …", in the footer. */
  notice?: string
}

export type NavigationAction =
  /** The palette opens (or reopens) in a mode. */
  | { type: "open"; mode: string }
  /** Switch mode, e.g. by shortcut or by typing its prefix (the rest of the query comes along). */
  | { type: "switchMode"; mode: string; query?: string }
  /** Drill into an item's children. */
  | { type: "push"; page: Page }
  /** Leave the current nested list. */
  | { type: "back" }
  | { type: "query"; query: string }
  | { type: "select"; id: string }
  | { type: "notice"; notice: string }

export const initialNavigation: Navigation = { session: 0, modeId: TABS.id, pages: [], query: "", selected: "" }

/** New query, new results: highlight the top one again. */
const withQuery = (state: Navigation, query: string): Navigation => ({
  ...state,
  query,
  selected: "",
  notice: undefined,
})

export function navigate(state: Navigation, action: NavigationAction): Navigation {
  switch (action.type) {
    case "open":
      return withQuery({ ...state, session: state.session + 1, modeId: action.mode, pages: [] }, "")
    case "switchMode":
      return withQuery({ ...state, modeId: action.mode, pages: [] }, action.query ?? "")
    case "push":
      return withQuery({ ...state, pages: [...state.pages, action.page] }, "")
    case "back":
      return withQuery({ ...state, pages: state.pages.slice(0, -1) }, "")
    case "query":
      return withQuery(state, action.query)
    case "select":
      return { ...state, selected: action.id }
    case "notice":
      return { ...state, notice: action.notice }
  }
}
