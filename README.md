<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/banner-dark.png" />
  <img src="docs/banner-light.png" alt="Palette: a command palette for Chrome. Switch tabs and run commands without the mouse" />
</picture>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#features">Features</a> ·
  <a href="#keyboard">Keyboard</a> ·
  <a href="#plugins">Plugins</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#development">Development</a>
</p>

<br />

Code editors have a command palette: one shortcut, type a few letters, done. This Chrome extension brings it to the browser. **⌘⇧P** jumps to any open tab, and **⌘⇧K** runs any browser action.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/screenshot-tabs-dark.png" />
    <img src="docs/screenshot-tabs.png" width="49%" alt="The tab switcher listing open tabs, most recently used first" />
  </picture>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/screenshot-commands-dark.png" />
    <img src="docs/screenshot-commands.png" width="49%" alt="The command list, with Chrome's shortcuts next to each command" />
  </picture>
</p>

## Features

- **Tab switcher.** Fuzzy search every open tab across all your windows, most recently used first. Hold ⌘⇧ and tap P to walk down the list, then let go to switch, just like in VS Code.
- **Commands.** About 30 actions for tabs, pages and windows: duplicate, pin, mute, reopen closed tab, close duplicates, move to another window, copy the URL as a Markdown link, zoom, and more. Chrome's own shortcuts are shown next to them, so you learn them as you go.
- **Open or search anything.** Type a domain to open it, or any text to search with your default search engine.
- **Isolated from the page.** The palette runs in its own frame, so site styles can't break it and it can't break the site.
- **Works everywhere.** On pages extensions can't touch, like `chrome://` pages and the new tab page, it opens from the toolbar instead.
- **Light and dark**, following your system.
- **Extensible.** Everything in the list comes from a [plugin](#plugins). Adding a command is a few lines of TypeScript.
- **Private.** Everything happens on your device. No network requests, no analytics, no data collected.

## Install

**From source** (until it's on the Chrome Web Store):

```sh
git clone https://github.com/ytarfa/palette.git
cd palette
pnpm install
pnpm build
```

Then open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick the `dist` folder.

Requires Chrome 127 or later.

## Keyboard

| Key | |
| --- | --- |
| <kbd>⌘</kbd><kbd>⇧</kbd><kbd>P</kbd> | Search tabs. Press P again while holding ⌘⇧ to move down the list, let go to switch |
| <kbd>⌘</kbd><kbd>⇧</kbd><kbd>K</kbd> | Run a command. Press again to close |
| <kbd>></kbd> | At the start of a tab search, switches to commands |
| <kbd>⌘</kbd><kbd>⌫</kbd> | Close the highlighted tab |
| <kbd>↵</kbd> | Run the item, or open its sub-list (items with a ›) |
| <kbd>⌫</kbd> | On an empty search, go back a level, or from commands back to tabs |
| <kbd>Esc</kbd> | Go back a level, or close |

On Windows and Linux, use Ctrl instead of ⌘. You can change both shortcuts at `chrome://extensions/shortcuts`.

## Plugins

Everything in the palette comes from a plugin, and the built-in features are plugins too ([`src/plugins`](src/plugins)). A plugin can add:

| | |
| --- | --- |
| **Commands** | Actions listed under ⌘⇧K |
| **Sources** | Items for any list, optionally reloaded as you type |
| **Modes** | New top-level lists, with a prefix to switch to them, like `>` |
| **Children** | A nested list instead of an action, like "Move tab to window…" |
| **Actions** | Extra shortcuts on the highlighted item, like ⌘⌫ to close a tab |

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

Then add it to the list in [`src/plugins/index.ts`](src/plugins/index.ts).

<details>
<summary>A new mode: search bookmarks with <code>@</code></summary>

<br />

This one also needs the `bookmarks` permission in `public/manifest.json`.

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

</details>

The full API is in [`src/core/types.ts`](src/core/types.ts).

### Shortcuts next to commands

Chrome doesn't let extensions read its keyboard shortcuts, so the ones in the list come from [`src/config/shortcuts.json`](src/config/shortcuts.json). It maps command ids to Chrome's default shortcuts, taken from [Google's list](https://support.google.com/chrome/answer/157179), and plugins don't need to set anything:

```json
{
  "tab-commands:new": "mod+t",
  "tab-commands:back": { "mac": "mod+[", "other": "alt+arrowleft" }
}
```

`mod` is ⌘ on macOS and Ctrl elsewhere. Write `plus`, `minus` and `comma` for those keys. These shortcuts are only displayed: pressing them is still handled by Chrome.

## How it works

When you press ⌘⇧P or ⌘⇧K:

1. Chrome passes the shortcut to the background worker. It's an extension shortcut, so it works on every page and takes priority over the page's own shortcuts.
2. The worker asks the tab's content script to open the palette. If the tab can't run one (`chrome://` pages, the new tab page, the Web Store), it opens the palette as the toolbar popup instead.
3. The content script shows the palette in an iframe, inside a closed shadow root. The page's CSS, fonts and key handlers can't reach it. The frame is created the first time and then kept hidden, so it opens instantly after that.
4. The palette is an extension page, so plugins call the `chrome.*` APIs directly, with no messaging layer in between.

Tabs that were open before the extension was installed get the content script injected on install, so there's no need to reload them.

## Development

TypeScript, Vite, React, Tailwind CSS v4 and [shadcn/ui](https://ui.shadcn.com)'s `Command` component, built on [cmdk](https://cmdk.paco.me).

```
public/manifest.json   Manifest V3 config, including the keyboard shortcuts
src/background/        Service worker: routes shortcuts, popup fallback
src/content/           Content script: shows and hides the palette frame
src/palette/           The palette UI (palette.html), in the page frame or the popup
src/core/              Plugin API, registry, modes and keyboard helpers
src/plugins/           Everything the palette lists
src/config/            Chrome's default shortcuts, shown next to commands
src/components/ui/     shadcn/ui components
scripts/               README image rendering
docs/                  README banners and screenshots
```

| Script | |
| --- | --- |
| `pnpm dev` | Rebuilds `dist/` on every change |
| `pnpm build` | Typechecks, then builds `dist/` |
| `pnpm lint` | Lints with oxlint |
| `pnpm render:readme` | Re-renders the images in `docs/` with your installed Chrome, using the real palette from `dist/` and a set of demo tabs |

After a rebuild, click the reload button on the extension's card in `chrome://extensions`. Open tabs pick up the new content script automatically.

To regenerate the icons after editing `public/icons/icon.svg`:

```sh
cd public/icons && for s in 16 32 48 128; do rsvg-convert -w $s -h $s icon.svg -o $s.png; done
```
