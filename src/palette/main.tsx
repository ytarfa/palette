import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { createRegistry } from "@/core/registry"
import { plugins } from "@/plugins"
import { embedded } from "./host"
import { Palette } from "./palette"
import "./index.css"

const root = document.documentElement
root.dataset.surface = embedded ? "embedded" : "popup"

const dark = matchMedia("(prefers-color-scheme: dark)")
const applyTheme = () => root.classList.toggle("dark", dark.matches)
applyTheme()
dark.addEventListener("change", applyTheme)

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Palette registry={createRegistry(plugins)} />
  </StrictMode>,
)
