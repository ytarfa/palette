# Toolbox for Palette

An example [Palette](../../README.md) plugin, built with [`@palette/sdk`](../../packages/sdk). It adds developer utilities to ⌘⇧K:

- **Copy new UUID**, **Copy current time** and **Copy Unix timestamp**
- **Copy tab as…**, a nested list: Markdown, HTML or Org-mode link, or just the title
- **Base64 encode**, **Base64 decode** and **URL encode** for whatever you type

It needs no permissions: everything it does is copying text, which it asks Palette to do.

## Try it

```sh
pnpm install
pnpm --filter palette-toolbox build
```

Load `examples/toolbox/dist` at `chrome://extensions`, next to Palette. Open ⌘⇧K and approve **Allow “Toolbox” to add commands**.

All the code is in [`src/background.ts`](src/background.ts).
