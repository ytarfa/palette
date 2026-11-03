# @palette/sdk

Add commands to [Palette](../../README.md) from your own Chrome extension.

Chrome extensions can't load code from elsewhere, so a Palette plugin is its own extension. Your extension tells Palette which commands it has. When the user picks one, Palette asks your extension to run it. Your code stays in your extension, with your permissions, and goes through the Chrome Web Store's review like any other extension.

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

That's it. When your extension is installed, it registers with Palette. Palette then tells the user a plugin is waiting for approval, and once they allow it in Palette's settings your commands appear in the list.

A complete example lives in [`examples/toolbox`](../../examples/toolbox).

## Commands

| Field | |
| --- | --- |
| `id` | Unique within your plugin |
| `title`, `subtitle` | What's shown in the list |
| `icon` | A `data:image/...` URL, or a `chrome-extension://<your id>/...` file listed in your `web_accessible_resources` |
| `keywords` | Extra words to match when searching |
| `group` | Group heading. Defaults to your plugin's name |
| `hint` | Muted text on the right |
| `shortcut` | Shortcut shown next to the command, e.g. `"mod+shift+u"`. Display only |
| `alwaysShow` | Show regardless of what's typed |
| `run(ctx)` | Runs in your service worker. Can return an effect, see below |
| `children` | `{ placeholder, items(ctx) }`: open a nested list instead of running |

`ctx` is `{ query, tab }`: what's typed, and the tab the palette was opened from. Both are empty unless you ask for them, see [Access](#access).

### Effects

Service workers can't use the clipboard, and Palette closes after a command runs. Return an effect to have Palette do the last step:

```ts
run: () => ({ copy: "text" })                        // copy to the clipboard
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

## Good to know

- **Approval.** Nothing shows until the user allows your plugin in Palette's settings, which list its name, description and declared `access` next to its extension ID. They can turn it off or remove it later from settings or **Manage plugins…**. Approved plugins receive only what they declared in `access`.
- **Text.** Palette removes control, bidi and zero-width characters from every string your plugin sends, then trims it.
- **Registration.** Plugins register when installed or updated, and when the browser starts. If your commands change at runtime, call `register()` on the object `definePalettePlugin` returns.
- **Re-approval.** The user approves your plugin's name, what its sources can see (the modes they use, and whether any is `dynamic`) and its `access`. Changing commands or descriptions keeps the approval. Registering under a new name, with a source in a new mode, with your first `dynamic` source, or with more `access` puts the plugin back to pending until the user allows it again, and `register()` resolves with `status: "pending"`.
- **Palette's ID.** Messages go to `PALETTE_ID`. Pass `paletteId` to point at a different build.
- **Protocol.** Messages are plain JSON with a `palette` version field, defined in [`src/protocol.ts`](src/protocol.ts), if you'd rather not use this package.
