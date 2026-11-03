import {
  CircleDot,
  Code,
  Copy,
  FileDiff,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  GitPullRequestCreate,
  Bell,
  Inbox,
  ListChecks,
  MonitorPlay,
  Plus,
  Search,
  Settings,
  SquarePen,
  Tag,
  Terminal,
  BookPlus,
} from "lucide-react"
import { definePlugin, type Command, type PaletteContext } from "@/core/types"

/**
 * Commands for github.com, shown at the top of ⌘⇧K while you're on GitHub.
 * Everything comes from the tab's URL and title, so it needs no extra
 * permissions and doesn't read the page.
 */

const GROUP = "GitHub"

// First path segments that aren't a user or organization.
const RESERVED = new Set([
  "about", "account", "apps", "codespaces", "collections", "dashboard", "enterprise", "explore",
  "features", "issues", "login", "logout", "marketplace", "new", "notifications", "orgs",
  "organizations", "pricing", "pulls", "search", "settings", "signup", "sponsors", "topics", "trending",
])

interface Page {
  /** "acme/storefront" when on a repository. */
  repo?: string
  /** Pull request or issue number. */
  pull?: number
  issue?: number
}

function parse(url: string | undefined): Page | undefined {
  if (!url) return undefined
  const { host, pathname } = new URL(url)
  if (host !== "github.com") return undefined
  const [owner, name, section, number] = pathname.split("/").filter(Boolean)
  if (!owner || !name || RESERVED.has(owner)) return {}
  const n = Number(number)
  return {
    repo: `${owner}/${name}`,
    pull: section === "pull" && n ? n : undefined,
    issue: section === "issues" && n ? n : undefined,
  }
}

const github = (path: string) => `https://github.com${path}`

/** "Fix checkout race by octocat · Pull Request #482 · acme/storefront · GitHub" → "Fix checkout race" */
function cleanTitle(title = "") {
  return title.split(" · ")[0].replace(/\s+by\s+\S+$/, "")
}

function go(id: string, title: string, url: string, icon: Command["icon"], subtitle?: string): Command {
  return {
    id,
    title,
    subtitle,
    group: GROUP,
    icon,
    keywords: ["github"],
    run: (ctx) => void chrome.tabs.update(ctx.tab!.id!, { url }),
    actions: [
      {
        id: "new-tab",
        title: "New tab",
        shortcut: "mod+enter",
        run: () => void chrome.tabs.create({ url }),
      },
    ],
  }
}

function copy(id: string, title: string, value: string, icon: Command["icon"]): Command {
  return { id, title, subtitle: value, group: GROUP, icon, keywords: ["github"], run: (ctx) => ctx.copy(value) }
}

function commands(ctx: PaletteContext): Command[] {
  const page = parse(ctx.tab?.url)
  if (!page) return []
  const items: Command[] = []
  const { repo, pull, issue } = page

  if (pull) {
    const base = `/${repo}/pull/${pull}`
    items.push(
      go("pr-files", "Files changed", github(`${base}/files`), FileDiff, `#${pull}`),
      go("pr-commits", "Commits", github(`${base}/commits`), GitCommitHorizontal, `#${pull}`),
      go("pr-checks", "Checks", github(`${base}/checks`), ListChecks, `#${pull}`),
      copy("pr-markdown", "Copy pull request as Markdown link", `[${cleanTitle(ctx.tab?.title)} (#${pull})](${github(base)})`, Copy),
      copy("pr-checkout", "Copy checkout command", `gh pr checkout ${pull} --repo ${repo}`, Terminal),
    )
  }
  if (issue) {
    const base = `/${repo}/issues/${issue}`
    items.push(copy("issue-markdown", "Copy issue as Markdown link", `[${cleanTitle(ctx.tab?.title)} (#${issue})](${github(base)})`, Copy))
  }
  if (repo) {
    items.push(
      go("code", "Code", github(`/${repo}`), Code, repo),
      go("issues", "Issues", github(`/${repo}/issues`), CircleDot, repo),
      go("pulls", "Pull requests", github(`/${repo}/pulls`), GitPullRequest, repo),
      go("actions", "Actions", github(`/${repo}/actions`), MonitorPlay, repo),
      go("releases", "Releases", github(`/${repo}/releases`), Tag, repo),
      go("branches", "Branches", github(`/${repo}/branches`), GitBranch, repo),
      go("settings", "Repository settings", github(`/${repo}/settings`), Settings, repo),
      go("new-issue", "New issue", github(`/${repo}/issues/new`), Plus, repo),
      go("new-pr", "New pull request", github(`/${repo}/compare`), GitPullRequestCreate, repo),
      go("github-dev", "Open in github.dev", ctx.tab!.url!.replace("://github.com", "://github.dev"), SquarePen, "Web editor"),
      copy("clone-https", "Copy clone URL", github(`/${repo}.git`), Copy),
      copy("clone-ssh", "Copy SSH clone URL", `git@github.com:${repo}.git`, Copy),
    )
  }
  items.push(
    go("my-pulls", "Your pull requests", github("/pulls"), GitPullRequest),
    go("my-issues", "Your issues", github("/issues"), CircleDot),
    go("notifications", "Notifications", github("/notifications"), Bell),
    go("dashboard", "Dashboard", github("/"), Inbox),
    go("new-repo", "New repository", github("/new"), BookPlus),
  )
  return items
}

/** "Search “query” in acme/storefront" and on all of GitHub, while typing. */
function search(ctx: PaletteContext): Command[] {
  const page = parse(ctx.tab?.url)
  const query = ctx.query.trim()
  if (!page || !query) return []
  const scoped = (q: string) => github(`/search?q=${encodeURIComponent(q)}&type=code`)
  const items = [{ ...go("search-all", `Search GitHub for “${query}”`, scoped(query), Search), alwaysShow: true }]
  if (page.repo) {
    items.unshift({
      ...go("search-repo", `Search “${query}” in ${page.repo}`, scoped(`repo:${page.repo} ${query}`), Search),
      alwaysShow: true,
    })
  }
  return items
}

export default definePlugin({
  id: "github",
  name: "GitHub",
  sources: [
    { mode: "commands", items: commands },
    { mode: "commands", dynamic: true, items: search },
  ],
})
