import { beforeEach, describe, expect, it } from "vitest"
import { commandsFor, context, mockChrome, run, titles } from "@/test/site"
import copyContent, { formatQuote, htmlToMarkdown, markdownDocument, quoteUrl, textFragment } from "./copy-content"

let chrome: ReturnType<typeof mockChrome>
beforeEach(() => {
  chrome = mockChrome()
})

describe("textFragment", () => {
  it("matches short selections exactly, with whitespace collapsed", () => {
    expect(textFragment("Hello world")).toBe(":~:text=Hello%20world")
    expect(textFragment("  spread   out  ")).toBe(":~:text=spread%20out")
  })

  it("percent-encodes the directive's syntax characters and parentheses", () => {
    expect(textFragment("well-known, safe & sound (mostly)")).toBe(
      ":~:text=well%2Dknown%2C%20safe%20%26%20sound%20%28mostly%29",
    )
    expect(textFragment("café #1 50%")).toBe(":~:text=caf%C3%A9%20%231%2050%25")
  })

  it("uses the start,end form for long selections", () => {
    const text = "one two three four five six seven eight nine ten eleven twelve"
    expect(textFragment(text)).toBe(":~:text=one%20two%20three%20four,nine%20ten%20eleven%20twelve")
  })

  it("uses the start,end form across blocks, each term within one block", () => {
    expect(textFragment("Heading\nFirst paragraph here.\n\nSecond one")).toBe(":~:text=Heading,Second%20one")
    expect(textFragment("cell a\tcell b")).toBe(":~:text=cell%20a,cell%20b")
    expect(textFragment("Intro line\r\n" + "a b c d e f g h i j k l")).toBe(":~:text=Intro%20line,i%20j%20k%20l")
  })

  it("adds words to the end term until it doesn't match earlier in the selection", () => {
    const text = "the end of it all comes before the end of it and then the end of it"
    // "the end of it" first appears at the start: extend until it's unique to the end.
    expect(textFragment(text)).toBe(":~:text=the%20end%20of%20it,then%20the%20end%20of%20it")
  })

  it("returns undefined for a blank selection", () => {
    expect(textFragment("")).toBeUndefined()
    expect(textFragment(" \n\t ")).toBeUndefined()
  })
})

describe("quoteUrl", () => {
  it("removes tracking parameters and replaces the hash", () => {
    expect(quoteUrl("https://example.com/post?id=1&utm_source=x#comments", "Hello world")).toBe(
      "https://example.com/post?id=1#:~:text=Hello%20world",
    )
  })

  it("drops the hash even without a selection", () => {
    expect(quoteUrl("https://example.com/a#b", "  ")).toBe("https://example.com/a")
  })
})

describe("formatQuote", () => {
  it("quotes each line and links to the selection", () => {
    expect(formatQuote("To be,\nor not to be.", "Hamlet", "https://example.com/hamlet")).toBe(
      [
        "> To be,",
        "> or not to be.",
        ">",
        "> — [Hamlet](https://example.com/hamlet#:~:text=To%20be%2C,or%20not%20to%20be.)",
      ].join("\n"),
    )
  })

  it("keeps one blank line between paragraphs, and escapes the title", () => {
    expect(formatQuote("\n  First.  \r\n\r\n\n\nSecond.\n", "A [draft]", "https://example.com/")).toBe(
      [
        "> First.",
        ">",
        "> Second.",
        ">",
        "> — [A \\[draft\\]](https://example.com/#:~:text=First.,Second.)",
      ].join("\n"),
    )
  })
})

describe("htmlToMarkdown", () => {
  const base = "https://example.com/blog/post.html"

  it("converts headings, emphasis and lists", () => {
    expect(htmlToMarkdown("<h2>Title</h2><p>Some <strong>bold</strong> text.</p><ul><li>a</li><li>b</li></ul>", base))
      .toBe("## Title\n\nSome **bold** text.\n\n-   a\n-   b")
  })

  it("makes links and images absolute", () => {
    const html = `<p><a href="../about" title="About us">About</a> <a href="#top">Top</a> <a href="//cdn.example.org/x">CDN</a>
      <img src="img/a b.png" alt="A  [diagram]"> <a href="mailto:me@example.com">Mail</a></p>`
    expect(htmlToMarkdown(html, base)).toBe(
      '[About](https://example.com/about "About us") [Top](https://example.com/blog/post.html#top) ' +
        "[CDN](https://cdn.example.org/x) ![A \\[diagram\\]](https://example.com/blog/img/a%20b.png) " +
        "[Mail](mailto:me@example.com)",
    )
  })

  it("escapes parentheses in link destinations", () => {
    expect(htmlToMarkdown('<a href="/wiki/Foo_(bar)">Foo</a>', base)).toBe(
      "[Foo](https://example.com/wiki/Foo_\\(bar\\))",
    )
  })

  it("drops javascript: links, empty links and data: images", () => {
    const html = `<p><a href="javascript:void(0)">Click</a> <a href="/x"> </a><img src="data:image/png;base64,AAAA" alt="x">done</p>`
    expect(htmlToMarkdown(html, base)).toBe("Click done")
  })

  it("removes scripts, styles and icons", () => {
    const html =
      "<style>p{}</style><p>Text</p><script>alert(1)</script><noscript>Enable JS</noscript><svg><title>Icon</title></svg>"
    expect(htmlToMarkdown(html, base)).toBe("Text")
  })

  it("fences code blocks, with or without <code>", () => {
    expect(htmlToMarkdown('<pre><code class="language-ts">const a = 1\n</code></pre>', base)).toBe(
      "```ts\nconst a = 1\n```",
    )
    expect(
      htmlToMarkdown('<div class="highlight highlight-source-js"><pre><span>let</span> x = `y`\n</pre></div>', base),
    ).toBe("```js\nlet x = `y`\n```")
    expect(htmlToMarkdown("<pre>a ``` b</pre>", base)).toBe("````\na ``` b\n````")
  })
})

describe("markdownDocument", () => {
  it("adds a title and the source", () => {
    expect(markdownDocument("  A\n post ", "https://example.com/a", "\nBody.\n\n")).toBe(
      "# A post\n\nSource: <https://example.com/a>\n\nBody.\n",
    )
  })
})

describe("copy content", () => {
  it("only shows on http(s) pages", async () => {
    expect(await commandsFor(copyContent, "chrome://settings")).toEqual([])
    expect(await commandsFor(copyContent, "file:///Users/me/a.html")).toEqual([])
    const items = await commandsFor(copyContent, "https://example.com/")
    expect(titles(items)).toEqual(["Copy selection as quote", "Copy page as Markdown"])
    expect(items.every((i) => i.group === "Copy")).toBe(true)
  })

  it("copies the page's selection as a quote", async () => {
    const url = "https://example.com/post?utm_source=x#intro"
    chrome.scripting.executeScript.mockResolvedValueOnce([{ result: "Selected words" }] as never)
    const items = await commandsFor(copyContent, url)
    const { copied } = await run(items, "copy-quote", context(url, { title: "A post" }))
    expect(chrome.scripting.executeScript).toHaveBeenCalledWith(expect.objectContaining({ target: { tabId: 1 } }))
    expect(copied).toEqual([
      "> Selected words\n>\n> — [A post](https://example.com/post#:~:text=Selected%20words)",
    ])
  })

  it("falls back to the host name without a title", async () => {
    chrome.scripting.executeScript.mockResolvedValueOnce([{ result: "Hi" }] as never)
    const items = await commandsFor(copyContent, "https://example.com/")
    const { copied } = await run(items, "copy-quote", context("https://example.com/"))
    expect(copied).toEqual(["> Hi\n>\n> — [example.com](https://example.com/#:~:text=Hi)"])
  })

  it("copies nothing and stays open when nothing is selected", async () => {
    chrome.scripting.executeScript.mockResolvedValueOnce([{ result: "  " }] as never)
    const items = await commandsFor(copyContent, "https://example.com/")
    const ctx = context("https://example.com/")
    const quote = items.find((i) => i.id === "copy-quote")!
    expect(await quote.run!(ctx)).toEqual({ keepOpen: true })
    expect(ctx.copied).toEqual([])
  })
})
