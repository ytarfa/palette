import {
  AppWindow,
  CircleDashed,
  CircleDot,
  Copy,
  FolderKanban,
  GitBranch,
  Hash,
  Inbox,
  IterationCw,
  Layers,
  Link,
  Search,
  SquarePen,
  Timer,
  UserRound,
} from "lucide-react"
import type { Command } from "@/core/types"
import { copy, defineSite, markdownLink, navigate, openInNewTab } from "../site-kit"

// Second path segments that mark the first one as a workspace, e.g. /acme/issue/ENG-123.
// Marketing pages (/docs/…, /changelog/…, /features/…) don't have one of these.
const APP_SECTIONS = new Set([
  "issue", "team", "teams", "project", "projects", "inbox", "my-issues", "view", "views", "search",
  "settings", "initiative", "initiatives", "document", "cycle", "reviews", "releases", "agent",
])

const ISSUE_ID = /^([a-z0-9]+)-(\d+)$/i

/** Workspace, team key, issue and project from a linear.app URL. */
export function parse(url: URL) {
  const [workspace, section, id, slug] = url.pathname.split("/").filter(Boolean).map(decodeURIComponent)
  if (!workspace || !section || !APP_SECTIONS.has(section)) return {}
  const issue = section === "issue" && id && ISSUE_ID.test(id) ? id.toUpperCase() : undefined
  const team = issue ? issue.split("-")[0] : section === "team" && id ? id.toUpperCase() : undefined
  return {
    workspace,
    team,
    issue,
    slug: issue ? slug : undefined,
    project: section === "project" && id ? id : undefined,
  }
}

const linear = (path: string) => `https://linear.app${path}`

/** Opens a linear.app URL in the desktop app: https://linear.app/acme/… → linear://linear.app/acme/… */
export const desktopUrl = (url: string) => url.replace(/^https:\/\//, "linear://")

/**
 * The issue title from the tab title, which starts with the issue ID: "ENG-123 Fix checkout race" → "Fix checkout race".
 * Undefined if the tab title is for another page (it lags behind in-app navigation).
 */
export function cleanTitle(title = "", issue: string) {
  const rest = title.replace(/\s+[›|–—-]\s+Linear$/, "").trim()
  const match = rest.match(/^([a-z0-9]+-\d+)(?::?\s+(.*))?$/i)
  return match && match[1].toUpperCase() === issue.toUpperCase() ? match[2]?.trim() || undefined : undefined
}

/** "fix-checkout-race" → "Fix checkout race" */
export const titleFromSlug = (slug = "") => {
  const text = slug.replace(/-+/g, " ").trim()
  return text && text[0].toUpperCase() + text.slice(1)
}

/** Linear's branch name without the username prefix: "eng-123-fix-checkout-race". */
export const branchName = (issue: string, slug?: string) => [issue.toLowerCase(), slug?.toLowerCase()].filter(Boolean).join("-")

export default defineSite({
  id: "linear",
  name: "Linear",
  description: "Copy issue links and branch names, jump to your team's issues and cycles",
  url: "https://linear.app",
  matches: (url) => url.hostname === "linear.app",

  commands({ url, tab }) {
    const { workspace, team, issue, slug, project } = parse(url)
    if (!workspace) return []
    const items: Command[] = []

    if (issue) {
      const link = linear(`/${workspace}/issue/${issue}`)
      const title = cleanTitle(tab?.title, issue) ?? titleFromSlug(slug)
      const full = title ? `${issue}: ${title}` : issue
      items.push(
        copy("copy-id", "Copy issue ID", issue, { icon: Hash }),
        copy("copy-title", "Copy issue ID and title", full, { icon: Copy }),
        copy("copy-markdown", "Copy issue as Markdown link", markdownLink(full, link), { icon: Link }),
        copy("copy-branch", "Copy git branch name", branchName(issue, slug), { icon: GitBranch }),
        openInNewTab("desktop", "Open in desktop app", desktopUrl(link), { icon: AppWindow, subtitle: issue }),
      )
    }
    if (project) {
      items.push(
        copy("copy-project", "Copy project link", linear(`/${workspace}/project/${project}`), { icon: Link }),
        openInNewTab("desktop", "Open in desktop app", desktopUrl(url.href), { icon: AppWindow }),
      )
    }
    if (team) {
      const base = `/${workspace}/team/${team}`
      const subtitle = team
      items.push(
        navigate("team-active", "Active issues", linear(`${base}/active`), { icon: CircleDot, subtitle }),
        navigate("team-backlog", "Backlog", linear(`${base}/backlog`), { icon: CircleDashed, subtitle }),
        navigate("team-all", "All issues", linear(`${base}/all`), { icon: Layers, subtitle }),
        navigate("team-cycle", "Current cycle", linear(`${base}/cycle/active`), { icon: Timer, subtitle }),
        navigate("team-cycles", "Cycles", linear(`${base}/cycles`), { icon: IterationCw, subtitle }),
      )
    }
    items.push(
      navigate("my-issues", "My issues", linear(`/${workspace}/my-issues/assigned`), { icon: UserRound }),
      navigate("inbox", "Inbox", linear(`/${workspace}/inbox`), { icon: Inbox }),
      navigate("projects", "Projects", linear(`/${workspace}/projects/all`), { icon: FolderKanban }),
      team
        ? navigate("new-issue", "New issue", linear(`/team/${team}/new`), { icon: SquarePen, subtitle: team })
        : navigate("new-issue", "New issue", "https://linear.new", { icon: SquarePen }),
    )
    return items
  },

  search({ url, query }) {
    const { workspace } = parse(url)
    if (!workspace) return []
    const q = query.trim()
    return [navigate("search", `Search Linear for “${q}”`, linear(`/${workspace}/search?q=${encodeURIComponent(q)}`), { icon: Search })]
  },
})
