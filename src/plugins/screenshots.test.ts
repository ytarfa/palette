import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Command } from "@/core/types"
import { commandsFor, context } from "@/test/site"
import screenshots, { dataUrlToBlob, maxCanvasHeight, planSlices, screenshotFilename, slicePixels } from "./screenshots"

const PNG = `data:image/png;base64,${btoa("png")}`
const JPEG = `data:image/jpeg;base64,${btoa("jpeg")}`

describe("screenshotFilename", () => {
  const date = new Date(2026, 0, 5, 9, 7)

  it("uses the page title and the local date and time", () => {
    expect(screenshotFilename({ title: "Pricing — Acme", url: "https://acme.com/pricing" }, "png", date)).toBe(
      "Pricing — Acme 2026-01-05 09.07.png",
    )
    expect(screenshotFilename({ title: "Docs" }, "jpg", date)).toBe("Docs 2026-01-05 09.07.jpg")
  })

  it("drops characters file systems don't allow", () => {
    expect(screenshotFilename({ title: ' a/b: "c" | d?* <e>\\ ' }, "png", date)).toBe("a b c d e 2026-01-05 09.07.png")
    expect(screenshotFilename({ title: "...hidden." }, "png", date)).toBe("hidden 2026-01-05 09.07.png")
  })

  it("falls back to the host, then to “Screenshot”", () => {
    expect(screenshotFilename({ title: "  ", url: "https://www.example.com/a" }, "png", date)).toBe(
      "www.example.com 2026-01-05 09.07.png",
    )
    expect(screenshotFilename(undefined, "png", date)).toBe("Screenshot 2026-01-05 09.07.png")
  })

  it("shortens long titles", () => {
    const name = screenshotFilename({ title: "x".repeat(300) }, "png", date)
    expect(name).toBe(`${"x".repeat(100)} 2026-01-05 09.07.png`)
  })
})

describe("planSlices", () => {
  it("cuts the page into viewport-sized slices, the last one shorter", () => {
    expect(planSlices(2500, 1000)).toEqual({
      height: 2500,
      clamped: false,
      slices: [
        { top: 0, height: 1000 },
        { top: 1000, height: 1000 },
        { top: 2000, height: 500 },
      ],
    })
    expect(planSlices(2000, 1000).slices).toEqual([
      { top: 0, height: 1000 },
      { top: 1000, height: 1000 },
    ])
  })

  it("takes one slice for pages that don't scroll", () => {
    expect(planSlices(800, 800).slices).toEqual([{ top: 0, height: 800 }])
  })

  it("cuts off pages taller than the maximum", () => {
    const plan = planSlices(10_000, 1000, 2400)
    expect(plan.clamped).toBe(true)
    expect(plan.height).toBe(2400)
    expect(plan.slices.at(-1)).toEqual({ top: 2000, height: 400 })
  })
})

describe("slicePixels", () => {
  it("takes the bottom of the last capture, since the page stops scrolling early", () => {
    // 2500px page, 1000px viewport: the last slice starts at 2000, but the page only scrolls to 1500.
    expect(slicePixels({ top: 2000, height: 500 }, 1500, 1000, 2)).toEqual({ sy: 1000, dy: 4000, height: 1000 })
  })

  it("takes whole captures when the page scrolls to the slice", () => {
    expect(slicePixels({ top: 1000, height: 1000 }, 1000, 1000, 1)).toEqual({ sy: 0, dy: 1000, height: 1000 })
  })

  it("leaves no gaps at fractional scales", () => {
    const { slices } = planSlices(2333, 777)
    const pixels = slices.map((slice) => slicePixels(slice, Math.min(slice.top, 2333 - 777), 777, 1.25))
    for (let i = 1; i < pixels.length; i++) {
      expect(pixels[i].dy).toBe(pixels[i - 1].dy + pixels[i - 1].height)
    }
    expect(pixels.at(-1)!.dy + pixels.at(-1)!.height).toBe(Math.round(2333 * 1.25))
  })

  it("never reads past the capture", () => {
    // The page scrolled less than expected (it got shorter while capturing).
    expect(slicePixels({ top: 1000, height: 1000 }, 500, 1000, 1)).toEqual({ sy: 500, dy: 1000, height: 500 })
  })
})

describe("maxCanvasHeight", () => {
  it("keeps the canvas under Chrome's area and side limits", () => {
    expect(maxCanvasHeight(1000)).toBe(65_500)
    expect(maxCanvasHeight(16_384)).toBe(16_384)
    expect(maxCanvasHeight(1000) * 1000).toBeLessThanOrEqual(268_435_456)
  })
})

describe("dataUrlToBlob", () => {
  it("decodes the data and keeps the type", async () => {
    const blob = dataUrlToBlob(PNG)
    expect(blob.type).toBe("image/png")
    expect(await blob.text()).toBe("png")
  })
})

describe("screenshots plugin", () => {
  let captureVisibleTab: ReturnType<typeof vi.fn>
  let write: ReturnType<typeof vi.fn>

  beforeEach(() => {
    captureVisibleTab = vi.fn(async (_windowId: number, options: { format: string }) =>
      options.format === "jpeg" ? JPEG : PNG,
    )
    write = vi.fn(async (items: { items: Record<string, Promise<Blob>> }[]) => {
      await items[0].items["image/png"]
    })
    vi.stubGlobal("chrome", { tabs: { captureVisibleTab } })
    vi.stubGlobal("navigator", { clipboard: { write } })
    vi.stubGlobal(
      "ClipboardItem",
      class {
        items: Record<string, Promise<Blob>>
        constructor(items: Record<string, Promise<Blob>>) {
          this.items = items
        }
      },
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  const item = async (id: string, url = "https://example.com/a") =>
    (await commandsFor(screenshots, url)).find((c) => c.id === id) as Command

  it("lists the commands on web pages only", async () => {
    expect((await commandsFor(screenshots, "https://example.com")).map((c) => c.id)).toEqual([
      "copy-visible",
      "copy-full-page",
      "save-visible",
      "save-full-page",
    ])
    expect((await commandsFor(screenshots, "https://example.com")).every((c) => c.group === "Screenshot")).toBe(true)
    expect(await commandsFor(screenshots, "chrome://extensions")).toEqual([])
    expect(await commandsFor(screenshots, "file:///tmp/a.html")).toEqual([])
  })

  it("copies the visible area as a PNG, starting the clipboard write before the palette is hidden", async () => {
    const events: string[] = []
    write.mockImplementation(async (items: { items: Record<string, Promise<Blob>> }[]) => {
      events.push("write")
      const blob = await items[0].items["image/png"]
      expect(blob.type).toBe("image/png")
    })
    captureVisibleTab.mockImplementation(async () => {
      events.push("capture")
      return PNG
    })
    const ctx = Object.assign(context("https://example.com"), {
      conceal: vi.fn(async () => {
        events.push("conceal")
        await Promise.resolve()
        events.push("concealed")
      }),
    })
    await (await item("copy-visible")).run!(ctx)
    expect(events).toEqual(["conceal", "write", "concealed", "capture"])
    expect(captureVisibleTab).toHaveBeenCalledWith(1, expect.objectContaining({ format: "png" }))
  })

  it("retries when Chrome's capture quota is exceeded", async () => {
    vi.useFakeTimers()
    captureVisibleTab
      .mockRejectedValueOnce(new Error("This request exceeds the MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND quota."))
      .mockResolvedValueOnce(PNG)
    const done = (await item("copy-visible")).run!(context("https://example.com"))
    await vi.runAllTimersAsync()
    await done
    expect(captureVisibleTab).toHaveBeenCalledTimes(2)
    expect(write).toHaveBeenCalledTimes(1)
  })

  it("saves through a download link, as PNG or JPG", async () => {
    vi.useFakeTimers()
    const link = { href: "", download: "", click: vi.fn(), remove: vi.fn() }
    vi.stubGlobal("document", { createElement: () => link, body: { append: vi.fn() } })
    const ctx = context("https://example.com/a", { title: "Example" })
    const formats = await (await item("save-visible")).children!.items(ctx)
    expect(formats.map((f) => f.id)).toEqual(["png", "jpg"])

    const saved = formats[1].run!(ctx)
    await vi.runAllTimersAsync()
    await saved
    expect(captureVisibleTab).toHaveBeenLastCalledWith(1, expect.objectContaining({ format: "jpeg", quality: 92 }))
    expect(link.download).toMatch(/^Example \d{4}-\d{2}-\d{2} \d{2}\.\d{2}\.jpg$/)
    expect(link.href).toMatch(/^blob:/)
    expect(link.click).toHaveBeenCalled()
  })

  describe("full page", () => {
    let calls: { name: string; args: unknown[] }[]
    let draws: number[][]
    let canvases: { width: number; height: number }[]

    beforeEach(() => {
      vi.useFakeTimers()
      calls = []
      draws = []
      canvases = []
      // A 2000px page in an 800px viewport (985px wide without the scrollbar), at 2x.
      const results: Record<string, (...args: never[]) => unknown> = {
        preparePage: () => ({ innerWidth: 1000, viewportWidth: 985, viewportHeight: 800, pageHeight: 2000, dpr: 2 }),
        scrollPage: (top: number) => Math.min(top, 1200),
        restorePage: () => undefined,
      }
      const executeScript = vi.fn(async ({ func, args = [] }: { func: { name: string }; args?: never[] }) => {
        calls.push({ name: func.name, args })
        return [{ result: results[func.name](...args) }]
      })
      vi.stubGlobal("chrome", { tabs: { captureVisibleTab, get: async () => ({ active: true }) }, scripting: { executeScript } })
      vi.stubGlobal("createImageBitmap", async () => ({ width: 2000, height: 1600, close: () => {} }))
      vi.stubGlobal(
        "OffscreenCanvas",
        class {
          width: number
          height: number
          constructor(width: number, height: number) {
            this.width = width
            this.height = height
            canvases.push({ width, height })
          }
          getContext() {
            return { drawImage: (_image: unknown, ...rect: number[]) => void draws.push(rect) }
          }
          async convertToBlob({ type }: { type: string }) {
            return new Blob([], { type })
          }
        },
      )
    })

    const runFullPage = async () => {
      const done = Promise.resolve((await item("copy-full-page")).run!(context("https://example.com")))
      const result = done.then(
        () => undefined,
        (error: unknown) => error,
      )
      await vi.runAllTimersAsync()
      return result
    }

    it("scrolls a viewport at a time, hides fixed elements after the first, and stitches", async () => {
      expect(await runFullPage()).toBeUndefined()
      expect(calls.map((c) => [c.name, ...c.args])).toEqual([
        ["preparePage"],
        ["scrollPage", 0, false],
        ["scrollPage", 800, true],
        ["scrollPage", 1600, true],
        ["restorePage"],
      ])
      expect(canvases).toEqual([{ width: 1970, height: 4000 }])
      // sx, sy, width, height, dx, dy, width, height. The last capture is scrolled to 1200, not 1600.
      expect(draws).toEqual([
        [0, 0, 1970, 1600, 0, 0, 1970, 1600],
        [0, 0, 1970, 1600, 0, 1600, 1970, 1600],
        [0, 800, 1970, 800, 0, 3200, 1970, 800],
      ])
      expect(captureVisibleTab).toHaveBeenCalledTimes(3)
      expect(write).toHaveBeenCalledTimes(1)
    })

    it("restores the page when a capture fails", async () => {
      captureVisibleTab.mockResolvedValueOnce(PNG).mockRejectedValueOnce(new Error("Cannot access contents of the page"))
      expect(await runFullPage()).toEqual(new Error("Cannot access contents of the page"))
      expect(calls.at(-1)?.name).toBe("restorePage")
    })
  })
})
