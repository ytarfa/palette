import { beforeEach, describe, expect, it } from "vitest"
import { commandsFor, context, mockChrome, run, searchFor, titles } from "@/test/site"
import jira, { branchName, parse, summaryFromTitle, textJql } from "./jira"

const SITE = "https://acme.atlassian.net"
const ISSUE = `${SITE}/browse/WEB-482`
const ISSUE_TITLE = "[WEB-482] Fix login redirect after SSO timeout - Jira"
const BACKLOG = `${SITE}/jira/software/c/projects/WEB/boards/12/backlog?selectedIssue=WEB-482`
const TEAM_BOARD = `${SITE}/jira/software/projects/MOB/boards/3`

let chrome: ReturnType<typeof mockChrome>
const lastUrl = () => (chrome.tabs.update.mock.lastCall as unknown as [number, { url: string }])[1].url

beforeEach(() => {
  chrome = mockChrome()
})

describe("jira", () => {
  it("only runs on Jira Cloud sites, not Confluence or lookalikes", async () => {
    expect(await commandsFor(jira, ISSUE)).not.toEqual([])
    expect(await commandsFor(jira, `${SITE}/jira/your-work`)).not.toEqual([])
    expect(await commandsFor(jira, `${SITE}/wiki/spaces/ENG/pages/123/Runbook`)).toEqual([])
    expect(await commandsFor(jira, `${SITE}/wiki`)).toEqual([])
    expect(await commandsFor(jira, "https://acme.atlassian.net.evil.com/browse/WEB-482")).toEqual([])
    expect(await commandsFor(jira, "https://evil-atlassian.net/browse/WEB-482")).toEqual([])
    expect(await commandsFor(jira, "https://www.atlassian.com/software/jira")).toEqual([])
  })

  it("parses issues, projects and boards", () => {
    expect(parse(new URL(ISSUE))).toEqual({ issue: "WEB-482", project: "WEB", board: undefined, software: undefined, onIssuePage: true })
    expect(parse(new URL(BACKLOG))).toEqual({
      issue: "WEB-482",
      project: "WEB",
      board: "12",
      software: "/jira/software/c/projects/WEB",
      onIssuePage: false,
    })
    expect(parse(new URL(TEAM_BOARD))).toMatchObject({ issue: undefined, project: "MOB", board: "3", software: "/jira/software/projects/MOB" })
    expect(parse(new URL(`${SITE}/jira/software/c/projects/WEB/issues/WEB-7?jql=project%20%3D%20WEB`)).issue).toBe("WEB-7")
    expect(parse(new URL(`${SITE}/jira/issues/OPS_2-15`)).issue).toBe("OPS_2-15")
    expect(parse(new URL(`${SITE}/browse/web`))).toMatchObject({ issue: undefined, project: "WEB" })
    expect(parse(new URL(`${SITE}/jira/your-work`))).toMatchObject({ issue: undefined, project: undefined })
  })

  it("reads the summary from the tab title", () => {
    expect(summaryFromTitle(ISSUE_TITLE, "WEB-482")).toBe("Fix login redirect after SSO timeout")
    expect(summaryFromTitle("[WEB-482] Retry - backoff - Jira", "WEB-482")).toBe("Retry - backoff")
    expect(summaryFromTitle("[WEB-9] Other issue - Jira", "WEB-482")).toBeUndefined()
    expect(summaryFromTitle("WEB board - Agile Board - Jira", "WEB-482")).toBeUndefined()
    expect(summaryFromTitle("")).toBeUndefined()
  })

  it("builds short, slugified branch names", () => {
    expect(branchName("WEB-482", "Fix login redirect after SSO timeout")).toBe("web-482-fix-login-redirect-after-sso-timeout")
    expect(branchName("WEB-482", "Crème brûlée: don't [crash] on émojis 🎉!")).toBe("web-482-creme-brulee-don-t-crash-on-emojis")
    expect(branchName("WEB-482")).toBe("web-482")
    const long = branchName("WEB-482", "Refactor the authentication middleware so that expired sessions are refreshed transparently")
    expect(long.length).toBeLessThanOrEqual(60)
    expect(long).toBe("web-482-refactor-the-authentication-middleware-so-that")
  })

  it("lists issue commands first on an issue", async () => {
    const items = await commandsFor(jira, ISSUE, { title: ISSUE_TITLE })
    expect(titles(items)).toEqual([
      "Copy issue key",
      "Copy key and summary",
      "Copy branch name",
      "Copy issue as Markdown link",
      "Project issues",
      "Project",
      "Your work",
      "All issues",
      "Filters",
      "Dashboards",
      "Projects",
    ])
    expect(items.every((i) => i.group === "Jira")).toBe(true)
  })

  it("copies the key, commit message, branch name and Markdown link", async () => {
    const items = await commandsFor(jira, ISSUE, { title: ISSUE_TITLE })
    expect((await run(items, "copy-key")).copied).toEqual(["WEB-482"])
    expect((await run(items, "copy-key-summary")).copied).toEqual(["WEB-482: Fix login redirect after SSO timeout"])
    expect((await run(items, "copy-branch")).copied).toEqual(["web-482-fix-login-redirect-after-sso-timeout"])
    expect((await run(items, "copy-markdown")).copied).toEqual([`[WEB-482: Fix login redirect after SSO timeout](${ISSUE})`])
  })

  it("falls back to the key when the title has no summary", async () => {
    const items = await commandsFor(jira, BACKLOG, { title: "WEB board - Agile Board - Jira" })
    expect(items.find((i) => i.id === "copy-key-summary")).toBeUndefined()
    expect((await run(items, "copy-branch")).copied).toEqual(["web-482"])
    expect((await run(items, "copy-markdown")).copied).toEqual([`[WEB-482](${ISSUE})`])
  })

  it("opens an issue shown on a board on its own page, and links the board and backlog", async () => {
    const items = await commandsFor(jira, BACKLOG, { title: ISSUE_TITLE })
    expect(titles(items).slice(4, 9)).toEqual(["Open issue page", "Board", "Backlog", "Project issues", "Project"])
    await run(items, "open-issue")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: ISSUE })
    await run(items, "board")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: `${SITE}/jira/software/c/projects/WEB/boards/12` })
    await run(items, "backlog")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: `${SITE}/jira/software/c/projects/WEB/boards/12/backlog` })
    await run(items, "project-issues")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: `${SITE}/jira/software/c/projects/WEB/issues` })
    await items.find((i) => i.id === "backlog")!.actions![0].run(context(BACKLOG))
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: `${SITE}/jira/software/c/projects/WEB/boards/12/backlog` })
  })

  it("links team-managed boards without the /c/ segment", async () => {
    const items = await commandsFor(jira, TEAM_BOARD)
    expect(items.some((i) => i.id.startsWith("copy-"))).toBe(false)
    await run(items, "backlog")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: `${SITE}/jira/software/projects/MOB/boards/3/backlog` })
  })

  it("lists project issues with JQL when the project type is unknown", async () => {
    const items = await commandsFor(jira, ISSUE, { title: ISSUE_TITLE })
    await run(items, "project-issues")
    const url = new URL(lastUrl())
    expect(url.pathname).toBe("/issues/")
    expect(url.searchParams.get("jql")).toBe('project = "WEB" ORDER BY created DESC')
  })

  it("only offers site-wide pages elsewhere", async () => {
    const items = await commandsFor(jira, `${SITE}/jira/your-work`)
    expect(titles(items)).toEqual(["Your work", "All issues", "Filters", "Dashboards", "Projects"])
    await run(items, "filters")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: `${SITE}/jira/filters` })
  })

  it("searches issue text with encoded JQL, scoped to the project", async () => {
    const items = await searchFor(jira, BACKLOG, 'say "hi" & 50%')
    expect(titles(items)).toEqual(["Search “say \"hi\" & 50%” in WEB", "Search Jira for “say \"hi\" & 50%”"])
    expect(items.every((i) => i.alwaysShow)).toBe(true)

    await run(items, "search-project")
    const href = lastUrl()
    expect(href).toBe(`${SITE}/issues/?jql=${encodeURIComponent('project = "WEB" AND text ~ "say \\"hi\\" & 50%"')}`)
    expect(new URL(href).searchParams.get("jql")).toBe('project = "WEB" AND text ~ "say \\"hi\\" & 50%"')

    expect(textJql("a\\b")).toBe('text ~ "a\\\\b"')
    expect(titles(await searchFor(jira, `${SITE}/jira/your-work`, "flaky test"))).toEqual(["Search Jira for “flaky test”"])
    expect(await searchFor(jira, ISSUE, "  ")).toEqual([])
  })
})
