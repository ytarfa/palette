import { AtSign, Bell, Bookmark, Compass, Hash, Heart, Home, Image, Link, MessageCircle, MessageSquareShare, Search, UserRound } from "lucide-react"
import type { Command } from "@/core/types"
import { copy, defineSite, navigate } from "../site-kit"

// x.com, twitter.com, and their www. and mobile. variants.
const HOSTS = new Set(["x.com", "twitter.com"].flatMap((host) => [host, `www.${host}`, `mobile.${host}`]))
const HANDLE = /^[A-Za-z0-9_]{1,15}$/
const ID = /^\d+$/

// First path segments that aren't a user.
const RESERVED = new Set([
  "about", "account", "compose", "download", "explore", "hashtag", "home", "i", "intent", "jobs", "login",
  "logout", "messages", "notifications", "privacy", "search", "settings", "share", "signup", "tos",
])

/** User and post from an X URL: /<user>, /<user>/status/<id>[/photo/1], /i/web/status/<id>. */
export function parse(url: URL) {
  const parts = url.pathname.split("/").filter(Boolean)
  if (parts[0] === "i") {
    const at = parts.indexOf("status")
    const post = at > 0 && ID.test(parts[at + 1] ?? "") ? parts[at + 1] : undefined
    return { user: undefined, post }
  }
  const [user, section, id] = parts
  if (!user || !HANDLE.test(user) || RESERVED.has(user.toLowerCase())) return {}
  return {
    user,
    post: section === "status" && ID.test(id ?? "") ? id : undefined,
  }
}

const x = (path: string) => `https://x.com${path}`

/** The canonical link to a post, without `s=`, `t=` or other parameters. */
export const cleanLink = (post: string, user?: string) => x(`/${user ?? "i"}/status/${post}`)

export default defineSite({
  id: "x",
  name: "X",
  description: "Copy clean post links and IDs, jump to profile tabs, search a user's posts",
  url: "https://x.com",
  matches: (url) => HOSTS.has(url.hostname),

  commands({ url }) {
    const { user, post } = parse(url)
    const items: Command[] = []

    if (post) {
      const subtitle = user ? `@${user}` : undefined
      items.push(
        copy("post-link", "Copy post link", cleanLink(post, user), { icon: Link, keywords: ["clean", "url", "share", "tweet"] }),
        copy("post-id", "Copy post ID", post, { icon: Hash, keywords: ["tweet"] }),
      )
      if (user) {
        items.push(
          copy("post-embed-link", "Copy link for chat apps", `https://fixupx.com/${user}/status/${post}`, {
            icon: MessageSquareShare,
            subtitle: "Via fixupx.com, a third-party service: full previews in Discord, Telegram…",
            keywords: ["fixupx", "fxtwitter", "embed", "preview", "discord", "tweet"],
          }),
          navigate("author", "Author's profile", x(`/${user}`), { icon: UserRound, subtitle }),
        )
      }
    } else if (user) {
      const subtitle = `@${user}`
      items.push(
        copy("handle", "Copy handle", `@${user}`, { icon: AtSign, keywords: ["username"] }),
        navigate("posts", "Posts", x(`/${user}`), { icon: UserRound, subtitle }),
        navigate("replies", "Replies", x(`/${user}/with_replies`), { icon: MessageCircle, subtitle }),
        navigate("media", "Media", x(`/${user}/media`), { icon: Image, subtitle }),
        navigate("likes", "Likes", x(`/${user}/likes`), { icon: Heart, subtitle: `${subtitle} · only visible on your own profile` }),
      )
    }

    items.push(
      navigate("home", "Home", x("/home"), { icon: Home }),
      navigate("notifications", "Notifications", x("/notifications"), { icon: Bell }),
      navigate("bookmarks", "Bookmarks", x("/i/bookmarks"), { icon: Bookmark }),
      navigate("explore", "Explore", x("/explore"), { icon: Compass }),
    )
    return items
  },

  search({ url, query }) {
    const { user } = parse(url)
    const q = query.trim()
    const latest = (search: string) => x(`/search?q=${encodeURIComponent(search)}&src=typed_query&f=live`)
    return [
      ...(user ? [navigate("search-user", `Search @${user}'s posts for “${q}”`, latest(`from:${user} ${q}`), { icon: Search })] : []),
      navigate("search-all", `Search X for “${q}”`, latest(q), { icon: Search, subtitle: "Latest" }),
    ]
  },
})
