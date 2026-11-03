import { beforeEach, describe, expect, it } from "vitest"
import { commandsFor, context, mockChrome, run, searchFor, titles } from "@/test/site"
import localhost, { isLocal, parsePort, portOf, withPort } from "./localhost"

const APP = "http://localhost:5173/settings/profile?tab=security#password"

let chrome: ReturnType<typeof mockChrome>
beforeEach(() => {
  chrome = mockChrome()
})

const ports = async (url: string) => {
  const item = (await commandsFor(localhost, url)).find((i) => i.id === "port")!
  return item.children!.items(context(url))
}

describe("localhost", () => {
  it("matches local dev servers only", () => {
    for (const url of [
      "http://localhost:3000/",
      "https://localhost/",
      "http://app.localhost:8080/login",
      "http://127.0.0.1:8000/admin/",
      "http://0.0.0.0:4200/",
      "http://[::1]:5173/",
    ]) {
      expect(isLocal(new URL(url)), url).toBe(true)
    }
    for (const url of [
      "https://localhost.example.com/",
      "https://evil-localhost.com/",
      "http://127.0.0.2:3000/",
      "http://192.168.1.20:3000/",
      "file:///Users/me/index.html",
      "ws://localhost:5173/",
    ]) {
      expect(isLocal(new URL(url)), url).toBe(false)
    }
  })

  it("only runs on local URLs", async () => {
    expect(await commandsFor(localhost, "https://example.com")).toEqual([])
  })

  it("parses ports", () => {
    expect(portOf(new URL(APP))).toBe(5173)
    expect(portOf(new URL("https://localhost/"))).toBe(443)
    expect(parsePort("3000")).toBe(3000)
    expect(parsePort(" :8080 ")).toBe(8080)
    expect(parsePort("0")).toBeUndefined()
    expect(parsePort("70000")).toBeUndefined()
    expect(parsePort("vite")).toBeUndefined()
    expect(withPort(new URL("http://[::1]:3000/a?b=1#c"), 4200)).toBe("http://[::1]:4200/a?b=1#c")
  })

  it("lists commands for a dev server page", async () => {
    const items = await commandsFor(localhost, APP)
    expect(titles(items)).toEqual([
      "Open on port…",
      "Switch to HTTPS",
      "Switch to 127.0.0.1",
      "Copy URL with 127.0.0.1",
      "Go to root",
    ])
    expect(items.every((i) => i.group === "Localhost")).toBe(true)
  })

  it("opens the same page on another port, marking the current one", async () => {
    const items = await ports(APP)
    expect(items.find((i) => i.id === "port-5173")).toMatchObject({ subtitle: "Vite", hint: "Current" })
    expect(items.find((i) => i.id === "port-3000")).toMatchObject({ subtitle: "Next.js / React", hint: undefined })
    expect(items.filter((i) => i.hint)).toHaveLength(1)
    await run(items, "port-4200")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: "http://localhost:4200/settings/profile?tab=security#password" })
  })

  it("adds an unlisted current port", async () => {
    const items = await ports("http://localhost:9123/")
    expect(items.at(-1)).toMatchObject({ id: "port-9123", title: "Port 9123", hint: "Current" })
  })

  it("switches protocol and host, keeping port and path", async () => {
    const items = await commandsFor(localhost, APP)
    await run(items, "protocol")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: "https://localhost:5173/settings/profile?tab=security#password" })
    await run(items, "host")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: "http://127.0.0.1:5173/settings/profile?tab=security#password" })

    const back = await commandsFor(localhost, "https://127.0.0.1:8443/api/health")
    expect(titles(back)).toEqual(["Open on port…", "Switch to HTTP", "Switch to localhost", "Go to root"])
    await run(back, "host")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: "https://localhost:8443/api/health" })
  })

  it("copies the URL with 127.0.0.1", async () => {
    const { copied } = await run(await commandsFor(localhost, APP), "copy-ip")
    expect(copied).toEqual(["http://127.0.0.1:5173/settings/profile?tab=security#password"])
  })

  it("keeps the host on localhost subdomains", async () => {
    const items = await commandsFor(localhost, "http://admin.localhost:3000/")
    expect(titles(items)).toEqual(["Open on port…", "Switch to HTTPS"])
  })

  it("goes to the root of the dev server", async () => {
    await run(await commandsFor(localhost, APP), "root")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: "http://localhost:5173/" })
    expect(titles(await commandsFor(localhost, "http://localhost:5173/"))).not.toContain("Go to root")
  })

  it("offers to open a typed port", async () => {
    const items = await searchFor(localhost, APP, "8080")
    expect(titles(items)).toEqual(["Open on port 8080"])
    expect(items.every((i) => i.alwaysShow)).toBe(true)
    await run(items, "open-port")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: "http://localhost:8080/settings/profile?tab=security#password" })
    expect(await searchFor(localhost, APP, "vite")).toEqual([])
    expect(await searchFor(localhost, APP, "99999")).toEqual([])
  })
})
