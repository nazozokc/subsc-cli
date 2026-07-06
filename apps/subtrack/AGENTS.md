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
- **TUI**: `ink` + `react` + `@inkjs/ui`
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
| `src/tui.tsx` | TUI entry: render Ink app |
| `src/tui/app.tsx` | Root component: layout, keyboard handling |
| `src/tui/context/app-context.tsx` | Global state (screen, mode, focus) |
| `src/tui/screens/` | TUI screen components (list, add, edit, …) |
| `src/tui/components/` | Reusable UI components (sidebar, table, form, …) |

## Key Conventions

- **Local imports**: `.ts` extension (`import { x } from "./foo.ts"`)
- **Node built-ins**: `node:` prefix (`node:fs`, `node:path`, `node:os`)
- **Type imports**: `type` prefix (`import type { X } from "./foo.ts"`)
- **No semicolons** in imports/exports
- **Prices**: integers (smallest unit — JPY no decimal, USD cents)
- **DB**: `sql.js` with `PRAGMA foreign_keys = ON`, use transactions for multi-step writes
- **TUI**: Ink + React components under `src/tui/`, vim-like keybindings, sidebar navigation

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
| `subtrack export csv\|json\|md` | Export subscriptions |
| `subtrack import <file>` | Import from CSV |
| `subtrack summary` | Show subscription summary |
| `subtrack backup [destination]` | Backup database |
| `subtrack restore [file]` | Restore database |
| `subtrack payment [period]` | Show payment totals |
| `subtrack usage add\|list\|delete\|refresh` | Track LLM API usage |
| `subtrack tui` | Interactive terminal UI (sidebar, vim-like) |
