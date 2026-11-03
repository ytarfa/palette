import { beforeEach, describe, expect, it } from "vitest"
import { commandsFor, context, mockChrome, run, searchFor, titles } from "@/test/site"
import hubspot, { cleanTitle, parse } from "./hubspot"

const DEAL = "https://app.hubspot.com/contacts/4628060/record/0-3/18467235901?eschref=%2Fcontacts%2F4628060%2Fobjects%2F0-3%2Fviews%2Fall%2Fboard"
const DEAL_LINK = "https://app.hubspot.com/contacts/4628060/record/0-3/18467235901"
const DEAL_TITLE = "Acme Corp - Annual renewal | HubSpot"
const EU_CONTACT = "https://app-eu1.hubspot.com/contacts/26458113/record/0-1/95201"

let chrome: ReturnType<typeof mockChrome>
beforeEach(() => {
  chrome = mockChrome()
})

describe("hubspot", () => {
  it("runs on app.hubspot.com and regional app hosts only", async () => {
    for (const host of ["app.hubspot.com", "app-eu1.hubspot.com", "app-na2.hubspot.com", "app-na3.hubspot.com", "app-ap1.hubspot.com"]) {
      expect(await commandsFor(hubspot, `https://${host}/contacts/4628060/objects/0-1/views/all/list`)).not.toEqual([])
    }
    for (const url of [
      "https://www.hubspot.com/products/crm",
      "https://knowledge.hubspot.com/records/work-with-records",
      "https://api.hubspot.com/contacts/4628060",
      "https://app.hubspot.com.evil.com/contacts/4628060",
      "https://app-eu1.hubspot.com.evil.com/contacts/4628060",
      "https://evil-app.hubspot.com/contacts/4628060",
    ]) {
      expect(await commandsFor(hubspot, url)).toEqual([])
    }
  })

  it("needs a portal ID", async () => {
    expect(await commandsFor(hubspot, "https://app.hubspot.com/login")).toEqual([])
    expect(await commandsFor(hubspot, "https://app.hubspot.com/myaccounts-beta")).toEqual([])
  })

  it("parses portals and records, including legacy record URLs", () => {
    expect(parse(new URL(DEAL))).toEqual({ portal: "4628060", record: { type: "0-3", id: "18467235901", name: "Deal" } })
    expect(parse(new URL(EU_CONTACT)).record).toEqual({ type: "0-1", id: "95201", name: "Contact" })
    expect(parse(new URL("https://app.hubspot.com/contacts/4628060/record/0-2/8124410922/view/1")).record?.name).toBe("Company")
    expect(parse(new URL("https://app.hubspot.com/contacts/4628060/record/0-5/2201937714")).record?.name).toBe("Ticket")
    expect(parse(new URL("https://app.hubspot.com/contacts/4628060/deal/18467235901")).record).toEqual({ type: "0-3", id: "18467235901", name: "Deal" })
    expect(parse(new URL("https://app.hubspot.com/contacts/4628060/contact/95201")).record?.name).toBe("Contact")
    expect(parse(new URL("https://app.hubspot.com/contacts/4628060/objects/0-3/views/all/board"))).toEqual({ portal: "4628060", record: undefined })
    expect(parse(new URL("https://app.hubspot.com/reports-dashboard/4628060/view/9301395")).portal).toBe("4628060")
    expect(parse(new URL("https://app.hubspot.com/login"))).toEqual({})
  })

  it("cleans record names from tab titles", () => {
    expect(cleanTitle(DEAL_TITLE)).toBe("Acme Corp - Annual renewal")
    expect(cleanTitle("(3) Jane Cooper | HubSpot")).toBe("Jane Cooper")
    expect(cleanTitle("Jane Cooper")).toBe("Jane Cooper")
  })

  it("lists record commands first on a record", async () => {
    const items = await commandsFor(hubspot, DEAL, { title: DEAL_TITLE })
    expect(titles(items).slice(0, 4)).toEqual(["Copy record ID", "Copy record link", "Copy record as Markdown link", "Contacts"])
    expect(items[0].subtitle).toBe("Deal 18467235901")
    expect(items.every((i) => i.group === "HubSpot")).toBe(true)
  })

  it("copies the record ID, a clean link and a Markdown link", async () => {
    const items = await commandsFor(hubspot, DEAL, { title: DEAL_TITLE })
    expect((await run(items, "record-id")).copied).toEqual(["18467235901"])
    expect((await run(items, "record-link")).copied).toEqual([DEAL_LINK])
    expect((await run(items, "record-markdown")).copied).toEqual([`[Acme Corp - Annual renewal](${DEAL_LINK})`])
  })

  it("normalizes legacy record links", async () => {
    const items = await commandsFor(hubspot, "https://app.hubspot.com/contacts/4628060/deal/18467235901/")
    expect((await run(items, "record-link")).copied).toEqual([DEAL_LINK])
  })

  it("keeps the regional host in links", async () => {
    const items = await commandsFor(hubspot, EU_CONTACT, { title: "Jane Cooper | HubSpot" })
    const link = "https://app-eu1.hubspot.com/contacts/26458113/record/0-1/95201"
    expect((await run(items, "record-markdown")).copied).toEqual([`[Jane Cooper](${link})`])
    await run(items, "deals")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: "https://app-eu1.hubspot.com/contacts/26458113/objects/0-3/views/all/board" })
  })

  it("jumps to portal sections", async () => {
    const page = "https://app.hubspot.com/reports-dashboard/4628060/view/9301395"
    const items = await commandsFor(hubspot, page)
    expect(titles(items)).toEqual(["Contacts", "Companies", "Deals", "Tickets", "Tasks", "Inbox", "Dashboards", "Settings"])
    const urls: Record<string, string> = {
      contacts: "/contacts/4628060/objects/0-1/views/all/list",
      companies: "/contacts/4628060/objects/0-2/views/all/list",
      tickets: "/contacts/4628060/objects/0-5/views/all/list",
      tasks: "/tasks/4628060/view/all",
      inbox: "/live-messages/4628060/inbox",
      dashboards: "/reports-dashboard/4628060",
      settings: "/settings/4628060",
    }
    for (const [id, path] of Object.entries(urls)) {
      await run(items, id)
      expect(chrome.tabs.update).toHaveBeenLastCalledWith(1, { url: `https://app.hubspot.com${path}` })
    }
    await items.find((i) => i.id === "tasks")!.actions![0].run(context(page))
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "https://app.hubspot.com/tasks/4628060/view/all" })
  })

  it("searches the portal", async () => {
    const items = await searchFor(hubspot, DEAL, "acme renewal")
    expect(titles(items)).toEqual(["Search HubSpot for “acme renewal”"])
    expect(items.every((i) => i.alwaysShow)).toBe(true)
    await run(items, "search")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: "https://app.hubspot.com/search/4628060/search?query=acme%20renewal" })
    expect(await searchFor(hubspot, DEAL, "  ")).toEqual([])
    expect(await searchFor(hubspot, "https://app.hubspot.com/login", "acme")).toEqual([])
  })
})
