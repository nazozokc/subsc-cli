<p align="center">
  <img src="images/subtrack-cli-logo.jpg" alt="subtrack" width="400"/>
</p>

<div align="center">
<h1>subtrack</h1>
</div>

[![Socket Badge](https://badge.socket.dev/npm/package/subtrack)](https://socket.dev/npm/package/subtrack)

<p align="center">
  <img src="images/subtrack-demo.png" alt="subtrack demo" width="700"/>
</p>

A CLI tool to manage your subscription services from the terminal.

**subtrack** lets you add, list, filter, and delete subscriptions with an interactive CLI. Data is stored locally in SQLite.

> [!TIP]
> This tool is a completely standalone CLI tool and is not affiliated with, bundled with, or part of any other software.

## Features

- **List** all subscriptions in a formatted table — auto-width, Unicode box-drawing, currency-grouped
- **Currency conversion** via `list --currency <CUR>` — automatically fetches live exchange rates
- **Add** subscriptions interactively, or fully non-interactive via flags
- **Delete** multiple subscriptions at once with a checkbox selector
- **Filter by tags** — AND-based filtering with multiple tags
- **Tag autocomplete hints** — shows existing tags during input
- **Payment totals** — see how much you pay per month, year, or any cycle with `subtrack payment`
- **Cycle-aware calculation** — automatically converts weekly, quarterly, yearly etc. to any period
- **37 currencies** supported: AED, ARS, AUD, BRL, CAD, CHF, CLP, CNY, COP, CZK, DKK, EGP, EUR, GBP, HKD, HUF, IDR, ILS, INR, JPY, KRW, MXN, MYR, NGN, NOK, NZD, PHP, PLN, SAR, SEK, SGD, THB, TRY, TWD, USD, VND, ZAR
- **6 billing cycles**: weekly, bi-weekly, monthly, quarterly, semi-annual, yearly
- **Status tracking** — active, paused, cancelled with color-coded display
- **Upcoming bills** — see what's due soon with `subtrack upcoming`
- **Analytics** — detailed spending breakdown with `subtrack analytics`
- **Configuration** — customize default currency, monthly budget via `subtrack config`
- **SQLite** storage — portable, zero-config, lives in `~/.config/subtrack/subtrack.db`
- **Input validation** — name length, price bounds, tag limits

## Installation

```bash
# from npm
npm install -g subtrack

# or with pnpm
pnpm add -g subtrack

# or with bun
bun add -g subtrack

# or from source
pnpm install
pnpm build
pnpm link --global
```

## Usage

```bash
# List all subscriptions (grouped by currency)
subtrack list

# List with currency conversion
subtrack list --currency JPY

# Add a subscription (interactive)
subtrack add

# Add a subscription non-interactively
subtrack add --name Spotify --price 980 --currency JPY --cycle monthly --tags music

# Delete subscriptions (interactive checkbox)
subtrack delete

# Filter subscriptions by tags (AND)
subtrack tags music video

# Edit a subscription (interactive)
subtrack edit

# Edit a subscription by ID
subtrack edit 1 --name "New Name" --price 1200

# Show monthly payment total
subtrack payment

# Show yearly payment total (converts all cycles automatically)
subtrack payment yearly

# Show monthly payment in a specific currency
subtrack payment monthly --currency JPY

# Export all subscriptions as JSON
subtrack export json

# Import subscriptions from CSV
subtrack import subscriptions.csv

# Show subscription summary
subtrack summary

# Backup database
subtrack backup

# Restore from backup
subtrack restore

# Show upcoming bills (next 7 days)
subtrack upcoming

# Show subscription analytics
subtrack analytics

# View or change configuration
subtrack config list
subtrack config set defaultCurrency JPY

# Track LLM API usage
subtrack usage add --provider openai --model gpt-4o --inputTokens 1000 --outputTokens 500
```

## npx usage
```bash
# List all subscriptions (grouped by currency)
npx subtrack list

# List with currency conversion
npx subtrack list --currency JPY

# Add a subscription (interactive)
npx subtrack add

# Add a subscription non-interactively
npx subtrack add --name Spotify --price 980 --currency JPY --cycle monthly --tags music

# Delete subscriptions (interactive checkbox)
npx subtrack delete

# Filter subscriptions by tags (AND)
npx subtrack tags music video

# Edit a subscription
npx subtrack edit 1 --name "New Name"

# Show monthly payment total
npx subtrack payment

# Show yearly payment total
npx subtrack payment yearly

# Export subscriptions as JSON
npx subtrack export json

# Import subscriptions from CSV
npx subtrack import subscriptions.csv

# Show summary statistics
npx subtrack summary

# Backup database
npx subtrack backup

# Restore from backup
npx subtrack restore

# Track LLM API usage
npx subtrack usage add --provider openai --model gpt-4o
```


### Commands

#### `list`

Lists all subscriptions in a formatted table. Subscriptions are grouped by
currency by default. Each group shows a subtotal row.

| Option                | Description                                                   |
| --------------------- | ------------------------------------------------------------- |
| `-c, --currency <C>`  | Convert all prices to the given currency using live exchange rates |
| `--sort <field>`      | Sort by field: `name`, `price`, `currency`, `cycle`           |
| `-d, --desc`          | Sort descending                                               |
| `-a, --api`           | Include LLM API usage cost for the current month              |

When `--currency` is used, all prices are converted to the target currency
(fetched from [open.er-api.com](https://open.er-api.com)) and displayed as a
single group with a total.

#### `add`

Adds a new subscription. Without flags, prompts for all fields interactively.

| Option                | Description                          |
| --------------------- | ------------------------------------ |
| `--name <name>`       | Subscription name                    |
| `--price <price>`     | Payment amount (integer)             |
| `--currency <currency>` | Currency code (e.g. JPY, USD)      |
| `--cycle <cycle>`      | Billing cycle (e.g. monthly, yearly) |
| `--tags <tags>`       | Comma-separated tags                 |
| `--billingDay <day>`  | Billing day of month (1-31)          |
| `--status <status>`   | Status: active, paused, cancelled    |

All flags are optional. Providing all flags skips prompts entirely (useful for
scripts). Partial flags still prompt for missing fields.

#### `delete`

Shows an interactive checkbox list of all subscriptions. Select one or more
to delete. Confirmation is required before deletion.

> **Note:** The `delete` command is always interactive — no non-interactive mode.

#### `edit [id]`

Edits an existing subscription. If no ID is given, an interactive selector
shows all subscriptions to pick from.

| Option                  | Description                          |
| ----------------------- | ------------------------------------ |
| `--name <name>`         | New subscription name                |
| `--price <price>`       | New payment amount (integer)         |
| `--currency <currency>` | New currency code (e.g. JPY, USD)    |
| `--cycle <cycle>`       | New billing cycle                    |
| `--status <status>`     | New status: active, paused, cancelled |
| `--billingDay <day>`    | New billing day of month (1-31)      |
| `--tags <tags>`         | New comma-separated tags             |

Without flags, prompts for which fields to change. With flags, only the
specified fields are updated (non-interactive).

```bash
# Interactive: pick subscription, then pick fields to edit
subtrack edit

# Non-interactive: update name and price by ID
subtrack edit 1 --name "Netflix" --price 1490
```

#### `payment [period]`

Calculates and displays how much you pay over a given billing period. All
subscriptions are converted to the target period automatically based on their
billing cycle.

| Option              | Description                                       |
| ------------------- | ------------------------------------------------- |
| `-c, --currency <C>` | Convert all prices to the given currency using live exchange rates |

When `--currency` is used, the total is displayed as a single amount in the
target currency. Without it, totals are grouped by currency.

```bash
# Monthly total (default)
subtrack payment

# Yearly total
subtrack payment yearly

# Weekly total in JPY
subtrack payment weekly --currency JPY
```

When exchange rates cannot be fetched (e.g. offline), the command falls back to
per-currency display without conversion.

#### `tags <taglist...>`

Filters and displays subscriptions that have **all** specified tags (AND logic).

```bash
# Subscriptions tagged with both "music" and "video"
subtrack tags music video
```

#### `tag list|rename|delete|prune`

Manages tags stored in the database.

| Subcommand | Description                                      |
| ---------- | ------------------------------------------------ |
| `list`     | List all tags with usage count                   |
| `rename`   | Rename a tag (merges if new name already exists) |
| `delete`   | Delete a tag and its associations                |
| `prune`    | Remove orphaned tags (no associated subscriptions)|

```bash
# List all tags
subtrack tag list

# Rename a tag
subtrack tag rename old-name new-name

# Delete a tag
subtrack tag delete unused-tag

# Prune orphaned tags
subtrack tag prune
```

#### `export <format>`

Exports subscriptions in the specified format.

| Option               | Description                                       |
| -------------------- | ------------------------------------------------- |
| `-c, --currency <C>` | Convert all prices to target currency             |
| `--tags <tags>`      | Filter by comma-separated tags                    |
| `-o, --output <file>` | Write to file instead of stdout                  |

Supported formats: `csv`, `json`, `md`.

```bash
# Export as CSV
subtrack export csv

# Export as JSON with currency conversion
subtrack export json --currency JPY

# Export as Markdown filtered by tag
subtrack export md --tags video

# Export to file
subtrack export csv --output subscriptions.csv
```

#### `import <file>`

Imports subscriptions from a CSV file. The CSV must have the header:
`name,cycle,tags,price,currency`.

| Option      | Description                                    |
| ----------- | ---------------------------------------------- |
| `--dry-run` | Validate the CSV without importing             |

```bash
# Import from CSV
subtrack import subscriptions.csv

# Dry-run (validate only)
subtrack import subscriptions.csv --dry-run
```

Tags in the CSV are separated by semicolons (`;`) within the tags column.

#### `summary`

Shows summary statistics: total count, most expensive subscription, monthly
total by currency, and monthly total by tag.

```bash
subtrack summary
```

#### `backup [destination]`

Creates a compressed (gzip) backup of the database. Optionally encrypts it
using the database encryption key.

| Option              | Description                                                   |
| ------------------- | ------------------------------------------------------------- |
| `-e, --encrypt`     | Encrypt the backup with your database encryption key          |

Destination defaults to `~/.config/subtrack/backups/`.

```bash
# Backup to default directory
subtrack backup

# Backup to a specific directory
subtrack backup /path/to/backups

# Create an encrypted backup
subtrack backup --encrypt
```

#### `restore [file]`

Restores the database from a backup file. Current data is automatically
backed up before restoration.

| Option            | Description                                        |
| ----------------- | -------------------------------------------------- |
| `-f, --force`     | Skip confirmation and integrity check warnings     |
| `--dir <dir>`     | Directory to scan for backup files (interactive)   |

```bash
# Restore from a specific backup file
subtrack restore /path/to/backup.db.gz

# Interactive restore (choose from available backups)
subtrack restore

# Force restore (skip confirmation)
subtrack restore backup.db.gz --force
```

#### `upcoming [days]`

Shows subscriptions with upcoming bills within the specified number of days.
Filters out cancelled subscriptions.

```bash
# Show bills due in the next 7 days (default)
subtrack upcoming

# Show bills due in the next 30 days
subtrack upcoming 30
```

#### `analytics`

Shows detailed subscription analytics: status breakdown, monthly spending by
currency, budget comparison (if configured), and monthly spending by tag.

```bash
subtrack analytics
```

#### `config list|get|set|reset`

Manages subtrack configuration stored in `~/.config/subtrack/config.json`.

| Subcommand | Description                                      |
| ---------- | ------------------------------------------------ |
| `list`     | List all configuration values                    |
| `get`      | Get a specific configuration value               |
| `set`      | Set a configuration value                        |
| `reset`    | Reset configuration to defaults                  |

Available config keys: `defaultCurrency`, `monthlyBudget`, `theme`.

```bash
# List all config
subtrack config list

# Get a specific value
subtrack config get defaultCurrency

# Set default currency to JPY
subtrack config set defaultCurrency JPY

# Set monthly budget (in smallest currency unit: cents for USD, yen for JPY, etc.)
subtrack config set monthlyBudget 50000

# Reset to defaults
subtrack config reset
```

#### `usage add|list|delete|import|refresh`

Tracks LLM API usage costs. Automatically calculates costs using LiteLLM
pricing data.

| Subcommand | Description                                                              |
| ---------- | ------------------------------------------------------------------------ |
| `add`      | Add an LLM API usage entry                                               |
| `list`     | List usage entries (filterable by provider/date)                         |
| `delete`   | Delete usage entries (interactive or by ID)                              |
| `import`   | Import LLM API usage from JSONL/JSON response log files                  |
| `refresh`  | Auto-scan known sources (OpenCode DB, Claude Code, etc.) and import data |

```bash
# Add a usage entry (auto-calculated cost)
subtrack usage add --provider openai --model gpt-4o --inputTokens 1000 --outputTokens 500

# Add with manual cost override
subtrack usage add --provider openai --model custom-model --inputTokens 1000 --outputTokens 500 --cost 0.50

# List recent usage
subtrack usage list

# List usage filtered by provider and date range
subtrack usage list --provider anthropic --from 2026-01-01 --to 2026-06-22

# Delete a specific usage entry
subtrack usage delete 42

# Interactive delete
subtrack usage delete

# Refresh — auto-scan known sources and import usage data for current month
subtrack usage refresh

# Refresh scanning a specific date range
subtrack usage refresh --from 2026-01-01 --to 2026-06-22

# Import usage from JSONL log file
subtrack usage import usage_log.jsonl
```

### Non-interactive mode

All flags on `add` can be combined for fully automated usage:

```bash
subtrack add --name "Netflix" --price 1490 --currency JPY --cycle monthly --tags "video,entertainment"
```

When all required flags are provided, the confirmation prompt is skipped.
Validation errors still produce error messages.

## Data

Subscriptions are stored in:

```
~/.config/subtrack/subtrack.db
```

The database directory can be overridden with the `SUBSC_CLI_DB_DIR` environment
variable:

```bash
SUBSC_CLI_DB_DIR=/path/to/custom/dir subtrack list
```

The database uses four tables: `subscriptions`, `tags`,
`subscription_tags` (many-to-many relationship), and `llm_usage` (for LLM API
usage tracking). Deleting a subscription automatically cleans up associated
tag links via `ON DELETE CASCADE`.

## Development

```bash
# Install dependencies
pnpm install

# Run directly (TypeScript)
pnpm start          # runs tsx src/index.ts

# Build
pnpm build          # runs tsdown → dist/index.mjs

# Test
pnpm test           # vitest run
pnpm test:watch     # vitest

# Lint
pnpm lint:typos     # typos check
```

## Tech Stack

| Category        | Choice                        |
| --------------- | ----------------------------- |
| Runtime         | Node.js                       |
| Language        | TypeScript (strict mode, ESM) |
| CLI framework   | gunshi                        |
| Interactive UI  | @inquirer/prompts             |
| Logging         | consola                       |
| Database        | sql.js (SQLite via WASM)      |
| Exchange rates  | open.er-api.com               |
| Build           | tsdown                        |
| Test            | vitest                        |
| Package manager | pnpm                          |

## Environment Variables

| Variable                 | Description                              |
| ------------------------ | ---------------------------------------- |
| `SUBSC_CLI_DB_DIR`       | Override the database directory (default: `~/.config/subtrack`) |
| `SUBSC_CLI_DB_PASSPHRASE`| Derive encryption key from passphrase instead of using a key file |

## License

MIT
