---
title: Plugin security
description: What Palette checks, what plugins can see, and what plugin authors should watch out for.
---

## What Palette does

- **Approval first.** Nothing from a plugin shows until the user allows it in Palette's settings, which list its name, description and declared `access` next to its extension ID. Plugins can only be allowed from settings, never from the palette.
- **Only what was declared.** Approved plugins receive only what they declared in `access`: the current tab's origin or full address, and what's typed.
- **Re-approval.** If an approved plugin later renames itself or asks for more (a source in a new mode, a source that sees every keystroke, or more of the current tab or what you type), it goes back to waiting for approval.
- **Checked input.** Palette checks everything a plugin sends, strips control, bidi and zero-width characters from its text, and only shows icons embedded in the plugin itself.
- **Separate code.** The plugin's code stays in its own extension, with its own permissions and its own Web Store review.

## Who can send requests

Your plugin only answers messages from Palette's extension ID (`PALETTE_ID`, or the `paletteId` you pass). It drops requests that aren't well formed: an unknown `type`, ids that aren't short strings, a `query` over 10,000 characters, or a `tab` with fields of the wrong type. `items`, `children` and `run` only ever see the documented fields.

:::caution[Until Palette is on the Chrome Web Store]
Palette's ID comes from the public `key` in its manifest. Any extension loaded unpacked with the same key gets the same ID, and can then do anything Palette can: read your registration, ask for your items and children, run your commands with any `query` and `tab`, and read what they return.
:::

Until that changes:

- **Don't return secrets.** Assume titles, subtitles, children, effects and error messages can be read by another extension.
- **Don't trust `query` or `tab`.** `tab.url` might not be a page the user has open. Check values before using them, especially in URLs or API calls.
- **Be careful with commands that change things**, like writing to an API with the user's credentials. Another extension could run them without the user picking them.

Once Palette is published, `PALETTE_ID` will switch to its Chrome Web Store ID, which no other extension can claim. Pass `paletteId` to keep talking to an unpacked build.
