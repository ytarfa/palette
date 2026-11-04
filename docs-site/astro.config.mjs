// @ts-check
import starlight from "@astrojs/starlight"
import { defineConfig } from "astro/config"
import starlightTypeDoc, { typeDocSidebarGroup } from "starlight-typedoc"

const repo = "https://github.com/ytarfa/palette"

export default defineConfig({
  site: "https://ytarfa.github.io",
  base: "/palette",
  integrations: [
    starlight({
      title: "Palette",
      description: "A command palette for Chrome. Switch tabs and run commands without the mouse.",
      logo: { src: "./src/assets/icon.svg" },
      favicon: "/favicon.svg",
      social: [{ icon: "github", label: "GitHub", href: repo }],
      editLink: { baseUrl: `${repo}/edit/main/docs-site/` },
      customCss: ["./src/styles/custom.css"],
      plugins: [
        // Generates the SDK reference from packages/sdk's types and comments.
        starlightTypeDoc({
          entryPoints: ["../packages/sdk/src/index.ts"],
          tsconfig: "../packages/sdk/tsconfig.json",
          output: "reference/sdk",
          sidebar: { label: "SDK reference", collapsed: true },
          typeDoc: { gitRevision: "main" },
        }),
      ],
      sidebar: [
        {
          label: "Using Palette",
          items: [
            "guides/install",
            "guides/keyboard",
            "guides/commands",
            "guides/site-commands",
            "guides/settings",
          ],
        },
        {
          label: "Plugins",
          items: [
            "plugins/overview",
            "plugins/built-in",
            "plugins/adding-a-site",
            "plugins/external",
            "plugins/toolbox",
            "plugins/security",
          ],
        },
        typeDocSidebarGroup,
        {
          label: "Project",
          items: ["project/how-it-works", "project/development", "project/releases"],
        },
      ],
    }),
  ],
})
