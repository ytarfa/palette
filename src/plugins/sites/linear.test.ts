import { beforeEach, describe, expect, it } from "vitest"
import { commandsFor, context, mockChrome, run, searchFor, titles } from "@/test/site"
import linear, { branchName, cleanTitle, desktopUrl, parse, titleFromSlug } from "./linear"

const ISSUE = "https://linear.app/acme/issue/ENG-123/fix-checkout-race-on-retry"
const ISSUE_TITLE = "ENG-123 Fix checkout race on retry"
const TEAM = "https://linear.app/acme/team/ENG/active"
const PROJECT = "https://linear.app/acme/project/mobile-launch-272f50ef9250/overview"

let chrome: ReturnType<typeof mockChrome>
beforeEach(() => {
  chrome = mockChrome()
})

describe("linear", () => {
  it("only runs in a linear.app workspace", async () => {
    expect(await commandsFor(linear, "https://evil-linear.app/acme/issue/ENG-123")).toEqual([])
    expect(await commandsFor(linear, "https://linear.app.evil.com/acme/issue/ENG-123")).toEqual([])
    expect(await commandsFor(linear, "https://linear.app/docs/creating-issues")).toEqual([])
    expect(await commandsFor(linear, "https://linear.app/changelog/2022-05-26-combined-board-and-issue-view")).toEqual([])
    expect(await commandsFor(linear, "https://linear.app/acme/inbox")).not.toEqual([])
  })

  it("parses workspaces, teams, issues and projects", () => {
    expect(parse(new URL(ISSUE))).toEqual({
      workspace: "acme",
      team: "ENG",
      issue: "ENG-123",
      slug: "fix-checkout-race-on-retry",
      project: undefined,
    })
    expect(parse(new URL("https://linear.app/acme/issue/eng-7"))).toMatchObject({ issue: "ENG-7", team: "ENG", slug: undefined })
    expect(parse(new URL("https://linear.app/1m-hyperdev/team/1M/backlog"))).toMatchObject({ workspace: "1m-hyperdev", team: "1M", issue: undefined })
    expect(parse(new URL(PROJECT))).toMatchObject({ project: "mobile-launch-272f50ef9250", team: undefined })
    expect(parse(new URL("https://linear.app/pricing"))).toEqual({})
  })

  it("reads the issue title from the tab title, or the URL slug", () => {
    expect(cleanTitle(ISSUE_TITLE, "ENG-123")).toBe("Fix checkout race on retry")
    expect(cleanTitle("ENG-123 Fix checkout race › Linear", "ENG-123")).toBe("Fix checkout race")
    expect(cleanTitle("ENG-1234 Another issue", "ENG-123")).toBeUndefined()
    expect(cleanTitle("Active issues › Engineering › Linear", "ENG-123")).toBeUndefined()
    expect(titleFromSlug("fix-checkout-race-on-retry")).toBe("Fix checkout race on retry")
    expect(branchName("ENG-123", "fix-checkout-race-on-retry")).toBe("eng-123-fix-checkout-race-on-retry")
    expect(branchName("ENG-123")).toBe("eng-123")
  })

  it("lists issue commands first, then the team, then the workspace", async () => {
    const items = await commandsFor(linear, ISSUE, { title: ISSUE_TITLE })
    expect(titles(items)).toEqual([
      "Copy issue ID",
      "Copy issue ID and title",
      "Copy issue as Markdown link",
      "Copy git branch name",
      "Open in desktop app",
      "Active issues",
      "Backlog",
      "All issues",
      "Current cycle",
      "Cycles",
      "My issues",
      "Inbox",
      "Projects",
      "New issue",
    ])
    expect(items.every((i) => i.group === "Linear")).toBe(true)
  })

  it("copies the issue ID, title, Markdown link and branch name", async () => {
    const items = await commandsFor(linear, ISSUE, { title: ISSUE_TITLE })
    expect((await run(items, "copy-id")).copied).toEqual(["ENG-123"])
    expect((await run(items, "copy-title")).copied).toEqual(["ENG-123: Fix checkout race on retry"])
    expect((await run(items, "copy-markdown")).copied).toEqual([
      "[ENG-123: Fix checkout race on retry](https://linear.app/acme/issue/ENG-123)",
    ])
    expect((await run(items, "copy-branch")).copied).toEqual(["eng-123-fix-checkout-race-on-retry"])
  })

  it("falls back to the URL slug when the tab title is for another page", async () => {
    const items = await commandsFor(linear, ISSUE, { title: "Inbox › Linear" })
    expect((await run(items, "copy-title")).copied).toEqual(["ENG-123: Fix checkout race on retry"])
    const bare = await commandsFor(linear, "https://linear.app/acme/issue/ENG-123")
    expect((await run(bare, "copy-title")).copied).toEqual(["ENG-123"])
  })

  it("opens the issue in the desktop app", async () => {
    const items = await commandsFor(linear, ISSUE, { title: ISSUE_TITLE })
    await run(items, "desktop")
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "linear://linear.app/acme/issue/ENG-123" })
    expect(desktopUrl("https://linear.app/acme/inbox")).toBe("linear://linear.app/acme/inbox")
  })

  it("navigates to team and workspace pages", async () => {
    const items = await commandsFor(linear, TEAM)
    expect(titles(items)[0]).toBe("Active issues")
    await run(items, "team-backlog")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: "https://linear.app/acme/team/ENG/backlog" })
    await run(items, "team-cycle")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: "https://linear.app/acme/team/ENG/cycle/active" })
    await run(items, "new-issue")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: "https://linear.app/team/ENG/new" })
    await items.find((i) => i.id === "my-issues")!.actions![0].run(context(TEAM))
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "https://linear.app/acme/my-issues/assigned" })
  })

  it("only has workspace commands outside a team", async () => {
    const items = await commandsFor(linear, "https://linear.app/acme/inbox")
    expect(titles(items)).toEqual(["My issues", "Inbox", "Projects", "New issue"])
    await run(items, "new-issue")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: "https://linear.new" })
  })

  it("copies a project link", async () => {
    const items = await commandsFor(linear, PROJECT)
    expect((await run(items, "copy-project")).copied).toEqual(["https://linear.app/acme/project/mobile-launch-272f50ef9250"])
  })

  it("searches the workspace", async () => {
    const items = await searchFor(linear, ISSUE, "checkout retry")
    expect(titles(items)).toEqual(["Search Linear for “checkout retry”"])
    expect(items.every((i) => i.alwaysShow)).toBe(true)
    await run(items, "search")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: "https://linear.app/acme/search?q=checkout%20retry" })
    expect(await searchFor(linear, ISSUE, "  ")).toEqual([])
    expect(await searchFor(linear, "https://linear.app/pricing", "retry")).toEqual([])
  })
})
