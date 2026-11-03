import {
  BookOpen,
  Boxes,
  Copy,
  FileCode,
  FolderOpen,
  HardDrive,
  Search,
  ShieldCheck,
  Tags,
  Terminal,
  TrendingUp,
  Users,
  Weight,
} from "lucide-react"
import { copy, defineSite, navigate, openInNewTab } from "../site-kit"

/**
 * Package and version from an npmjs.com URL:
 * `/package/react`, `/package/@babel/core`, `/package/@babel/core/v/7.24.0`.
 */
export function parse(url: URL): { name?: string; version?: string } {
  let path: string
  try {
    path = decodeURIComponent(url.pathname)
  } catch {
    return {}
  }
  const [root, first, ...rest] = path.split("/").filter(Boolean)
  if (root !== "package" || !first) return {}
  const scoped = first.startsWith("@")
  if (scoped && !rest[0]) return {}
  const name = scoped ? `${first}/${rest.shift()}` : first
  const version = rest[0] === "v" && rest[1] ? rest[1] : undefined
  return { name, version }
}

/** "react" + "18.2.0" → "react@18.2.0", for install commands and versioned tools. */
export const spec = (name: string, version?: string) => (version ? `${name}@${version}` : name)

const npm = (path: string) => `https://www.npmjs.com${path}`

export default defineSite({
  id: "npm",
  name: "npm",
  description: "Copy install commands, jump to package tabs, check bundle size and security",
  url: "https://www.npmjs.com",
  matches: (url) => url.hostname === "www.npmjs.com" || url.hostname === "npmjs.com",

  commands({ url }) {
    const { name, version } = parse(url)
    if (!name) return []
    const pkg = spec(name, version)
    const page = npm(`/package/${name}`)
    const versioned = version ? `${page}/v/${version}` : page
    const tab = (base: string, activeTab: string) => `${base}?activeTab=${activeTab}`
    const subtitle = pkg

    return [
      copy("install-npm", "Copy install command", `npm i ${pkg}`, { icon: Terminal }),
      copy("install-pnpm", "Copy pnpm install command", `pnpm add ${pkg}`, { icon: Terminal }),
      copy("install-yarn", "Copy yarn install command", `yarn add ${pkg}`, { icon: Terminal }),
      copy("install-bun", "Copy bun install command", `bun add ${pkg}`, { icon: Terminal }),
      copy("copy-name", "Copy package name", name, { icon: Copy }),
      navigate("readme", "Readme", tab(versioned, "readme"), { icon: BookOpen, subtitle }),
      navigate("versions", "Versions", tab(page, "versions"), { icon: Tags, subtitle: name }),
      navigate("dependencies", "Dependencies", tab(versioned, "dependencies"), { icon: Boxes, subtitle }),
      navigate("dependents", "Dependents", tab(page, "dependents"), { icon: Users, subtitle: name }),
      navigate("code", "Code", tab(versioned, "code"), { icon: FileCode, subtitle }),
      openInNewTab("bundlephobia", "Bundle size", `https://bundlephobia.com/package/${pkg}`, {
        icon: Weight,
        subtitle: "Bundlephobia",
      }),
      openInNewTab("packagephobia", "Install size", `https://packagephobia.com/result?p=${encodeURIComponent(pkg)}`, {
        icon: HardDrive,
        subtitle: "Packagephobia",
      }),
      openInNewTab("unpkg", "Browse files", `https://app.unpkg.com/${pkg}`, { icon: FolderOpen, subtitle: "unpkg" }),
      openInNewTab("npmtrends", "Download trends", `https://npmtrends.com/${name}`, {
        icon: TrendingUp,
        subtitle: "npm trends",
      }),
      openInNewTab(
        "socket",
        "Security report",
        `https://socket.dev/npm/package/${name}${version ? `/overview/${version}` : ""}`,
        { icon: ShieldCheck, subtitle: "Socket" },
      ),
    ]
  },

  search({ query }) {
    const q = query.trim()
    return [navigate("search", `Search npm for “${q}”`, npm(`/search?q=${encodeURIComponent(q)}`), { icon: Search })]
  },
})
