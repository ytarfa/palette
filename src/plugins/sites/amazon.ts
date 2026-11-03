import { ChartLine, Copy, Globe, Hash, Heart, Link, MessageSquareText, Package, Search, ShoppingCart } from "lucide-react"
import type { Command } from "@/core/types"
import { copy, defineSite, markdownLink, navigate, openInNewTab } from "../site-kit"

/** Amazon storefronts, by domain. */
export const STORES: Record<string, string> = {
  "amazon.com": "United States",
  "amazon.ca": "Canada",
  "amazon.com.mx": "Mexico",
  "amazon.com.br": "Brazil",
  "amazon.co.uk": "United Kingdom",
  "amazon.ie": "Ireland",
  "amazon.de": "Germany",
  "amazon.fr": "France",
  "amazon.it": "Italy",
  "amazon.es": "Spain",
  "amazon.nl": "Netherlands",
  "amazon.com.be": "Belgium",
  "amazon.se": "Sweden",
  "amazon.pl": "Poland",
  "amazon.com.tr": "Türkiye",
  "amazon.ae": "United Arab Emirates",
  "amazon.sa": "Saudi Arabia",
  "amazon.eg": "Egypt",
  "amazon.co.za": "South Africa",
  "amazon.in": "India",
  "amazon.co.jp": "Japan",
  "amazon.sg": "Singapore",
  "amazon.com.au": "Australia",
}

// camelcamelcamel's price history sites, by Amazon store.
const CAMEL: Record<string, string> = {
  "amazon.com": "camelcamelcamel.com",
  "amazon.ca": "ca.camelcamelcamel.com",
  "amazon.co.uk": "uk.camelcamelcamel.com",
  "amazon.de": "de.camelcamelcamel.com",
  "amazon.fr": "fr.camelcamelcamel.com",
  "amazon.it": "it.camelcamelcamel.com",
  "amazon.es": "es.camelcamelcamel.com",
  "amazon.com.au": "au.camelcamelcamel.com",
}

/** "www.amazon.co.uk" → "amazon.co.uk". Undefined for anything that isn't a storefront. */
export function store(url: URL): string | undefined {
  const domain = url.hostname.replace(/^www\./, "")
  return Object.hasOwn(STORES, domain) ? domain : undefined
}

/** The product's ASIN from /dp/…, /<slug>/dp/…, /gp/product/… or /gp/aw/d/… */
export function parseAsin(url: URL): string | undefined {
  const match = url.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?=[/?]|$)/i)
  return match?.[1].toUpperCase()
}

/**
 * "Amazon.com: Apple AirPods Pro 2 : Electronics" → "Apple AirPods Pro 2"
 * "Kindle Paperwhite : Amazon.co.uk: Amazon Devices" → "Kindle Paperwhite"
 */
export function cleanTitle(title = "") {
  const t = title.trim()
  const suffix = t.replace(/\s*:\s*Amazon\.[a-z.]+\s*:.*$/i, "")
  if (suffix !== t) return suffix.trim()
  const prefix = t.replace(/^Amazon\.[a-z.]+\s*:\s*/i, "")
  if (prefix !== t) return prefix.replace(/\s+:\s+[^:]+$/, "").trim()
  return t
}

export default defineSite({
  id: "amazon",
  name: "Amazon",
  description: "Copy clean product links, check price history and reviews, jump to orders and cart",
  url: "https://www.amazon.com",
  matches: (url) => store(url) !== undefined,

  commands({ url, tab }) {
    const domain = store(url)!
    const amazon = (path: string) => `${url.origin}${path}`
    const asin = parseAsin(url)
    const items: Command[] = []

    if (asin) {
      const link = amazon(`/dp/${asin}`)
      const name = cleanTitle(tab?.title) || asin
      items.push(
        copy("copy-link", "Copy short link", link, { icon: Link }),
        copy("copy-asin", "Copy ASIN", asin, { icon: Hash }),
        copy("copy-markdown", "Copy as Markdown link", markdownLink(name, link), { icon: Copy, subtitle: name }),
        navigate("reviews", "Reviews", amazon(`/product-reviews/${asin}`), { icon: MessageSquareText, subtitle: asin }),
      )
      const camel = CAMEL[domain]
      if (camel) {
        items.push(
          openInNewTab("price-history", "Price history", `https://${camel}/product/${asin}`, {
            icon: ChartLine,
            subtitle: "camelcamelcamel",
            keywords: ["camelcamelcamel", "price tracker"],
          }),
        )
      }
      items.push({
        id: "other-store",
        title: "Open on another store",
        subtitle: asin,
        icon: Globe,
        keywords: ["country", "marketplace"],
        children: {
          placeholder: "Store…",
          items: () =>
            Object.entries(STORES)
              .filter(([other]) => other !== domain)
              .map(([other, country]) =>
                navigate(`store-${other}`, country, `https://www.${other}/dp/${asin}`, { subtitle: other, icon: Globe }),
              ),
        },
      })
    }

    items.push(
      navigate("orders", "Your orders", amazon("/your-orders/orders"), { icon: Package }),
      navigate("cart", "Cart", amazon("/gp/cart/view.html"), { icon: ShoppingCart, keywords: ["basket"] }),
      navigate("wish-lists", "Wish lists", amazon("/hz/wishlist/ls"), { icon: Heart, keywords: ["your lists"] }),
    )
    return items
  },

  search({ url, query }) {
    const q = query.trim()
    return [navigate("search", `Search Amazon for “${q}”`, `${url.origin}/s?k=${encodeURIComponent(q)}`, { icon: Search })]
  },
})
