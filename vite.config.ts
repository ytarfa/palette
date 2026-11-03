import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export const alias = { "@": path.resolve(import.meta.dirname, "./src") }

/**
 * Builds the palette page and the background service worker.
 * The content script needs a classic (non-module) script, so it has its own
 * build: vite.content.config.ts.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias },
  build: {
    emptyOutDir: false,
    rolldownOptions: {
      input: {
        palette: path.resolve(import.meta.dirname, "palette.html"),
        background: path.resolve(import.meta.dirname, "src/background/index.ts"),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js",
      },
    },
  },
})
