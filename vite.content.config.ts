import { defineConfig } from "vite"
import { alias } from "./vite.config.ts"

export default defineConfig({
  resolve: { alias },
  publicDir: false,
  build: {
    emptyOutDir: false,
    lib: {
      entry: "src/content/index.ts",
      formats: ["iife"],
      name: "paletteContent",
      fileName: () => "content.js",
    },
  },
})
