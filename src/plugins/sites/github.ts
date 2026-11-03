import {
  Bell,
  BookPlus,
  CircleDot,
  Code,
  Copy,
  FileDiff,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  GitPullRequestCreate,
  Inbox,
  ListChecks,
  MonitorPlay,
  Plus,
  Search,
  Settings,
  SquarePen,
  Tag,
  Terminal,
} from "lucide-react"
import type { Command } from "@/core/types"
import { copy, defineSite, markdownLink, navigate } from "../site-kit"

// First path segments that aren't a user or organization.
const RESERVED = new Set([
  "about", "account", "apps", "codespaces", "collections", "dashboard", "enterprise", "explore",
  "features", "issues", "login", "logout", "marketplace", "new", "notifications", "orgs",
  "organizations", "pricing", "pulls", "search", "settings", "signup", "sponsors", "topics", "trending",
])

/** Repository, pull request and issue from a github.com URL. */
export function parse(url: URL) {
  const [owner, name, section, number] = url.pathname.split("/").filter(Boolean)
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
export function cleanTitle(title = "") {
  return title.split(" · ")[0].replace(/\s+by\s+\S+$/, "")
}

export default defineSite({
  id: "github",
  name: "GitHub",
  description: "Jump around repositories, copy pull request links and checkout commands",
  url: "https://github.com",
  matches: (url) => url.hostname === "github.com",

  commands({ url, tab }) {
    const { repo, pull, issue } = parse(url)
    const items: Command[] = []

    if (pull) {
      const base = `/${repo}/pull/${pull}`
      const subtitle = `#${pull}`
      items.push(
        navigate("pr-files", "Files changed", github(`${base}/files`), { icon: FileDiff, subtitle }),
        navigate("pr-commits", "Commits", github(`${base}/commits`), { icon: GitCommitHorizontal, subtitle }),
        navigate("pr-checks", "Checks", github(`${base}/checks`), { icon: ListChecks, subtitle }),
        copy("pr-markdown", "Copy pull request as Markdown link", markdownLink(`${cleanTitle(tab?.title)} (#${pull})`, github(base)), { icon: Copy }),
        copy("pr-checkout", "Copy checkout command", `gh pr checkout ${pull} --repo ${repo}`, { icon: Terminal }),
      )
    }
    if (issue) {
      const link = markdownLink(`${cleanTitle(tab?.title)} (#${issue})`, github(`/${repo}/issues/${issue}`))
      items.push(copy("issue-markdown", "Copy issue as Markdown link", link, { icon: Copy }))
    }
    if (repo) {
      const subtitle = repo
      items.push(
        navigate("code", "Code", github(`/${repo}`), { icon: Code, subtitle }),
        navigate("issues", "Issues", github(`/${repo}/issues`), { icon: CircleDot, subtitle }),
        navigate("pulls", "Pull requests", github(`/${repo}/pulls`), { icon: GitPullRequest, subtitle }),
        navigate("actions", "Actions", github(`/${repo}/actions`), { icon: MonitorPlay, subtitle }),
        navigate("releases", "Releases", github(`/${repo}/releases`), { icon: Tag, subtitle }),
        navigate("branches", "Branches", github(`/${repo}/branches`), { icon: GitBranch, subtitle }),
        navigate("settings", "Repository settings", github(`/${repo}/settings`), { icon: Settings, subtitle }),
        navigate("new-issue", "New issue", github(`/${repo}/issues/new`), { icon: Plus, subtitle }),
        navigate("new-pr", "New pull request", github(`/${repo}/compare`), { icon: GitPullRequestCreate, subtitle }),
        navigate("github-dev", "Open in github.dev", url.href.replace("://github.com", "://github.dev"), { icon: SquarePen, subtitle: "Web editor" }),
        copy("clone-https", "Copy clone URL", github(`/${repo}.git`), { icon: Copy }),
        copy("clone-ssh", "Copy SSH clone URL", `git@github.com:${repo}.git`, { icon: Copy }),
      )
    }
    items.push(
      navigate("my-pulls", "Your pull requests", github("/pulls"), { icon: GitPullRequest }),
      navigate("my-issues", "Your issues", github("/issues"), { icon: CircleDot }),
      navigate("notifications", "Notifications", github("/notifications"), { icon: Bell }),
      navigate("dashboard", "Dashboard", github("/"), { icon: Inbox }),
      navigate("new-repo", "New repository", github("/new"), { icon: BookPlus }),
    )
    return items
  },

  search({ url, query }) {
    const { repo } = parse(url)
    const q = query.trim()
    const code = (search: string) => github(`/search?q=${encodeURIComponent(search)}&type=code`)
    return [
      ...(repo ? [navigate("search-repo", `Search “${q}” in ${repo}`, code(`repo:${repo} ${q}`), { icon: Search })] : []),
      navigate("search-all", `Search GitHub for “${q}”`, code(q), { icon: Search }),
    ]
  },
})
