---
title: Plugins in your own extension
description: Add commands to Palette from your own Chrome extension with @palette/sdk.
---

Chrome extensions can't load code from elsewhere, so a Palette plugin can be its own extension. Your extension tells Palette which commands it has. When the user picks one, Palette asks your extension to run it. Your code stays in your extension, with your permissions, and goes through the Chrome Web Store's review like any other extension.

The [`@palette/sdk`](https://github.com/ytarfa/palette/tree/main/packages/sdk) package handles the messaging. Every type is documented in the [SDK reference](../../reference/sdk/readme/).

## Example

```ts
// background.ts, your extension's service worker
import { definePalettePlugin } from "@palette/sdk"

definePalettePlugin({
  name: "Toolbox",
  description: "UUIDs, timestamps and encoders",
  commands: [
    {
      id: "uuid",
      title: "Copy new UUID",
      run: () => ({ copy: crypto.randomUUID() }),
    },
  ],
})
```

That's it. Call `definePalettePlugin` once, at the top level of your service worker.

1. When your extension is installed, it registers its commands with Palette. Palette's toolbar icon shows a badge.
2. <kbd>⌘</kbd><kbd>⇧</kbd><kbd>K</kbd> shows **1 plugin is waiting for approval**, which opens Palette's settings, where the user allows or blocks it.
3. Once allowed, your commands show up in the list. Picking one asks your extension to run it, and it can reply with something for Palette to do, like copying text or opening a page.

A complete example is the [Toolbox plugin](../toolbox/).

## Commands

| Field | |
| --- | --- |
| `id` | Unique within your plugin |
| `title`, `subtitle` | What's shown in the list |
| `icon` | A `data:image/...` URL, or a `chrome-extension://<your id>/...` file listed in your `web_accessible_resources` |
| `keywords` | Extra words to match when searching |
| `group` | Shown after your plugin's name in the group heading, e.g. "My plugin · Email". Built-in names like "Tabs" are ignored |
| `hint` | Muted text on the right |
| `shortcut` | Shortcut shown next to the command, e.g. `"mod+shift+u"`. Display only |
| `alwaysShow` | Show regardless of what's typed |
| `run(ctx)` | Runs in your service worker. Can return an effect, see below |
| `children` | `{ placeholder, items(ctx) }`: open a nested list instead of running |

`ctx` is `{ query, tab }`: what's typed, and the tab the palette was opened from. Both are empty unless you ask for them, see [Access](#access).

### Effects

Service workers can't use the clipboard, and Palette closes after a command runs. Return an effect to have Palette do the last step:

```ts
run: () => ({ copy: "text" })                        // copy to the clipboard (up to 100,000 characters)
run: () => ({ open: "https://example.com" })         // open in the current tab
run: () => ({ open: "https://...", newTab: true })   // or in a new tab
run: () => ({ keepOpen: true })                      // stay open and reload the list
```

Anything else your extension can already do itself, with its own permissions.

## Sources

For items that depend on the current tab or on what's typed, use a source instead of static commands:

```ts
definePalettePlugin({
  name: "Toolbox",
  sources: [
    {
      id: "encoders",
      mode: "commands", // or "tabs" for the ⌘⇧P list
      dynamic: true, // ask again on every keystroke
      items: ({ query }) =>
        query
          ? [{ id: "url", title: "URL encode", subtitle: encodeURIComponent(query), run: () => ({ copy: encodeURIComponent(query) }) }]
          : [],
    },
  ],
})
```

Sources without `dynamic` are asked once each time the palette opens. Dynamic sources need `access.query`, otherwise they're asked once too. Palette waits up to 1.5 seconds for an answer and skips plugins that are slower.

## Access

By default your plugin sees neither the current tab nor what's typed. Declare what you need, and the user sees it when approving your plugin:

```ts
definePalettePlugin({
  name: "Toolbox",
  access: { tab: "url", query: true },
  // ...
})
```

| `access` | `ctx` gets |
| --- | --- |
| `tab: "none"` (default) | No `tab` |
| `tab: "origin"` | `tab.origin` only, e.g. `https://example.com`. Nothing on pages without one, like `chrome://` pages |
| `tab: "url"` | `tab.origin`, `url`, `title`, `id` and `windowId` |
| `query: true` | `query`, what's typed, in every mode your sources list in. Otherwise it's always `""` |

Ask for as little as you can: addresses can carry tokens and other private data.

## Registration and re-approval

- Plugins register when installed or updated, and when the browser starts. If your commands change at runtime, call `register()` on the object `definePalettePlugin` returns.
- The user approves your plugin's name, what its sources can see (the modes they use, and whether any is `dynamic`) and its `access`. Changing commands or descriptions keeps the approval.
- Registering under a new name, with a source in a new mode, with your first `dynamic` source, or with more `access` puts the plugin back to pending until the user allows it again, and `register()` resolves with `status: "pending"`.

## Good to know

- **Text.** Palette removes control, bidi and zero-width characters from every string your plugin sends, then trims it.
- **Palette's ID.** Messages go to `PALETTE_ID`. Pass `paletteId` to point at a different build. Read [Who can send requests](../security/#who-can-send-requests) before relying on it.
- **Protocol.** Messages are plain JSON with a `palette` version field, defined in [`src/protocol.ts`](https://github.com/ytarfa/palette/blob/main/packages/sdk/src/protocol.ts), if you'd rather not use this package.
