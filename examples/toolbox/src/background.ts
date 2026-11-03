import { definePalettePlugin, type Item } from "@palette/sdk"

// A wrench, inline so Palette can show it without any network request.
const icon =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
  )

const base64 = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)))

/** Only offer decoding when the result is readable text. */
const tryDecode = (text: string) => {
  try {
    const bytes = Uint8Array.from(atob(text), (c) => c.charCodeAt(0))
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    return /^[\P{C}\s]+$/u.test(decoded) ? decoded : undefined
  } catch {
    return undefined
  }
}

definePalettePlugin({
  name: "Toolbox",
  description: "UUIDs, timestamps and encoders",
  // "Copy tab as…" needs the tab's address and title, the encoders need what's typed.
  access: { tab: "url", query: true },
  commands: [
    {
      id: "uuid",
      title: "Copy new UUID",
      icon,
      run: () => ({ copy: crypto.randomUUID() }),
    },
    {
      id: "iso-time",
      title: "Copy current time",
      subtitle: "ISO 8601",
      icon,
      run: () => ({ copy: new Date().toISOString() }),
    },
    {
      id: "unix-time",
      title: "Copy Unix timestamp",
      icon,
      run: () => ({ copy: String(Math.floor(Date.now() / 1000)) }),
    },
    {
      id: "copy-tab",
      title: "Copy tab as…",
      icon,
      children: {
        placeholder: "Pick a format…",
        items: ({ tab }) => {
          const title = tab?.title ?? ""
          const url = tab?.url ?? ""
          const format = (id: string, name: string, value: string): Item => ({
            id,
            title: name,
            subtitle: value,
            icon,
            run: () => ({ copy: value }),
          })
          return [
            format("markdown", "Markdown link", `[${title}](${url})`),
            format("html", "HTML link", `<a href="${url}">${title}</a>`),
            format("org", "Org-mode link", `[[${url}][${title}]]`),
            format("title", "Title", title),
          ]
        },
      },
    },
  ],
  sources: [
    {
      // Encoders for whatever is typed, e.g. "hello world" → Base64.
      id: "encoders",
      mode: "commands",
      dynamic: true,
      items: ({ query }) => {
        if (!query) return []
        const decoded = tryDecode(query)
        const items: Item[] = [
          { id: "base64", title: "Base64 encode", subtitle: base64(query) },
          { id: "url", title: "URL encode", subtitle: encodeURIComponent(query) },
        ]
        if (decoded) items.push({ id: "base64-decode", title: "Base64 decode", subtitle: decoded })
        return items.map((item) => ({
          ...item,
          icon,
          alwaysShow: true,
          run: () => ({ copy: item.subtitle }),
        }))
      },
    },
  ],
})
