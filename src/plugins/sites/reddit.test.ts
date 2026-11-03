import { beforeEach, describe, expect, it } from "vitest"
import { commandsFor, mockChrome, run, searchFor, titles } from "@/test/site"
import reddit, { cleanTitle, parse } from "./reddit"

const POST =
  "https://www.reddit.com/r/programming/comments/1xjiofl/how_curl_was_accidentally_turingcomplete_for_nine/?utm_source=share&utm_medium=web3x&share_id=abc123&context=3"
const CLEAN = "https://www.reddit.com/r/programming/comments/1xjiofl/"
const NEW_TITLE = "How curl was accidentally Turing-complete for nine months : r/programming"
const OLD_TITLE = "How curl was accidentally Turing-complete for nine months : programming"
const SUB = "https://www.reddit.com/r/programming/"

let chrome: ReturnType<typeof mockChrome>
const lastUrl = () => (chrome.tabs.update.mock.lastCall as unknown as [number, { url: string }])[1].url

beforeEach(() => {
  chrome = mockChrome()
})

describe("reddit", () => {
  it("runs on Reddit's hosts, not lookalikes", async () => {
    for (const host of ["www.reddit.com", "reddit.com", "old.reddit.com", "new.reddit.com", "sh.reddit.com"]) {
      expect(await commandsFor(reddit, `https://${host}/r/programming/`)).not.toEqual([])
    }
    expect(await commandsFor(reddit, "https://reddit.com.evil.com/r/programming/")).toEqual([])
    expect(await commandsFor(reddit, "https://evil-reddit.com/r/programming/")).toEqual([])
    expect(await commandsFor(reddit, "https://notreddit.com/r/programming/")).toEqual([])
    expect(await commandsFor(reddit, "https://redd.it/1xjiofl")).toEqual([])
  })

  it("parses subreddits and posts", () => {
    expect(parse(new URL(POST))).toEqual({ sub: "programming", post: "1xjiofl" })
    expect(parse(new URL("https://old.reddit.com/r/AskReddit/top/?t=week"))).toEqual({ sub: "AskReddit", post: undefined })
    expect(parse(new URL("https://www.reddit.com/comments/1xjiofl"))).toEqual({ sub: undefined, post: "1xjiofl" })
    expect(parse(new URL("https://www.reddit.com/user/spez/"))).toEqual({ sub: undefined, post: undefined })
  })

  it("cleans old and new Reddit tab titles", () => {
    const title = "How curl was accidentally Turing-complete for nine months"
    expect(cleanTitle(NEW_TITLE, "programming")).toBe(title)
    expect(cleanTitle(OLD_TITLE, "programming")).toBe(title)
    expect(cleanTitle(`r/programming on Reddit: ${title}`, "programming")).toBe(title)
    expect(cleanTitle(`From the programming community on Reddit: ${title}`, "programming")).toBe(title)
    expect(cleanTitle("Ask HN: what's next? : r/programming")).toBe("Ask HN: what's next?")
    expect(cleanTitle("Rust 2.0 : thoughts : programming", "programming")).toBe("Rust 2.0 : thoughts")
  })

  it("lists post commands first on a post", async () => {
    const items = await commandsFor(reddit, POST, { title: NEW_TITLE })
    expect(titles(items).slice(0, 4)).toEqual(["Copy post link", "Copy short link", "Copy post as Markdown link", "Open in old Reddit"])
    expect(items.every((i) => i.group === "Reddit")).toBe(true)
  })

  it("copies clean, short and Markdown links", async () => {
    const items = await commandsFor(reddit, POST, { title: NEW_TITLE })
    expect((await run(items, "post-link")).copied).toEqual([CLEAN])
    expect((await run(items, "post-short-link")).copied).toEqual(["https://redd.it/1xjiofl"])
    expect((await run(items, "post-markdown")).copied).toEqual([`[How curl was accidentally Turing-complete for nine months](${CLEAN})`])

    const old = await commandsFor(reddit, POST.replace("www.", "old."), { title: OLD_TITLE })
    expect((await run(old, "post-markdown")).copied).toEqual([`[How curl was accidentally Turing-complete for nine months](${CLEAN})`])
  })

  it("switches between old and new Reddit on the same page", async () => {
    await run(await commandsFor(reddit, `${SUB}top/?t=week`), "old-reddit")
    expect(lastUrl()).toBe("https://old.reddit.com/r/programming/top/?t=week")
    const old = await commandsFor(reddit, "https://old.reddit.com/r/programming/")
    expect(titles(old)).not.toContain("Open in old Reddit")
    await run(old, "new-reddit")
    expect(lastUrl()).toBe(SUB)
  })

  it("sorts the subreddit, staying on old Reddit", async () => {
    const items = await commandsFor(reddit, SUB)
    expect(titles(items)).toEqual(["Open in old Reddit", "Hot", "New", "Top of the week", "Top of all time", "Home", "Popular"])
    await run(items, "top-week")
    expect(lastUrl()).toBe("https://www.reddit.com/r/programming/top/?t=week")
    await run(items, "top-all")
    expect(lastUrl()).toBe("https://www.reddit.com/r/programming/top/?t=all")
    await run(await commandsFor(reddit, "https://old.reddit.com/r/programming/"), "new")
    expect(lastUrl()).toBe("https://old.reddit.com/r/programming/new/")
  })

  it("leaves out subreddit commands elsewhere", async () => {
    expect(titles(await commandsFor(reddit, "https://www.reddit.com/"))).toEqual(["Open in old Reddit", "Home", "Popular"])
  })

  it("searches the subreddit and all of Reddit", async () => {
    const items = await searchFor(reddit, POST, "http/3 support")
    expect(titles(items)).toEqual(["Search r/programming for “http/3 support”", "Search Reddit for “http/3 support”"])
    expect(items.every((i) => i.alwaysShow)).toBe(true)
    await run(items, "search-sub")
    expect(lastUrl()).toBe("https://www.reddit.com/r/programming/search/?q=http%2F3%20support&restrict_sr=1")
    await run(items, "search-all")
    expect(lastUrl()).toBe("https://www.reddit.com/search/?q=http%2F3%20support")
    expect(titles(await searchFor(reddit, "https://www.reddit.com/r/popular/", "cats"))).toEqual(["Search Reddit for “cats”"])
    expect(await searchFor(reddit, SUB, "  ")).toEqual([])
  })
})
