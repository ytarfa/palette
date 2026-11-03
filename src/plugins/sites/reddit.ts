import { ArrowUpDown, Clock, Copy, Flame, Home, Link, Search, TrendingUp, Trophy } from "lucide-react"
import type { Command } from "@/core/types"
import { copy, defineSite, markdownLink, navigate } from "../site-kit"

const HOSTS = new Set(["reddit.com", "www.reddit.com", "old.reddit.com", "new.reddit.com", "sh.reddit.com"])
const SUB = /^[A-Za-z0-9_]+$/
const ID = /^[a-z0-9]+$/i
// Feeds under /r/ that aren't communities you can search within.
const FEEDS = new Set(["all", "popular", "friends", "mod"])

/** Subreddit and post from a Reddit URL: /r/<sub>/comments/<id>/<slug>/, /comments/<id>, /r/<sub>/top… */
export function parse(url: URL) {
  const parts = url.pathname.split("/").filter(Boolean)
  const sub = parts[0]?.toLowerCase() === "r" && SUB.test(parts[1] ?? "") ? parts[1] : undefined
  const rest = sub ? parts.slice(2) : parts
  const post = rest[0] === "comments" && ID.test(rest[1] ?? "") ? rest[1].toLowerCase() : undefined
  return { sub, post }
}

const reddit = (path: string) => `https://www.reddit.com${path}`

/** The canonical link to a post, without tracking or comment context. */
export const cleanLink = (post: string, sub?: string) => reddit(`${sub ? `/r/${sub}` : ""}/comments/${post}/`)

/**
 * The post title from the tab title:
 * "Title : r/sub" (new Reddit), "Title : sub" (old Reddit), "r/sub on Reddit: Title" (older redesign).
 */
export function cleanTitle(title = "", sub?: string) {
  // `sub` comes from parse(), so it's only letters, digits and underscores.
  const name = sub ?? "\\w+"
  return title
    .trim()
    .replace(/\s+[-–|]\s+Reddit$/i, "")
    .replace(new RegExp(`^(?:r/${name} on Reddit|From the ${name} community on Reddit):\\s*`, "i"), "")
    .replace(new RegExp(`\\s+:\\s+${sub ? `(?:r/)?${sub}` : "r/\\w+"}$`, "i"), "")
    .trim()
}

export default defineSite({
  id: "reddit",
  name: "Reddit",
  description: "Copy clean post links, switch to old Reddit, sort and search subreddits",
  url: "https://www.reddit.com",
  matches: (url) => HOSTS.has(url.hostname),

  commands({ url, tab }) {
    const { sub, post } = parse(url)
    const old = url.hostname === "old.reddit.com"
    // Stay on old Reddit when browsing it.
    const here = (path: string) => (old ? `https://old.reddit.com${path}` : reddit(path))
    const items: Command[] = []

    if (post) {
      const link = cleanLink(post, sub)
      const subtitle = sub ? `r/${sub}` : undefined
      items.push(
        copy("post-link", "Copy post link", link, { icon: Link, keywords: ["clean", "url", "share"] }),
        copy("post-short-link", "Copy short link", `https://redd.it/${post}`, { icon: Link, keywords: ["redd.it", "url"] }),
        copy("post-markdown", "Copy post as Markdown link", markdownLink(cleanTitle(tab?.title, sub) || (subtitle ?? "Reddit post"), link), {
          icon: Copy,
          subtitle,
        }),
      )
    }

    const path = `${url.pathname}${url.search}${url.hash}`
    items.push(
      old
        ? navigate("new-reddit", "Open in new Reddit", reddit(path), { icon: ArrowUpDown, subtitle: "www.reddit.com" })
        : navigate("old-reddit", "Open in old Reddit", `https://old.reddit.com${path}`, { icon: ArrowUpDown, subtitle: "old.reddit.com" }),
    )

    if (sub) {
      const subtitle = `r/${sub}`
      items.push(
        navigate("hot", "Hot", here(`/r/${sub}/hot/`), { icon: Flame, subtitle }),
        navigate("new", "New", here(`/r/${sub}/new/`), { icon: Clock, subtitle }),
        navigate("top-week", "Top of the week", here(`/r/${sub}/top/?t=week`), { icon: TrendingUp, subtitle }),
        navigate("top-all", "Top of all time", here(`/r/${sub}/top/?t=all`), { icon: Trophy, subtitle }),
      )
    }

    items.push(
      navigate("home", "Home", here("/"), { icon: Home }),
      navigate("popular", "Popular", here("/r/popular/"), { icon: TrendingUp }),
    )
    return items
  },

  search({ url, query }) {
    const { sub } = parse(url)
    const q = encodeURIComponent(query.trim())
    const text = query.trim()
    return [
      ...(sub && !FEEDS.has(sub.toLowerCase())
        ? [navigate("search-sub", `Search r/${sub} for “${text}”`, reddit(`/r/${sub}/search/?q=${q}&restrict_sr=1`), { icon: Search })]
        : []),
      navigate("search-all", `Search Reddit for “${text}”`, reddit(`/search/?q=${q}`), { icon: Search }),
    ]
  },
})
