---
title: FAQ
description: Frequently asked questions and troubleshooting for subtrack.
---

## I lost my database. Can I recover it?

Use `subtrack restore` to restore from a backup. If you have a backup file, you can also restore it manually:

```bash
cp ~/backups/subtrack_20260617_143000.db.gz ~/.config/subtrack/subtrack.db.gz
gunzip -k ~/.config/subtrack/subtrack.db.gz
```

Without a backup, the data cannot be recovered — the database is stored locally only.

**Recommendation:** Set up regular automated backups via cron or Task Scheduler. See the [Data & Storage](/data) page for details.

## Can I add support for more currencies?

The `Currency` type now accepts any ISO 4217 3-letter code, so all currencies supported by [open.er-api.com](https://open.er-api.com) work out of the box. The interactive prompt provides a curated list of 36 commonly used currencies. If you need a currency not in the list, use the `--currency` flag directly with any valid code.

## Does subtrack work offline?

Yes. Listing, adding, editing, deleting, importing, exporting, and filtering all work fully offline. The only feature that requires internet is `--currency` conversion, which fetches live exchange rates from [open.er-api.com](https://open.er-api.com).

When offline, `--currency` falls back to per-currency display without conversion.

## How do I restore from a backup?

Use the `restore` command for interactive or direct restore:

```bash
# Interactive: select from available backups
subtrack restore

# Direct restore from a specific file
subtrack restore ~/backups/subtrack_20260617_143000.db.gz
```

Alternatively, copy the backup file manually:

```bash
cp ~/backups/subtrack_20260617_143000.db.gz ~/.config/subtrack/subtrack.db.gz
gunzip -k ~/.config/subtrack/subtrack.db.gz
```

The `restore` command automatically backs up your current data before restoring. Ensure no subtrack processes are running during the restore — the database is flushed to disk after each command.

## Is my data sent anywhere?

**No.** All data is stored locally in a SQLite file on your machine. There are no accounts, no telemetry, and no cloud sync. The only external request subtrack makes is to [open.er-api.com](https://open.er-api.com) for currency exchange rates — and only when you use the `--currency` flag.

## Is the database encrypted?

Yes. subtrack automatically encrypts the SQLite database file on disk using **AES-256-GCM**. On first run, a random 256-bit key is generated and stored at `~/.config/subtrack/.key`. Alternatively, you can set `SUBSC_CLI_DB_PASSPHRASE` to derive the key from a passphrase.

> ⚠️ **If you lose the key file or forget the passphrase, the database cannot be recovered.** Always back up the `.key` file or keep your passphrase in a secure location (e.g. password manager).

## Can I encrypt backups?

Yes. Use `subtrack backup --encrypt` to create an encrypted backup. Encrypted backups use the `.db.enc` extension and can only be restored on a machine with the same encryption key or passphrase.

## Can I use subtrack in Docker or CI?

Yes. subtrack is a standard Node.js CLI tool and works in any environment with Node.js 22+. For Docker:

```dockerfile
FROM node:22-alpine
RUN npm install -g subtrack
CMD ["subtrack", "list"]
```

Use `SUBSC_CLI_DB_DIR` to control where the database is stored in containerized environments.

## How does LLM API cost tracking work?

The `subtrack usage` command uses [LiteLLM](https://github.com/BerriAI/litellm) pricing data to automatically calculate costs based on model name and token counts. Pricing is cached locally for 24 hours and can be refreshed with `subtrack usage refresh`. If a model is not found in the cache, it falls back to the LiteLLM Model Catalog API, then prompts for manual cost input.

API costs are stored in USD cents (as a real number, allowing fractional cents for precise billing) and can be included in payment totals with `subtrack payment --api`.

## Where does the pricing data come from?

Model pricing is fetched from the [LiteLLM GitHub repository](https://github.com/BerriAI/litellm) (`model_prices_and_context_window.json`). The data is cached locally for 24 hours to avoid excessive network requests. You can force a refresh with `subtrack usage refresh`.

## Can I pause a subscription instead of deleting it?

Yes! Each subscription has a `status` field: `active`, `paused`, or `cancelled`. Paused subscriptions are preserved in the database but excluded from payment totals, analytics, and upcoming bills. This is useful for subscriptions you want to keep for reference but aren't currently paying for.

Use `subtrack edit <id> --status paused` or edit interactively and select the `status` field.

## What is the billing day for?

The billing day (1–31) controls the day of month when a subscription is considered due. This is used by the `subtrack upcoming` command to predict when your next bill is coming. If not set, the subscription's creation date is used as the billing anchor.

Set it with: `subtrack edit <id> --billingDay 15`

## What is the analytics command?

`subtrack analytics` provides a detailed overview of your subscriptions including:
- Status breakdown (active vs paused vs cancelled)
- Monthly spending by currency
- Monthly spending by tag
- Budget tracking (if configured)

Set a budget with `subtrack config set monthlyBudget <amount>` and the analytics command will show whether you're within budget.

## How does the config command work?

The `subtrack config` command manages runtime settings stored in `~/.config/subtrack/config.json`:

- `defaultCurrency` — default currency for display (default: `USD`)
- `monthlyBudget` — monthly spending budget in USD (0 = disabled)
- `theme` — display theme (default: `default`)

Set values with `subtrack config set <key> <value>` and list them with `subtrack config list`.

## How does usage auto-scan work?

The `subtrack usage refresh` command automatically scans known AI coding tools for LLM API usage data, including OpenCode DB, Claude Code, Codex CLI, Cursor, GitHub Copilot, and Windsurf. It parses local logs and databases to find usage entries and imports them without manual data entry.

By default, it scans the current month. Use `--all` to scan all historical data.

## How do I update subtrack?

```bash
npm update -g subtrack
```

Or, if installed via pnpm:

```bash
pnpm update -g subtrack
```

Your database will be preserved — updates only affect the CLI code, not your data.

## What is MCP and how do I use it?

MCP (Model Context Protocol) is a standard that allows AI assistants to interact with tools. subtrack implements an MCP server that exposes 17 tools for subscription management. Start it with `subtrack mcp` and configure it in Claude Desktop, Cursor, Windsurf, or any MCP-compatible host. See the [MCP page](/mcp) for full details.

## How do I search for subscriptions?

Use `subtrack search <query>` to search by name, notes, or tags. You can restrict search scope with `--names`, `--notes`, or `--tags`. Without a query, it opens an interactive search prompt.

## What are trial periods?

The `subtrack trial` command lets you track free trial periods. Add trials with an expiration date, and use `subtrack trial expiring` to see which trials are about to end. This helps you avoid unexpected charges when trials convert to paid subscriptions.

## Can I manage multiple subscriptions at once?

Yes. The `subtrack bulk` command lets you change status, delete, or modify tags on multiple subscriptions at once. You can filter by tag, current status, or name pattern before applying the action.

## What does the forecast command do?

`subtrack forecast` projects your subscription spending over a given number of months (default: 12). It supports what-if scenarios — you can simulate cancelling subscriptions (`--cancel`) or adding hypothetical ones (`--add-name`, `--add-price`) to see how your costs would change.

## What is the timeline command?

`subtrack timeline` shows a monthly spending bar chart over time. Use `--categories` to break down spending by the first tag of each subscription. Useful for spotting spending trends.

## How do I optimize my subscriptions?

`subtrack optimize` analyzes your subscriptions for cost savings. It flags cycle changes (monthly → yearly savings), duplicate services, inactive subscriptions, and waste from cancelled subscriptions. Use `--min-savings` to filter suggestions by minimum yearly savings.

## Can I compare my spending month-over-month?

Yes. `subtrack compare` compares spending between the current period and the previous period. It accounts for price changes recorded in your subscription history. Use it with or without currency conversion and API cost inclusion.

## How do I see a monthly calendar of my bills?

`subtrack calendar` displays a monthly calendar with billing days marked, showing which subscriptions bill on which day. Specify `--month` and `--year` for a specific month, or omit for the current month.

## Can I get desktop notifications for upcoming bills?

Yes. `subtrack notify` sends an OS desktop notification for bills due within a configurable number of days. Use `--dry-run` to preview without sending a notification. The default look-ahead period is configured via `subtrack config set notifyDays <n>`.

## What are filter profiles?

Filter profiles let you save a set of filters (tags, status, payment method) and switch between them. When a profile is active, all list, payment, and summary commands show only matching subscriptions. Useful for separating work/personal subscriptions or focusing on specific categories.
