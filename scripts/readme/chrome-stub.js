// Stands in for the extension APIs so the real palette bundle renders outside
// the extension, with a fixed set of demo tabs. Injected into palette.html by
// scripts/render-readme-assets.mjs.
(() => {
  // The caret blinks, so whether it shows up depends on timing. Hide it.
  document.head.append(Object.assign(document.createElement("style"), {
    textContent: "input { caret-color: transparent }",
  }))

  const now = Date.now()
  const tab = (id, title, url, extra = {}) => ({
    id,
    windowId: 1,
    index: id,
    title,
    url,
    lastAccessed: now - id * 60_000,
    ...extra,
  })
  const tabs = [
    tab(1, "Fix checkout race condition by octocat · Pull Request #482 · acme/storefront", "https://github.com/acme/storefront/pull/482"),
    tab(2, "Q4 roadmap", "https://www.notion.so/acme/q4-roadmap"),
    tab(3, "Array.prototype.toSorted() - JavaScript | MDN", "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/toSorted"),
    tab(4, "ENG-1024 Keyboard shortcuts for the palette", "https://linear.app/acme/issue/ENG-1024"),
    tab(5, "Lo-fi beats to code to", "https://www.youtube.com/watch?v=jfKfPfyJRdk", { audible: true }),
    tab(6, "Design system – Figma", "https://www.figma.com/design/acme/design-system"),
    tab(7, "Hacker News", "https://news.ycombinator.com/"),
    tab(0, "Getting started | Vite", "https://vite.dev/guide/", { active: true }),
  ]
  // `?site=github` makes the current tab a GitHub pull request instead.
  if (parent.location.search.includes("site=github")) {
    tabs.forEach((t) => (t.active = false))
    tabs.find((t) => t.id === 1).active = true
  }
  const current = tabs.find((t) => t.active)

  window.chrome = Object.assign(window.chrome || {}, {
    runtime: { id: "readme", getURL: (path) => location.origin + path },
    tabs: { query: async (query) => (query.active ? [current] : tabs) },
    storage: {
      session: { get: async () => ({}), remove: async () => {} },
      local: { get: async () => ({}), set: async () => {} },
    },
  })
})()
