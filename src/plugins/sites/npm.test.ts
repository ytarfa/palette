import { beforeEach, describe, expect, it } from "vitest"
import { commandsFor, context, mockChrome, run, searchFor, titles } from "@/test/site"
import npm, { parse, spec } from "./npm"

const REACT = "https://www.npmjs.com/package/react"
const BABEL = "https://www.npmjs.com/package/@babel/core/v/7.24.0"
const BABEL_TITLE = "@babel/core - npm"

let chrome: ReturnType<typeof mockChrome>
beforeEach(() => {
  chrome = mockChrome()
})

describe("npm", () => {
  it("only runs on npmjs.com", async () => {
    expect(await commandsFor(npm, "https://npmjs.com/package/react")).not.toEqual([])
    expect(await commandsFor(npm, "https://www.npmjs.com.evil.com/package/react")).toEqual([])
    expect(await commandsFor(npm, "https://evil-npmjs.com/package/react")).toEqual([])
    expect(await commandsFor(npm, "https://docs.npmjs.com/package/react")).toEqual([])
    expect(await commandsFor(npm, "https://github.com/facebook/react")).toEqual([])
  })

  it("parses packages, scoped packages and versions", () => {
    expect(parse(new URL(REACT))).toEqual({ name: "react", version: undefined })
    expect(parse(new URL("https://www.npmjs.com/package/react/v/18.2.0"))).toEqual({ name: "react", version: "18.2.0" })
    expect(parse(new URL("https://www.npmjs.com/package/@babel/core?activeTab=code"))).toEqual({
      name: "@babel/core",
      version: undefined,
    })
    expect(parse(new URL(BABEL))).toEqual({ name: "@babel/core", version: "7.24.0" })
    expect(parse(new URL("https://www.npmjs.com/package/%40babel%2Fcore"))).toEqual({ name: "@babel/core", version: undefined })
    expect(parse(new URL("https://www.npmjs.com/package/@babel"))).toEqual({})
    expect(parse(new URL("https://www.npmjs.com/search?q=react"))).toEqual({})
    expect(parse(new URL("https://www.npmjs.com/~sindresorhus"))).toEqual({})
    expect(spec("@babel/core", "7.24.0")).toBe("@babel/core@7.24.0")
  })

  it("has no commands off a package page", async () => {
    expect(await commandsFor(npm, "https://www.npmjs.com/")).toEqual([])
    expect(await commandsFor(npm, "https://www.npmjs.com/search?q=react")).toEqual([])
  })

  it("lists install commands first, then package tabs, then external tools", async () => {
    const items = await commandsFor(npm, BABEL, { title: BABEL_TITLE })
    expect(titles(items)).toEqual([
      "Copy install command",
      "Copy pnpm install command",
      "Copy yarn install command",
      "Copy bun install command",
      "Copy package name",
      "Readme",
      "Versions",
      "Dependencies",
      "Dependents",
      "Code",
      "Bundle size",
      "Install size",
      "Browse files",
      "Download trends",
      "Security report",
    ])
    expect(items.every((i) => i.group === "npm")).toBe(true)
  })

  it("copies install commands, keeping the version", async () => {
    const items = await commandsFor(npm, BABEL)
    expect((await run(items, "install-npm")).copied).toEqual(["npm i @babel/core@7.24.0"])
    expect((await run(items, "install-pnpm")).copied).toEqual(["pnpm add @babel/core@7.24.0"])
    expect((await run(items, "install-yarn")).copied).toEqual(["yarn add @babel/core@7.24.0"])
    expect((await run(items, "install-bun")).copied).toEqual(["bun add @babel/core@7.24.0"])
    expect((await run(items, "copy-name")).copied).toEqual(["@babel/core"])

    const latest = await commandsFor(npm, REACT)
    expect((await run(latest, "install-npm")).copied).toEqual(["npm i react"])
  })

  it("navigates to package tabs, or a new tab with ⌘↵", async () => {
    const items = await commandsFor(npm, BABEL)
    await run(items, "code")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: `${BABEL}?activeTab=code` })
    await run(items, "versions")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: "https://www.npmjs.com/package/@babel/core?activeTab=versions" })
    await items.find((i) => i.id === "dependents")!.actions![0].run(context(BABEL))
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "https://www.npmjs.com/package/@babel/core?activeTab=dependents" })

    await run(await commandsFor(npm, REACT), "dependencies")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: `${REACT}?activeTab=dependencies` })
  })

  it("opens external tools in a new tab", async () => {
    const items = await commandsFor(npm, BABEL)
    const opened = async (id: string) => {
      chrome.tabs.create.mockClear()
      await run(items, id)
      return chrome.tabs.create.mock.calls[0]
    }
    expect(await opened("bundlephobia")).toEqual([{ url: "https://bundlephobia.com/package/@babel/core@7.24.0" }])
    expect(await opened("packagephobia")).toEqual([{ url: "https://packagephobia.com/result?p=%40babel%2Fcore%407.24.0" }])
    expect(await opened("unpkg")).toEqual([{ url: "https://app.unpkg.com/@babel/core@7.24.0" }])
    expect(await opened("npmtrends")).toEqual([{ url: "https://npmtrends.com/@babel/core" }])
    expect(await opened("socket")).toEqual([{ url: "https://socket.dev/npm/package/@babel/core/overview/7.24.0" }])
    expect(chrome.tabs.update).not.toHaveBeenCalled()

    await run(await commandsFor(npm, REACT), "socket")
    expect(chrome.tabs.create).toHaveBeenLastCalledWith({ url: "https://socket.dev/npm/package/react" })
  })

  it("offers a search", async () => {
    const items = await searchFor(npm, REACT, "date picker")
    expect(titles(items)).toEqual(["Search npm for “date picker”"])
    expect(items.every((i) => i.alwaysShow)).toBe(true)
    await run(items, "search")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: "https://www.npmjs.com/search?q=date%20picker" })
    expect(await searchFor(npm, "https://www.npmjs.com/", "  ")).toEqual([])
  })
})
