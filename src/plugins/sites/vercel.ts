import {
  Activity,
  ChartColumn,
  ChartLine,
  Copy,
  Gauge,
  Globe,
  KeyRound,
  LayoutDashboard,
  Plus,
  Rocket,
  ScrollText,
  Settings,
  Terminal,
  Users,
} from "lucide-react"
import type { Command } from "@/core/types"
import { copy, defineSite, navigate } from "../site-kit"

// First path segments that aren't a team: marketing, docs and account pages.
const RESERVED = new Set([
  "about", "academy", "account", "agent", "agents", "ai", "ai-accelerator", "ai-gateway", "ai-sdk", "api",
  "blog", "careers", "changelog", "cli", "connect", "contact", "customers", "d", "dashboard", "design", "docs",
  "domains", "enterprise", "eve", "events", "fluid", "frameworks", "geist", "get", "guides", "help", "home", "i",
  "integrations", "kb", "legal", "login", "logout", "marketplace", "new", "open-source-program", "oss",
  "partners", "passport", "press", "pricing", "products", "sandbox", "security", "ship", "shipped", "signup",
  "solutions", "startups", "storage", "support", "teams", "templates", "workflows",
])

// Deployment IDs in dashboard URLs are the API ID without "dpl_", e.g. "233NRGRjVZX1caZrXWtz5g1TAksD".
// Project pages ("deployments", "speed-insights", …) are short, lowercase words.
const DEPLOYMENT_ID = /^(?=.*[A-Z0-9])[A-Za-z0-9]{20,}$/

/** Team, project and deployment from a vercel.com dashboard URL. */
export function parse(url: URL) {
  const [team, project, section] = url.pathname.split("/").filter(Boolean)
  if (!team || RESERVED.has(team)) return {}
  // Team pages live under /<team>/~/…
  if (!project || project === "~") return { team }
  return { team, project, deployment: section && DEPLOYMENT_ID.test(section) ? `dpl_${section}` : undefined }
}

const vercel = (path: string) => `https://vercel.com${path}`

export default defineSite({
  id: "vercel",
  name: "Vercel",
  description: "Jump between project and team pages, copy deployment IDs",
  url: "https://vercel.com",
  matches: (url) => url.hostname === "vercel.com",

  commands({ url }) {
    const { team, project, deployment } = parse(url)
    const items: Command[] = []

    if (team && project && deployment) {
      items.push(
        copy("deployment-id", "Copy deployment ID", deployment, { icon: Copy }),
        copy("deployment-logs", "Copy build logs command", `vercel inspect ${deployment} --logs --scope ${team}`, { icon: Terminal }),
      )
    }
    if (team && project) {
      const base = `/${team}/${project}`
      const subtitle = project
      items.push(
        navigate("project", "Project overview", vercel(base), { icon: LayoutDashboard, subtitle }),
        navigate("deployments", "Deployments", vercel(`${base}/deployments`), { icon: Rocket, subtitle }),
        navigate("logs", "Logs", vercel(`${base}/logs`), { icon: ScrollText, subtitle }),
        navigate("analytics", "Analytics", vercel(`${base}/analytics`), { icon: ChartLine, subtitle }),
        navigate("speed-insights", "Speed Insights", vercel(`${base}/speed-insights`), { icon: Gauge, subtitle }),
        navigate("observability", "Observability", vercel(`${base}/observability`), { icon: Activity, subtitle }),
        navigate("settings", "Project settings", vercel(`${base}/settings`), { icon: Settings, subtitle }),
        navigate("domains", "Domains", vercel(`${base}/settings/domains`), { icon: Globe, subtitle }),
        navigate("env", "Environment variables", vercel(`${base}/settings/environment-variables`), { icon: KeyRound, subtitle, keywords: ["env", "secrets"] }),
      )
    }
    if (team) {
      const subtitle = team
      items.push(
        navigate("team", "Team overview", vercel(`/${team}`), { icon: Users, subtitle, keywords: ["projects"] }),
        navigate("team-settings", "Team settings", vercel(`/${team}/~/settings`), { icon: Settings, subtitle }),
        navigate("usage", "Usage", vercel(`/${team}/~/usage`), { icon: ChartColumn, subtitle, keywords: ["billing"] }),
      )
    }
    items.push(
      navigate("dashboard", "Dashboard", vercel("/dashboard"), { icon: LayoutDashboard }),
      navigate("new-project", "New project", vercel("/new"), { icon: Plus, keywords: ["import", "deploy"] }),
    )
    return items
  },
})
