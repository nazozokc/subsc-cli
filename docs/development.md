---
title: Development
description: How to set up, build, test, and contribute to subtrack.
---

## Repository setup

```bash
git clone https://github.com/nazozokc/subtrack.git
cd subtrack
pnpm install
```

## Nix devShell

If you use Nix, a devShell is available with all required tools:

```bash
nix develop
```

This provides `node`, `pnpm`, `typescript`, `typos`, and `nixfmt`.

## Available commands

| Command | Description |
|---------|-------------|
| `pnpm start` | Run subtrack in dev mode (tsx) |
| `pnpm build` | Build all packages |
| `pnpm test` | Test all packages |
| `pnpm lint:types` | Type check (tsc --noEmit) |
| `pnpm format` | Format Nix files (nixfmt) |

## Tech stack

| Category | Choice |
|----------|--------|
| Runtime | Node.js |
| Language | TypeScript (strict mode, ESM) |
| CLI framework | `gunshi` |
| Interactive prompts | `@inquirer/prompts` |
| Terminal output | `consola`, `picocolors`, `cli-table3` |
| Database | `sql.js` (SQLite via WASM) |
| Exchange rates | [open.er-api.com](https://open.er-api.com) |
| Build tool | `tsdown` |
| Test framework | `vitest` |
| Package manager | `pnpm` |
| Documentation | VitePress (this site) |
| Encryption | AES-256-GCM via Node.js `node:crypto` |

## Contributing

See [CONTRIBUTING.md](https://github.com/nazozokc/subtrack/blob/main/CONTRIBUTING.md) for branch policy, AI agent guidelines, and PR requirements.

### Before opening a PR

```bash
pnpm build
pnpm test
```

Make sure both pass and CI is green.

## Project structure

```
subtrack/
├── apps/
│   └── subtrack/              # CLI tool (TypeScript/ESM)
│       ├── src/
│       │   ├── index.ts            # Entry point, CLI bootstrap (gunshi)
│       │   ├── menu.ts             # Interactive main menu (@inquirer select)
│       │   ├── commands/           # Command definitions (gunshi `define`)
│       │   │   ├── index.ts            # Barrel, subCommands map
│       │   │   ├── core.ts             # list, add, edit, delete, clone, archive, unarchive, search
│       │   │   ├── tag.ts              # tags, tag subcommands (list/rename/delete/prune/merge)
│       │   │   ├── trial.ts            # trial subcommands (add/list/expiring/delete)
│       │   │   ├── bulk.ts             # bulk subcommands (status/delete/tag)
│       │   │   ├── io.ts               # export, import
│       │   │   ├── backup.ts           # backup, restore
│       │   │   ├── config.ts           # config subcommands (list/get/set/reset)
│       │   │   ├── usage.ts            # usage subcommands (add/list/delete/import/refresh/total)
│       │   │   ├── report.ts           # summary, payment, upcoming, analytics, compare,
│       │   │   │                       # calendar, forecast, history, notify, timeline,
│       │   │   │                       # optimize, stats
│       │   │   └── misc.ts             # mcp, profile, audit, maintenance, cleanup, currency
│       │   ├── subscription/      # Subscription command handlers
│       │   │   ├── core.ts            # handleList, handleDelete, handleClone, handleArchive,
│       │   │   │                       # handleUnarchive, handleTags
│       │   │   ├── add.ts             # handleAdd
│       │   │   └── edit.ts            # handleEdit
│       │   ├── db/                # Database layer (SQLite CRUD via sql.js)
│       │   │   ├── connection.ts      # DB connection, save, restore, backup helpers
│       │   │   ├── schema.ts          # Table creation & migrations
│       │   │   ├── subscriptions.ts   # Subscription CRUD
│       │   │   ├── tags.ts            # Tag CRUD
│       │   │   ├── usage.ts           # LLM usage CRUD
│       │   │   ├── trials.ts          # Trial CRUD
│       │   │   ├── price-history.ts   # Price change history
│       │   │   └── audit.ts           # Audit log CRUD
│       │   ├── display.ts         # Table rendering, price formatting
│       │   ├── display-constants.ts # Table styling constants
│       │   ├── prompts.ts         # Input validation, prompt helpers
│       │   ├── types.ts           # TypeScript type definitions
│       │   ├── payment.ts         # Payment totals & summary statistics
│       │   ├── upcoming.ts        # Upcoming bills calculator
│       │   ├── analytics.ts       # Subscription analytics & budget tracking
│       │   ├── compare.ts         # Period-over-period spending comparison
│       │   ├── forecast.ts        # Spending forecast with what-if scenarios
│       │   ├── timeline.ts        # Monthly spending timeline & bar chart
│       │   ├── optimize.ts        # Cost optimization suggestions
│       │   ├── history.ts         # Price change history view
│       │   ├── calendar.ts        # Monthly calendar with billing days
│       │   ├── notify.ts          # Desktop notification for upcoming bills
│       │   ├── profile.ts         # Filter profile management
│       │   ├── tag.ts             # Tag management handlers
│       │   ├── search.ts          # Subscription search
│       │   ├── trial.ts           # Trial management handlers
│       │   ├── bulk.ts            # Bulk operation handlers
│       │   ├── config.ts          # Configuration management (JSON file)
│       │   ├── export.ts          # CSV / JSON / Markdown export formatters
│       │   ├── import-csv.ts      # CSV parser & import handler
│       │   ├── backup.ts          # Backup & restore handlers
│       │   ├── fx.ts              # FX rate API & price conversion
│       │   ├── pricing.ts         # LiteLLM pricing cache & cost calculation
│       │   ├── crypto.ts          # AES-256-GCM encryption helpers
│       │   ├── path-utils.ts      # Safe path resolution helpers
│       │   ├── date-utils.ts      # Date formatting utilities
│       │   ├── safe-json.ts       # Safe JSON parsing helper
│       │   ├── format.ts          # File size formatting, byte helpers
│       │   ├── price.ts           # Price formatting helpers
│       │   ├── usage.ts           # LLM API usage list & delete
│       │   ├── usage-add.ts       # LLM usage add (interactive & flags)
│       │   ├── usage-edit.ts      # LLM usage field updates (flags)
│       │   ├── usage-import.ts    # LLM usage import from JSONL/JSON logs
│       │   ├── usage-refresh.ts   # Auto-scanner for AI tool usage data
│       │   ├── usage-total.ts     # Aggregated usage cost/token summary
│       │   ├── scanner.ts         # Scanner framework for AI tool log parsing
│       │   ├── scanner-types.ts   # Scanner type definitions
│       │   ├── claude-scanner.ts  # Claude Code log scanner
│       │   ├── codex-scanner.ts   # Codex CLI log scanner
│       │   ├── copilot-scanner.ts # GitHub Copilot scanner
│       │   ├── cursor-scanner.ts  # Cursor editor scanner
│       │   ├── opencode-scanner.ts # OpenCode DB scanner
│       │   ├── windsurf-scanner.ts # Windsurf editor scanner
│       │   ├── audit.ts           # Audit log command handler
│       │   ├── maintenance.ts     # Database maintenance (VACUUM, integrity check)
│       │   ├── cleanup.ts         # One-command database cleanup
│       │   ├── stats.ts           # Database statistics
│       │   ├── currency.ts        # List supported currencies
│       │   ├── mcp.ts             # MCP server entry (lazy-loads mcp/)
│       │   ├── mcp/               # MCP server implementation
│       │   │   ├── index.ts           # Barrel
│       │   │   ├── server.ts          # MCP server setup & transport
│       │   │   ├── tools.ts           # Tool definitions & schemas
│       │   │   ├── handlers.ts        # Tool call handlers
│       │   │   ├── security.ts        # Input validation & sanitization
│       │   │   └── types.ts           # MCP type definitions
│       │   └── __tests__/         # Test files (vitest)
│       └── dist/                  # Built output (dist/index.mjs)
├── docs/                      # Documentation site (VitePress)
├── images/                    # Logo & branding assets
├── flake.nix                  # Nix devShell
└── pnpm-workspace.yaml
```
