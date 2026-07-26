---
title: Usage Guides
description: Practical usage examples and workflows for subtrack.
---

Practical workflows for managing your subscriptions with subtrack.

## First-time setup & adding subscriptions

After installation, start by adding your subscriptions. The interactive mode guides you through each field:

```bash
subtrack add
```

You'll be prompted for: name, price, currency, billing cycle, and tags. Once added, verify with:

```bash
subtrack list
```

### Example: Adding a Netflix subscription

```bash
subtrack add \
  --name "Netflix Premium" \
  --price 1980 \
  --currency JPY \
  --cycle monthly \
  --tags "video,entertainment"
```

## Editing subscriptions

Update existing subscriptions with `subtrack edit`. Run it interactively to pick a subscription and choose which fields to change:

```bash
subtrack edit
```

For non-interactive use, specify the subscription ID and the fields to update:

```bash
subtrack edit 3 --price 2500 --tags "video,entertainment,4k"
```

To see subscription IDs, run `subtrack list`.

### Managing status and billing day

Each subscription has a **status** (`active`, `paused`, `cancelled`) and an optional **billing day** (day of month).

```bash
# Pause a subscription (excluded from totals and upcoming bills)
subtrack edit 3 --status paused

# Set a specific billing day for accurate upcoming bill predictions
subtrack edit 3 --billingDay 15

# Reactivate a paused subscription
subtrack edit 3 --status active
```

Paused subscriptions are preserved in the database but excluded from payment calculations. Cancelled subscriptions are kept for record-keeping but excluded from all totals.

## Tracking upcoming bills

See which subscriptions are due for payment soon:

```bash
# Bills due in the next 7 days (default)
subtrack upcoming

# Bills due in the next 30 days
subtrack upcoming 30

# Bills due today
subtrack upcoming 0
```

The `upcoming` command uses each subscription's `billingDay` (or creation date) to calculate the next billing date. Only active and paused subscriptions are included.

## Analytics and budget tracking

Get detailed analytics including status breakdown and budget tracking:

```bash
subtrack analytics
```

Set a monthly budget to track spending:

```bash
subtrack config set monthlyBudget 500
subtrack analytics
```

The analytics command shows whether you're within budget or over.

## Importing from CSV

Bulk-import subscriptions from a CSV file:

```bash
subtrack import subscriptions.csv
```

The CSV must have the header `name,cycle,tags,price,currency`. Tags are separated by semicolons:

```csv
name,cycle,tags,price,currency
Netflix,monthly,video;entertainment,1980,JPY
GitHub Copilot,monthly,development,10,USD
```

Use `--dry-run` to validate without importing:

```bash
subtrack import subscriptions.csv --dry-run
```

## Tag-based organization

Tags are a powerful way to categorize subscriptions. Examples:

- **By category:** `music`, `video`, `cloud`, `productivity`
- **By priority:** `essential`, `nice-to-have`
- **By payment method:** `credit-card`, `paypal`
- **By usage:** `personal`, `work`, `family`

Filter by tags:

```bash
# Find all music-related subscriptions
subtrack tags music

# Find subscriptions used for both work and personal
subtrack tags work personal
```

Tags use AND logic — only subscriptions matching **all** specified tags are shown.

### Managing tags

View all tags and their usage count:

```bash
subtrack tag list
```

Rename a tag (merges if the new name already exists):

```bash
subtrack tag rename entertainment fun
```

Delete a tag and its associations:

```bash
subtrack tag delete fun
```

Clean up orphaned tags (tags no longer attached to any subscription):

```bash
subtrack tag prune
```

## Understanding your spending

Use `subtrack payment` to see your total spending across different periods:

```bash
# How much per month?
subtrack payment

# How much per year?
subtrack payment yearly

# Weekly cost in USD
subtrack payment weekly --currency USD
```

`payment` automatically converts all billing cycles to the target period. A yearly subscription will be divided into monthly cost, and a weekly subscription will be multiplied accordingly.

You can also include LLM API usage costs in the payment calculation:

```bash
# Monthly subscription + API costs
subtrack payment monthly --api

# API costs converted to JPY
subtrack payment monthly --api --currency JPY
```

### Summary statistics

Get a quick overview of all your subscriptions:

```bash
subtrack summary
```

This shows total count, the most expensive subscription, monthly spending broken down by currency, and monthly spending broken down by tag.

## Managing multi-currency subscriptions

If you have subscriptions in different currencies (e.g., JPY for local services and USD for international ones), subtrack handles this natively:

```bash
# See everything in your local currency
subtrack list --currency JPY

# Compare spending across currencies
subtrack list
```

Without `--currency`, subscriptions are grouped by their original currency with per-group subtotals.

## Exporting data

Export subscriptions for use in spreadsheets or other tools:

```bash
# CSV (for Excel / Google Sheets)
subtrack export csv

# JSON (for programmatic use)
subtrack export json

# Markdown (for documentation)
subtrack export md

# Filter by tags and convert currency
subtrack export csv --tags video --currency JPY
```

## Regular backups

Set up a cron job (or Task Scheduler on Windows) for automatic backups:

```bash
# Example cron: daily backup at 3 AM
0 3 * * * subtrack backup ~/subtrack-backups
```

Backups are timestamped and will never overwrite previous files. See [Data & Storage](/data) for restore instructions.

## Tracking LLM API costs

subtrack can track LLM API usage costs alongside subscription costs. This is useful if you use paid LLM APIs (OpenAI, Anthropic, etc.) and want to see total AI spending.

### Adding usage entries

```bash
# Interactive mode
subtrack usage add

# Non-interactive
subtrack usage add \
  --provider openai \
  --model gpt-4o \
  --inputTokens 5000 \
  --outputTokens 1500 \
  --date 2026-06-19 \
  --description "Code review"
```

Cost is automatically calculated using LiteLLM pricing data. If a model is not recognized, you'll be prompted to enter the cost manually.

### Listing and filtering

```bash
# All entries
subtrack usage list

# Filter by provider and date range
subtrack usage list --provider anthropic --from 2026-06-01
```

### Including API costs in payment totals

```bash
# See subscription + API costs together
subtrack payment monthly --api
```

API costs for the current period are fetched and added to the subscription totals. They are stored in USD cents and automatically converted if you use `--currency`.

### Auto-scanning from AI tools

subtrack can automatically discover and import LLM usage data from various AI coding tools:

```bash
# Auto-scan known sources for the current month
subtrack usage refresh

# Scan a specific date range
subtrack usage refresh --from 2026-01-01 --to 2026-06-30

# Scan all available historical data
subtrack usage refresh --all
```

Supported sources: OpenCode DB, Claude Code, Codex CLI, Cursor, GitHub Copilot, and Windsurf.

### Importing from log files

Import usage data from provider response logs:

```bash
# Import from a JSONL file
subtrack usage import ./openai-responses.jsonl

# Pipe from stdin
cat responses.jsonl | subtrack usage import -
```

### Refreshing pricing data

The LiteLLM pricing cache is automatically refreshed every 24 hours. To force a refresh:

```bash
subtrack usage refresh
```

## Searching subscriptions

Quickly find subscriptions by name, notes, or tags:

```bash
# Search interactively
subtrack search

# Search by keyword
subtrack search netflix

# Search in notes only
subtrack search "family plan" --notes
```

## Tracking free trials

Add trial periods to get reminders before they expire:

```bash
# Add a trial
subtrack trial add --name "Spotify Premium" --expires-at 2026-08-01 --price 980 --currency JPY --cycle monthly

# List all trials
subtrack trial list

# See what's expiring soon
subtrack trial expiring 7
```

## Bulk operations

Manage multiple subscriptions at once with filters:

```bash
# Pause all unused subscriptions
subtrack bulk status --set paused --tag unused

# Delete cancelled subscriptions
subtrack bulk delete --status cancelled

# Tag all active music subscriptions
subtrack bulk tag add --add music --status active
```

## Spending forecast

Project your subscription costs into the future:

```bash
# 12-month forecast
subtrack forecast

# What if I cancel Netflix?
subtrack forecast --cancel Netflix

# What if I add a new service?
subtrack forecast --add-name "New Service" --add-price 1500 --add-currency JPY --add-cycle monthly
```

## Cost optimization

Let subtrack analyze your subscriptions for savings:

```bash
# Show all optimization suggestions
subtrack optimize

# Only show suggestions saving $100+/year
subtrack optimize --min-savings 100
```

The optimizer flags:
- **Cycle changes** — switching from monthly to yearly could save money
- **Duplicate subscriptions** — similar services with overlapping features
- **Inactive subscriptions** — paused or long-unused subscriptions
- **Cancelled waste** — subscriptions that were cancelled but had recent payments

## Comparing spending over time

See how your costs have changed between periods:

```bash
# Current month vs last month
subtrack compare

# Current quarter vs last quarter
subtrack compare quarterly
```

The `compare` command accounts for price changes recorded in your subscription history.

## Monthly spending timeline

Visualize spending trends:

```bash
# 12-month view
subtrack timeline

# 6-month view with category breakdown
subtrack timeline --months 6 --categories
```

## Price change history

Track when subscription prices changed:

```bash
# History for a specific subscription
subtrack history 3

# All recent changes
subtrack history --all --days 30
```

## Calendar view

See which days of the month have bills due:

```bash
# Current month
subtrack calendar

# Specific month
subtrack calendar --month 12 --year 2026
```

## Desktop notifications

Get OS-level reminders for upcoming bills:

```bash
# Preview upcoming bills
subtrack notify --dry-run

# Send notification
subtrack notify

# Custom look-ahead period
subtrack notify --days 3
```

## Filter profiles

Save and switch between filter profiles to focus on specific subscription groups:

```bash
# Save a "work" profile
subtrack profile save work --tag work --status active

# Switch to work profile
subtrack profile switch work

# See everything again (clear profile)
# (restart subtrack or use subtrack list without profile)

# List saved profiles
subtrack profile list
```

## MCP integration

subtrack runs an MCP (Model Context Protocol) server, allowing AI assistants to manage your subscriptions:

```bash
subtrack mcp
```

This enables AI tools like Claude Desktop, Cursor, and Windsurf to read and modify your subscription data. See the [MCP page](/mcp) for setup instructions and tool reference.
