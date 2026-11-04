---
title: Plugins overview
description: Everything in Palette is a plugin. Here's what a plugin can add, and the two ways to write one.
---

Everything in the palette comes from a plugin, and the built-in features are plugins too. A plugin can add:

| | |
| --- | --- |
| **Commands** | Actions listed under ⌘⇧K |
| **Sources** | Items for any list, optionally reloaded as you type |
| **Modes** | New top-level lists, with a prefix to switch to them, like `>` |
| **Children** | A nested list instead of an action, like "Move tab to window…" |
| **Actions** | Extra shortcuts on the highlighted item, like ⌘⌫ to close a tab |

## Two ways to write one

**Built into Palette.** A file in [`src/plugins`](https://github.com/ytarfa/palette/tree/main/src/plugins), with full access to the `chrome.*` APIs. This is how the tab commands, site commands and everything else ship. Good for contributions to Palette itself. See [Built-in plugins](../built-in/), or [Adding a site](../adding-a-site/) for the most common case.

**In your own extension.** Chrome extensions can't download code, so a published Palette can't load plugins the way an editor does. Instead, a plugin can be its own extension that talks to Palette through Chrome's extension messaging, using [`@palette/sdk`](../external/). Your code stays in your extension, with your permissions, and the user approves it before anything shows up.

| | Built-in | Own extension |
| --- | --- | --- |
| Ships with | Palette | Your extension |
| Chrome APIs | Palette's permissions | Your extension's permissions |
| Commands, sources, children | Yes | Yes |
| New modes, item actions | Yes | No, sources list in ⌘⇧P or ⌘⇧K |
| Needs approval | No | Yes, in Palette's settings |
