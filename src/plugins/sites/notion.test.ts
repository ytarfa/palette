import { beforeEach, describe, expect, it } from "vitest"
import { commandsFor, context, mockChrome, run, titles } from "@/test/site"
import notion, { cleanLink, cleanTitle, parse, toUuid } from "./notion"

const ID = "1a2b3c4d5e6f40718293a4b5c6d7e8f9"
const DB = "9f8e7d6c5b4a40398271605f4e3d2c1b"
const VIEW = "0c1d2e3f4a5b46c7d8e9f0a1b2c3d4e5"
const PEEK = "7e6f5a4b3c2d41e0f9a8b7c6d5e4f3a2"
const PAGE = `https://www.notion.so/acme/Q3-Roadmap-${ID}`
const PAGE_TITLE = "Q3 Roadmap | Notion"
const PEEKED = `https://www.notion.so/acme/${DB}?v=${VIEW}&p=${PEEK}&pm=s`

let chrome: ReturnType<typeof mockChrome>
beforeEach(() => {
  chrome = mockChrome()
})

describe("notion", () => {
  it("only runs on notion.so and published notion.site pages", async () => {
    expect(await commandsFor(notion, PAGE)).not.toEqual([])
    expect(await commandsFor(notion, `https://notion.so/${ID}`)).not.toEqual([])
    expect(await commandsFor(notion, `https://acme.notion.site/Handbook-${ID}`)).not.toEqual([])
    expect(await commandsFor(notion, `https://www.notion.so.evil.com/acme/Q3-Roadmap-${ID}`)).toEqual([])
    expect(await commandsFor(notion, `https://evil-notion.so/${ID}`)).toEqual([])
    expect(await commandsFor(notion, `https://notion.site.evil.com/${ID}`)).toEqual([])
    expect(await commandsFor(notion, `https://evilnotion.site/${ID}`)).toEqual([])
  })

  it("has nothing to offer off a page", async () => {
    expect(await commandsFor(notion, "https://www.notion.so/pricing")).toEqual([])
    expect(await commandsFor(notion, "https://www.notion.so/acme")).toEqual([])
  })

  it("parses page IDs, database views and peeked pages", () => {
    expect(parse(new URL(PAGE))).toEqual({ page: ID, view: undefined, peek: undefined })
    expect(parse(new URL(`https://www.notion.so/${ID}`)).page).toBe(ID)
    expect(parse(new URL(PEEKED))).toEqual({ page: DB, view: VIEW, peek: PEEK })
    expect(parse(new URL(`${PAGE}?p=${toUuid(PEEK)}`)).peek).toBe(PEEK)
    expect(parse(new URL("https://www.notion.so/acme/Q3-Roadmap"))).toEqual({})
  })

  it("builds clean links", () => {
    expect(cleanLink(new URL(`${PAGE}?pvs=4&source=copy_link`))).toBe(PAGE)
    expect(cleanLink(new URL(`https://notion.so/acme/Q3-Roadmap-${ID}?pvs=25`))).toBe(PAGE)
    expect(cleanLink(new URL(`https://www.notion.so/acme/${DB}?v=${VIEW}&pvs=4`))).toBe(`https://www.notion.so/acme/${DB}?v=${VIEW}`)
    expect(cleanLink(new URL(PEEKED))).toBe(`https://www.notion.so/${PEEK}`)
    expect(cleanLink(new URL(`${PAGE}?pvs=4#${DB}`))).toBe(`${PAGE}#${DB}`)
    expect(cleanLink(new URL(`https://acme.notion.site/Handbook-${ID}?pvs=4`))).toBe(`https://acme.notion.site/Handbook-${ID}`)
  })

  it("cleans tab titles", () => {
    expect(cleanTitle(PAGE_TITLE)).toBe("Q3 Roadmap")
    expect(cleanTitle("(3) Q3 Roadmap")).toBe("Q3 Roadmap")
    expect(cleanTitle("Design - Notion vs Linear")).toBe("Design - Notion vs Linear")
  })

  it("lists page commands", async () => {
    const items = await commandsFor(notion, `${PAGE}?pvs=4`, { title: PAGE_TITLE })
    expect(titles(items)).toEqual([
      "Copy clean link",
      "Copy as Markdown link",
      "Copy page ID",
      "Copy page ID as UUID",
      "Open in desktop app",
    ])
    expect(items.every((i) => i.group === "Notion")).toBe(true)
  })

  it("copies the clean link, Markdown link and page IDs", async () => {
    const items = await commandsFor(notion, `${PAGE}?pvs=4&pm=c`, { title: PAGE_TITLE })
    expect((await run(items, "copy-link")).copied).toEqual([PAGE])
    expect((await run(items, "copy-markdown")).copied).toEqual([`[Q3 Roadmap](${PAGE})`])
    expect((await run(items, "copy-id")).copied).toEqual([ID])
    expect((await run(items, "copy-uuid")).copied).toEqual(["1a2b3c4d-5e6f-4071-8293-a4b5c6d7e8f9"])
  })

  it("opens the page in the desktop app", async () => {
    const items = await commandsFor(notion, `${PAGE}?pvs=4`)
    await run(items, "open-app", context(PAGE))
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: `notion://www.notion.so/acme/Q3-Roadmap-${ID}` })
  })

  it("acts on the peeked page and opens it as a full page", async () => {
    const items = await commandsFor(notion, PEEKED, { title: "Tasks | Notion" })
    expect(titles(items)).toEqual(["Open as full page", "Copy clean link", "Copy page ID", "Copy page ID as UUID", "Open in desktop app"])
    await run(items, "full-page", context(PEEKED))
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: `https://www.notion.so/${PEEK}` })
    expect((await run(items, "copy-id")).copied).toEqual([PEEK])
    await run(items, "open-app", context(PEEKED))
    expect(chrome.tabs.update).toHaveBeenLastCalledWith(1, { url: `notion://www.notion.so/${PEEK}` })
  })

  it("skips the desktop app on published pages", async () => {
    const items = await commandsFor(notion, `https://acme.notion.site/Handbook-${ID}`, { title: "Handbook" })
    expect(titles(items)).not.toContain("Open in desktop app")
    expect((await run(items, "copy-markdown")).copied).toEqual([`[Handbook](https://acme.notion.site/Handbook-${ID})`])
  })
})
