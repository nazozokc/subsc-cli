<script lang="ts">
  import { base } from "$app/paths"
</script>

<svelte:head>
  <title>subtrack — CLI subscription manager</title>
  <meta name="description" content="Manage your subscription services from the terminal." />
</svelte:head>

<section class="hero">
  <img
    class="logo-img"
    src="{base}/subtrack-cli-logo.png"
    alt="subtrack"
    width="320"
    height="auto"
  />
  <h1>subtrack</h1>
  <p class="tagline">Manage your subscription services from&nbsp;the&nbsp;terminal.</p>
  <div class="install">
    <pre>npm install -g subtrack</pre>
  </div>
</section>

<section class="features">
  <div class="feature">
    <h2>CLI &amp; TUI</h2>
    <p>Interactive terminal UI for browsing subscriptions, plus a full CLI for scripting and automation.</p>
  </div>
  <div class="feature">
    <h2>Local SQLite</h2>
    <p>All data is stored locally. No servers, no accounts, no telemetry.</p>
  </div>
  <div class="feature">
    <h2>Currency Conversion</h2>
    <p>Live exchange rates from open.er-api.com. View totals in any of 36 supported currencies.</p>
  </div>
</section>

<section class="home-usage">
  <h2>Quick Start</h2>
  <pre># List all subscriptions
subtrack list

# Add a subscription
subtrack add --name Netflix --price 1999 --currency USD --cycle monthly

# Edit a subscription
subtrack edit 3 --price 2500

# Clone a subscription
subtrack clone 3 --name "Netflix (Backup)"

# Archive a subscription
subtrack archive 4

# Show monthly payment total
subtrack payment

# Show upcoming bills
subtrack upcoming

# Show summary statistics
subtrack summary

# Show detailed analytics
subtrack analytics

# Filter by tags
subtrack tags music video

# Run database maintenance
subtrack maintenance

# Show database stats
subtrack stats</pre>
  <p style="margin-top: 1rem;">
    <a href={base + "/installation"}>Installation guide &rarr;</a>
    &nbsp;&middot;&nbsp;
    <a href={base + "/commands"}>Full command reference &rarr;</a>
  </p>
</section>

<style>
  .hero {
    text-align: center;
    padding: 4rem 0 3rem;
  }

  .logo-img {
    display: block;
    margin: 0 auto 1.5rem;
    max-width: 320px;
    width: 100%;
    height: auto;
  }

  h1 {
    font-family: var(--font-mono);
    font-size: 3rem;
    font-weight: 800;
    letter-spacing: -0.03em;
    background: linear-gradient(135deg, var(--accent), #c084fc);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .tagline {
    margin-top: 0.75rem;
    font-size: 1.15rem;
    color: var(--muted);
  }

  .install {
    margin-top: 1.5rem;
  }

  .install pre {
    display: inline-block;
    padding: 0.6rem 1.2rem;
    font-size: 0.9rem;
  }

  .features {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 1.5rem;
    padding: 2rem 0;
  }

  .feature {
    background: #141414;
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 1.5rem;
  }

  .feature h2 {
    font-size: 1.1rem;
    margin-bottom: 0.5rem;
  }

  .feature p {
    font-size: 0.9rem;
    color: var(--muted);
    line-height: 1.5;
  }

</style>
