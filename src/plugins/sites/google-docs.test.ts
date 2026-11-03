import { beforeEach, describe, expect, it } from "vitest"
import { commandsFor, context, mockChrome, run, titles } from "@/test/site"
import googleDocs, { cleanLink, cleanTitle, parse } from "./google-docs"

const DOC_ID = "1tpNvUDk_qYd00FYHnVXRN8Cg1YPnUIj-NJ0P0G-SWAY"
const SHEET_ID = "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
const SLIDES_ID = "1EAYk18WDjIG-zp_0vLm3CsfQh_i8eXc67Jo2O9C6Vuc"

const DOC = `https://docs.google.com/document/d/${DOC_ID}/edit?usp=sharing&tab=t.0`
const DOC_TITLE = "Q3 planning [draft] - Google Docs"
const SHEET = `https://docs.google.com/spreadsheets/u/1/d/${SHEET_ID}/edit?usp=drive_link#gid=1386834576&range=B4`
const SHEET_TITLE = "Class data - Google Sheets"
const SLIDES = `https://docs.google.com/presentation/d/${SLIDES_ID}/edit#slide=id.p`
const SLIDES_TITLE = "Launch review - Google Slides"

let chrome: ReturnType<typeof mockChrome>
beforeEach(() => {
  chrome = mockChrome()
})

describe("google docs", () => {
  it("only runs on documents, spreadsheets and presentations on docs.google.com", async () => {
    expect(await commandsFor(googleDocs, `https://docs.google.com.evil.com/document/d/${DOC_ID}/edit`)).toEqual([])
    expect(await commandsFor(googleDocs, `https://evil-docs.google.com/document/d/${DOC_ID}/edit`)).toEqual([])
    expect(await commandsFor(googleDocs, "https://docs.google.com/document/u/0/")).toEqual([])
    expect(await commandsFor(googleDocs, "https://docs.google.com/forms/d/1FAIpQLSf/viewform")).toEqual([])
    expect(await commandsFor(googleDocs, "https://docs.google.com/document/d/e/2PACX-1vR/pub")).toEqual([])
    expect(await commandsFor(googleDocs, DOC)).not.toEqual([])
    expect(await commandsFor(googleDocs, SHEET)).not.toEqual([])
    expect(await commandsFor(googleDocs, SLIDES)).not.toEqual([])
  })

  it("parses the editor, id, account and sheet", () => {
    expect(parse(new URL(DOC))).toEqual({ kind: "document", id: DOC_ID, account: undefined, gid: undefined })
    expect(parse(new URL(SHEET))).toEqual({ kind: "spreadsheets", id: SHEET_ID, account: "1", gid: "1386834576" })
    expect(parse(new URL(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/htmlview?gid=42`))?.gid).toBe("42")
    expect(parse(new URL(SLIDES))?.kind).toBe("presentation")
  })

  it("cleans titles and links", () => {
    expect(cleanTitle(DOC_TITLE)).toBe("Q3 planning [draft]")
    expect(cleanTitle(SHEET_TITLE)).toBe("Class data")
    expect(cleanTitle(SLIDES_TITLE)).toBe("Launch review")
    expect(cleanLink(parse(new URL(DOC))!)).toBe(`https://docs.google.com/document/d/${DOC_ID}/edit`)
    expect(cleanLink(parse(new URL(SHEET))!)).toBe(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=1386834576`)
  })

  it("lists downloads first, for the current editor", async () => {
    const doc = await commandsFor(googleDocs, DOC, { title: DOC_TITLE })
    expect(titles(doc).slice(0, 2)).toEqual(["Download as PDF", "Download as…"])
    expect(doc.every((i) => i.group === "Google Docs")).toBe(true)
    const sheet = await commandsFor(googleDocs, SHEET, { title: SHEET_TITLE })
    expect(titles(sheet).slice(0, 3)).toEqual(["Download as Microsoft Excel", "Download as CSV", "Download as…"])
    const slides = await commandsFor(googleDocs, SLIDES, { title: SLIDES_TITLE })
    expect(titles(slides)).toContain("New presentation")
  })

  it("downloads a document as PDF in the current tab", async () => {
    await run(await commandsFor(googleDocs, DOC), "download-pdf")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, {
      url: `https://docs.google.com/document/d/${DOC_ID}/export?format=pdf`,
    })
  })

  it("lists every format for the editor under Download as…", async () => {
    const items = await commandsFor(googleDocs, DOC)
    const formats = await items.find((i) => i.id === "download")!.children!.items(context(DOC))
    expect(titles(formats)).toEqual([
      "PDF", "Microsoft Word", "Markdown", "Plain text", "OpenDocument", "Rich text", "EPUB", "Web page",
    ])
    await run(formats, "download-md")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, {
      url: `https://docs.google.com/document/d/${DOC_ID}/export?format=md`,
    })

    const slides = await commandsFor(googleDocs, SLIDES)
    const slideFormats = await slides.find((i) => i.id === "download")!.children!.items(context(SLIDES))
    await run(slideFormats, "download-pptx")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, {
      url: `https://docs.google.com/presentation/d/${SLIDES_ID}/export?format=pptx`,
    })
  })

  it("exports the current sheet as CSV, keeping the account", async () => {
    const items = await commandsFor(googleDocs, SHEET)
    expect(items.find((i) => i.id === "download-csv")!.subtitle).toBe(".csv, current sheet")
    await run(items, "download-csv")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, {
      url: `https://docs.google.com/spreadsheets/u/1/d/${SHEET_ID}/export?format=csv&gid=1386834576`,
    })
    await run(items, "download-xlsx")
    expect(chrome.tabs.update).toHaveBeenLastCalledWith(1, {
      url: `https://docs.google.com/spreadsheets/u/1/d/${SHEET_ID}/export?format=xlsx`,
    })
  })

  it("copies a clean link and a Markdown link", async () => {
    const doc = await commandsFor(googleDocs, DOC, { title: DOC_TITLE })
    const link = `https://docs.google.com/document/d/${DOC_ID}/edit`
    expect((await run(doc, "copy-link")).copied).toEqual([link])
    expect((await run(doc, "copy-markdown")).copied).toEqual([`[Q3 planning \\[draft\\]](${link})`])

    const sheet = await commandsFor(googleDocs, SHEET, { title: SHEET_TITLE })
    expect((await run(sheet, "copy-markdown")).copied).toEqual([
      `[Class data](https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=1386834576)`,
    ])
  })

  it("makes a copy and opens the preview", async () => {
    const items = await commandsFor(googleDocs, SHEET, { title: SHEET_TITLE })
    await run(items, "make-copy")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: `https://docs.google.com/spreadsheets/u/1/d/${SHEET_ID}/copy` })
    await items.find((i) => i.id === "preview")!.actions![0].run(context(SHEET))
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: `https://docs.google.com/spreadsheets/u/1/d/${SHEET_ID}/preview` })
  })
})
