---
title: Example plugin
description: Toolbox, a complete Palette plugin extension built with @palette/sdk.
---

[`examples/toolbox`](https://github.com/ytarfa/palette/tree/main/examples/toolbox) is a complete plugin extension built with [`@palette/sdk`](../external/). It adds developer utilities to <kbd>⌘</kbd><kbd>⇧</kbd><kbd>K</kbd>:

- **Copy new UUID**, **Copy current time** and **Copy Unix timestamp**
- **Copy tab as…**, a nested list: Markdown, HTML or Org-mode link, or just the title
- **Base64 encode**, **Base64 decode** and **URL encode** for whatever you type

It needs no Chrome permissions: everything it does is copying text, which it asks Palette to do. It does ask Palette for the current tab's address and title, for **Copy tab as…**, and for what you type, for the encoders. You see both when you approve it.

## Try it

```sh
pnpm install
pnpm --filter palette-toolbox build
```

Load `examples/toolbox/dist` at `chrome://extensions`, next to Palette. Open <kbd>⌘</kbd><kbd>⇧</kbd><kbd>K</kbd> and approve **Allow “Toolbox” to add commands**.

All the code is in [`src/background.ts`](https://github.com/ytarfa/palette/blob/main/examples/toolbox/src/background.ts).
