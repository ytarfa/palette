import { beforeEach, describe, expect, it } from "vitest"
import { commandsFor, context, mockChrome, run, titles } from "@/test/site"
import vercel, { parse } from "./vercel"

const PROJECT = "https://vercel.com/acme/storefront"
const DEPLOYMENT = "https://vercel.com/acme/storefront/233NRGRjVZX1caZrXWtz5g1TAksD"

let chrome: ReturnType<typeof mockChrome>
beforeEach(() => {
  chrome = mockChrome()
})

describe("vercel", () => {
  it("only runs on vercel.com", async () => {
    expect(await commandsFor(vercel, "https://vercel.com.evil.com/acme/storefront")).toEqual([])
    expect(await commandsFor(vercel, "https://evilvercel.com/acme/storefront")).toEqual([])
    expect(await commandsFor(vercel, "https://storefront.vercel.app")).toEqual([])
    expect(await commandsFor(vercel, DEPLOYMENT)).not.toEqual([])
  })

  it("parses teams, projects and deployments", () => {
    expect(parse(new URL(DEPLOYMENT))).toEqual({ team: "acme", project: "storefront", deployment: "dpl_233NRGRjVZX1caZrXWtz5g1TAksD" })
    expect(parse(new URL(`${PROJECT}/speed-insights`))).toEqual({ team: "acme", project: "storefront", deployment: undefined })
    expect(parse(new URL(`${PROJECT}/settings/environment-variables`)).deployment).toBeUndefined()
    expect(parse(new URL("https://vercel.com/acme/~/settings/members"))).toEqual({ team: "acme" })
    expect(parse(new URL("https://vercel.com/acme"))).toEqual({ team: "acme" })
    expect(parse(new URL("https://vercel.com/docs/deployments/logs"))).toEqual({})
    expect(parse(new URL("https://vercel.com/new/acme"))).toEqual({})
  })

  it("lists deployment, then project, then team commands", async () => {
    const items = await commandsFor(vercel, DEPLOYMENT)
    expect(titles(items)).toEqual([
      "Copy deployment ID",
      "Copy build logs command",
      "Project overview",
      "Deployments",
      "Logs",
      "Analytics",
      "Speed Insights",
      "Observability",
      "Project settings",
      "Domains",
      "Environment variables",
      "Team overview",
      "Team settings",
      "Usage",
      "Dashboard",
      "New project",
    ])
    expect(items.every((i) => i.group === "Vercel")).toBe(true)
  })

  it("copies the deployment ID and a build logs command", async () => {
    const items = await commandsFor(vercel, DEPLOYMENT)
    expect((await run(items, "deployment-id")).copied).toEqual(["dpl_233NRGRjVZX1caZrXWtz5g1TAksD"])
    expect((await run(items, "deployment-logs")).copied).toEqual([
      "vercel inspect dpl_233NRGRjVZX1caZrXWtz5g1TAksD --logs --scope acme",
    ])
  })

  it("navigates to project pages, or a new tab with ⌘↵", async () => {
    const items = await commandsFor(vercel, `${PROJECT}/deployments`)
    expect(titles(items)).not.toContain("Copy deployment ID")
    await run(items, "domains")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: `${PROJECT}/settings/domains` })
    await run(items, "env")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: `${PROJECT}/settings/environment-variables` })
    await run(items, "speed-insights")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: `${PROJECT}/speed-insights` })
    await items.find((i) => i.id === "observability")!.actions![0].run(context(PROJECT))
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: `${PROJECT}/observability` })
  })

  it("offers team pages on team URLs", async () => {
    const items = await commandsFor(vercel, "https://vercel.com/acme/~/usage")
    expect(titles(items)).toEqual(["Team overview", "Team settings", "Usage", "Dashboard", "New project"])
    await run(items, "team-settings")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: "https://vercel.com/acme/~/settings" })
    await run(items, "usage")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: "https://vercel.com/acme/~/usage" })
  })

  it("only offers site-wide pages outside the dashboard", async () => {
    const items = await commandsFor(vercel, "https://vercel.com/docs/environment-variables")
    expect(titles(items)).toEqual(["Dashboard", "New project"])
    await run(items, "new-project")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: "https://vercel.com/new" })
  })
})
