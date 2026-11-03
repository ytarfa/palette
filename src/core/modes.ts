import type { Mode } from "./types"

/**
 * Built-in modes. Their global shortcuts are the "commands" in the manifest;
 * `shortcut` here is what the palette itself listens for while focused.
 */
export const TABS: Mode = {
  id: "tabs",
  name: "Tabs",
  placeholder: "Search open tabs…",
  shortcut: "mod+shift+p",
}

export const COMMANDS: Mode = {
  id: "commands",
  name: "Commands",
  placeholder: "Run a command…",
  prefix: ">",
  shortcut: "mod+shift+k",
}
