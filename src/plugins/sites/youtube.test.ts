import { beforeEach, describe, expect, it } from "vitest"
import { commandsFor, context, mockChrome, run, searchFor, titles } from "@/test/site"
import youtube, { cleanTitle, parse, shortLink, SPEEDS, startTime } from "./youtube"

const ID = "dQw4w9WgXcQ"
const WATCH = `https://www.youtube.com/watch?v=${ID}&pp=ygUJcmljayByb2xs&si=Ab12Cd34Ef56Gh78`
const TITLE = "(3) Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster) - YouTube"
const SHORT = "https://www.youtube.com/shorts/aqz-KE-bpKQ?feature=share"

let chrome: ReturnType<typeof mockChrome>
beforeEach(() => {
  chrome = mockChrome()
})

describe("youtube", () => {
  it("only runs on YouTube hosts", async () => {
    for (const url of [WATCH, `https://youtube.com/watch?v=${ID}`, `https://m.youtube.com/watch?v=${ID}`, `https://music.youtube.com/watch?v=${ID}`, `https://youtu.be/${ID}`]) {
      expect((await commandsFor(youtube, url)).length).toBeGreaterThan(0)
    }
    expect(await commandsFor(youtube, `https://evil-youtube.com/watch?v=${ID}`)).toEqual([])
    expect(await commandsFor(youtube, `https://www.youtube.com.evil.com/watch?v=${ID}`)).toEqual([])
    expect(await commandsFor(youtube, `https://youtu.be.example.com/${ID}`)).toEqual([])
    expect(await commandsFor(youtube, "https://vimeo.com/76979871")).toEqual([])
  })

  it("parses video IDs and playlists", () => {
    const id = (url: string) => parse(new URL(url)).video
    expect(id(WATCH)).toBe(ID)
    expect(id(SHORT)).toBe("aqz-KE-bpKQ")
    expect(id(`https://www.youtube.com/live/${ID}?si=xyz`)).toBe(ID)
    expect(id(`https://www.youtube.com/embed/${ID}?start=30`)).toBe(ID)
    expect(id(`https://youtu.be/${ID}?si=xyz`)).toBe(ID)
    expect(id("https://www.youtube.com/@RickAstleyYT")).toBeUndefined()
    expect(id("https://www.youtube.com/watch?v=nope")).toBeUndefined()
    expect(parse(new URL(SHORT)).short).toBe(true)
    expect(parse(new URL(`${WATCH}&list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI&index=2`)).playlist).toBe("PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI")
  })

  it("cleans tab titles", () => {
    expect(cleanTitle(TITLE)).toBe("Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)")
    expect(cleanTitle("(99+) Lofi hip hop radio - YouTube")).toBe("Lofi hip hop radio")
    expect(cleanTitle("Bohemian Rhapsody - YouTube Music")).toBe("Bohemian Rhapsody")
    expect(cleanTitle()).toBe("")
  })

  it("builds short links and reads start times", () => {
    expect(shortLink(ID)).toBe(`https://youtu.be/${ID}`)
    expect(shortLink(ID, 83.92)).toBe(`https://youtu.be/${ID}?t=83`)
    expect(shortLink(ID, 0.4)).toBe(`https://youtu.be/${ID}`)
    expect(startTime(new URL(`${WATCH}&t=90s`))).toBe(90)
    expect(startTime(new URL(`${WATCH}&t=1m30s`))).toBe(90)
    expect(startTime(new URL(`https://youtu.be/${ID}?t=42`))).toBe(42)
    expect(startTime(new URL(WATCH))).toBeUndefined()
  })

  it("lists video commands first on a video", async () => {
    const items = await commandsFor(youtube, WATCH, { title: TITLE })
    expect(titles(items)).toEqual([
      "Copy short link",
      "Copy link at current time",
      "Copy as Markdown link",
      "Copy video ID",
      "Playback speed…",
      "Loop video",
      "Open in YouTube Music",
      "Subscriptions",
      "Watch later",
      "Liked videos",
      "History",
    ])
    expect(items.every((i) => i.group === "YouTube")).toBe(true)
    expect(titles(await commandsFor(youtube, "https://www.youtube.com/feed/subscriptions"))).toEqual(["Subscriptions", "Watch later", "Liked videos", "History"])
  })

  it("copies a short link without tracking params, keeping the start time", async () => {
    let { copied } = await run(await commandsFor(youtube, WATCH), "copy-short-link")
    expect(copied).toEqual([`https://youtu.be/${ID}`])
    ;({ copied } = await run(await commandsFor(youtube, `https://youtu.be/${ID}?si=Ab12Cd34&t=42`), "copy-short-link"))
    expect(copied).toEqual([`https://youtu.be/${ID}?t=42`])
  })

  it("copies the video ID and a Markdown link with a clean title", async () => {
    const items = await commandsFor(youtube, WATCH, { title: TITLE })
    expect((await run(items, "copy-id")).copied).toEqual([ID])
    expect((await run(items, "copy-markdown")).copied).toEqual([
      `[Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)](https://www.youtube.com/watch?v=${ID})`,
    ])
  })

  it("copies a link at the video's current time", async () => {
    const items = await commandsFor(youtube, WATCH)
    chrome.scripting.executeScript.mockResolvedValueOnce([{ result: 125.7 }] as never)
    const { copied } = await run(items, "copy-link-at-time", context(WATCH))
    expect(chrome.scripting.executeScript).toHaveBeenCalledWith(expect.objectContaining({ target: { tabId: 1 } }))
    expect(copied).toEqual([`https://youtu.be/${ID}?t=125`])
  })

  it("copies nothing when there's no video on the page", async () => {
    const items = await commandsFor(youtube, WATCH)
    const { copied } = await run(items, "copy-link-at-time", context(WATCH))
    expect(copied).toEqual([])
  })

  it("sets the playback speed, marking the current one", async () => {
    const items = await commandsFor(youtube, WATCH)
    const speed = items.find((i) => i.id === "playback-speed")!
    chrome.scripting.executeScript.mockResolvedValueOnce([{ result: 1.5 }] as never)
    const speeds = await speed.children!.items(context(WATCH))
    expect(speeds).toHaveLength(SPEEDS.length)
    expect(titles(speeds).slice(0, 3)).toEqual(["0.5×", "0.75×", "1× (normal)"])
    expect(speeds.filter((s) => s.hint === "Current").map((s) => s.id)).toEqual(["speed-1.5"])

    await run(speeds, "speed-2", context(WATCH))
    expect(chrome.scripting.executeScript).toHaveBeenLastCalledWith(expect.objectContaining({ target: { tabId: 1 }, args: [2] }))
  })

  it("toggles looping in the page", async () => {
    await run(await commandsFor(youtube, WATCH), "loop", context(WATCH))
    expect(chrome.scripting.executeScript).toHaveBeenCalledWith(expect.objectContaining({ target: { tabId: 1 } }))
  })

  it("opens a Short as a regular video", async () => {
    const items = await commandsFor(youtube, SHORT)
    await run(items, "open-as-video")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ" })
    expect(titles(await commandsFor(youtube, WATCH))).not.toContain("Open as regular video")
  })

  it("opens the video in YouTube Music, except when already there", async () => {
    await run(await commandsFor(youtube, WATCH), "open-in-music")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: `https://music.youtube.com/watch?v=${ID}` })
    expect(titles(await commandsFor(youtube, `https://music.youtube.com/watch?v=${ID}`))).not.toContain("Open in YouTube Music")
  })

  it("opens the playlist on its own page", async () => {
    const list = "PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI"
    await run(await commandsFor(youtube, `${WATCH}&list=${list}&index=2`), "open-playlist")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: `https://www.youtube.com/playlist?list=${list}` })
    expect(titles(await commandsFor(youtube, WATCH))).not.toContain("Open playlist")
    expect(titles(await commandsFor(youtube, `https://www.youtube.com/playlist?list=${list}`))).not.toContain("Open playlist")
    expect(titles(await commandsFor(youtube, `${WATCH}&list=RD${ID}`))).not.toContain("Open playlist")
  })

  it("searches YouTube", async () => {
    const items = await searchFor(youtube, WATCH, "lofi beats")
    expect(titles(items)).toEqual(["Search YouTube for “lofi beats”"])
    expect(items.every((i) => i.alwaysShow)).toBe(true)
    await run(items, "search")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: "https://www.youtube.com/results?search_query=lofi%20beats" })
    expect(await searchFor(youtube, WATCH, "  ")).toEqual([])
  })
})
