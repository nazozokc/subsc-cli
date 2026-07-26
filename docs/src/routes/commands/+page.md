---
title: Commands
description: Full reference for all subtrack CLI commands.
---

subtrack provides the following commands. Most support both interactive and non-interactive modes.

<details>
<summary><strong>Quick navigation</strong></summary>

- [`list`](#list)
- [`add`](#add)
- [`edit`](#edit)
- [`delete`](#delete)
- [`upcoming`](#upcoming)
- [`payment`](#payment)
- [`summary`](#summary)
- [`analytics`](#analytics)
- [`tags`](#tags)
- [`tag`](#tag)
- [`export`](#export)
- [`import`](#import)
- [`clone`](#clone)
- [`archive`](#archive)
- [`unarchive`](#unarchive)
- [`search`](#search)
- [`trial`](#trial)
- [`bulk`](#bulk)
- [`forecast`](#forecast)
- [`history`](#history)
- [`timeline`](#timeline)
- [`optimize`](#optimize)
- [`compare`](#compare)
- [`calendar`](#calendar)
- [`notify`](#notify)
- [`profile`](#profile)
- [`audit`](#audit)
- [`maintenance`](#maintenance)
- [`cleanup`](#cleanup)
- [`stats`](#stats)
- [`currency`](#currency)
- [`backup`](#backup)
- [`restore`](#restore)
- [`config`](#config)
- [`usage`](#usage)
- [`mcp`](#mcp)
- [`tui`](#tui)

</details>

## `list`

Lists all subscriptions in a formatted table. Subscriptions are grouped by currency by default, with a subtotal row per group.

| Option | Description |
|--------|-------------|
| `-c, --currency <C>` | Convert all prices to the given currency using live exchange rates |
| `--sort <field>` | Sort by field: `name`, `price`, `currency`, `cycle`, `status`, `id` (default) |
| `-d, --desc` | Sort in descending order (use with `--sort`) |
| `-a, --api` | Include LLM API usage costs for the current month |
| `-n, --notes` | Show notes column |
| `-m, --method` | Show payment method column |
| `-j, --json` | Output as JSON |
| `--tags <tags>` | Comma-separated tag names to filter by (AND logic) |
| `--limit <n>` | Max number of items to show |
| `--offset <n>` | Number of items to skip |
| `--include-archived` | Include archived subscriptions |

### Examples

```bash
# List all subscriptions (grouped by currency)
subtrack list

# Convert all prices to JPY
subtrack list --currency JPY

# Sort by price (cheapest first)
subtrack list --sort price

# Sort by name, descending
subtrack list --sort name --desc

# Include LLM API usage for current month
subtrack list --api

# Combine with currency conversion
subtrack list --api --currency JPY

# Show payment method and notes columns
subtrack list --method --notes

# Filter by tags
subtrack list --tags music,video

# JSON output for scripting
subtrack list --json

# Include archived subscriptions
subtrack list --include-archived
```

When `--currency` is used, all prices are converted to the target currency (fetched from [open.er-api.com](https://open.er-api.com)) and displayed as a single group with a grand total.

When `--api` is used, LLM API usage costs for the current month are fetched from the `llm_usage` table and displayed in a separate table below the subscription list, including a provider breakdown.

## `add`

Adds a new subscription. Without flags, prompts for all fields interactively. Providing all flags skips prompts entirely (useful for scripts).

| Option | Description |
|--------|-------------|
| `--name <name>` | Subscription name (max 100 characters) |
| `--price <price>` | Payment amount — integer, non-negative, max 99,999,999 |
| `--currency <C>` | Currency code (ISO 4217). Accepts any 3-letter code; interactive mode provides a curated list |
| `--cycle <cycle>` | Billing cycle. One of: weekly, bi-weekly, monthly, quarterly, semi-annual, yearly |
| `--tags <tags>` | Comma-separated tags (max 10 tags, each max 50 characters) |
| `--status <status>` | Subscription status: `active`, `paused`, `cancelled` (default: `active`) |
| `--billingDay <n>` | Billing day of month (1–31). If not set, defaults to the creation date |
| `--paymentMethod <method>` | Payment method (e.g. `credit_card`, `paypal`) |

### Examples

```bash
# Interactive mode
subtrack add

# Fully non-interactive (skips confirmation)
subtrack add \
  --name Spotify \
  --price 980 \
  --currency JPY \
  --cycle monthly \
  --tags music

# Partial flags — missing fields are prompted
subtrack add --name Netflix

# Tags with existing tag autocomplete
subtrack add --name "AWS" --price 50 --currency USD --cycle monthly

# Add a paused subscription
subtrack add \
  --name "Adobe CC" \
  --price 6980 \
  --currency JPY \
  --cycle monthly \
  --status paused

# Set a custom billing day
subtrack add \
  --name Netflix \
  --price 1980 \
  --currency JPY \
  --cycle monthly \
  --billingDay 15

# Set payment method
subtrack add \
  --name Spotify \
  --price 980 \
  --currency JPY \
  --cycle monthly \
  --paymentMethod credit_card
```

## `edit`

Edits an existing subscription. Without flags, interactively selects a subscription and fields to change. Flags can be used for non-interactive partial updates.

| Option | Description |
|--------|-------------|
| `[id]` | Subscription ID (optional). If omitted, prompts for selection |
| `--name <name>` | New subscription name |
| `--price <price>` | New payment amount |
| `--currency <C>` | New currency code |
| `--cycle <cycle>` | New billing cycle |
| `--tags <tags>` | New comma-separated tags |
| `--status <status>` | New status: `active`, `paused`, `cancelled` |
| `--billingDay <n>` | New billing day (1–31, or empty to clear) |
| `--paymentMethod <method>` | New payment method |

### Examples

```bash
# Interactive: select subscription, then pick fields to edit
subtrack edit

# Edit a specific subscription by ID
subtrack edit 3

# Non-interactive: update price only
subtrack edit 3 --price 1500

# Update multiple fields
subtrack edit 3 --name "Netflix Premium" --price 2500 --currency JPY

# Pause a subscription
subtrack edit 3 --status paused

# Change billing day
subtrack edit 3 --billingDay 1

# Clear billing day (use cycle creation date instead)
subtrack edit 3 --billingDay ""

# Change payment method
subtrack edit 3 --paymentMethod paypal
```

Without flags, `edit` shows a multi-select of fields to change. Each selected field is prompted with the current value as default.

## `delete [ids...]`

Shows an interactive checkbox list of all subscriptions. Select one or more to delete. Confirmation is required before deletion.

You can also specify subscription IDs as positional arguments for non-interactive deletion.

### Examples

```bash
# Interactive: checkbox selection
subtrack delete

# Non-interactive: delete by ID(s)
subtrack delete 3
subtrack delete 2 5 7
```

## `upcoming [days]`

Shows subscriptions that are due for billing within the specified number of days (default: 7). Only active and paused subscriptions are included. Bills are calculated based on each subscription's billing cycle and `billingDay` (or creation date if not set).

| Argument | Description |
|----------|-------------|
| `[days]` | Number of days to look ahead (default: 7). Must be a non-negative integer. |

| Option | Description |
|--------|-------------|
| `-j, --json` | Output as JSON |

### Examples

```bash
# Bills due in the next 7 days (default)
subtrack upcoming

# Bills due in the next 30 days
subtrack upcoming 30

# Bills due today
subtrack upcoming 0

# JSON output
subtrack upcoming --json
```

## `clone`

Clones an existing subscription. Creates a new subscription pre-filled with all fields from the source, with optional overrides.

| Option | Description |
|--------|-------------|
| `[id]` | Subscription ID to clone |
| `--name <name>` | New name (default: `<original> (copy)`) |
| `--price <price>` | Override price |
| `--currency <C>` | Override currency |
| `--cycle <cycle>` | Override billing cycle |
| `--tags <tags>` | Override tags (comma-separated) |

### Examples

```bash
# Clone subscription 3 with auto-naming
subtrack clone 3

# Clone with custom name
subtrack clone 3 --name "Netflix (Secondary)"

# Clone with overrides
subtrack clone 3 --price 1500 --tags "video,4k"
```

## `archive`

Archives a subscription by setting its status to `archived`. Archived subscriptions are preserved in the database but excluded from all payment calculations and reports. Unlike `cancelled`, archived subscriptions are intended for long-term record-keeping.

| Argument | Description |
|----------|-------------|
| `[id]` | Subscription ID to archive |

```bash
# Archive subscription 3
subtrack archive 3
```

## `unarchive`

Unarchives a subscription, restoring its status to `active`.

| Argument | Description |
|----------|-------------|
| `[id]` | Subscription ID to unarchive |

```bash
# Unarchive subscription 3
subtrack unarchive 3
```

Output is sorted by due date and shows each subscription's name, amount, cycle, and tags. A total row is displayed when multiple subscriptions are shown.

## `payment [period]`

Calculates and displays how much you pay over a given billing period. All subscriptions are automatically converted to the target period based on their billing cycle.

The `period` argument defaults to `monthly`. Valid values:

| Period | Alias |
|--------|-------|
| `weekly` | per week |
| `bi-weekly` | per two weeks |
| `monthly` | per month (default) |
| `quarterly` | per 3 months |
| `semi-annual` | per 6 months |
| `yearly` | per year |

| Option | Description |
|--------|-------------|
| `-c, --currency <C>` | Convert all prices to the given currency using live exchange rates |
| `-a, --api` | Include LLM API usage costs in the total |
| `-m, --method` | Group by payment method |
| `-j, --json` | Output as JSON |

### Examples

```bash
# Monthly total (default)
subtrack payment

# Yearly total
subtrack payment yearly

# Weekly total in JPY
subtrack payment weekly --currency JPY

# Include LLM API usage costs
subtrack payment monthly --api

# API costs in a specific currency
subtrack payment monthly --api --currency JPY

# Group by payment method
subtrack payment --method

# JSON output
subtrack payment --json
```

When `--currency` is used, the total is displayed as a single amount in the target currency. Without it, totals are grouped by currency.

When `--api` is used, API usage costs for the current period are fetched from the `llm_usage` table and added to the subscription totals. API costs are stored in USD cents and are shown both individually and as part of the grand total.

If exchange rates cannot be fetched (e.g. offline), the command falls back to per-currency display without conversion.

## `summary`

Shows a summary of all subscriptions including:

- Total number of subscriptions
- Most expensive subscription
- Monthly spending by currency
- Monthly spending by tag (sorted by cost)

| Option | Description |
|--------|-------------|
| `-j, --json` | Output as JSON |

### Example

```bash
subtrack summary

# JSON output
subtrack summary --json
```

Output:

```
Total subscriptions:  5
Most expensive:       AWS ($50.00/month)

Monthly by currency:
  JPY    ¥4,940
  USD    $85.00

Monthly by tag:
  hosting           $50.00/month (1 sub)
  video             $47.00/month (3 subs)
  ...
```

## `analytics`

Shows detailed subscription analytics, including a status breakdown (active/paused/cancelled/archived), monthly spending by currency and tag, and budget tracking if a monthly budget has been configured.

### Example

```bash
subtrack analytics
```

Output:

```
📊 Subscription Analytics

Overview:
  Total subscriptions:  5
  Status breakdown:
    active: 4
    paused: 1

Monthly spending:
  JPY    ¥4,940
  USD    $85.00
  ──────────────────────────────
  Budget:     $500.00
  Remaining:  $415.00

Monthly by tag:
  hosting           $50.00/month (1 sub)
  video             $47.00/month (3 subs)
  ...
```

The budget display requires a monthly budget set via `subtrack config set monthlyBudget <amount>`.

## `tags <taglist...>`

Filters and displays subscriptions that have **all** specified tags (AND logic).

### Examples

```bash
# Subscriptions tagged with "music"
subtrack tags music

# Subscriptions tagged with both "music" AND "video"
subtrack tags music video

# Subscriptions tagged with "entertainment", "video", and "kids"
subtrack tags entertainment video kids
```

## `tag`

Manages tags with the following subcommands:

### `tag list`

Lists all tags with their subscription count.

| Option | Description |
|--------|-------------|
| `--sort <field>` | Sort by: `name` or `count` (default: `name`) |

```bash
# List all tags
subtrack tag list

# Sort by usage count
subtrack tag list --sort count
```

### `tag rename <old> <new>`

Renames a tag. If the new name already exists, the old tag is merged into it.

```bash
subtrack tag rename entertainment fun
```

### `tag delete <name>`

Deletes a tag and removes its associations from subscriptions.

```bash
subtrack tag delete fun
```

### `tag prune`

Removes orphaned tags (tags not associated with any subscription).

```bash
subtrack tag prune
```

### `tag merge <source> <target>`

Merges a source tag into a target tag. All subscriptions tagged with the source tag are reassigned to the target tag, and the source tag is deleted. If the target tag doesn't exist, it's created.

```bash
subtrack tag merge entertainment fun
```

## `import <file>`

Imports subscriptions from a CSV file. The CSV must have a header row with exactly `name,cycle,tags,price,currency`.

| Argument | Description |
|----------|-------------|
| `<file>` | Path to the CSV file |
| `--dry-run` | Validate rows without importing |
| `--deduplicate` | Skip or update existing subscriptions with the same name |

### CSV format

```
name,cycle,tags,price,currency
Netflix,monthly,video;entertainment,1980,JPY
GitHub Copilot,monthly,development,10,USD
AWS,monthly,cloud;hosting,50,USD
```

- Tags are separated by `;` (semicolon) in the CSV
- Price is an integer (smallest currency unit)
- Currency is an ISO 4217 code
- Cycle must be one of: weekly, bi-weekly, monthly, quarterly, semi-annual, yearly

### Examples

```bash
# Import from file
subtrack import subscriptions.csv

# Dry-run: validate without importing
subtrack import subscriptions.csv --dry-run
```

## `export <format>`

Exports subscriptions to the specified format.

| Argument | Description |
|----------|-------------|
| `<format>` | Export format: `csv`, `json`, `md`, `excel`, `ics` |

| Option | Description |
|--------|-------------|
| `-c, --currency <C>` | Convert all prices to the given currency before exporting |
| `--tags <tags>` | Filter by comma-separated tags before exporting |
| `--status <status>` | Filter by status (comma-separated: `active`, `paused`, `cancelled`) |
| `-o, --output <path>` | Write to file instead of stdout |

### Examples

```bash
# Export as CSV
subtrack export csv

# Export as JSON
subtrack export json

# Export as Markdown
subtrack export md

# Export as Excel (.xlsx)
subtrack export excel

# Export as iCalendar (.ics) — importable into calendar apps
subtrack export ics

# Export only tagged subscriptions, converted to JPY
subtrack export csv --tags music,video --currency JPY

# Write to a file instead of stdout
subtrack export csv --output subscriptions.csv
```

## `backup [destination]`

Creates a timestamped gzip-compressed backup of the SQLite database. The backup filename follows the format `subtrack_YYYYMMDD_HHmmss.db.gz`.

If no destination is specified, backups are saved to `~/.config/subtrack/backups/` (created automatically). Backups use exclusive file creation and will never overwrite existing files.

| Option | Description |
|--------|-------------|
| `-e, --encrypt` | Encrypt the backup using AES-256-GCM with your database encryption key |

Encrypted backups use the `.db.enc` extension and require the same derived key material to restore (either the same `.key` file, or the same passphrase **and** persisted salt).

### Examples

```bash
# Backup to default directory (~/.config/subtrack/backups/)
subtrack backup

# Backup to a specific directory
subtrack backup ~/backups

# Backup to current directory
subtrack backup .

# Create an encrypted backup
subtrack backup --encrypt
```

## `restore [file]`

Restores the database from a backup file. If no file is specified, shows an interactive list of available backups from the default backup directory (`~/.config/subtrack/backups/`).

Before restoring, the current database is automatically backed up (timestamped with `_before_restore.db.gz` suffix) as a safety measure.

Each backup has a SHA-256 hash sidecar file (`<backup>.sha256`) for integrity verification. The restore command checks this hash before proceeding and warns if it doesn't match.

| Option | Description |
|--------|-------------|
| `-f, --force` | Skip confirmation prompt and hash check warnings |
| `--dir <path>` | Scan a custom directory for backup files |

### Examples

```bash
# Interactive: select a backup from the default directory
subtrack restore

# Restore from a specific file
subtrack restore ~/backups/subtrack_20260617_143000.db.gz

# Force restore without confirmation
subtrack restore ~/backups/subtrack_20260617_143000.db.gz --force

# List backups from a custom directory
subtrack restore --dir ~/custom-backups
```

## `config`

Manages subtrack configuration. Configuration is stored in `~/.config/subtrack/config.json`.

| Subcommand | Description |
|------------|-------------|
| `list` | List all config values |
| `get <key>` | Get a specific config value |
| `set <key> <value>` | Set a config value |
| `reset` | Reset config to defaults |

### Config keys

| Key | Description | Default |
|-----|-------------|---------|
| `defaultCurrency` | Default currency for display and analytics | `USD` |
| `monthlyBudget` | Monthly spending budget in USD (0 = disabled) | `0` |
| `theme` | Display theme | `default` |

### Examples

```bash
# List all config values
subtrack config list

# Get a specific config value
subtrack config get defaultCurrency

# Set a monthly budget of $500
subtrack config set monthlyBudget 500

# Set default display currency
subtrack config set defaultCurrency JPY

# Reset all config to defaults
subtrack config reset
```

The `config set` command validates input (e.g., currency codes must be ISO 4217, budget must be non-negative).

## `usage`

Tracks LLM API usage costs. Costs are auto-calculated from model pricing when available, with manual fallback.

### `usage add`

Records an LLM API usage entry. Without flags, prompts for all fields interactively.

| Option | Description |
|--------|-------------|
| `--provider <name>` | Provider: `openai`, `anthropic`, `google-ai`, `mistral`, `groq`, `together`, `deepseek`, `cohere`, or custom |
| `--model <name>` | Model name (e.g. `gpt-4o`, `claude-3-opus-20240229`) |
| `--inputTokens <n>` | Input token count |
| `--outputTokens <n>` | Output token count |
| `--date <YYYY-MM-DD>` | Date of usage (default: today) |
| `--description <text>` | Optional description |
| `--cost <amount>` | Total cost in USD (e.g. `0.50` for 50 cents; overrides auto-pricing) |

```bash
# Interactive mode
subtrack usage add

# Non-interactive
subtrack usage add \
  --provider openai \
  --model gpt-4o \
  --inputTokens 500 \
  --outputTokens 200 \
  --date 2026-06-19 \
  --description "Chat completion"

# Override auto-calculated cost
subtrack usage add \
  --provider openai \
  --model gpt-4o \
  --inputTokens 500 \
  --outputTokens 200 \
  --cost 0.15
```

Cost is calculated automatically via the LiteLLM pricing cache (fetched from GitHub, cached for 24 hours). If pricing is not found, the tool falls back to querying the LiteLLM Model Catalog API, then prompts for manual cost input. Use `--cost` to override auto-pricing entirely.

### `usage list`

Lists LLM API usage entries with optional filtering.

| Option | Description |
|--------|-------------|
| `--provider <name>` | Filter by provider |
| `--from <YYYY-MM-DD>` | Start date (inclusive) |
| `--to <YYYY-MM-DD>` | End date (inclusive) |
| `-j, --json` | Output as JSON |

```bash
# List all entries
subtrack usage list

# Filter by provider and date range
subtrack usage list --provider openai --from 2026-01-01 --to 2026-06-30

# JSON output
subtrack usage list --json
```

Shows up to 100 entries with provider, model, token counts, cost, date, and description. Displays a total cost at the bottom.

### `usage delete`

Interactively selects and deletes LLM API usage entries.

```bash
subtrack usage delete
```

Multi-select via checkbox → confirm → batch delete. You can also pass entry IDs directly:

```bash
subtrack usage delete 3 5 7
```

### `usage import`

Imports LLM API usage from JSONL or JSON response log files. Supports importing from provider API response formats (e.g. OpenAI, Anthropic) by parsing token usage from the response body.

| Option | Description |
|--------|-------------|
| `<file>` | JSONL/JSON file to import (use `-` for stdin) |
| `--dry-run` | Validate without importing |

Input size protections:
- **File import**: max 50 MB
- **Stdin import**: max 10 MB, with a 30-second timeout
- Exceeding these limits will abort with an error message

```bash
# Import from a JSONL file
subtrack usage import ./openai-responses.jsonl

# Import from stdin
cat responses.jsonl | subtrack usage import -

# Dry-run to validate
subtrack usage import ./responses.jsonl --dry-run
```

### `usage refresh`

Auto-scans known AI tool sources to find and import LLM usage data. Scans the following sources by default:

- **OpenCode DB** — reads from OpenCode's own database
- **Claude Code** — parses Claude Code CLI usage logs
- **Codex CLI** — parses Codex CLI logs
- **Cursor** — parses Cursor editor usage history
- **GitHub Copilot** — parses Copilot CLI usage
- **Windsurf** — parses Windsurf editor usage

By default, scans the current month. Also refreshes the LiteLLM pricing cache from GitHub.

| Option | Description |
|--------|-------------|
| `--from <YYYY-MM-DD>` | Start date (inclusive) |
| `--to <YYYY-MM-DD>` | End date (inclusive) |
| `--all` | Scan all historical data (ignore date range) |

```bash
# Scan current month (default)
subtrack usage refresh

# Scan a specific date range
subtrack usage refresh --from 2026-01-01 --to 2026-06-30

# Scan all available history
subtrack usage refresh --all

# Force-refresh pricing cache only (no scanner data import)
# (This is the default behavior of the old refresh — pricing is auto-refreshed daily)
```

### `usage total`

Shows aggregated LLM API usage costs for a given period, including a provider breakdown.

| Option | Description |
|--------|-------------|
| `--from <YYYY-MM-DD>` | Start date (inclusive) |
| `--to <YYYY-MM-DD>` | End date (inclusive) |
| `--period <period>` | Period: `monthly`, `quarterly`, `yearly` (default: `monthly`) |
| `-j, --json` | Output as JSON |

When neither `--from`/`--to` nor `--period` is specified, defaults to the current month.

```bash
# Current month total
subtrack usage total

# Specific date range
subtrack usage total --from 2026-01-01 --to 2026-06-30

# Yearly total with provider breakdown
subtrack usage total --period yearly

# JSON output
subtrack usage total --json
```

## `search`

Searches subscriptions by name, notes, or tags. Useful for quickly finding subscriptions without scrolling through the full list.

| Option | Description |
|--------|-------------|
| `[query]` | Search query (omit for interactive prompt) |
| `--names` | Search in names only |
| `--notes` | Search in notes only |
| `--tags` | Search in tags only |
| `-j, --json` | Output as JSON |

### Examples

```bash
# Interactive search
subtrack search

# Search by keyword
subtrack search netflix

# Search in notes only
subtrack search "family plan" --notes

# JSON output
subtrack search aws --json
```

## `trial`

Track free trial periods and set reminders before they expire.

### `trial add`

| Option | Description |
|--------|-------------|
| `--name <name>` | Trial name |
| `--expires-at <YYYY-MM-DD>` | Expiration date |
| `--price <price>` | Price after trial ends |
| `--currency <C>` | Currency |
| `--cycle <cycle>` | Billing cycle |
| `--notes <text>` | Notes |

### `trial list`

Lists all tracked trial periods.

### `trial expiring [days]`

Shows trials expiring within the given number of days (default: 7).

### `trial delete [ids...]`

Deletes trial entries (interactive checkbox selection when no IDs given).

```bash
# Add a trial
subtrack trial add \
  --name "Spotify Premium" \
  --expires-at 2026-08-01 \
  --price 980 \
  --currency JPY \
  --cycle monthly

# List all trials
subtrack trial list

# Trials expiring within 7 days
subtrack trial expiring

# Trials expiring within 30 days
subtrack trial expiring 30

# Delete trials (interactive)
subtrack trial delete
```

## `bulk`

Perform bulk operations on multiple subscriptions at once, with optional filtering by tag, status, or name pattern.

### `bulk status`

| Option | Description |
|--------|-------------|
| `--set <status>` | **Required.** Target status: `active`, `paused`, `cancelled` |
| `--tag <name>` | Only affect subscriptions with this tag |
| `--status <status>` | Only affect subscriptions with this current status |
| `--name <pattern>` | Only affect subscriptions whose name contains this |
| `-f, --force` | Skip confirmation prompt |

### `bulk delete`

| Option | Description |
|--------|-------------|
| `--tag <name>` | Only affect subscriptions with this tag |
| `--status <status>` | Only affect subscriptions with this status |
| `--name <pattern>` | Only affect subscriptions whose name contains this |
| `-f, --force` | Skip confirmation prompt |

### `bulk tag add`

| Option | Description |
|--------|-------------|
| `--add <tag>` | **Required.** Tag to add |
| `--tag <name>` | Filter by existing tag |
| `--status <status>` | Filter by status |
| `--name <pattern>` | Filter by name pattern |

### `bulk tag remove`

| Option | Description |
|--------|-------------|
| `--remove <tag>` | **Required.** Tag to remove |
| `--tag <name>` | Filter by existing tag |
| `--status <status>` | Filter by status |
| `--name <pattern>` | Filter by name pattern |

```bash
# Pause all subscriptions tagged "unused"
subtrack bulk status --set paused --tag unused

# Bulk delete cancelled subscriptions
subtrack bulk delete --status cancelled --force

# Add "essential" tag to all active subscriptions
subtrack bulk tag add --add essential --status active

# Remove "trial" tag from subscriptions expiring soon
subtrack bulk tag remove --remove trial --name "Free"
```

## `forecast`

Projects subscription spending over a given number of months. Supports what-if scenarios (cancelling or adding hypothetical subscriptions) and currency conversion.

| Option | Description |
|--------|-------------|
| `--months <n>` | Number of months to forecast (default: 12) |
| `-c, --currency <C>` | Convert all prices to target currency |
| `--cancel <names>` | Comma-separated subscription names to exclude |
| `--add-name <name>` | Hypothetical subscription name to add |
| `--add-price <price>` | Hypothetical subscription price |
| `--add-currency <C>` | Hypothetical subscription currency |
| `--add-cycle <cycle>` | Hypothetical subscription cycle |

```bash
# Basic 12-month forecast
subtrack forecast

# 6-month forecast in JPY
subtrack forecast --months 6 --currency JPY

# What if I cancel Netflix?
subtrack forecast --cancel Netflix

# What if I add a new service?
subtrack forecast --add-name "New Service" --add-price 1500 --add-currency JPY --add-cycle monthly
```

## `history`

View price change history for subscriptions. Supports filtering by ID, showing all changes, or viewing recent activity.

| Option | Description |
|--------|-------------|
| `[id]` | Subscription ID to view history for |
| `--all` | Show all price changes across all subscriptions |
| `--days <n>` | Filter to recent N days (use with `--all`) |
| `-j, --json` | Output as JSON |

```bash
# View history for a specific subscription
subtrack history 3

# View all price changes
subtrack history --all

# Recent changes in the last 30 days
subtrack history --all --days 30

# JSON output
subtrack history --all --json
```

## `timeline`

Shows a monthly spending timeline with an ASCII bar chart. Useful for visualizing spending trends over time.

| Option | Description |
|--------|-------------|
| `--months <n>` | Number of months to display (default: 12) |
| `-c, --categories` | Show breakdown by category (first tag) |
| `-j, --json` | Output as JSON |

```bash
# 12-month spending timeline
subtrack timeline

# 6-month timeline with category breakdown
subtrack timeline --months 6 --categories

# JSON output
subtrack timeline --json
```

## `optimize`

Analyzes your subscriptions for cost optimization opportunities. Detects potential savings from cycle changes, duplicate subscriptions, inactive subscriptions, and cancelled subscription waste.

| Option | Description |
|--------|-------------|
| `-j, --json` | Output as JSON |
| `--min-savings <amount>` | Minimum yearly savings to show (default: 0) |

```bash
# Show all optimization suggestions
subtrack optimize

# Only show suggestions saving at least $100/year
subtrack optimize --min-savings 100

# JSON output
subtrack optimize --json
```

## `compare`

Compares subscription spending between the current period and the previous period. Useful for understanding how your costs have changed over time.

| Argument | Description |
|----------|-------------|
| `[period]` | Period: `monthly` (default), `quarterly`, `yearly` |

| Option | Description |
|--------|-------------|
| `-c, --currency <C>` | Convert all prices to target currency |
| `-a, --api` | Include LLM API usage costs |

```bash
# Compare current month vs previous month
subtrack compare

# Compare current quarter vs previous quarter
subtrack compare quarterly

# With currency conversion and API costs
subtrack compare monthly --currency JPY --api
```

## `calendar`

Displays a monthly calendar with billing days marked. Shows which subscriptions bill on which day.

| Option | Description |
|--------|-------------|
| `--month <n>` | Month (1–12, default: current) |
| `--year <yyyy>` | Year (default: current) |
| `-j, --json` | Output as JSON |

```bash
# Show current month calendar
subtrack calendar

# Show a specific month
subtrack calendar --month 12 --year 2026

# JSON output
subtrack calendar --json
```

## `notify`

Sends an OS desktop notification for upcoming bills. Supports dry-run mode to preview without notifying, and JSON output for scripting.

| Option | Description |
|--------|-------------|
| `--days <n>` | Number of days to look ahead (default: config `notifyDays` or 7) |
| `--dry-run` | Show upcoming bills without sending notification |
| `-j, --json` | Output as JSON |

```bash
# Send notification for bills due in 7 days
subtrack notify

# Preview without sending
subtrack notify --dry-run

# Next 30 days
subtrack notify --days 30

# JSON output
subtrack notify --json
```

## `profile`

Save and switch between subscription filter profiles. Each profile stores a set of filters (tags, status, payment method) that can be activated to temporarily filter all views.

### `profile save <name>`

| Option | Description |
|--------|-------------|
| `--tag <name>` | Filter by tag (repeatable or comma-separated) |
| `--status <status>` | Filter by status |
| `--payment-method <method>` | Filter by payment method |

### `profile switch <name>`

Activates a saved profile. All list, payment, and summary commands will only show matching subscriptions.

### `profile list`

Lists all saved profiles.

### `profile show [name]`

Shows the details of a saved profile (or the active one if no name given).

### `profile delete <name>`

Deletes a saved profile.

```bash
# Save a profile for work subscriptions
subtrack profile save work --tag work --status active

# Switch to the work profile
subtrack profile switch work

# List all profiles
subtrack profile list

# Show active profile details
subtrack profile show

# Delete a profile
subtrack profile delete work
```

## `audit`

View and manage the audit log. All mutating operations (add, edit, delete, clone, archive, import, etc.) are recorded in an audit trail.

### `audit list`

| Option | Description |
|--------|-------------|
| `--action <action>` | Filter by action type |
| `--limit <n>` | Max entries (default: 50) |
| `--from <YYYY-MM-DD>` | Start date |
| `--to <YYYY-MM-DD>` | End date |
| `-j, --json` | Output as JSON |

```bash
# Show last 50 audit entries
subtrack audit list

# Filter by action type
subtrack audit list --action subscription.delete

# Filter by date range
subtrack audit list --from 2026-01-01 --to 2026-06-30

# JSON output
subtrack audit list --json
```

### `audit prune`

Removes old audit log entries to save space.

| Option | Description |
|--------|-------------|
| `--days <n>` | Delete entries older than N days (default: 90) |
| `-f, --force` | Skip confirmation |
| `-j, --json` | Output as JSON |

```bash
# Prune entries older than 90 days
subtrack audit prune

# Prune entries older than 30 days
subtrack audit prune --days 30
```

## `maintenance`

Run database maintenance operations: integrity check and VACUUM.

| Option | Description |
|--------|-------------|
| `--vacuum` | Run VACUUM to reclaim disk space (not run by default) |
| `--check` | Run integrity check (default: true) |
| `-j, --json` | Output as JSON |

```bash
# Default: integrity check only
subtrack maintenance

# Run VACUUM to reclaim space
subtrack maintenance --vacuum

# JSON output
subtrack maintenance --json
```

## `cleanup`

One-command database cleanup: runs integrity check, VACUUM, prunes old audit entries and orphaned tags.

| Option | Description |
|--------|-------------|
| `--vacuum` | Run VACUUM (default: true) |
| `--audit-days <n>` | Prune audit entries older than N days (default: 90) |
| `-j, --json` | Output as JSON |

```bash
# Full cleanup with defaults
subtrack cleanup

# Skip VACUUM, only prune audit/tags
subtrack cleanup --no-vacuum

# Keep 30 days of audit history
subtrack cleanup --audit-days 30
```

## `stats`

Shows database statistics: subscription counts by status, tag count, trial count, usage entry count, database file size, and price range information.

| Option | Description |
|--------|-------------|
| `-j, --json` | Output as JSON |

```bash
subtrack stats

# JSON output
subtrack stats --json
```

## `currency`

Lists all 36 supported currencies with their display names.

| Option | Description |
|--------|-------------|
| `-j, --json` | Output as JSON |

```bash
subtrack currency

# JSON output — useful for scripting
subtrack currency --json
```

## `mcp`

Starts a Model Context Protocol (MCP) server over stdio, enabling AI assistants (Claude Desktop, Cursor, etc.) to interact with your subscription data programmatically.

```bash
subtrack mcp
```

The MCP server exposes 16 tools for subscription management. See the [MCP page](/mcp) for full details, tool reference, and integration examples.

## `tui`

Launches an interactive terminal user interface (TUI) built with Ink + React. Provides a full-screen management experience with sidebar navigation, vim-like keybindings, and mouse support.

```bash
subtrack tui
```

Features:
- Sidebar navigation with screen switching
- Subscription list, add, edit, delete screens
- Reports (summary, payment, upcoming, analytics, compare, forecast)
- Calendar view, history view
- Tools (export, import, backup, restore, usage)
- Configuration management
- Command palette with fuzzy search
- Toast notifications

See the [TUI page](/tui) for keybindings and navigation details.
```
