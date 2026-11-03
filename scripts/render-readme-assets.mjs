#!/usr/bin/env node
// Renders the README banners and screenshots into docs/ with your installed
// Chrome, and the demo GIFs with ffmpeg. They show the real palette and
// settings page from dist/ (run `pnpm build` first), with the extension APIs
// stubbed by scripts/readme/chrome-stub.js. Pass file names to render only
// those, e.g. `pnpm render:readme screenshot-cleanup.png demo.gif`.
import { execFileSync } from "node:child_process"
import fs from "node:fs/promises"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import { chromium } from "playwright-core"

const root = path.resolve(import.meta.dirname, "..")
const dist = path.join(root, "dist")
const templates = path.join(root, "scripts/readme")
const chrome =
  process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

const jobs = [
  ["banner.html", "banner-light.png", 1280, 560],
  ["banner.html?dark", "banner-dark.png", 1280, 560],
  ["screenshot-tabs.html", "screenshot-tabs.png", 1280, 800],
  ["screenshot-tabs.html?dark", "screenshot-tabs-dark.png", 1280, 800],
  ["screenshot-commands.html?mode=commands", "screenshot-commands.png", 1280, 800],
  ["screenshot-commands.html?mode=commands&dark", "screenshot-commands-dark.png", 1280, 800],
  ["screenshot-github.html?mode=commands&site=github", "screenshot-github.png", 1280, 800],
  ["screenshot-github.html?mode=commands&site=github&dark", "screenshot-github-dark.png", 1280, 800],
  ["screenshot-capture.html?mode=commands&site=mdn&q=copy", "screenshot-capture.png", 1280, 800],
  ["screenshot-capture.html?mode=commands&site=mdn&q=copy&dark", "screenshot-capture-dark.png", 1280, 800],
  ["screenshot-cleanup.html?mode=commands&stale&q=not+used+in+a+week&enter", "screenshot-cleanup.png", 1280, 800],
  ["screenshot-cleanup.html?mode=commands&stale&q=not+used+in+a+week&enter&dark", "screenshot-cleanup-dark.png", 1280, 800],
  ["screenshot-plugins.html?page=options&section=From+other+extensions&plugins", "screenshot-plugins.png", 1280, 600],
  ["screenshot-plugins.html?page=options&section=From+other+extensions&plugins&dark", "screenshot-plugins-dark.png", 1280, 600],
]
const demos = [
  ["demo.html?closed", "demo.gif", 960, 600],
  ["demo.html?closed&dark", "demo-dark.gif", 960, 600],
]
const only = process.argv.slice(2)

// Stand-in favicons for the demo tabs: a coloured tile with the site's initial.
const FAVICONS = {
  "github.com": "#24292f",
  "www.notion.so": "#37352f",
  "developer.mozilla.org": "#1b1b1b",
  "linear.app": "#5e6ad2",
  "www.youtube.com": "#ff0033",
  "www.figma.com": "#a259ff",
  "news.ycombinator.com": "#ff6600",
  "vite.dev": "#646cff",
}

function favicon(pageUrl) {
  const host = new URL(pageUrl).host
  const letter = host.replace(/^(www|news|developer)\./, "")[0].toUpperCase()
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
    <rect width="32" height="32" rx="7" fill="${FAVICONS[host] ?? "#86868b"}"/>
    <text x="16" y="22" text-anchor="middle" font-family="system-ui, sans-serif" font-size="17" font-weight="700" fill="#fff">${letter}</text>
  </svg>`
}

const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".woff2": "font/woff2" }

async function serve(req, res) {
  const url = new URL(req.url, "http://localhost")
  if (url.pathname === "/_favicon/") {
    res.setHeader("content-type", "image/svg+xml")
    return res.end(favicon(url.searchParams.get("pageUrl")))
  }
  for (const dir of [templates, dist]) {
    const file = path.join(dir, url.pathname)
    if (!file.startsWith(dir)) continue
    try {
      let body = await fs.readFile(file)
      if (url.pathname === "/palette.html" || url.pathname === "/options.html") {
        // Load the API stub before the page's module script.
        body = body.toString().replace("<script", '<script src="/chrome-stub.js"></script><script')
      }
      res.setHeader("content-type", TYPES[path.extname(file)] ?? "application/octet-stream")
      return res.end(body)
    } catch {}
  }
  res.statusCode = 404
  res.end()
}

await fs.access(path.join(dist, "palette.html")).catch(() => {
  console.error("dist/ is missing. Run `pnpm build` first.")
  process.exit(1)
})

const server = http.createServer(serve).listen(0, "127.0.0.1")
await new Promise((resolve) => server.once("listening", resolve))
const base = `http://127.0.0.1:${server.address().port}`
await fs.mkdir(path.join(root, "docs"), { recursive: true })
const browser = await chromium.launch({ executablePath: chrome })

for (const [template, output, width, height] of jobs) {
  if (only.length && !only.includes(output)) continue
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 2,
    colorScheme: template.endsWith("dark") ? "dark" : "light",
  })
  await page.goto(`${base}/${template}`)
  // Set by readme.js once the palette is open; then let favicons and the open animation finish.
  await page.waitForSelector("body[data-ready]")
  await page.waitForLoadState("networkidle")
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(root, "docs", output) })
  await page.close()
  console.log(`docs/${output}`)
}

/**
 * The demo: open the tab switcher, find a tab, then switch to commands. Each
 * step is a screenshot shown for `hold` seconds; ffmpeg turns them into a GIF.
 */
async function recordDemo(page, output) {
  const frames = await fs.mkdtemp(path.join(os.tmpdir(), "palette-demo-"))
  const list = []
  const shot = async (hold) => {
    // Let React render the last key, and the open animation finish.
    await page.waitForTimeout(220)
    const file = path.join(frames, `${String(list.length).padStart(3, "0")}.png`)
    await page.screenshot({ path: file })
    list.push(`file '${file}'\nduration ${hold}`)
  }
  // Only while the palette is closed: over it, the keys would cover the list.
  const keys = (shown) => page.evaluate((shown) => showKeys(shown), shown)
  const input = page.frameLocator(".viewport iframe").locator("input")
  const type = async (text, hold = 0.11) => {
    for (const char of text) {
      await input.press(char)
      await shot(hold)
    }
  }

  await shot(1)
  await keys(["⌘", "⇧", "P"])
  await shot(0.5)
  await page.evaluate(() => openPalette("tabs"))
  await page.waitForSelector("body[data-shown]")
  await keys([])
  await shot(1.2)
  await type("lin")
  await shot(1.4)
  for (let i = 0; i < 3; i++) {
    await input.press("Backspace")
    await shot(0.06)
  }
  await type(">", 0.8)
  await type("dupl")
  await shot(1.4)
  await input.press("ArrowDown")
  await shot(1.6)

  // The concat demuxer ignores the last frame's duration unless it's listed twice.
  list.push(list.at(-1).split("\n")[0])
  const concat = path.join(frames, "frames.txt")
  await fs.writeFile(concat, list.join("\n"))
  const [, , width] = demos.find(([, name]) => name === output)
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", concat,
    "-vf", `scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
    path.join(root, "docs", output),
  ])
  await fs.rm(frames, { recursive: true })
}

for (const [template, output, width, height] of demos) {
  if (only.length && !only.includes(output)) continue
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 2,
    colorScheme: template.endsWith("dark") ? "dark" : "light",
  })
  await page.goto(`${base}/${template}`)
  await page.waitForSelector("body[data-ready]")
  await page.waitForLoadState("networkidle")
  await recordDemo(page, output)
  await page.close()
  console.log(`docs/${output}`)
}

await browser.close()
server.close()
