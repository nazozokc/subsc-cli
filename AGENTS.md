---
description: Agent instructions for the subtrack monorepo
---

# subtrack

Monorepo for **subtrack** — a CLI tool to manage subscription services from the terminal.

## Agent Role

You are a subtrack agent. Your primary responsibilities in this repository are:

- Understanding the full monorepo structure and how packages relate
- Implementing features and fixing bugs in the CLI tool (`subtrack/`)
- Maintaining code quality, type safety, and test coverage
- Following project conventions (ESM, TypeScript strict, `sql.js`, `gunshi`)
- Knowing when to load project-specific skills for detailed guidance

## Repository Structure

```
.
├── apps/
│   └── subtrack/      # CLI tool (Node.js/TypeScript, published as npm package)
│       ├── src/       # Source code
│       ├── dist/      # Build output (dist/index.mjs)
│       ├── package.json
│       └── tsconfig.json
├── docs/              # Documentation site (VitePress)
├── .agents/skills/    # OpenCode skill definitions
├── flake.nix          # Nix devShell / CI shell
└── pnpm-workspace.yaml
```

**Key**: All application code lives under `apps/subtrack/`. The monorepo root has no dependencies of its own.

## Design Tenets

1. **CLI-native** — Everything is driven from the terminal. No web UI, no daemon, no TUI framework.
2. **SQLite persistence** — Data is stored locally via `sql.js` (WASM SQLite). No external database servers.
3. **Layer separation** — Code is organized into strict layers (entry → commands → DB → display). Cross-layer concerns are mediated, not mixed.
4. **Interactive by default, scriptable by flag** — Commands prompt interactively when invoked bare, but accept flags for automation.
5. **Portable** — Works on Linux/macOS. Single binary via npm package. No platform-specific dependencies.

## Architecture Overview

The CLI tool (`subtrack/`) uses `gunshi` for command routing and follows a multi-layer architecture:

| Layer       | File                | Responsibility                      |
| ----------- | ------------------- | ----------------------------------- |
| Entry       | `src/index.ts`      | Command definitions (gunshi), routing |
| Commands    | `src/commands.ts`   | Command handlers, workflow logic    |
| Database    | `src/db.ts`         | SQLite CRUD, schema, persistence    |
| Display     | `src/display.ts`    | Table rendering, formatting         |
| Prompts     | `src/prompts.ts`    | Input validation, interactive prompts |
| Payment     | `src/payment.ts`    | Payment/summary calculations        |
| FX          | `src/fx.ts`         | Exchange rate fetching & conversion |
| Usage       | `src/usage.ts`      | LLM API usage tracking              |

For **detailed implementation guidance** (DB schema, testing patterns, import style, dependency reference), load the `subtrack-rules` skill.

## Available Skills

This repository defines skills under `.agents/skills/`. Load them via the `skill` tool when the task matches:

| Skill | When to load |
|---|---|
| `subtrack-rules` | Working on source code, running tests, managing dependencies — full project conventions |
| `subtrack-commit` | Committing, pushing, or creating a PR |
| `bug-fixes` | Diagnosing test failures, debugging runtime errors, fixing type errors |

All 3 skills are also available automatically via the agent system prompt.

## Key Conventions

- **Runtime**: Node.js (>=22), **not** Bun or Deno
- **Language**: TypeScript (strict mode, ESM, `verbatimModuleSyntax`)
- **Database**: `sql.js` (SQLite via WASM) — **not** `better-sqlite3` or `bun:sqlite`
- **CLI**: `gunshi` — **not** `commander` (despite what old docs may say)
- **Package manager**: `pnpm` — **not** npm or bun
- **Local imports**: use `.ts` extension (`import { x } from "./foo.ts"`)
- **Node built-ins**: use `node:` prefix (`node:fs`, `node:path`, `node:os`)
- **Type imports**: use `type` prefix (`import type { X } from "./foo.ts"`)
- **No semicolons** in imports/exports
- **Prices**: stored as integers (smallest unit — JPY no decimal, USD in cents)
- **DB transactions**: use `BEGIN TRANSACTION` / `COMMIT` / `ROLLBACK` for multi-step writes
- **PRAGMA**: `PRAGMA foreign_keys = ON` at connection time

## Quick Reference

```bash
pnpm install          # install all workspace dependencies
pnpm build            # build all packages (pnpm -r build)
pnpm test             # test all packages (pnpm -r test)
pnpm start            # run CLI in dev mode (tsx src/index.ts)
nix develop           # enter devShell
nix fmt               # format nix files (nixfmt-rfc-style)
```

Available CLI commands (run `subtrack --help` in the package for the full list):

| Command | Description |
|---|---|
| `subtrack list` | List all subscriptions |
| `subtrack add` | Add a subscription |
| `subtrack edit [id]` | Edit a subscription |
| `subtrack delete [ids...]` | Delete subscriptions |
| `subtrack cancel [id]` | Cancel a subscription with a guided checklist |
| `subtrack tags <names...>` | Filter by tags (AND logic) |
| `subtrack tag list\|rename\|delete\|prune` | Manage tags |
| `subtrack dedupe [merge]` | Detect/merge duplicate subscriptions |
| `subtrack export csv\|json\|md\|ics` | Export subscriptions |
| `subtrack import <file>` | Import from CSV |
| `subtrack summary` | Show subscription summary |
| `subtrack backup [destination]` | Backup database |
| `subtrack restore [file]` | Restore database |
| `subtrack payment [period]` | Show payment totals |
| `subtrack budget` | Show spending vs budget (overrun detection) |
| `subtrack report` | Show yearly subscription report |
| `subtrack usage add\|list\|delete\|refresh` | Track LLM API usage |

## Environment Variables

| Variable | Description |
|---|---|
| `SUBSC_CLI_DB_DIR` | Override database directory (default: `~/.config/subtrack`) |

## Links

- **Published package**: `subtrack` on npm
- **GitHub**: https://github.com/nazozokc/subtrack
