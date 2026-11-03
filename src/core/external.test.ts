import { beforeEach, describe, expect, it, vi } from "vitest"

type Listener = (changes: Record<string, unknown>, area: string) => void

/** An in-memory chrome.storage.local that fires onChanged like Chrome does. */
function mockStorage(initial: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = structuredClone(initial)
  const listeners: Listener[] = []
  const notify = (keys: string[]) => {
    const changes = Object.fromEntries(keys.map((k) => [k, {}]))
    for (const listener of listeners) listener(changes, "local")
  }
  const local = {
    get: vi.fn(async (keys: string | null) =>
      structuredClone(keys === null ? data : keys in data ? { [keys]: data[keys] } : {}),
    ),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(data, structuredClone(items))
      notify(Object.keys(items))
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      for (const k of [keys].flat()) delete data[k]
      notify([keys].flat())
    }),
  }
  vi.stubGlobal("chrome", {
    storage: { local, onChanged: { addListener: (l: Listener) => listeners.push(l) } },
    action: { setBadgeText: vi.fn(async () => {}) },
  })
  return { data, local }
}

// The module keeps a cache, so each test gets a fresh copy.
const load = () => import("./external")

beforeEach(() => vi.resetModules())

const registration = (extra: Record<string, unknown> = {}) => ({
  name: "Acme",
  commands: [{ id: "a", title: "A" }],
  sources: [],
  ...extra,
})

describe("registrationError", () => {
  it("accepts a normal registration", async () => {
    const { registrationError } = await load()
    expect(registrationError(registration())).toBeUndefined()
    const icon = `data:image/png;base64,${"a".repeat(15_000)}`
    expect(registrationError(registration({ commands: [{ id: "a", title: "A", icon }] }))).toBeUndefined()
  })

  it("rejects icons over 16 KB", async () => {
    const { registrationError } = await load()
    const icon = `data:image/png;base64,${"a".repeat(16_000)}`
    expect(registrationError(registration({ commands: [{ id: "big", title: "A", icon }] }))).toMatch(
      /Icon of command “big” is too large/,
    )
  })

  it("rejects registrations over 256 KB", async () => {
    const { registrationError } = await load()
    const commands = Array.from({ length: 500 }, (_, i) => ({ id: `c${i}`, title: "x".repeat(600) }))
    expect(registrationError(registration({ commands }))).toMatch(/Registration is too large \(\d+ KB/)
  })

  it("counts bytes, not characters", async () => {
    const { registrationError } = await load()
    expect(registrationError(registration({ description: "é".repeat(100_000) }))).toBeUndefined()
    expect(registrationError(registration({ description: "é".repeat(130_000) }))).toMatch(/too large/)
  })
})

describe("cleanItem", () => {
  it("drops icons over 16 KB instead of cutting them", async () => {
    const { cleanItem } = await load()
    const small = `data:image/png;base64,${"a".repeat(100)}`
    const big = `data:image/png;base64,${"a".repeat(16_000)}`
    expect(cleanItem({ id: "a", title: "A", icon: small }, "ext")?.icon).toBe(small)
    expect(cleanItem({ id: "a", title: "A", icon: big }, "ext")?.icon).toBeUndefined()
  })
})

describe("storage", () => {
  it("stores each plugin under its own key", async () => {
    const { data, local } = mockStorage({ "externalPlugin:one": { id: "one", name: "One", status: "allowed" } })
    const { savePlugin, setStatus, removePlugin } = await load()
    expect(await savePlugin("two", registration())).toBe("pending")
    expect(Object.keys(local.set.mock.calls[0][0])).toEqual(["externalPlugin:two"])
    expect(data["externalPlugin:two"]).toMatchObject({ id: "two", name: "Acme", status: "pending" })

    await setStatus("two", "allowed")
    expect(Object.keys(local.set.mock.calls[1][0])).toEqual(["externalPlugin:two"])
    expect(await savePlugin("two", registration({ name: "Acme 2" }))).toBe("allowed")

    await removePlugin("two")
    expect(local.remove).toHaveBeenLastCalledWith(["externalPlugin:two"])
    expect(Object.keys(data)).toEqual(["externalPlugin:one"])
  })

  it("caches the plugin list until storage changes", async () => {
    const { local } = mockStorage({ "externalPlugin:one": { id: "one", name: "One", status: "allowed" } })
    const { getPlugins, setStatus } = await load()
    expect(await getPlugins()).toHaveLength(1)
    await getPlugins()
    await getPlugins()
    expect(local.get).toHaveBeenCalledTimes(1)

    await setStatus("one", "denied")
    expect((await getPlugins())[0].status).toBe("denied")
  })

  it("rereads after another page changes storage", async () => {
    const { local } = mockStorage()
    const { getPlugins } = await load()
    expect(await getPlugins()).toEqual([])
    await local.set({ "externalPlugin:new": { id: "new", name: "New", status: "pending" } })
    expect(await getPlugins()).toHaveLength(1)
    await local.set({ unrelated: 1 })
    await getPlugins()
    expect(local.get).toHaveBeenCalledTimes(2)
  })
})
