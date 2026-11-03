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

That's it. When your extension is installed, it registers with Palette. The user then sees **Allow “Toolbox” to add commands** at the top of ⌘⇧K, and once they approve it your commands appear in the list.

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

`ctx` is `{ query, tab }`: what's typed, and the `id`, `windowId`, `url` and `title` of the tab the palette was opened from.

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

Sources without `dynamic` are asked once each time the palette opens. Palette waits up to 1.5 seconds for an answer and skips plugins that are slower.

## Good to know

- **Approval.** Nothing shows until the user allows your plugin. They can block or remove it later from **Manage plugins…**. Approved plugins receive the current tab's URL and title with each request.
- **Registration.** Plugins register when installed or updated, and when the browser starts. If your commands change at runtime, call `register()` on the object `definePalettePlugin` returns.
- **Re-approval.** The user approves your plugin's name and what its sources can see: the modes they use, and whether any is `dynamic`. Changing commands or descriptions keeps the approval. Registering under a new name, with a source in a new mode, or with your first `dynamic` source puts the plugin back to pending until the user allows it again, and `register()` resolves with `status: "pending"`.
- **Palette's ID.** Messages go to `PALETTE_ID`. Pass `paletteId` to point at a different build.
- **Protocol.** Messages are plain JSON with a `palette` version field, defined in [`src/protocol.ts`](src/protocol.ts), if you'd rather not use this package.
