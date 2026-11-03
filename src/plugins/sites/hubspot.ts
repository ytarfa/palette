import {
  Building2,
  Contact,
  Copy,
  Handshake,
  Hash,
  Inbox,
  LayoutDashboard,
  Link,
  ListTodo,
  Search,
  Settings,
  Ticket,
} from "lucide-react"
import type { Command } from "@/core/types"
import { copy, defineSite, markdownLink, navigate } from "../site-kit"

// app.hubspot.com (US East, na1) and data center hosts like app-eu1, app-na2, app-na3, app-ap1.
const HOST = /^app(-[a-z]{2}\d+)?\.hubspot\.com$/

/** Standard CRM object type IDs, as in `/record/0-3/<id>`. */
export const OBJECTS: Record<string, string> = { "0-1": "Contact", "0-2": "Company", "0-3": "Deal", "0-5": "Ticket" }

// Older record URLs: /contacts/<portalId>/deal/<id>
const LEGACY: Record<string, string> = { contact: "0-1", company: "0-2", deal: "0-3", ticket: "0-5" }

/** Portal (account) ID and CRM record from an app.hubspot.com URL. */
export function parse(url: URL) {
  const [app, portal, kind, a, b] = url.pathname.split("/").filter(Boolean)
  if (!app || !/^\d+$/.test(portal ?? "")) return {}
  let type: string | undefined
  let id: string | undefined
  if (app === "contacts" && kind === "record" && Object.hasOwn(OBJECTS, a)) [type, id] = [a, b]
  else if (app === "contacts" && Object.hasOwn(LEGACY, kind)) [type, id] = [LEGACY[kind], a]
  const record = type && id && /^\d+$/.test(id) ? { type, id, name: OBJECTS[type] } : undefined
  return { portal, record }
}

/** "Acme Corp | HubSpot" → "Acme Corp" */
export function cleanTitle(title = "") {
  return title
    .replace(/^\(\d+\)\s*/, "")
    .replace(/\s+[|·–-]\s+HubSpot$/i, "")
    .trim()
}

export default defineSite({
  id: "hubspot",
  name: "HubSpot",
  description: "Jump to CRM lists, tasks and inbox, copy record IDs and links",
  url: "https://app.hubspot.com",
  matches: (url) => url.protocol === "https:" && HOST.test(url.hostname),

  commands({ url, tab }) {
    const { portal, record } = parse(url)
    if (!portal) return []
    // Accounts live in one data center: keep links on the same host.
    const hubspot = (path: string) => `${url.origin}${path}`
    const items: Command[] = []

    if (record) {
      const link = hubspot(`/contacts/${portal}/record/${record.type}/${record.id}`)
      const subtitle = `${record.name} ${record.id}`
      const keywords = [record.name.toLowerCase()]
      const name = cleanTitle(tab?.title) || subtitle
      items.push(
        copy("record-id", "Copy record ID", record.id, { icon: Hash, subtitle, keywords }),
        copy("record-link", "Copy record link", link, { icon: Link, subtitle, keywords }),
        copy("record-markdown", "Copy record as Markdown link", markdownLink(name, link), { icon: Copy, subtitle, keywords }),
      )
    }

    const objects = (type: string, view: "list" | "board") => hubspot(`/contacts/${portal}/objects/${type}/views/all/${view}`)
    items.push(
      navigate("contacts", "Contacts", objects("0-1", "list"), { icon: Contact }),
      navigate("companies", "Companies", objects("0-2", "list"), { icon: Building2 }),
      navigate("deals", "Deals", objects("0-3", "board"), { icon: Handshake }),
      navigate("tickets", "Tickets", objects("0-5", "list"), { icon: Ticket }),
      navigate("tasks", "Tasks", hubspot(`/tasks/${portal}/view/all`), { icon: ListTodo }),
      navigate("inbox", "Inbox", hubspot(`/live-messages/${portal}/inbox`), { icon: Inbox, keywords: ["conversations"] }),
      navigate("dashboards", "Dashboards", hubspot(`/reports-dashboard/${portal}`), { icon: LayoutDashboard, keywords: ["reports"] }),
      navigate("settings", "Settings", hubspot(`/settings/${portal}`), { icon: Settings }),
    )
    return items
  },

  search({ url, query }) {
    const { portal } = parse(url)
    if (!portal) return []
    const q = query.trim()
    return [navigate("search", `Search HubSpot for “${q}”`, `${url.origin}/search/${portal}/search?query=${encodeURIComponent(q)}`, { icon: Search })]
  },
})
