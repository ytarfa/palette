import { defineConfig } from "vite"

export default defineConfig({
  build: {
    rolldownOptions: {
      input: "src/background.ts",
      output: { entryFileNames: "background.js" },
    },
  },
})
