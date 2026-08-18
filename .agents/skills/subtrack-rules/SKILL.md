---
name: subtrack-rules
description: When working on the subtrack project, editing source code, running tests, or managing dependencies
---

# Subtrack Project Rules

## Project Overview

subtrack is a Node.js CLI tool for managing subscription services from the terminal. Written in TypeScript, it stores data in SQLite and provides interactive prompts for CRUD operations.

## Package Management

- Use `pnpm add <package>` instead of `npm install <package>` or `bun add <package>`
- Use `pnpm remove <package>` instead of `npm uninstall <package>` or `bun remove <package>`
- Use `pnpm update` instead of `npm update` or `bun update`
- Use `pnpm run <script>` or `pnpm <script>` instead of `npm run` or `bun run`
- Use `pnpmx <package>` instead of `npx` or `bunx`
- All packages go under `apps/subtrack/` directory (monorepo root has no deps)

## Build & Run

- Development execution: `tsx src/index.ts`
- Build: `tsdown` (configured as `pnpm build`)
- Type check: `pnpm lint:types` (`tsc --noEmit`)
- Don't use `bun` or `node --loader` for running TypeScript directly
- Build output is `apps/subtrack/dist/index.mjs`

## Testing

- Framework: `vitest` (`pnpm test` or `vitest run`)
- Test files live under `src/__tests__/` as `*.test.ts` (not co-located)
- Use `pnpm test:watch` for watch mode
- Use `__setDb()` from `db.ts` to inject an in-memory SQLite database for tests
- Mock `consola` via `consola.mockTypes()` for output assertions (see `display.test.ts`)
- Mock `globalThis.fetch` for exchange rate API tests

## Database

- Use `sql.js` (WASM-based SQLite) — **not** `better-sqlite3`, `sqlite3`, or `bun:sqlite`
- Import: `import initSqlJs from "sql.js"` and `import type { Database, SqlValue, BindParams } from "sql.js"`
- Database file location: `$SUBSC_CLI_DB_DIR` env var or `~/.config/subtrack/subtrack.db`
- State is held in memory (`_db`) and persisted to disk via `saveDb()` on writes
- Schema has 8 tables: `subscriptions`, `tags`, `subscription_tags`, `llm_usage`, `trials`, `price_history`, `suggestions`, `audit_log`
- Always use transactions for multi-step writes (`BEGIN TRANSACTION` / `COMMIT` / `ROLLBACK`)
- Use `PRAGMA foreign_keys = ON` at connection time

## Architecture

The source code (`subtrack/src/`) follows a 4-layer separation:

| Layer | File | Responsibility |
|---|---|---|
| Entry | `index.ts` | CLI definition (gunshi), command routing |
| Commands | `commands/` | gunshi command definitions (`define()` + `.run()`) |
| Handlers | `subscription/`, `menu.ts`, `search.ts`, `payment.ts`, … | Command handlers, workflow logic, user interaction |
| Database | `db.ts`, `db/` | SQLite CRUD, schema, persistence, `__setDb()` for testing |
| Display | `display.ts` | Table rendering with cli-table3, FX rate conversion |
| Prompts | `prompts.ts` | Input validation, interactive prompts, shared choices |
| FX | `fx.ts` | Exchange rate fetching & conversion (`fetchFxRates`, `convertPrice`, `convertSubsWithRates`, `tryConvert`) |
| Dates | `date-utils.ts` | Date helpers (`today`, `formatDate`, `daysUntil`, period ranges) |
| Path safety | `path-utils.ts` | `resolveSafePath` / `resolveSafeOutputPath` (+ `safePath` / `safeOutputPath` shortcuts) |

Keep concerns separated. Don't put DB queries in display logic or prompt logic in command handlers.

## Import Style

- Use `node:` prefix for Node.js built-ins: `import { readFileSync } from "node:fs"`, `import path from "node:path"`, `import { homedir } from "node:os"`
- Use `.ts` extension in local imports: `import { handleList } from "./subscription/core.ts"`
- Prefer native `fetch` for HTTP requests
- Prefer native `WebSocket` for WebSocket connections (if needed)
- Use `type` prefix for type-only imports: `import type { SharedArgs } from "./db.ts"`

## Code Style

- TypeScript strict mode enabled (see `tsconfig.json`)
- Test files (`*.test.ts`) excluded from `tsconfig.json` — type-checked separately by vitest
- ESM modules (`"type": "module"` in package.json)
- No semicolons in imports/exports
- Target: ESNext, module: Preserve, moduleResolution: bundler
- `verbatimModuleSyntax`: enforce correct import/value separation
- `noUncheckedIndexedAccess`: disabled (codebase not compatible)

## Dependencies

Key packages and their purpose:

| Package | Usage |
|---|---|---|
| `gunshi` | CLI argument parsing (`cli()`, `define()`, `.args`, `.run()`) |
| `@inquirer/prompts` | Interactive prompts (`input`, `confirm`, `checkbox`, `select`) |
| `consola` | Logging (`consola.info`, `consola.success`, `consola.error`, `consola.warn`, `consola.fail`) |
| `cli-table3` | Table rendering (customizable chars, styles, column widths) |
| `picocolors` | Terminal colors |
| `sql.js` | SQLite via WASM (`new SQL.Database()`, `.run()`, `.exec()`) |
| `@types/node` | Node.js type definitions (dev) |

## Linting

- Spell check: `typos` (`pnpm lint:typos` or `typos`)
- No ESLint or Prettier configured (formatting via editor defaults)
- Nix formatting: `nix fmt` (`nixfmt-rfc-style`)

## Environment

- `SUBSC_CLI_DB_DIR`: override database directory (default: `~/.config/subtrack/`)
- Data file: `subtrack.db` (SQLite)
- No `.env` file or secrets management in this project

## Conventions

- Prices are stored as integers (smallest unit, e.g. JPY has no decimal, USD stored as cents)
- Currencies: JPY/USD/EUR/GBP/AUD/CAD/KRW/CNY/SGD/HKD
- Cycles: weekly/bi-weekly/monthly/quarterly/semi-annual/yearly
- Tags are stored in a normalized many-to-many relation
- FX rates are fetched from `open.er-api.com` (USD base)
