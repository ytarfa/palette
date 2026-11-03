import { beforeEach, describe, expect, it } from "vitest"
import { commandsFor, mockChrome, run, searchFor, titles } from "@/test/site"
import x, { parse } from "./x"

const POST = "https://x.com/NASA/status/1851383247212675342?s=46&t=kL3mQ9xYzA1b2C3d4E5f6g"
const CLEAN = "https://x.com/NASA/status/1851383247212675342"
const PROFILE = "https://x.com/NASA"

let chrome: ReturnType<typeof mockChrome>
const lastUrl = () => (chrome.tabs.update.mock.lastCall as unknown as [number, { url: string }])[1].url

beforeEach(() => {
  chrome = mockChrome()
})

describe("x", () => {
  it("runs on x.com and twitter.com, not lookalikes", async () => {
    for (const host of ["x.com", "www.x.com", "mobile.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"]) {
      expect(await commandsFor(x, `https://${host}/NASA`)).not.toEqual([])
    }
    expect(await commandsFor(x, "https://x.com.evil.com/NASA")).toEqual([])
    expect(await commandsFor(x, "https://evil-x.com/NASA")).toEqual([])
    expect(await commandsFor(x, "https://fixupx.com/NASA/status/1851383247212675342")).toEqual([])
    expect(await commandsFor(x, "https://api.twitter.com/NASA")).toEqual([])
  })

  it("parses users and posts", () => {
    expect(parse(new URL(POST))).toEqual({ user: "NASA", post: "1851383247212675342" })
    expect(parse(new URL(`${CLEAN}/photo/1`))).toEqual({ user: "NASA", post: "1851383247212675342" })
    expect(parse(new URL("https://twitter.com/NASA/with_replies"))).toEqual({ user: "NASA", post: undefined })
    expect(parse(new URL("https://x.com/i/web/status/1851383247212675342"))).toEqual({ user: undefined, post: "1851383247212675342" })
    for (const path of ["home", "explore", "notifications", "messages", "settings/account", "search?q=nasa", "compose/post", "i/bookmarks"]) {
      expect(parse(new URL(`https://x.com/${path}`)).user).toBeUndefined()
    }
  })

  it("lists post commands first on a post", async () => {
    const items = await commandsFor(x, POST)
    expect(titles(items).slice(0, 4)).toEqual(["Copy post link", "Copy post ID", "Copy link for chat apps", "Author's profile"])
    expect(items.every((i) => i.group === "X")).toBe(true)
  })

  it("copies a clean link, the post ID and an embeddable link", async () => {
    const items = await commandsFor(x, POST.replace("x.com", "mobile.twitter.com"))
    expect((await run(items, "post-link")).copied).toEqual([CLEAN])
    expect((await run(items, "post-id")).copied).toEqual(["1851383247212675342"])
    expect((await run(items, "post-embed-link")).copied).toEqual(["https://fixupx.com/NASA/status/1851383247212675342"])
    await run(items, "author")
    expect(lastUrl()).toBe(PROFILE)
  })

  it("copies a link to a post without a username", async () => {
    const items = await commandsFor(x, "https://x.com/i/web/status/1851383247212675342")
    expect((await run(items, "post-link")).copied).toEqual(["https://x.com/i/status/1851383247212675342"])
    expect(titles(items)).not.toContain("Author's profile")
  })

  it("offers the handle and profile tabs on a profile", async () => {
    const items = await commandsFor(x, "https://twitter.com/NASA/media")
    expect(titles(items).slice(0, 5)).toEqual(["Copy handle", "Posts", "Replies", "Media", "Likes"])
    expect((await run(items, "handle")).copied).toEqual(["@NASA"])
    await run(items, "replies")
    expect(lastUrl()).toBe("https://x.com/NASA/with_replies")
  })

  it("only shows site-wide pages elsewhere", async () => {
    expect(titles(await commandsFor(x, "https://x.com/home"))).toEqual(["Home", "Notifications", "Bookmarks", "Explore"])
  })

  it("searches latest posts, and the user's posts on a profile", async () => {
    const items = await searchFor(x, PROFILE, "artemis #moon")
    expect(titles(items)).toEqual(["Search @NASA's posts for “artemis #moon”", "Search X for “artemis #moon”"])
    expect(items.every((i) => i.alwaysShow)).toBe(true)
    await run(items, "search-user")
    expect(lastUrl()).toBe("https://x.com/search?q=from%3ANASA%20artemis%20%23moon&src=typed_query&f=live")
    await run(items, "search-all")
    expect(lastUrl()).toBe("https://x.com/search?q=artemis%20%23moon&src=typed_query&f=live")
    expect(titles(await searchFor(x, "https://x.com/home", "artemis"))).toEqual(["Search X for “artemis”"])
    expect(await searchFor(x, PROFILE, "  ")).toEqual([])
  })
})
