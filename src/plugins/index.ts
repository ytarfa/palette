import type { Plugin } from "@/core/types"
import browserCommands from "./browser-commands"
import { externalPlugins, pluginRequests } from "./external"
import pageTools from "./page-tools"
import tabCommands from "./tab-commands"
import tabs from "./tabs"
import webSearch from "./web-search"

/** Every file in ./sites is a site plugin, registered automatically. */
const sites = Object.values(
  import.meta.glob<Plugin>(["./sites/*.ts", "!./sites/*.test.ts"], { eager: true, import: "default" }),
).sort((a, b) => a.name.localeCompare(b.name))

/**
 * All plugins. Order sets the order of groups when the query is empty:
 * commands for the current site first. The notice about plugin requests sits
 * with "Manage plugins…", out of the top slot.
 * Users turn plugins on and off in settings (src/options).
 */
export const plugins: Plugin[] = [
  ...sites,
  tabs,
  tabCommands,
  browserCommands,
  pageTools,
  pluginRequests,
  externalPlugins,
  webSearch,
]
