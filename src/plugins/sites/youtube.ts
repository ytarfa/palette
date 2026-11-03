import {
  Clock,
  Copy,
  Gauge,
  Hash,
  History,
  Link,
  ListVideo,
  MonitorPlay,
  Music,
  Repeat,
  Search,
  ThumbsUp,
  Timer,
  Tv,
} from "lucide-react"
import type { Command, PaletteContext } from "@/core/types"
import { copy, defineSite, markdownLink, navigate, runInPage } from "../site-kit"

const HOSTS = new Set(["www.youtube.com", "youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"])
const VIDEO_ID = /^[\w-]{11}$/

/** Video ID, playlist and kind of page from a YouTube URL. */
export function parse(url: URL) {
  const [first, second] = url.pathname.split("/").filter(Boolean)
  let candidate: string | undefined
  if (url.hostname === "youtu.be") candidate = first
  else if (first === "watch") candidate = url.searchParams.get("v") ?? undefined
  else if (first === "shorts" || first === "live" || first === "embed") candidate = second
  const video = candidate && VIDEO_ID.test(candidate) ? candidate : undefined
  return {
    video,
    playlist: url.searchParams.get("list") ?? undefined,
    short: !!video && first === "shorts",
  }
}

const youtube = (path: string) => `https://www.youtube.com${path}`

/** `https://youtu.be/<id>`, with `?t=<seconds>` for a start time of at least one second. */
export function shortLink(video: string, seconds?: number) {
  const t = seconds != null && Number.isFinite(seconds) ? Math.floor(seconds) : 0
  return `https://youtu.be/${video}${t >= 1 ? `?t=${t}` : ""}`
}

/** "(3) Never Gonna Give You Up - YouTube" → "Never Gonna Give You Up" */
export function cleanTitle(title = "") {
  return title
    .replace(/^\(\d+\+?\)\s*/, "")
    .replace(/\s+-\s+YouTube(?: Music)?$/, "")
    .trim()
}

/** Start time in seconds from a `t=` param like "90", "90s" or "1m30s". */
export function startTime(url: URL): number | undefined {
  const t = url.searchParams.get("t")
  const match = t?.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/)
  if (!t || !match) return undefined
  const [, h = "0", m = "0", s = "0"] = match
  return Number(h) * 3600 + Number(m) * 60 + Number(s)
}

export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3]

// These run in the page's isolated world, which shares the DOM with YouTube's
// player. They're serialized, so they can't use anything from this module.
const readTime = () => document.querySelector("video")?.currentTime
const readSpeed = () => document.querySelector("video")?.playbackRate
const setSpeed = (rate: number) => {
  const video = document.querySelector("video")
  if (video) video.playbackRate = rate
}
const toggleLoop = () => {
  const video = document.querySelector("video")
  if (video) video.loop = !video.loop
  return video?.loop
}

function speedItems(current: number | undefined): Command[] {
  return SPEEDS.map((rate) => ({
    id: `speed-${rate}`,
    title: rate === 1 ? "1× (normal)" : `${rate}×`,
    icon: Gauge,
    hint: rate === current ? "Current" : undefined,
    // Best effort: this sets the <video> element's rate directly, so YouTube's
    // own settings menu may still show the old speed, and the player may reset
    // it (e.g. on the next video or after an ad).
    run: async (ctx: PaletteContext) => void (await runInPage(ctx, setSpeed, rate)),
  }))
}

export default defineSite({
  id: "youtube",
  name: "YouTube",
  description: "Copy short and timestamped video links, change playback speed, open Shorts as regular videos",
  url: "https://www.youtube.com",
  matches: (url) => HOSTS.has(url.hostname),

  commands({ url, tab }) {
    const { video, playlist, short } = parse(url)
    const music = url.hostname === "music.youtube.com"
    const items: Command[] = []

    if (video) {
      const title = cleanTitle(tab?.title) || video
      items.push(
        copy("copy-short-link", "Copy short link", shortLink(video, startTime(url)), { icon: Link }),
        {
          id: "copy-link-at-time",
          title: "Copy link at current time",
          icon: Timer,
          keywords: ["timestamp"],
          async run(ctx) {
            const seconds = await runInPage(ctx, readTime)
            if (typeof seconds === "number") await ctx.copy(shortLink(video, seconds))
          },
        },
        copy("copy-markdown", "Copy as Markdown link", markdownLink(title, youtube(`/watch?v=${video}`)), { icon: Copy }),
        copy("copy-id", "Copy video ID", video, { icon: Hash }),
      )
      if (short) {
        items.push(navigate("open-as-video", "Open as regular video", youtube(`/watch?v=${video}`), { icon: MonitorPlay, subtitle: video }))
      }
      items.push(
        {
          id: "playback-speed",
          title: "Playback speed…",
          icon: Gauge,
          keywords: ["rate", "faster", "slower"],
          children: {
            placeholder: "Playback speed",
            items: async (ctx) => speedItems(await runInPage(ctx, readSpeed)),
          },
        },
        {
          id: "loop",
          title: "Loop video",
          icon: Repeat,
          keywords: ["repeat"],
          run: async (ctx) => void (await runInPage(ctx, toggleLoop)),
        },
      )
      if (!music) {
        items.push(navigate("open-in-music", "Open in YouTube Music", `https://music.youtube.com/watch?v=${video}`, { icon: Music }))
      }
    }
    // Mixes (RD…) have no playlist page.
    if (playlist && !playlist.startsWith("RD") && url.pathname !== "/playlist") {
      const origin = music ? "https://music.youtube.com" : "https://www.youtube.com"
      items.push(navigate("open-playlist", "Open playlist", `${origin}/playlist?list=${encodeURIComponent(playlist)}`, { icon: ListVideo, subtitle: playlist }))
    }
    items.push(
      navigate("subscriptions", "Subscriptions", youtube("/feed/subscriptions"), { icon: Tv }),
      navigate("watch-later", "Watch later", youtube("/playlist?list=WL"), { icon: Clock }),
      navigate("liked", "Liked videos", youtube("/playlist?list=LL"), { icon: ThumbsUp }),
      navigate("history", "History", youtube("/feed/history"), { icon: History }),
    )
    return items
  },

  search({ query }) {
    const q = query.trim()
    return [navigate("search", `Search YouTube for “${q}”`, youtube(`/results?search_query=${encodeURIComponent(q)}`), { icon: Search })]
  },
})
