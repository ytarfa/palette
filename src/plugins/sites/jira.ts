import {
  Briefcase,
  Copy,
  Filter,
  FolderKanban,
  Folders,
  GitBranch,
  GitCommitHorizontal,
  Kanban,
  LayoutDashboard,
  Link,
  List,
  ListTodo,
  Maximize2,
  Search,
} from "lucide-react"
import type { Command } from "@/core/types"
import { copy, defineSite, hostIs, markdownLink, navigate } from "../site-kit"

const KEY = /^([A-Z][A-Z0-9_]*)-([1-9]\d*)$/i
const PROJECT = /^[A-Z][A-Z0-9_]*$/i

/** "abc-123" → "ABC-123", or undefined if it isn't an issue key. */
export function issueKey(value: string | null | undefined) {
  return value && KEY.test(value) ? value.toUpperCase() : undefined
}

/**
 * Issue, project and board from a Jira Cloud URL:
 * /browse/ABC-123, /browse/ABC, /jira/software/c/projects/ABC/boards/12/backlog?selectedIssue=ABC-123,
 * /jira/software/projects/ABC/issues/ABC-123, /jira/issues/ABC-123…
 */
export function parse(url: URL) {
  const parts = url.pathname.split("/").filter(Boolean)
  let issue = issueKey(url.searchParams.get("selectedIssue"))
  let project: string | undefined
  let board: string | undefined
  let software: string | undefined

  if (parts[0] === "browse" && parts[1]) {
    issue ??= issueKey(parts[1])
    if (!issue && PROJECT.test(parts[1])) project = parts[1].toUpperCase()
  }

  // /jira/<product>/[c/]projects/<KEY>/…
  const at = parts.indexOf("projects")
  if (parts[0] === "jira" && at > 0 && parts[at + 1] && PROJECT.test(parts[at + 1])) {
    project = parts[at + 1].toUpperCase()
    const rest = parts.slice(at + 2)
    if (parts[1] === "software") software = `/jira/software/${parts[2] === "c" ? "c/" : ""}projects/${project}`
    if (rest[0] === "boards" && /^\d+$/.test(rest[1] ?? "")) board = rest[1]
    if (rest[0] === "issues") issue ??= issueKey(rest[1])
  }

  // Global issue navigator: /jira/issues/ABC-123
  if (parts[0] === "jira" && parts[1] === "issues") issue ??= issueKey(parts[2])

  project ??= issue?.split("-")[0]
  return { issue, project, board, software, onIssuePage: parts[0] === "browse" && !!issue }
}

/** "[ABC-123] Fix login redirect - Jira" → "Fix login redirect", if the title is about `key`. */
export function summaryFromTitle(title = "", key?: string) {
  const match = /^\[([^\]]+)\]\s*(.*)$/.exec(title.trim())
  if (!match || (key && match[1].toUpperCase() !== key)) return undefined
  return match[2].replace(/\s+-\s+Jira(?:\s+[\w ]+)?$/i, "").trim() || undefined
}

/** ("ABC-123", "Fix login redirect") → "abc-123-fix-login-redirect", at most `max` characters. */
export function branchName(key: string, summary = "", max = 60) {
  const slug = summary
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  let name = key.toLowerCase()
  for (const word of slug.split("-").filter(Boolean)) {
    if (name.length + 1 + word.length > max) break
    name += `-${word}`
  }
  return name
}

/** JQL for a text search: `text ~ "…"`, optionally in one project. */
export function textJql(query: string, project?: string) {
  const text = `text ~ "${query.replace(/[\\"]/g, "\\$&")}"`
  return project ? `project = "${project}" AND ${text}` : text
}

export default defineSite({
  id: "jira",
  name: "Jira",
  description: "Copy issue keys, branch names and links, jump to boards, backlogs and searches",
  url: "https://www.atlassian.com/software/jira",
  matches: (url) =>
    url.protocol === "https:" &&
    hostIs(url, "atlassian.net") &&
    url.hostname !== "atlassian.net" &&
    !/^\/wiki(\/|$)/.test(url.pathname),

  commands({ url, tab }) {
    const { issue, project, board, software, onIssuePage } = parse(url)
    const jira = (path: string) => `${url.origin}${path}`
    const search = (jql: string) => jira(`/issues/?jql=${encodeURIComponent(jql)}`)
    const items: Command[] = []

    if (issue) {
      const summary = summaryFromTitle(tab?.title, issue)
      const text = summary ? `${issue}: ${summary}` : issue
      items.push(copy("copy-key", "Copy issue key", issue, { icon: Copy }))
      if (summary) {
        items.push(copy("copy-key-summary", "Copy key and summary", text, { icon: GitCommitHorizontal, keywords: ["commit message"] }))
      }
      items.push(
        copy("copy-branch", "Copy branch name", branchName(issue, summary), { icon: GitBranch, keywords: ["git"] }),
        copy("copy-markdown", "Copy issue as Markdown link", markdownLink(text, jira(`/browse/${issue}`)), { icon: Link }),
      )
      if (!onIssuePage) {
        items.push(navigate("open-issue", "Open issue page", jira(`/browse/${issue}`), { icon: Maximize2, subtitle: issue }))
      }
    }
    if (project) {
      const subtitle = project
      if (software && board) {
        items.push(
          navigate("board", "Board", jira(`${software}/boards/${board}`), { icon: Kanban, subtitle }),
          navigate("backlog", "Backlog", jira(`${software}/boards/${board}/backlog`), { icon: ListTodo, subtitle }),
        )
      }
      items.push(
        navigate("project-issues", "Project issues", software ? jira(`${software}/issues`) : search(`project = "${project}" ORDER BY created DESC`), { icon: List, subtitle }),
        navigate("project", "Project", jira(`/browse/${project}`), { icon: FolderKanban, subtitle }),
      )
    }
    items.push(
      navigate("your-work", "Your work", jira("/jira/your-work"), { icon: Briefcase }),
      navigate("all-issues", "All issues", search("ORDER BY created DESC"), { icon: Search }),
      navigate("filters", "Filters", jira("/jira/filters"), { icon: Filter }),
      navigate("dashboards", "Dashboards", jira("/jira/dashboards"), { icon: LayoutDashboard }),
      navigate("projects", "Projects", jira("/jira/projects"), { icon: Folders }),
    )
    return items
  },

  search({ url, query }) {
    const { project } = parse(url)
    const q = query.trim()
    const search = (jql: string) => `${url.origin}/issues/?jql=${encodeURIComponent(jql)}`
    return [
      ...(project ? [navigate("search-project", `Search “${q}” in ${project}`, search(textJql(q, project)), { icon: Search })] : []),
      navigate("search-all", `Search Jira for “${q}”`, search(textJql(q)), { icon: Search }),
    ]
  },
})
