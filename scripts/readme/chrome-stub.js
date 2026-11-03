// Stands in for the extension APIs so the real palette and settings bundles
// render outside the extension, with a fixed set of demo tabs. Injected into
// palette.html and options.html by scripts/render-readme-assets.mjs.
//
// The scene comes from the template's query string:
//   ?site=github  the current tab is a GitHub pull request
//   ?site=mdn     the current tab is an MDN article
//   ?stale        tabs were last used days to months ago
//   ?plugins      two plugins from other extensions, one waiting for approval
(() => {
  const scene = new URLSearchParams(parent.location.search)

  // The caret blinks, so whether it shows up depends on timing. Hide it.
  document.head.append(Object.assign(document.createElement("style"), {
    textContent: "input { caret-color: transparent }",
  }))

  const now = Date.now()
  const MINUTE = 60_000
  const DAY = 24 * 60 * MINUTE
  const tab = (id, title, url, extra = {}) => ({
    id,
    windowId: 1,
    index: id,
    title,
    url,
    lastAccessed: now - id * MINUTE,
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
  const activate = (id) => tabs.forEach((t) => (t.active = t.id === id))
  if (scene.get("site") === "github") activate(1)
  if (scene.get("site") === "mdn") activate(3)
  if (scene.has("stale")) {
    // Days since each tab was last used. The YouTube tab is playing, so it's never stale.
    const ages = { 1: 9, 2: 64, 3: 12, 4: 23, 5: 40, 6: 31, 7: 8 }
    for (const t of tabs) if (ages[t.id]) t.lastAccessed = now - ages[t.id] * DAY - t.id * 37 * MINUTE
  }
  const current = tabs.find((t) => t.active)

  const local = {}
  if (scene.has("plugins")) {
    local["externalPlugin:hkbcfneamgjpdkmlhpcdoodjbjgmkfoo"] = {
      id: "hkbcfneamgjpdkmlhpcdoodjbjgmkfoo",
      name: "Toolbox",
      description: "UUIDs, timestamps and encoders",
      status: "allowed",
      updatedAt: now,
      commands: [{ id: "uuid", title: "Copy new UUID" }],
      sources: [],
      access: { query: true },
      approved: { name: "Toolbox", modes: [], dynamic: false, tab: "none", query: true },
    }
    local["externalPlugin:mfjbcpkhaoiecdlngagnoppfepdbkjhl"] = {
      id: "mfjbcpkhaoiecdlngagnoppfepdbkjhl",
      name: "Pocket Links",
      description: "Save the current page to your reading list",
      status: "pending",
      updatedAt: now,
      commands: [],
      sources: [],
      access: { tab: "url" },
    }
  }

  const area = (data) => ({
    get: async (key) => (key == null ? { ...data } : key in data ? { [key]: data[key] } : {}),
    set: async (items) => void Object.assign(data, items),
    remove: async () => {},
  })
  const event = { addListener() {}, removeListener() {} }

  window.chrome = Object.assign(window.chrome || {}, {
    runtime: {
      id: "readme",
      getURL: (path) => location.origin + path,
      // The only message the palette sends on its own is the frame claim; readme.js tags its messages with this token.
      sendMessage: async () => "readme",
      onMessage: event,
    },
    tabs: { query: async (query) => (query.active ? [current] : tabs) },
    windows: { getAll: async () => [{ id: 1, focused: true }] },
    commands: {
      getAll: async () => [
        { name: "open-tabs", description: "Search open tabs", shortcut: "⌘⇧P" },
        { name: "open-commands", description: "Run a command", shortcut: "⌘⇧K" },
      ],
    },
    action: { setBadgeText: async () => {} },
    storage: {
      session: area({}),
      local: area(local),
      sync: area({}),
      onChanged: event,
    },
  })
})()
