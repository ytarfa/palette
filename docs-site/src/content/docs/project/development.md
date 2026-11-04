---
title: Development
description: Build Palette, run the tests and work on the docs.
---

TypeScript, Vite, React, Tailwind CSS v4 and [shadcn/ui](https://ui.shadcn.com)'s `Command` component, built on [cmdk](https://cmdk.paco.me).

```
public/manifest.json   Manifest V3 config, including the keyboard shortcuts
src/background/        Service worker: routes shortcuts, popup fallback
src/content/           Content script: shows and hides the palette frame
src/palette/           The palette UI (palette.html), in the page frame or the popup
src/core/              Plugin API, registry, modes and keyboard helpers
src/plugins/           Everything the palette lists
src/plugins/sites/     One file per site, registered automatically
src/options/           Settings page (options.html)
src/config/            Chrome's default shortcuts, shown next to commands
src/components/ui/     shadcn/ui components
packages/sdk/          @palette/sdk, for plugins in other extensions
examples/toolbox/      Example plugin extension
docs-site/             This site (Astro Starlight)
scripts/               README image rendering
docs/                  README banners, screenshots and demo GIFs
```

## Scripts

| Script | |
| --- | --- |
| `pnpm dev` | Rebuilds `dist/` on every change |
| `pnpm build` | Builds the SDK, typechecks, then builds `dist/` |
| `pnpm --filter palette-toolbox build` | Builds the example plugin into `examples/toolbox/dist/` |
| `pnpm test` | Runs the tests (Vitest) |
| `pnpm lint` | Lints with oxlint |
| `pnpm render:readme` | Re-renders the images in `docs/` with your installed Chrome (and ffmpeg for the GIFs), using the real palette from `dist/` and a set of demo tabs. Pass file names to render only those |
| `pnpm docs:dev` | Serves this site with live reload |
| `pnpm docs:build` | Builds this site into `docs-site/dist/` |

## Working on it

After a rebuild, click the reload button on the extension's card in `chrome://extensions`. Open tabs pick up the new content script automatically.

The manifest pins Palette's extension ID to `jcjopjoglbklaejmahmfnhmanfoomnpk` when loaded unpacked, so plugins can find it. The `key` behind it is public, so any unpacked extension that copies it gets the same ID and can send requests to plugins as if it were Palette ([what plugins should do about it](../../plugins/security/#who-can-send-requests)). The Chrome Web Store will assign an ID no other extension can claim, and `PALETTE_ID` in the SDK will then switch to it.

To regenerate the icons after editing `public/icons/icon.svg`:

```sh
cd public/icons && for s in 16 32 48 128; do rsvg-convert -w $s -h $s icon.svg -o $s.png; done
```

## Docs

This site lives in [`docs-site`](https://github.com/ytarfa/palette/blob/main/docs-site). Pages are Markdown files in `docs-site/src/content/docs`, and the sidebar is set in `docs-site/astro.config.mjs`. The [SDK reference](../../reference/sdk/readme/) is generated from the types and comments in `packages/sdk/src` on every build, so document the SDK there.
