import { defineConfig } from "vitepress"

export default defineConfig({
  lang: "en-US",
  title: "subtrack",
  description: "Manage your subscription services from the terminal.",
  base: "/subtrack/",
  head: [
    [
      "link",
      {
        rel: "icon",
        type: "image/png",
        href: "/subtrack/subtrack-cli-logo.png",
      },
    ],
  ],
  themeConfig: {
    logo: "/subtrack-cli-logo.png",
    search: {
      provider: "local",
    },
    nav: [
      { text: "Commands", link: "/commands" },
      { text: "GitHub", link: "https://github.com/nazozokc/subtrack" },
      { text: "npm", link: "https://www.npmjs.com/package/subtrack" },
    ],
    sidebar: [
      {
        text: "Getting Started",
        items: [
          { text: "Home", link: "/" },
          { text: "Installation", link: "/installation" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "Commands", link: "/commands" },
          { text: "MCP", link: "/mcp" },
        ],
      },
      {
        text: "Guides",
        items: [
          { text: "Usage Guides", link: "/guides" },
          { text: "Data & Storage", link: "/data" },
          { text: "Configuration", link: "/configuration" },
        ],
      },
      {
        text: "Development",
        items: [
          { text: "Development", link: "/development" },
          { text: "FAQ", link: "/faq" },
        ],
      },
    ],
    footer: {
      message: "MIT",
      copyright: "nazozokc",
    },
  },
})
