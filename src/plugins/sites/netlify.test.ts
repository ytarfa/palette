import { beforeEach, describe, expect, it } from "vitest"
import { commandsFor, context, mockChrome, run, titles } from "@/test/site"
import netlify, { parse } from "./netlify"

const PROJECT = "https://app.netlify.com/projects/acme-storefront"
const DEPLOY = `${PROJECT}/deploys/6905f08aa0cf68f7eef4585c`

let chrome: ReturnType<typeof mockChrome>
beforeEach(() => {
  chrome = mockChrome()
})

describe("netlify", () => {
  it("only runs on app.netlify.com", async () => {
    expect(await commandsFor(netlify, "https://app.netlify.com.evil.com/projects/acme-storefront")).toEqual([])
    expect(await commandsFor(netlify, "https://acme-storefront.netlify.app")).toEqual([])
    expect(await commandsFor(netlify, "https://www.netlify.com/projects/acme-storefront")).toEqual([])
    expect(await commandsFor(netlify, PROJECT)).not.toEqual([])
  })

  it("parses projects, legacy site URLs, deploys and teams", () => {
    expect(parse(new URL(DEPLOY))).toEqual({
      site: "acme-storefront",
      base: "/projects/acme-storefront",
      deploy: "6905f08aa0cf68f7eef4585c",
    })
    expect(parse(new URL("https://app.netlify.com/sites/acme-storefront/configuration/env"))).toEqual({
      site: "acme-storefront",
      base: "/sites/acme-storefront",
      deploy: undefined,
    })
    expect(parse(new URL(`${PROJECT}/deploys`)).deploy).toBeUndefined()
    expect(parse(new URL("https://app.netlify.com/teams/acme/overview"))).toEqual({ team: "acme" })
    expect(parse(new URL("https://app.netlify.com/projects/~/configuration/env"))).toEqual({})
    expect(parse(new URL("https://app.netlify.com/user/applications"))).toEqual({})
  })

  it("lists deploy commands first on a deploy", async () => {
    const items = await commandsFor(netlify, DEPLOY)
    expect(titles(items)).toEqual([
      "Open deploy permalink",
      "Copy deploy ID",
      "Open live site",
      "Copy live site URL",
      "Project overview",
      "Deploys",
      "Function logs",
      "Domain management",
      "Environment variables",
      "Project configuration",
      "Forms",
    ])
    expect(items.every((i) => i.group === "Netlify")).toBe(true)
  })

  it("opens and copies the deploy permalink and live site", async () => {
    const items = await commandsFor(netlify, DEPLOY)
    await run(items, "deploy-open")
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "https://6905f08aa0cf68f7eef4585c--acme-storefront.netlify.app" })
    expect((await run(items, "deploy-id")).copied).toEqual(["6905f08aa0cf68f7eef4585c"])
    await run(items, "live-open")
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "https://acme-storefront.netlify.app" })
    expect((await run(items, "live-copy")).copied).toEqual(["https://acme-storefront.netlify.app"])
  })

  it("navigates within the project, or a new tab with ⌘↵", async () => {
    const items = await commandsFor(netlify, `${PROJECT}/overview`)
    expect(titles(items)).not.toContain("Copy deploy ID")
    await run(items, "domains")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: `${PROJECT}/domain-management` })
    await run(items, "env")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: `${PROJECT}/configuration/env` })
    await items.find((i) => i.id === "function-logs")!.actions![0].run(context(PROJECT))
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: `${PROJECT}/logs/functions` })
  })

  it("keeps legacy /sites/ URLs", async () => {
    const items = await commandsFor(netlify, "https://app.netlify.com/sites/acme-storefront/overview")
    await run(items, "forms")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: "https://app.netlify.com/sites/acme-storefront/forms" })
  })

  it("offers the team overview on team pages", async () => {
    const items = await commandsFor(netlify, "https://app.netlify.com/teams/acme/dns")
    expect(titles(items)).toEqual(["Team overview"])
    await run(items, "team")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: "https://app.netlify.com/teams/acme/overview" })
  })
})
