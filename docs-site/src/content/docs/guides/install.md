---
title: Install
description: Install Palette in Chrome from the latest release, or build it from source.
---

Palette isn't on the Chrome Web Store yet. Until it is, you load it as an unpacked extension:

1. **[Download the latest release](https://github.com/ytarfa/palette/releases/latest/download/palette.zip)** and unzip it.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and pick the unzipped folder.

Then press <kbd>⌘</kbd><kbd>⇧</kbd><kbd>P</kbd> on any page. Tabs that were already open get Palette on install, so there's no need to reload them.

Requires Chrome 130 or later.

## Update

Download the new release, unzip it over the same folder, and click the reload button on Palette's card in `chrome://extensions`. All releases are listed on the [releases page](https://github.com/ytarfa/palette/releases).

## Build from source

```sh
git clone https://github.com/ytarfa/palette.git
cd palette
pnpm install
pnpm build
```

Then load the `dist` folder the same way. See [Development](../../project/development/) for working on it.
