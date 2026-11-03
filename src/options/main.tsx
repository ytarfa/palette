import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { plugins } from "@/plugins"
import { Options } from "./options"
import "@/palette/index.css"

const root = document.documentElement
root.dataset.surface = "options"

const dark = matchMedia("(prefers-color-scheme: dark)")
const applyTheme = () => root.classList.toggle("dark", dark.matches)
applyTheme()
dark.addEventListener("change", applyTheme)

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Options plugins={plugins} />
  </StrictMode>,
)
