// Plays the content script's part: loads the palette into the mock window's
// iframe and opens it. `?mode=commands` picks the mode, `?q=` types a query.
const params = new URLSearchParams(location.search)
const mode = params.get("mode") ?? "tabs"
const query = params.get("q") ?? ""
if (params.has("dark")) document.body.classList.add("dark")

const frame = document.querySelector(".viewport iframe")
frame.src = "/palette.html#readme"

addEventListener("message", (e) => {
  if (e.source !== frame.contentWindow) return
  if (e.data.type === "ready") {
    frame.contentWindow.postMessage({ palette: "readme", type: "open", mode }, "*")
  }
  if (e.data.type === "show") {
    if (query) {
      const win = frame.contentWindow
      const input = win.document.querySelector("input")
      Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value").set.call(input, query)
      input.dispatchEvent(new win.Event("input", { bubbles: true }))
    }
    // Tells the render script it can take the screenshot.
    document.body.dataset.ready = "true"
  }
})
