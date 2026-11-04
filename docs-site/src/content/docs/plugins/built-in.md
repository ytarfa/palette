---
title: Built-in plugins
description: Write a plugin that ships inside Palette.
---

Built-in plugins live in [`src/plugins`](https://github.com/ytarfa/palette/tree/main/src/plugins). They run in the palette, which is an extension page, so they call the `chrome.*` APIs directly.

## A command

A command takes a few lines:

```ts
// src/plugins/hello.ts
import { Type } from "lucide-react"
import { definePlugin } from "@/core/types"

export default definePlugin({
  id: "hello",
  name: "Hello",
  commands: [
    {
      id: "copy-title",
      title: "Copy page title",
      group: "Page",
      icon: Type,
      when: (ctx) => !!ctx.tab?.title,
      run: (ctx) => ctx.copy(ctx.tab!.title!),
    },
  ],
})
```

Then add it to the list in [`src/plugins/index.ts`](https://github.com/ytarfa/palette/blob/main/src/plugins/index.ts). The plugin gets a switch in settings, and so does each of its `commands`. Set `enabledByDefault: false` on a plugin or a command to leave it off until the user turns it on.

## A new mode

This one searches bookmarks with `@`. It also needs the `bookmarks` permission in `public/manifest.json`.

```ts
export default definePlugin({
  id: "bookmarks",
  name: "Bookmarks",
  modes: [{ id: "bookmarks", name: "Bookmarks", placeholder: "Search bookmarks…", prefix: "@" }],
  sources: [
    {
      mode: "bookmarks",
      dynamic: true, // reload on every keystroke
      async items(ctx) {
        if (!ctx.query) return []
        const results = await chrome.bookmarks.search(ctx.query)
        return results
          .filter((b) => b.url)
          .map((b) => ({
            id: b.id,
            title: b.title,
            subtitle: b.url,
            run: () => void chrome.tabs.create({ url: b.url }),
          }))
      },
    },
  ],
})
```

The full API is in [`src/core/types.ts`](https://github.com/ytarfa/palette/blob/main/src/core/types.ts).

## Shortcuts next to commands

Chrome doesn't let extensions read its keyboard shortcuts, so the ones in the list come from [`src/config/shortcuts.json`](https://github.com/ytarfa/palette/blob/main/src/config/shortcuts.json). It maps command ids to Chrome's default shortcuts, taken from [Google's list](https://support.google.com/chrome/answer/157179), and plugins don't need to set anything:

```json
{
  "tab-commands:new": "mod+t",
  "tab-commands:back": { "mac": "mod+[", "other": "alt+arrowleft" }
}
```

`mod` is ⌘ on macOS and Ctrl elsewhere. Write `plus`, `minus` and `comma` for those keys. These shortcuts are only displayed: pressing them is still handled by Chrome.
