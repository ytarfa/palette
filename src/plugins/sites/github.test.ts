import { beforeEach, describe, expect, it } from "vitest"
import { commandsFor, context, mockChrome, run, searchFor, titles } from "@/test/site"
import github, { cleanTitle, parse } from "./github"

const PR = "https://github.com/acme/storefront/pull/482"
const PR_TITLE = "Fix checkout race by octocat · Pull Request #482 · acme/storefront · GitHub"

let chrome: ReturnType<typeof mockChrome>
beforeEach(() => {
  chrome = mockChrome()
})

describe("github", () => {
  it("only runs on github.com", async () => {
    expect(await commandsFor(github, "https://gitlab.com/acme/storefront")).toEqual([])
    expect(await commandsFor(github, "https://example.com")).toEqual([])
  })

  it("parses repositories, pull requests and issues", () => {
    expect(parse(new URL(PR))).toEqual({ repo: "acme/storefront", pull: 482, issue: undefined })
    expect(parse(new URL("https://github.com/acme/storefront/issues/7")).issue).toBe(7)
    expect(parse(new URL("https://github.com/notifications"))).toEqual({})
  })

  it("lists pull request commands first on a pull request", async () => {
    const items = await commandsFor(github, PR, { title: PR_TITLE })
    expect(titles(items).slice(0, 3)).toEqual(["Files changed", "Commits", "Checks"])
    expect(items.every((i) => i.group === "GitHub")).toBe(true)
  })

  it("navigates the current tab, or a new one with ⌘↵", async () => {
    const items = await commandsFor(github, PR)
    await run(items, "pr-files")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: `${PR}/files` })
    await items.find((i) => i.id === "pr-files")!.actions![0].run(context(PR))
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: `${PR}/files` })
  })

  it("copies a pull request as a Markdown link with a clean title", async () => {
    const items = await commandsFor(github, PR, { title: PR_TITLE })
    const { copied } = await run(items, "pr-markdown")
    expect(copied).toEqual([`[Fix checkout race (#482)](${PR})`])
    expect(cleanTitle(PR_TITLE)).toBe("Fix checkout race")
  })

  it("offers searches scoped to the repository", async () => {
    const items = await searchFor(github, PR, "retry")
    expect(titles(items)).toEqual(["Search “retry” in acme/storefront", "Search GitHub for “retry”"])
    expect(items.every((i) => i.alwaysShow)).toBe(true)
    expect(await searchFor(github, PR, "  ")).toEqual([])
  })
})
