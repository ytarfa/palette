import { ArrowLeftRight, Copy, House, Lock, LockOpen, Plug } from "lucide-react"
import type { Command } from "@/core/types"
import { copy, defineSite, navigate } from "../site-kit"

const LOOPBACK = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]"])

/** Common dev server ports, with the tool that usually runs there. */
export const DEV_PORTS: [number, string][] = [
  [1234, "Parcel"],
  [3000, "Next.js / React"],
  [3001, "Fallback for 3000"],
  [4000, "Phoenix / Jekyll"],
  [4173, "Vite preview"],
  [4200, "Angular"],
  [4321, "Astro"],
  [5000, "Flask"],
  [5173, "Vite"],
  [5174, "Fallback for 5173"],
  [6006, "Storybook"],
  [8000, "Django"],
  [8080, "Vue CLI / webpack"],
  [8081, "Metro"],
  [8888, "Jupyter"],
]

/** Is this a local dev server? localhost, *.localhost, 127.0.0.1, 0.0.0.0 or [::1], over http(s). */
export function isLocal(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false
  return LOOPBACK.has(url.hostname) || url.hostname.endsWith(".localhost")
}

/** The port in use, including the protocol's default. */
export const portOf = (url: URL) => Number(url.port) || (url.protocol === "https:" ? 443 : 80)

/** A port number typed as "5173" or ":5173", or undefined. */
export function parsePort(query: string) {
  const match = /^:?(\d{1,5})$/.exec(query.trim())
  const port = match ? Number(match[1]) : 0
  return port >= 1 && port <= 65535 ? port : undefined
}

/** `url` with only some parts changed, e.g. `{ port: "5173" }` or `{ hostname: "127.0.0.1" }`. */
export function withParts(url: URL, parts: Partial<Pick<URL, "protocol" | "hostname" | "port" | "pathname">>) {
  const next = new URL(url)
  Object.assign(next, parts)
  return next.toString()
}

export const withPort = (url: URL, port: number) => withParts(url, { port: String(port) })

export default defineSite({
  id: "localhost",
  name: "Localhost",
  description: "Switch ports, protocol and host on local dev servers",
  url: "http://localhost",
  matches: isLocal,

  commands({ url }) {
    const current = portOf(url)
    const ports = new Map(DEV_PORTS)
    if (!ports.has(current)) ports.set(current, "")
    const items: Command[] = [
      {
        id: "port",
        title: "Open on port…",
        subtitle: `Now on ${current}`,
        icon: Plug,
        keywords: ["port", ...DEV_PORTS.map(([, tool]) => tool)],
        children: {
          placeholder: "Pick a port…",
          items: () =>
            [...ports]
              .sort(([a], [b]) => a - b)
              .map(([port, tool]) =>
                navigate(`port-${port}`, `Port ${port}`, withPort(url, port), {
                  icon: Plug,
                  subtitle: tool || undefined,
                  hint: port === current ? "Current" : undefined,
                }),
              ),
        },
      },
    ]

    const https = url.protocol === "https:"
    const otherProtocol = withParts(url, { protocol: https ? "http:" : "https:" })
    items.push(
      navigate("protocol", https ? "Switch to HTTP" : "Switch to HTTPS", otherProtocol, {
        icon: https ? LockOpen : Lock,
        subtitle: new URL(otherProtocol).origin,
      }),
    )

    // Subdomains of localhost are usually virtual hosts: swapping the host would lose them.
    const subdomain = url.hostname.endsWith(".localhost")
    if (!subdomain) {
      const host = url.hostname === "localhost" ? "127.0.0.1" : "localhost"
      const swapped = withParts(url, { hostname: host })
      items.push(navigate("host", `Switch to ${host}`, swapped, { icon: ArrowLeftRight, subtitle: new URL(swapped).host }))
    }
    if (!subdomain && url.hostname !== "127.0.0.1") {
      items.push(copy("copy-ip", "Copy URL with 127.0.0.1", withParts(url, { hostname: "127.0.0.1" }), { icon: Copy }))
    }

    if (url.pathname !== "/" || url.search || url.hash) {
      items.push(navigate("root", "Go to root", `${url.origin}/`, { icon: House, subtitle: url.host }))
    }
    return items
  },

  search({ url, query }) {
    const port = parsePort(query)
    if (!port) return []
    const target = withPort(url, port)
    return [navigate("open-port", `Open on port ${port}`, target, { icon: Plug, subtitle: new URL(target).host })]
  },
})
