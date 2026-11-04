---
title: How it works
description: What happens between pressing ⌘⇧K and the palette showing up.
---

When you press <kbd>⌘</kbd><kbd>⇧</kbd><kbd>P</kbd> or <kbd>⌘</kbd><kbd>⇧</kbd><kbd>K</kbd>:

1. Chrome passes the shortcut to the background worker. It's an extension shortcut, so it works on every page and takes priority over the page's own shortcuts.
2. The worker asks the tab's content script to open the palette. If the tab can't run one (`chrome://` pages, the new tab page, the Web Store), it opens the palette as the toolbar popup instead.
3. The content script shows the palette in an iframe, inside a closed shadow root. The page's CSS, fonts and key handlers can't reach it. The frame is created the first time and then kept hidden, so it opens instantly after that.
4. The palette is an extension page, so built-in plugins call the `chrome.*` APIs directly. Plugins from other extensions are asked for their items over `chrome.runtime` messaging.

Tabs that were open before the extension was installed get the content script injected on install, so there's no need to reload them.

## Privacy

Everything happens on your device. Palette makes no network requests, has no analytics and collects no data.
