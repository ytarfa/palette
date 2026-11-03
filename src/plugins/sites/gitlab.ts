import {
  CircleDot,
  Copy,
  FileDiff,
  FolderGit2,
  FolderPlus,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequestCreate,
  ListChecks,
  ListTodo,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  SquarePen,
  Tag,
  Terminal,
  Workflow,
} from "lucide-react"
import type { Command } from "@/core/types"
import { copy, defineSite, markdownLink, navigate } from "../site-kit"

// First path segments that aren't a group or user (GitLab's TOP_LEVEL_ROUTES).
const RESERVED = new Set([
  "-", "admin", "api", "assets", "dashboard", "explore", "groups", "help", "import", "jwt", "login",
  "o", "oauth", "profile", "projects", "public", "s", "search", "sitemap", "snippets", "unsubscribes",
  "uploads", "users", "v2",
])

// GitLab's `/-/` separator followed by a route name, e.g. `/-/merge_requests`. Requiring a plain
// lowercase word after it keeps out other sites that happen to use `/-/`, like npm tarball URLs.
const SEPARATOR = /\/-\/[a-z_]+(\/|$)/

/** gitlab.com, or a self-hosted GitLab page with the `/-/` separator in its path. */
export function isGitLab(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") return false
  return url.hostname === "gitlab.com" || SEPARATOR.test(url.pathname)
}

/**
 * Project, merge request and issue from a GitLab URL.
 *
 * The project path is everything before `/-/`, so nested groups work
 * (`group/subgroup/project/-/issues/7`). Without `/-/`, a project home page
 * looks exactly like a group page, so only a two-segment path on gitlab.com is
 * taken as a project (`gitlab.com/group/project`). That still misreads a
 * top-level subgroup (`gitlab.com/group/subgroup`), but its links just 404,
 * and deeper paths (`group/subgroup/project`) get project commands as soon as
 * you open any project page with `/-/` in it.
 */
export function parse(url: URL) {
  const separator = url.pathname.indexOf("/-/")
  const segments = (separator >= 0 ? url.pathname.slice(0, separator) : url.pathname).split("/").filter(Boolean)
  const known = separator >= 0 ? segments.length >= 2 : url.hostname === "gitlab.com" && segments.length === 2
  if (!known || RESERVED.has(segments[0])) return {}

  const [section, number, ...rest] = separator >= 0 ? url.pathname.slice(separator + 3).split("/") : []
  const n = Number(number)
  return {
    project: segments.join("/"),
    mergeRequest: section === "merge_requests" && n ? n : undefined,
    issue: (section === "issues" || section === "work_items") && n ? { kind: section, number: n } : undefined,
    // Only a bare `/-/tree/<ref>`: with more segments, `feature/login` could be a branch or a folder.
    ref: section === "tree" && number && rest.filter(Boolean).length === 0 ? number : undefined,
  }
}

/**
 * "Fix checkout race (!4) · Merge requests · Acme / Storefront · GitLab" → "Fix checkout race".
 * Undefined when the title has no `(!n)` or `(#n)` reference, e.g. while the page is still loading.
 */
export function cleanTitle(title = "") {
  const match = /^(.+?) \((?:!|#)\d+\)$/.exec(title.split(" · ")[0].trim())
  return match?.[1]
}

export default defineSite({
  id: "gitlab",
  name: "GitLab",
  description: "Jump around projects, copy merge request links and checkout commands",
  url: "https://gitlab.com",
  matches: isGitLab,

  commands({ url, tab }) {
    const { project, mergeRequest, issue, ref } = parse(url)
    // Keep the current origin so self-hosted instances link to themselves.
    const gitlab = (path: string) => `${url.origin}${path}`
    const items: Command[] = []

    if (project && mergeRequest) {
      const base = `/${project}/-/merge_requests/${mergeRequest}`
      const subtitle = `!${mergeRequest}`
      const text = cleanTitle(tab?.title)
      // glab defaults to gitlab.com, so other hosts need the full project URL.
      const repo = url.hostname === "gitlab.com" ? project : gitlab(`/${project}`)
      items.push(
        navigate("mr-changes", "Changes", gitlab(`${base}/diffs`), { icon: FileDiff, subtitle }),
        navigate("mr-commits", "Commits", gitlab(`${base}/commits`), { icon: GitCommitHorizontal, subtitle }),
        navigate("mr-pipelines", "Pipelines", gitlab(`${base}/pipelines`), { icon: ListChecks, subtitle }),
        copy("mr-markdown", "Copy merge request as Markdown link", markdownLink(text ? `${text} (!${mergeRequest})` : `${project}!${mergeRequest}`, gitlab(base)), { icon: Copy }),
        copy("mr-checkout", "Copy checkout command", `glab mr checkout ${mergeRequest} --repo ${repo}`, { icon: Terminal }),
      )
    }
    if (project && issue) {
      const text = cleanTitle(tab?.title)
      const link = markdownLink(text ? `${text} (#${issue.number})` : `${project}#${issue.number}`, gitlab(`/${project}/-/${issue.kind}/${issue.number}`))
      items.push(copy("issue-markdown", "Copy issue as Markdown link", link, { icon: Copy }))
    }
    if (project) {
      const subtitle = project
      const ide = gitlab(`/-/ide/project/${project}`)
      const ideUrl = mergeRequest ? `${ide}/merge_requests/${mergeRequest}` : ref ? `${ide}/edit/${ref}/-/` : ide
      items.push(
        navigate("repository", "Repository", gitlab(`/${project}`), { icon: FolderGit2, subtitle }),
        navigate("issues", "Issues", gitlab(`/${project}/-/issues`), { icon: CircleDot, subtitle }),
        navigate("merge-requests", "Merge requests", gitlab(`/${project}/-/merge_requests`), { icon: GitMerge, subtitle }),
        navigate("pipelines", "Pipelines", gitlab(`/${project}/-/pipelines`), { icon: Workflow, subtitle }),
        navigate("ci-settings", "CI/CD settings", gitlab(`/${project}/-/settings/ci_cd`), { icon: SlidersHorizontal, subtitle }),
        navigate("releases", "Releases", gitlab(`/${project}/-/releases`), { icon: Tag, subtitle }),
        navigate("branches", "Branches", gitlab(`/${project}/-/branches`), { icon: GitBranch, subtitle }),
        navigate("settings", "Project settings", gitlab(`/${project}/edit`), { icon: Settings, subtitle }),
        navigate("new-issue", "New issue", gitlab(`/${project}/-/issues/new`), { icon: Plus, subtitle }),
        navigate("new-mr", "New merge request", gitlab(`/${project}/-/merge_requests/new`), { icon: GitPullRequestCreate, subtitle }),
        navigate("web-ide", "Open in Web IDE", ideUrl, { icon: SquarePen, subtitle }),
        copy("clone-https", "Copy clone URL", gitlab(`/${project}.git`), { icon: Copy }),
        // Self-hosted instances may use another SSH host or port; this is the default form.
        copy("clone-ssh", "Copy SSH clone URL", `git@${url.hostname}:${project}.git`, { icon: Copy }),
      )
    }
    items.push(
      navigate("my-merge-requests", "Your merge requests", gitlab("/dashboard/merge_requests"), { icon: GitMerge }),
      navigate("todos", "To-do list", gitlab("/dashboard/todos"), { icon: ListTodo }),
      navigate("projects", "Projects", gitlab("/dashboard/projects"), { icon: FolderGit2 }),
      navigate("new-project", "New project", gitlab("/projects/new"), { icon: FolderPlus }),
    )
    return items
  },

  // Project-wide search (`/search?project_id=`) needs the numeric project ID, which isn't in the
  // URL, and there is no `<project>/-/search` route. So the project items search its issue and
  // merge request lists, which take `?search=`.
  search({ url, query }) {
    const { project } = parse(url)
    const q = encodeURIComponent(query.trim())
    const shown = query.trim()
    const items: Command[] = []
    if (project) {
      items.push(
        navigate("search-issues", `Search “${shown}” in ${project} issues`, `${url.origin}/${project}/-/issues?search=${q}`, { icon: Search }),
        navigate("search-mrs", `Search “${shown}” in ${project} merge requests`, `${url.origin}/${project}/-/merge_requests?search=${q}`, { icon: Search }),
      )
    }
    items.push(navigate("search-all", `Search GitLab for “${shown}”`, `${url.origin}/search?search=${q}`, { icon: Search }))
    return items
  },
})
