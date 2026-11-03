import { beforeEach, describe, expect, it } from "vitest"
import { commandsFor, context, mockChrome, run, searchFor, titles } from "@/test/site"
import confluence, { cleanTitle, parse, slugTitle } from "./confluence"

const SITE = "https://acme.atlassian.net"
const PAGE = `${SITE}/wiki/spaces/ENG/pages/2147352577/Release+checklist`
const PAGE_TITLE = "Release checklist - Platform Engineering - Confluence"
const EDIT = `${SITE}/wiki/spaces/ENG/pages/edit-v2/2147352577`
const OVERVIEW = `${SITE}/wiki/spaces/ENG/overview?homepageId=2147287041`

let chrome: ReturnType<typeof mockChrome>
beforeEach(() => {
  chrome = mockChrome()
})

describe("confluence", () => {
  it("only runs on Confluence Cloud, not Jira or lookalike hosts", async () => {
    expect(await commandsFor(confluence, `${SITE}/wiki/home`)).not.toEqual([])
    expect(await commandsFor(confluence, `${SITE}/wiki`)).not.toEqual([])
    expect(await commandsFor(confluence, `${SITE}/jira/software/projects/ENG/boards/1`)).toEqual([])
    expect(await commandsFor(confluence, `${SITE}/browse/ENG-42`)).toEqual([])
    expect(await commandsFor(confluence, `${SITE}/wikipedia`)).toEqual([])
    expect(await commandsFor(confluence, "https://evil-atlassian.net.com/wiki/home")).toEqual([])
    expect(await commandsFor(confluence, "https://acme.notatlassian.net/wiki/home")).toEqual([])
  })

  it("parses spaces, pages, the editor and page history", () => {
    expect(parse(new URL(PAGE))).toEqual({ space: "ENG", page: "2147352577", slug: "Release+checklist", view: "page" })
    expect(parse(new URL(EDIT))).toEqual({ space: "ENG", page: "2147352577", view: "edit" })
    expect(parse(new URL(`${SITE}/wiki/spaces/ENG/history/2147352577/Release+checklist`)).view).toBe("history")
    expect(parse(new URL(OVERVIEW))).toEqual({ space: "ENG" })
    expect(parse(new URL(`${SITE}/wiki/spaces/~5570581cd4ef/overview`))).toEqual({ space: "~5570581cd4ef" })
    expect(parse(new URL(`${SITE}/wiki/home`))).toEqual({})
  })

  it("cleans page titles", () => {
    expect(cleanTitle(PAGE_TITLE)).toBe("Release checklist")
    expect(cleanTitle("Q3 - Q4 roadmap - Product - Confluence")).toBe("Q3 - Q4 roadmap")
    expect(cleanTitle("Confluence")).toBeUndefined()
    expect(slugTitle("Q3+roadmap+%26+goals")).toBe("Q3 roadmap & goals")
  })

  it("lists page commands first, then space, then site-wide", async () => {
    const items = await commandsFor(confluence, PAGE, { title: PAGE_TITLE })
    expect(titles(items)).toEqual([
      "Edit page",
      "Page history",
      "Copy page as Markdown link",
      "Copy page link",
      "Copy page ID",
      "Create child page",
      "Space overview",
      "Create page",
      "Home",
      "Recently visited",
      "Drafts",
    ])
    expect(items.every((i) => i.group === "Confluence")).toBe(true)
  })

  it("edits the page and opens its history", async () => {
    const items = await commandsFor(confluence, PAGE, { title: PAGE_TITLE })
    await run(items, "edit")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: EDIT })
    await run(items, "history")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: `${SITE}/wiki/spaces/ENG/history/2147352577` })
    await items.find((i) => i.id === "edit")!.actions![0].run(context(PAGE))
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: EDIT })
  })

  it("offers to view the page from the editor", async () => {
    const items = await commandsFor(confluence, EDIT, { title: PAGE_TITLE })
    expect(titles(items).slice(0, 2)).toEqual(["View page", "Page history"])
    await run(items, "view")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: `${SITE}/wiki/spaces/ENG/pages/2147352577` })
  })

  it("copies the page as a Markdown link, a clean link and its ID", async () => {
    const items = await commandsFor(confluence, `${PAGE}?focusedCommentId=99#comments`, { title: PAGE_TITLE })
    expect((await run(items, "page-markdown")).copied).toEqual([`[Release checklist](${PAGE})`])
    expect((await run(items, "page-link")).copied).toEqual([`${SITE}/wiki/spaces/ENG/pages/2147352577`])
    expect((await run(items, "page-id")).copied).toEqual(["2147352577"])
  })

  it("falls back to the URL slug for the page title", async () => {
    const items = await commandsFor(confluence, PAGE, { title: "" })
    expect((await run(items, "page-markdown")).copied).toEqual([`[Release checklist](${PAGE})`])
  })

  it("creates pages in the current space", async () => {
    const items = await commandsFor(confluence, OVERVIEW)
    expect(titles(items)).toEqual(["Space overview", "Create page", "Home", "Recently visited", "Drafts"])
    await run(items, "new-page")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: `${SITE}/wiki/create-content/page?spaceKey=ENG` })
    const pageItems = await commandsFor(confluence, PAGE, { title: PAGE_TITLE })
    await run(pageItems, "new-child")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, {
      url: `${SITE}/wiki/create-content/page?spaceKey=ENG&parentPageId=2147352577`,
    })
  })

  it("only lists site-wide pages outside a space", async () => {
    const items = await commandsFor(confluence, `${SITE}/wiki/home`)
    expect(titles(items)).toEqual(["Home", "Recently visited", "Drafts"])
    await run(items, "recent")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: `${SITE}/wiki/recent/visited` })
  })

  it("offers searches scoped to the space", async () => {
    const items = await searchFor(confluence, PAGE, "on-call rota")
    expect(titles(items)).toEqual(["Search “on-call rota” in ENG", "Search Confluence for “on-call rota”"])
    expect(items.every((i) => i.alwaysShow)).toBe(true)
    await run(items, "search-space")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: `${SITE}/wiki/search?text=on-call%20rota&spaces=ENG` })
    await run(items, "search-all")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: `${SITE}/wiki/search?text=on-call%20rota` })
    expect(titles(await searchFor(confluence, `${SITE}/wiki/home`, "rota"))).toEqual(["Search Confluence for “rota”"])
    expect(await searchFor(confluence, PAGE, "  ")).toEqual([])
  })
})
