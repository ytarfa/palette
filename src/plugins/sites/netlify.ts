import {
  ClipboardList,
  Copy,
  ExternalLink,
  Globe,
  KeyRound,
  LayoutDashboard,
  Rocket,
  ScrollText,
  Settings,
  Users,
} from "lucide-react"
import type { Command } from "@/core/types"
import { copy, defineSite, navigate, openInNewTab } from "../site-kit"

// Project names are also their netlify.app subdomain.
const NAME = /^[a-z0-9-]+$/i
// Deploy IDs are 24 hex characters, e.g. "6905f08aa0cf68f7eef4585c".
const DEPLOY_ID = /^[0-9a-f]{24}$/i

/**
 * Project, deploy and team from an app.netlify.com URL. Netlify renamed sites
 * to projects: `/sites/<name>/…` and `/projects/<name>/…` both work, and
 * `base` keeps whichever the current URL uses.
 */
export function parse(url: URL) {
  const [kind, name, section, id] = url.pathname.split("/").filter(Boolean)
  if (!name || !NAME.test(name)) return {}
  if (kind === "teams") return { team: name }
  if (kind !== "sites" && kind !== "projects") return {}
  return {
    site: name,
    base: `/${kind}/${name}`,
    deploy: section === "deploys" && id && DEPLOY_ID.test(id) ? id : undefined,
  }
}

const app = (path: string) => `https://app.netlify.com${path}`

export default defineSite({
  id: "netlify",
  name: "Netlify",
  description: "Jump between project pages, open the live site and deploy permalinks",
  url: "https://app.netlify.com",
  matches: (url) => url.hostname === "app.netlify.com",

  commands({ url }) {
    const { site, base, deploy, team } = parse(url)
    const items: Command[] = []

    if (site && deploy) {
      const permalink = `https://${deploy}--${site}.netlify.app`
      items.push(
        openInNewTab("deploy-open", "Open deploy permalink", permalink, { icon: ExternalLink, subtitle: `${deploy}--${site}.netlify.app` }),
        copy("deploy-id", "Copy deploy ID", deploy, { icon: Copy }),
      )
    }
    if (site && base) {
      const live = `https://${site}.netlify.app`
      const subtitle = site
      items.push(
        openInNewTab("live-open", "Open live site", live, { icon: ExternalLink, subtitle: `${site}.netlify.app` }),
        copy("live-copy", "Copy live site URL", live, { icon: Copy }),
        navigate("overview", "Project overview", app(`${base}/overview`), { icon: LayoutDashboard, subtitle }),
        navigate("deploys", "Deploys", app(`${base}/deploys`), { icon: Rocket, subtitle }),
        navigate("function-logs", "Function logs", app(`${base}/logs/functions`), { icon: ScrollText, subtitle, keywords: ["functions"] }),
        navigate("domains", "Domain management", app(`${base}/domain-management`), { icon: Globe, subtitle, keywords: ["dns", "https"] }),
        navigate("env", "Environment variables", app(`${base}/configuration/env`), { icon: KeyRound, subtitle, keywords: ["env", "secrets"] }),
        navigate("configuration", "Project configuration", app(`${base}/configuration/general`), { icon: Settings, subtitle, keywords: ["site", "settings"] }),
        navigate("forms", "Forms", app(`${base}/forms`), { icon: ClipboardList, subtitle }),
      )
    }
    if (team) {
      items.push(navigate("team", "Team overview", app(`/teams/${team}/overview`), { icon: Users, subtitle: team }))
    }
    return items
  },
})
