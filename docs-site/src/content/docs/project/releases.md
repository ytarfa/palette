---
title: CI and releases
description: What runs on pull requests and on pushes to main.
---

- **Pull requests** run lint, typecheck, tests, both builds and the docs build ([`ci.yml`](https://github.com/ytarfa/palette/blob/main/.github/workflows/ci.yml)). A pull request can't be merged into `main` until they pass.
- **Every push to `main`** that changes the extension runs the same checks, then publishes a release with the built extension as `palette.zip` ([`release.yml`](https://github.com/ytarfa/palette/blob/main/.github/workflows/release.yml)). Pushes that only touch docs don't release. A release can also be started by hand from the Actions tab.
- **Versions** are `major.minor.patch`: major and minor come from `public/manifest.json`, so bump those there for a bigger release. The patch number counts up on each release, and the release's `manifest.json` gets the full version.
- **This site** is rebuilt and published to GitHub Pages on every push to `main` that touches `docs-site/`, `docs/` or the SDK ([`docs.yml`](https://github.com/ytarfa/palette/blob/main/.github/workflows/docs.yml)).
