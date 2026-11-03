import { beforeEach, describe, expect, it } from "vitest"
import { commandsFor, context, mockChrome, run, searchFor, titles } from "@/test/site"
import amazon, { cleanTitle, parseAsin, store } from "./amazon"

const PRODUCT = "https://www.amazon.com/Apple-Generation-Cancelling-Transparency-Personalized/dp/B0D1XD1ZV3/ref=sr_1_1?crid=2X4&keywords=airpods&qid=1730000000&sr=8-1&th=1"
const PRODUCT_TITLE = "Amazon.com: Apple AirPods Pro 2 Wireless Earbuds, Active Noise Cancellation : Electronics"
const UK_PRODUCT = "https://www.amazon.co.uk/gp/product/B0CFPJYX7P?psc=1&ref_=ppx_yo2ov_dt_b_product_details"
const UK_TITLE = "Kindle Paperwhite (16 GB) – Our fastest Kindle ever : Amazon.co.uk: Amazon Devices & Accessories"

let chrome: ReturnType<typeof mockChrome>
beforeEach(() => {
  chrome = mockChrome()
})

describe("amazon", () => {
  it("only runs on Amazon storefronts", async () => {
    for (const url of ["https://www.amazon.com/", "https://amazon.de/", "https://www.amazon.co.jp/", "https://www.amazon.com.au/s?k=tea"]) {
      expect((await commandsFor(amazon, url)).length, url).toBeGreaterThan(0)
    }
    for (const url of [
      "https://amazon.com.evil.io/dp/B0D1XD1ZV3",
      "https://notamazon.com/dp/B0D1XD1ZV3",
      "https://www.amazon.co.uk.example.com/",
      "https://aws.amazon.com/s3/",
      "https://console.aws.amazon.com/console/home",
      "https://example.com",
    ]) {
      expect(await commandsFor(amazon, url), url).toEqual([])
    }
  })

  it("finds the store domain", () => {
    expect(store(new URL("https://www.amazon.co.uk/"))).toBe("amazon.co.uk")
    expect(store(new URL("https://amazon.com.mx/"))).toBe("amazon.com.mx")
    expect(store(new URL("https://sellercentral.amazon.com/"))).toBeUndefined()
  })

  it("parses the ASIN from product URLs", () => {
    expect(parseAsin(new URL(PRODUCT))).toBe("B0D1XD1ZV3")
    expect(parseAsin(new URL("https://www.amazon.com/dp/B0D1XD1ZV3"))).toBe("B0D1XD1ZV3")
    expect(parseAsin(new URL(UK_PRODUCT))).toBe("B0CFPJYX7P")
    expect(parseAsin(new URL("https://www.amazon.de/gp/aw/d/3492317090/ref=ox_sc_act_image_1"))).toBe("3492317090")
    expect(parseAsin(new URL("https://www.amazon.com/s?k=airpods"))).toBeUndefined()
    expect(parseAsin(new URL("https://www.amazon.com/dp/B0D1XD1ZV3X"))).toBeUndefined()
  })

  it("cleans product names from tab titles", () => {
    expect(cleanTitle(PRODUCT_TITLE)).toBe("Apple AirPods Pro 2 Wireless Earbuds, Active Noise Cancellation")
    expect(cleanTitle(UK_TITLE)).toBe("Kindle Paperwhite (16 GB) – Our fastest Kindle ever")
    expect(cleanTitle("Der Prozess : Kafka, Franz: Amazon.de: Bücher")).toBe("Der Prozess : Kafka, Franz")
    expect(cleanTitle("Amazon.co.jp: Anker USB-C ケーブル : 家電＆カメラ")).toBe("Anker USB-C ケーブル")
    expect(cleanTitle("Some product")).toBe("Some product")
  })

  it("lists product commands first, then site-wide pages", async () => {
    const items = await commandsFor(amazon, PRODUCT, { title: PRODUCT_TITLE })
    expect(titles(items)).toEqual([
      "Copy short link",
      "Copy ASIN",
      "Copy as Markdown link",
      "Reviews",
      "Price history",
      "Open on another store",
      "Your orders",
      "Cart",
      "Wish lists",
    ])
    expect(items.every((i) => i.group === "Amazon")).toBe(true)
    expect(titles(await commandsFor(amazon, "https://www.amazon.com/s?k=airpods"))).toEqual(["Your orders", "Cart", "Wish lists"])
  })

  it("copies a short link, the ASIN and a Markdown link without tracking", async () => {
    const items = await commandsFor(amazon, PRODUCT, { title: PRODUCT_TITLE })
    expect((await run(items, "copy-link")).copied).toEqual(["https://www.amazon.com/dp/B0D1XD1ZV3"])
    expect((await run(items, "copy-asin")).copied).toEqual(["B0D1XD1ZV3"])
    expect((await run(items, "copy-markdown")).copied).toEqual([
      "[Apple AirPods Pro 2 Wireless Earbuds, Active Noise Cancellation](https://www.amazon.com/dp/B0D1XD1ZV3)",
    ])
  })

  it("keeps the user's store in links", async () => {
    const items = await commandsFor(amazon, UK_PRODUCT, { title: UK_TITLE })
    expect((await run(items, "copy-link")).copied).toEqual(["https://www.amazon.co.uk/dp/B0CFPJYX7P"])
    await run(items, "reviews")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: "https://www.amazon.co.uk/product-reviews/B0CFPJYX7P" })
    await run(items, "orders")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: "https://www.amazon.co.uk/your-orders/orders" })
    await items.find((i) => i.id === "cart")!.actions![0].run(context(UK_PRODUCT))
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "https://www.amazon.co.uk/gp/cart/view.html" })
  })

  it("opens price history on the matching camelcamelcamel site", async () => {
    await run(await commandsFor(amazon, PRODUCT), "price-history")
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "https://camelcamelcamel.com/product/B0D1XD1ZV3" })
    await run(await commandsFor(amazon, UK_PRODUCT), "price-history")
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "https://uk.camelcamelcamel.com/product/B0CFPJYX7P" })
    const japan = await commandsFor(amazon, "https://www.amazon.co.jp/dp/B0D1XD1ZV3")
    expect(japan.map((i) => i.id)).not.toContain("price-history")
  })

  it("opens the product on another store", async () => {
    const items = await commandsFor(amazon, UK_PRODUCT)
    const stores = await items.find((i) => i.id === "other-store")!.children!.items(context(UK_PRODUCT))
    expect(titles(stores)).toContain("Germany")
    expect(titles(stores)).not.toContain("United Kingdom")
    await run(stores, "store-amazon.de")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: "https://www.amazon.de/dp/B0CFPJYX7P" })
  })

  it("searches the current store", async () => {
    const items = await searchFor(amazon, UK_PRODUCT, "usb c cable")
    expect(titles(items)).toEqual(["Search Amazon for “usb c cable”"])
    expect(items.every((i) => i.alwaysShow)).toBe(true)
    await run(items, "search")
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: "https://www.amazon.co.uk/s?k=usb%20c%20cable" })
    expect(await searchFor(amazon, UK_PRODUCT, "  ")).toEqual([])
  })
})
