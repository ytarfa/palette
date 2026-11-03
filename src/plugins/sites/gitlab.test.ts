import { beforeEach, describe, expect, it } from "vitest"
import { commandsFor, context, mockChrome, run, searchFor, titles } from "@/test/site"
import gitlab, { cleanTitle, isGitLab, parse } from "./gitlab"

const MR = "https://gitlab.com/acme/storefront/-/merge_requests/482"
const MR_TITLE = "Fix checkout race (!482) · Merge requests · Acme / Storefront · GitLab"
const SELF_HOSTED_MR = "https://git.company.com/platform/payments/api/-/merge_requests/4"
const ISSUE = "https://gitlab.com/acme/storefront/-/issues/7"
const ISSUE_TITLE = "Cart total is wrong after coupon (#7) · Issues · Acme / Storefront · GitLab"

let chrome: ReturnType<typeof mockChrome>
beforeEach(() => {
  chrome = mockChrome()
})

const find = (items: Awaited<ReturnType<typeof commandsFor>>, id: string) => items.find((i) => i.id === id)

describe("gitlab", () => {
  it("runs on gitlab.com and on self-hosted pages with the /-/ separator", () => {
    expect(isGitLab(new URL(MR))).toBe(true)
    expect(isGitLab(new URL("https://gitlab.com/dashboard/todos"))).toBe(true)
    expect(isGitLab(new URL(SELF_HOSTED_MR))).toBe(true)
    expect(isGitLab(new URL("https://git.company.com/platform/api/-/tree/main"))).toBe(true)
  })

  it("rejects other sites and lookalike hosts", async () => {
    expect(isGitLab(new URL("https://gitlab.com.evil.io/acme/storefront"))).toBe(false)
    expect(isGitLab(new URL("https://evilgitlab.com/acme/storefront"))).toBe(false)
    expect(isGitLab(new URL("https://git.company.com/platform/api"))).toBe(false)
    expect(isGitLab(new URL("https://registry.npmjs.org/react/-/react-18.2.0.tgz"))).toBe(false)
    expect(await commandsFor(gitlab, "https://github.com/acme/storefront")).toEqual([])
    expect(await commandsFor(gitlab, "https://example.com")).toEqual([])
  })

  it("parses projects with nested groups, merge requests and issues", () => {
    expect(parse(new URL(MR))).toEqual({ project: "acme/storefront", mergeRequest: 482, issue: undefined, ref: undefined })
    expect(parse(new URL(SELF_HOSTED_MR)).project).toBe("platform/payments/api")
    expect(parse(new URL(`${SELF_HOSTED_MR}/diffs`)).mergeRequest).toBe(4)
    expect(parse(new URL(ISSUE)).issue).toEqual({ kind: "issues", number: 7 })
    expect(parse(new URL("https://gitlab.com/acme/storefront/-/work_items/9")).issue).toEqual({ kind: "work_items", number: 9 })
    expect(parse(new URL("https://gitlab.com/acme/storefront/-/tree/develop")).ref).toBe("develop")
    expect(parse(new URL("https://gitlab.com/acme/storefront/-/tree/develop/src")).ref).toBeUndefined()
  })

  it("only takes a gitlab.com path without /-/ as a project when it has two segments", () => {
    expect(parse(new URL("https://gitlab.com/acme/storefront")).project).toBe("acme/storefront")
    expect(parse(new URL("https://gitlab.com/acme"))).toEqual({})
    expect(parse(new URL("https://gitlab.com/acme/web/storefront"))).toEqual({})
    expect(parse(new URL("https://gitlab.com/dashboard/merge_requests"))).toEqual({})
    expect(parse(new URL("https://gitlab.com/groups/acme/-/issues"))).toEqual({})
    expect(parse(new URL("https://git.company.com/-/ide/project/platform/api"))).toEqual({})
  })

  it("lists merge request commands first on a merge request", async () => {
    const items = await commandsFor(gitlab, MR, { title: MR_TITLE })
    expect(titles(items).slice(0, 5)).toEqual([
      "Changes", "Commits", "Pipelines", "Copy merge request as Markdown link", "Copy checkout command",
    ])
    expect(items.every((i) => i.group === "GitLab")).toBe(true)
  })

  it("navigates the current tab, or a new one with ⌘↵", async () => {
    const items = await commandsFor(gitlab, MR)
    await run(items, "mr-changes")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: `${MR}/diffs` })
    await find(items, "mr-pipelines")!.actions![0].run(context(MR))
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: `${MR}/pipelines` })
  })

  it("copies a merge request as a Markdown link with a clean title", async () => {
    const items = await commandsFor(gitlab, `${MR}/diffs`, { title: MR_TITLE })
    const { copied } = await run(items, "mr-markdown")
    expect(copied).toEqual([`[Fix checkout race (!482)](${MR})`])
    expect(cleanTitle(MR_TITLE)).toBe("Fix checkout race")
    expect(cleanTitle("Draft: Bump [deps] (!12) · Merge requests · Acme / Web · GitLab")).toBe("Draft: Bump [deps]")
  })

  it("falls back to the reference when the title isn't loaded", async () => {
    const items = await commandsFor(gitlab, MR, { title: "Merge requests · Acme / Storefront · GitLab" })
    const { copied } = await run(items, "mr-markdown")
    expect(copied).toEqual([`[acme/storefront!482](${MR})`])
  })

  it("copies glab checkout commands, with the full URL on self-hosted GitLab", async () => {
    const { copied } = await run(await commandsFor(gitlab, MR), "mr-checkout")
    expect(copied).toEqual(["glab mr checkout 482 --repo acme/storefront"])
    const selfHosted = await run(await commandsFor(gitlab, SELF_HOSTED_MR), "mr-checkout")
    expect(selfHosted.copied).toEqual(["glab mr checkout 4 --repo https://git.company.com/platform/payments/api"])
  })

  it("copies an issue as a Markdown link", async () => {
    const items = await commandsFor(gitlab, ISSUE, { title: ISSUE_TITLE })
    expect(titles(items)[0]).toBe("Copy issue as Markdown link")
    const { copied } = await run(items, "issue-markdown")
    expect(copied).toEqual([`[Cart total is wrong after coupon (#7)](${ISSUE})`])
  })

  it("keeps the self-hosted origin in project links and clone URLs", async () => {
    const items = await commandsFor(gitlab, SELF_HOSTED_MR)
    await run(items, "ci-settings")
    expect(chrome.tabs.update).toHaveBeenLastCalledWith(1, { url: "https://git.company.com/platform/payments/api/-/settings/ci_cd" })
    await run(items, "settings")
    expect(chrome.tabs.update).toHaveBeenLastCalledWith(1, { url: "https://git.company.com/platform/payments/api/edit" })
    await run(items, "my-merge-requests")
    expect(chrome.tabs.update).toHaveBeenLastCalledWith(1, { url: "https://git.company.com/dashboard/merge_requests" })
    expect(find(items, "clone-https")!.subtitle).toBe("https://git.company.com/platform/payments/api.git")
    expect(find(items, "clone-ssh")!.subtitle).toBe("git@git.company.com:platform/payments/api.git")
  })

  it("opens the Web IDE on the branch or merge request in the URL", async () => {
    const ide = async (url: string) => {
      await run(await commandsFor(gitlab, url), "web-ide")
      return chrome.tabs.update.mock.lastCall
    }
    expect(await ide("https://gitlab.com/acme/storefront/-/tree/develop")).toEqual([1, { url: "https://gitlab.com/-/ide/project/acme/storefront/edit/develop/-/" }])
    expect(await ide("https://gitlab.com/acme/storefront")).toEqual([1, { url: "https://gitlab.com/-/ide/project/acme/storefront" }])
    expect(await ide(MR)).toEqual([1, { url: "https://gitlab.com/-/ide/project/acme/storefront/merge_requests/482" }])
  })

  it("shows only site-wide commands outside a project", async () => {
    const items = await commandsFor(gitlab, "https://gitlab.com/dashboard/todos")
    expect(titles(items)).toEqual(["Your merge requests", "To-do list", "Projects", "New project"])
  })

  it("offers searches scoped to the project", async () => {
    const items = await searchFor(gitlab, SELF_HOSTED_MR, "retry policy")
    expect(titles(items)).toEqual([
      "Search “retry policy” in platform/payments/api issues",
      "Search “retry policy” in platform/payments/api merge requests",
      "Search GitLab for “retry policy”",
    ])
    expect(items.every((i) => i.alwaysShow)).toBe(true)
    await run(items, "search-all")
    expect(chrome.tabs.update).toHaveBeenLastCalledWith(1, { url: "https://git.company.com/search?search=retry%20policy" })
    await run(items, "search-mrs")
    expect(chrome.tabs.update).toHaveBeenLastCalledWith(1, { url: "https://git.company.com/platform/payments/api/-/merge_requests?search=retry%20policy" })
    expect(await searchFor(gitlab, MR, "  ")).toEqual([])
  })
})
