---
layout: home

hero:
  name: subtrack
  text: Manage your subscription services from the terminal.
  tagline: Local-first subscription manager for the CLI
  image:
    src: /subtrack-cli-logo.png
    alt: subtrack
  actions:
    - theme: brand
      text: Get Started
      link: /installation
    - theme: alt
      text: Commands
      link: /commands

features:
  - title: CLI-first
    details: Full CLI for scripting and automation, plus an interactive menu for exploring your subscriptions.
  - title: Local SQLite
    details: All data is stored locally. No servers, no accounts, no telemetry.
  - title: Currency Conversion
    details: Live exchange rates from open.er-api.com. View totals in any of 36 supported currencies.
---

## Quick Start

```bash
# List all subscriptions
subtrack list

# Add a subscription
subtrack add --name Netflix --price 1999 --currency USD --cycle monthly

# Show monthly payment total
subtrack payment

# Show upcoming bills
subtrack upcoming

# Run `subtrack` alone to open the interactive menu
subtrack
```
