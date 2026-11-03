import { beforeEach, describe, expect, it, vi } from "vitest"
import { claimFrame, forgetFrame, registerFrame } from "./frames"

beforeEach(() => {
  const store: Record<string, unknown> = {}
  vi.stubGlobal("chrome", {
    storage: {
      session: {
        get: async (key: string) => (key in store ? { [key]: store[key] } : {}),
        set: async (items: Record<string, unknown>) => void Object.assign(store, items),
        remove: async (key: string) => void delete store[key],
      },
    },
  })
})

describe("frame tokens", () => {
  it("hands the token to a frame in the same tab", async () => {
    await registerFrame(1, "secret")
    expect(await claimFrame(1)).toBe("secret")
  })

  it("refuses frames in other tabs", async () => {
    await registerFrame(1, "secret")
    expect(await claimFrame(2)).toBeUndefined()
    expect(await claimFrame(1)).toBe("secret")
  })

  it("hands each token out once", async () => {
    await registerFrame(1, "secret")
    await claimFrame(1)
    expect(await claimFrame(1)).toBeUndefined()
  })

  it("refuses frames when nothing was registered", async () => {
    expect(await claimFrame(1)).toBeUndefined()
  })

  it("keeps the latest registration for a tab", async () => {
    await registerFrame(1, "old")
    await registerFrame(1, "new")
    expect(await claimFrame(1)).toBe("new")
  })

  it("forgets closed tabs", async () => {
    await registerFrame(1, "secret")
    await forgetFrame(1)
    expect(await claimFrame(1)).toBeUndefined()
  })
})
