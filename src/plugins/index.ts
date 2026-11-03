import type { Plugin } from "@/core/types"
import browserCommands from "./browser-commands"
import copyContent from "./copy-content"
import { externalPlugins, pluginRequests } from "./external"
import pageTools from "./page-tools"
import pageView from "./page-view"
import screenshots from "./screenshots"
import siteData from "./site-data"
import tabCleanup from "./tab-cleanup"
import tabCommands from "./tab-commands"
import tabs from "./tabs"
import webSearch from "./web-search"

/** Every file in ./sites is a site plugin, registered automatically. */
const sites = Object.values(
  import.meta.glob<Plugin>(["./sites/*.ts", "!./sites/*.test.ts"], { eager: true, import: "default" }),
).sort((a, b) => a.name.localeCompare(b.name))

/**
 * All plugins. Order sets the order of groups when the query is empty:
 * approval requests first, then commands for the current site.
 * Users turn plugins on and off in settings (src/options).
 */
export const plugins: Plugin[] = [
  pluginRequests,
  ...sites,
  tabs,
  tabCommands,
  browserCommands,
  pageTools,
  screenshots,
  copyContent,
  pageView,
  tabCleanup,
  siteData,
  externalPlugins,
  webSearch,
]
