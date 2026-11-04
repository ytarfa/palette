---
title: Adding a site
description: Add commands for a new website in one file.
---

Each site is one file in [`src/plugins/sites`](https://github.com/ytarfa/palette/tree/main/src/plugins/sites), picked up automatically. [`github.ts`](https://github.com/ytarfa/palette/blob/main/src/plugins/sites/github.ts) is a good template, and [`site-kit.ts`](https://github.com/ytarfa/palette/blob/main/src/plugins/site-kit.ts) has the helpers:

```ts
export default defineSite({
  id: "example",
  name: "Example",
  description: "Jump to the dashboard, copy item links",
  url: "https://example.com",
  matches: (url) => url.hostname === "example.com",
  commands: ({ url, tab }) => [
    navigate("dashboard", "Dashboard", "https://example.com/dashboard", { icon: LayoutDashboard }),
    copy("copy-link", "Copy clean link", url.origin + url.pathname, { icon: Link }),
  ],
})
```

## Keep it to the address

Build commands from the tab's `url` and `title` where you can. That way the site needs no extra permissions and keeps working when the site changes its design.

## Test it

Add a test next to it ([`github.test.ts`](https://github.com/ytarfa/palette/blob/main/src/plugins/sites/github.test.ts) shows how) and run:

```sh
pnpm test
```

The new site gets a switch in settings, and shows up in the [site list](../../guides/site-commands/) once you add it there and to the README.
