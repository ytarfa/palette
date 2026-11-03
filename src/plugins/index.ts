import type { Plugin } from "@/core/types"
import browserCommands from "./browser-commands"
import { externalPlugins, pluginRequests } from "./external"
import github from "./sites/github"
import tabCommands from "./tab-commands"
import tabs from "./tabs"
import webSearch from "./web-search"

/**
 * Enabled plugins. Order sets the order of groups when the query is empty:
 * approval requests first, then commands for the current site.
 */
export const plugins: Plugin[] = [
  pluginRequests,
  github,
  tabs,
  tabCommands,
  browserCommands,
  externalPlugins,
  webSearch,
]
