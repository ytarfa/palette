import { describe, expect, it } from "vitest"
import { plugins } from "@/plugins"
import { builtInNames, fold, pluginGroup, pluginName } from "./plugin-names"

const reserved = builtInNames(plugins)

describe("builtInNames", () => {
  it("has the built-in plugin, mode and group names", () => {
    for (const name of ["Tabs", "Commands", "Palette", "Plugins", "Plugin requests", "Tab", "Page", "Window", "Browser", "Web"]) {
      expect(reserved.has(fold(name)), name).toBe(true)
    }
    for (const site of plugins.filter((p) => p.category === "site")) expect(reserved.has(fold(site.name))).toBe(true)
  })

  it("leaves other names free", () => {
    for (const name of ["Bookmarks", "Snippets", "Todoist", "My Tools"]) expect(reserved.has(fold(name)), name).toBe(false)
  })
})

describe("fold", () => {
  it("ignores case, spacing, punctuation, accents and invisible characters", () => {
    for (const name of [" tabs ", "TABS", "T a b s", "Tabs:", "Tâbs", "Ta​bs", "Ｔａｂｓ", "Tab"]) {
      expect(fold(name), name).toBe(fold("Tabs"))
    }
  })

  it("folds look-alike letters", () => {
    expect(fold("Таbs")).toBe(fold("Tabs")) // Cyrillic Т and а
    expect(fold("G1tHub")).toBe(fold("GitHub"))
    expect(fold("GltHub")).toBe(fold("GitHub"))
    expect(fold("Pa1ette")).toBe(fold("Palette"))
    expect(fold("Brovvser")).toBe(fold("Browser"))
  })
})

describe("pluginName", () => {
  it("keeps names that don't look built-in", () => {
    expect(pluginName("Snippets", reserved)).toBe("Snippets")
  })

  it("marks names that look built-in", () => {
    expect(pluginName("Tabs", reserved)).toBe("Tabs (plugin)")
    expect(pluginName(" github ", reserved)).toBe(" github  (plugin)")
    expect(pluginName("Plugin Requests", reserved)).toBe("Plugin Requests (plugin)")
  })

  it("marks names with nothing visible to compare", () => {
    expect(pluginName("​", reserved)).toBe("​ (plugin)")
  })
})

describe("pluginGroup", () => {
  it("is the plugin's name by default", () => {
    expect(pluginGroup("Snippets", undefined, reserved)).toBe("Snippets")
  })

  it("adds the plugin's own group after its name", () => {
    expect(pluginGroup("Snippets", "Email", reserved)).toBe("Snippets · Email")
  })

  it("drops groups that look built-in or repeat the name", () => {
    expect(pluginGroup("Snippets", "Tabs", reserved)).toBe("Snippets")
    expect(pluginGroup("Snippets", "plugin requests", reserved)).toBe("Snippets")
    expect(pluginGroup("Snippets", "GitHub", reserved)).toBe("Snippets")
    expect(pluginGroup("Snippets", "snippets", reserved)).toBe("Snippets")
    expect(pluginGroup("Snippets", "​", reserved)).toBe("Snippets")
  })
})
