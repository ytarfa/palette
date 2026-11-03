# Palette

A command palette for Chrome, in the style of VS Code.

- **⌘⇧P**: search open tabs across all windows, most recently used first
- **⌘⇧K**: run commands (tab, page, window and browser actions)

On Windows and Linux, use Ctrl instead of ⌘.

Built with TypeScript, Vite, React, Tailwind v4 and shadcn/ui (`Command`, built on [cmdk](https://cmdk.paco.me)).

## Using it

| Key | Action |
| --- | --- |
| ⌘⇧P | Tab switcher. Press P again while holding ⌘⇧ to move down the list, then release to switch |
| ⌘⇧K | Commands. Press ⌘⇧K again to close |
| `>` | Typed at the start of the tab search, switches to commands (like VS Code) |
| ⌘⌫ | Close the highlighted tab |
| ↵ | Run the item, or open its sub-list (items with a `›`) |
| Backspace on an empty query | Go back a level, or from commands back to tabs |
| Esc | Go back a level, or close |

Typing a domain or any text adds **Open …** and **Search “…”** (with your default search engine) at the bottom.

The shortcuts are Chrome extension shortcuts, so they work on every page and take priority over the page's own shortcuts. Change them at `chrome://extensions/shortcuts`.

Chrome doesn't let extensions inject into `chrome://` pages, the new tab page or the Web Store. There, the palette opens as the toolbar popup instead.

## Development

```sh
pnpm install
pnpm dev      # watch build into dist/
pnpm build    # typecheck + production build
```

Load `dist/` at `chrome://extensions` (Developer mode → Load unpacked). After a rebuild, click reload on the extension card. Open tabs pick up the new content script automatically.

## How it works

```
src/
  background/   service worker: extension shortcuts, popup fallback
  content/      tiny content script: shows and hides the palette iframe
  palette/      the React app (palette.html), used both in the iframe and the popup
  core/         plugin API, registry, modes, keyboard helpers
  plugins/      everything the palette shows
  components/   shadcn/ui
```

- The shortcuts are `commands` in `public/manifest.json`. The background worker relays them to the tab's content script.
- The content script injects the palette as an **iframe** (inside a closed shadow root). This keeps it isolated from the page's CSS, fonts and key handlers. The iframe is an extension page, so plugins call `chrome.*` APIs directly, with no message passing.
- The iframe is created on first use and then kept hidden, so reopening is instant.
- The same `palette.html` is the toolbar popup, used on pages where content scripts can't run.

## Plugins

Everything in the palette comes from a plugin. A plugin can add:

- **commands**: static actions listed under ⌘⇧K
- **sources**: functions that return items for any mode, optionally re-run as the query changes
- **modes**: new top-level lists, with an optional prefix to switch to them (like `>`)

Items can also have **children** (a nested list, such as "Move tab to window…") and **actions** (secondary shortcuts on the highlighted item, such as ⌘⌫ to close a tab).

```ts
// src/plugins/hello.ts
import { Sparkles } from "lucide-react"
import { definePlugin } from "@/core/types"

export default definePlugin({
  id: "hello",
  name: "Hello",
  commands: [
    {
      id: "copy-title",
      title: "Copy page title",
      group: "Page",
      icon: Sparkles,
      when: (ctx) => !!ctx.tab?.title,
      run: (ctx) => ctx.copy(ctx.tab!.title!),
    },
  ],
})
```

Then add it to `src/plugins/index.ts`. Plugins added there are enabled.

A new mode with a prefix and a query-driven source looks like this (this one needs the `bookmarks` permission in `public/manifest.json`):

```ts
export default definePlugin({
  id: "bookmarks",
  name: "Bookmarks",
  modes: [{ id: "bookmarks", name: "Bookmarks", placeholder: "Search bookmarks…", prefix: "@" }],
  sources: [
    {
      mode: "bookmarks",
      dynamic: true, // re-run on every keystroke
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

See `src/core/types.ts` for the full API.
