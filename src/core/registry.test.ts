import { describe, expect, it } from "vitest"
import { collect, createRegistry } from "./registry"
import { definePlugin, type PaletteContext } from "./types"

const plugin = definePlugin({
  id: "demo",
  name: "Demo",
  category: "general",
  commands: [
    { id: "a", title: "A" },
    { id: "b", title: "B", enabledByDefault: false },
  ],
  sources: [{ mode: "commands", items: () => [{ id: "dynamic", title: "Dynamic" }] }],
})

const ctx: PaletteContext = { tab: undefined, query: "", copy: async () => {} }
const ids = async (settings: Parameters<ReturnType<typeof createRegistry>["sources"]>[1]) =>
  (await collect(createRegistry([plugin]).sources("commands", settings), ctx)).map((item) => item.id)

describe("command toggles", () => {
  it("uses each command's default", async () => {
    expect(await ids({ plugins: {}, commands: {} })).toEqual(["demo:dynamic", "demo:a"])
  })

  it("follows the user's choice over the default", async () => {
    expect(await ids({ plugins: {}, commands: { "demo:a": false, "demo:b": true } })).toEqual(["demo:dynamic", "demo:b"])
  })

  it("hides every command when the plugin is off", async () => {
    expect(await ids({ plugins: { demo: false }, commands: { "demo:b": true } })).toEqual([])
  })
})
