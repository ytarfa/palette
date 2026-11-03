// Plays the content script's part: loads the palette into the mock window's
// iframe and opens it. `?mode=commands` picks the mode, `?q=` types a query,
// `?enter` then presses Enter to open the top item's sub-list.
// `?closed` leaves the palette closed until the render script calls
// `openPalette(mode)`, for the demo.
// `?page=options` loads the settings page instead, scrolled to `?section=`.
const params = new URLSearchParams(location.search)
const mode = params.get("mode") ?? "tabs"
const query = params.get("q") ?? ""
if (params.has("dark")) document.body.classList.add("dark")

const frame = document.querySelector(".viewport iframe")
// Tells the render script it can take the screenshot.
const ready = () => (document.body.dataset.ready = "true")

window.openPalette = (mode) => {
  frame.contentWindow.postMessage({ palette: "readme", type: "open", mode }, "*")
}

if (params.get("page") === "options") {
  frame.src = "/options.html"
  frame.addEventListener("load", async () => {
    const doc = frame.contentDocument
    const section = params.get("section")
    let heading
    while (!(heading = [...doc.querySelectorAll("h2")].find((h) => !section || h.textContent === section))) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    // Room below, so the section can scroll to the top even though it's the last one.
    doc.querySelector("main").style.paddingBottom = "100vh"
    heading.closest("section").scrollIntoView({ block: "start" })
    frame.contentWindow.scrollBy(0, -40)
    ready()
  })
} else {
  frame.src = "/palette.html#readme"
  // The content script keeps the frame hidden until the palette is open.
  if (params.has("closed")) frame.style.visibility = "hidden"
}

addEventListener("message", (e) => {
  if (e.source !== frame.contentWindow) return
  const win = frame.contentWindow
  if (e.data.type === "ready") {
    if (params.has("closed")) ready()
    else openPalette(mode)
  }
  if (e.data.type === "show") {
    frame.style.visibility = ""
    document.body.dataset.shown = "true"
    if (params.has("closed")) return
    const input = win.document.querySelector("input")
    if (query) {
      Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value").set.call(input, query)
      input.dispatchEvent(new win.Event("input", { bubbles: true }))
    }
    if (params.has("enter")) {
      // Let the results for the query render first.
      setTimeout(() => {
        input.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
        setTimeout(ready, 300)
      }, 300)
    } else {
      ready()
    }
  }
})
