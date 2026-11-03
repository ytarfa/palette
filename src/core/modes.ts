import type { Mode } from "./types"

/** Built-in modes. Their global shortcuts live in the content script and manifest. */
export const TABS: Mode = {
  id: "tabs",
  name: "Tabs",
  placeholder: "Search open tabs…",
  shortcut: "mod+p",
}

export const COMMANDS: Mode = {
  id: "commands",
  name: "Commands",
  placeholder: "Run a command…",
  prefix: ">",
  shortcut: "mod+k",
}
