import type { Plugin } from "@/core/types"
import browserCommands from "./browser-commands"
import tabCommands from "./tab-commands"
import tabs from "./tabs"
import webSearch from "./web-search"

/** Enabled plugins. Order sets the order of groups when the query is empty. */
export const plugins: Plugin[] = [tabs, tabCommands, browserCommands, webSearch]
