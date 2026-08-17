# subtrack

CLI tool to manage subscription services from the terminal. Node.js + TypeScript.

## Tech Stack

- **Runtime**: Node.js (>=22, not Bun or Deno)
- **Language**: TypeScript (strict mode, ESM, `verbatimModuleSyntax`)
- **Database**: `sql.js` (SQLite via WASM)
- **CLI**: `gunshi`
- **Prompts**: `@inquirer/prompts`
- **Logging**: `consola`
- **Tables**: `cli-table3`
- **Colors**: `picocolors`
- **Build**: `tsdown`
- **Test**: `vitest`

## Package Management

- Use `pnpm add <package>`
- Use `pnpm remove <package>`
- Use `pnpm update`
- Use `pnpm run <script>` or `pnpm <script>`
- Use `pnpmx <package>` instead of `npx` or `bunx`

## Running

- Development: `pnpm start` (tsx src/index.ts)
- Build: `pnpm build` (tsdown)
- Output: `dist/index.mjs`

## Testing

- `pnpm test` (vitest)
- Test files co-located as `*.test.ts`
- Use `__setDb()` from `db.ts` to inject in-memory SQLite for tests
- Mock `consola` via `consola.mockTypes()`
- Mock `globalThis.fetch` for FX rate API

## Architecture

| File | Responsibility |
|---|---|
| `src/index.ts` | CLI definition (gunshi), command routing |
| `src/menu.ts` | Interactive main menu (@inquirer select, launched by bare `subtrack`) |
| `src/commands.ts` | Command handlers, workflow logic |
| `src/db.ts` | SQLite CRUD, schema, persistence |
| `src/display.ts` | Table rendering, formatting |
| `src/prompts.ts` | Input validation, interactive prompts |
| `src/payment.ts` | Payment/summary calculations |
| `src/fx.ts` | Exchange rate fetching & conversion |
| `src/usage.ts` | LLM API usage tracking |
| `src/export.ts` | CSV/JSON/MD export |
| `src/import-csv.ts` | CSV import |
| `src/crypto.ts` | Backup encryption |
| `src/pricing.ts` | Pricing/litellm integration |
| `src/types.ts` | Shared types |

## Key Conventions

- **Local imports**: `.ts` extension (`import { x } from "./foo.ts"`)
- **Node built-ins**: `node:` prefix (`node:fs`, `node:path`, `node:os`)
- **Type imports**: `type` prefix (`import type { X } from "./foo.ts"`)
- **No semicolons** in imports/exports
- **Prices**: integers (smallest unit — JPY no decimal, USD cents)
- **DB**: `sql.js` with `PRAGMA foreign_keys = ON`, use transactions for multi-step writes

## Environment Variables

| Variable | Description |
|---|---|
| `SUBSC_CLI_DB_DIR` | Override database directory (default: `~/.config/subtrack`) |

## Commands

| Command | Description |
|---|---|
| `subtrack list` | List all subscriptions |
| `subtrack add` | Add a subscription |
| `subtrack edit [id]` | Edit a subscription |
| `subtrack delete [ids...]` | Delete subscriptions |
| `subtrack tags <names...>` | Filter by tags (AND logic) |
| `subtrack tag list\|rename\|delete\|prune` | Manage tags |
| `subtrack export csv\|json\|md\|ics` | Export subscriptions |
| `subtrack import <file>` | Import from CSV |
| `subtrack summary` | Show subscription summary |
| `subtrack backup [destination]` | Backup database |
| `subtrack restore [file]` | Restore database |
| `subtrack payment [period]` | Show payment totals |
| `subtrack budget` | Show spending vs budget |
| `subtrack dedupe [merge]` | Detect/merge duplicate subscriptions |
| `subtrack cancel [id]` | Cancel with guided checklist |
| `subtrack report` | Yearly subscription report |
| `subtrack usage add\|list\|delete\|refresh` | Track LLM API usage |
