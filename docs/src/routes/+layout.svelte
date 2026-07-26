<script lang="ts">
  import { page } from "$app/stores"
  import { base } from "$app/paths"
  import "../app.css"

  let { children } = $props()
  let sidebarOpen = $state(false)

  type NavItem = {
    href: string
    label: string
  }

  type NavSection = {
    title: string
    items: NavItem[]
  }

  const sections: NavSection[] = [
    {
      title: "Getting Started",
      items: [
        { href: "/", label: "Home" },
        { href: "/installation", label: "Installation" },
      ],
    },
    {
      title: "Reference",
      items: [
        { href: "/commands", label: "Commands" },
        { href: "/mcp", label: "MCP" },
      ],
    },
    {
      title: "Guides",
      items: [
        { href: "/guides", label: "Usage Guides" },
        { href: "/tui", label: "Interactive TUI" },
        { href: "/data", label: "Data & Storage" },
        { href: "/configuration", label: "Configuration" },
      ],
    },
    {
      title: "Development",
      items: [
        { href: "/development", label: "Development" },
        { href: "/faq", label: "FAQ" },
      ],
    },
  ]

  function isActive(href: string): boolean {
    const path = $page.url.pathname
    if (href === "/") return path === base + "/" || path === base
    return path === base + href
  }

  function closeSidebar() {
    sidebarOpen = false
  }
</script>

<header>
  <nav>
    <div class="nav-left">
      <button
        class="sidebar-toggle"
        class:open={sidebarOpen}
        onclick={() => (sidebarOpen = !sidebarOpen)}
        aria-label="Toggle sidebar"
      >
        <div class="hamburger">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </button>
      <a href={base + "/"} class="logo">subtrack</a>
    </div>
    <div class="nav-links">
      <a href={base + "/commands"}>Docs</a>
      <a href="https://github.com/nazozokc/subtrack">GitHub</a>
      <a href="https://www.npmjs.com/package/subtrack">npm</a>
    </div>
  </nav>
</header>

<div class="layout">
  <!-- Sidebar overlay (mobile) -->
  {#if sidebarOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="sidebar-overlay visible" onclick={closeSidebar} role="button" tabindex="-1"></div>
  {/if}

  <aside class:open={sidebarOpen}>
    <nav>
      {#each sections as section}
        <div class="sidebar-section">
          <div class="sidebar-section-title">{section.title}</div>
          {#each section.items as item}
            <a
              href={base + item.href}
              class:active={isActive(item.href)}
            >
              {item.label}
            </a>
          {/each}
        </div>
      {/each}
    </nav>
  </aside>

  <main>
    {@render children()}
  </main>
</div>

<footer class="docs-footer">
  <p>MIT &mdash; <a href="https://github.com/nazozokc/subtrack">nazozokc/subtrack</a></p>
</footer>
