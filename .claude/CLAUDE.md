# subtrack

Monorepo for **subtrack** — a CLI tool to manage subscription services from the terminal.

## Repository Structure

```
.
├── apps/
│   └── subtrack/    # CLI tool (Node.js/TypeScript, published as npm package)
├── docs/            # Documentation site (SvelteKit)
├── .agents/         # OpenCode agent and skill definitions
├── .claude/         # Claude Code configuration
├── flake.nix        # Nix devShell / CI shell
└── pnpm-workspace.yaml
```

## Package Management

- Use `pnpm add <package>` instead of `npm install <package>` or `bun add <package>`
- Use `pnpm remove <package>` instead of `npm uninstall <package>` or `bun remove <package>`
- Use `pnpm update` instead of `npm update` or `bun update`
- Use `pnpm run <script>` or `pnpm <script>` instead of `npm run` or `bun run`
- Use `pnpmx <package>` instead of `npx` or `bunx`

## Root Commands

```bash
pnpm install          # install all workspace dependencies
pnpm build            # build all packages (pnpm -r build)
pnpm test             # test all packages (pnpm -r test)
```

## Nix DevShell

```bash
nix develop           # enter devShell (node, pnpm, typos, typescript, nixfmt)
nix fmt               # format nix files (nixfmt-rfc-style)
```

## Key Conventions

- **Runtime**: Node.js, **NOT** Bun or Deno
- **Language**: TypeScript (strict mode, ESM, `verbatimModuleSyntax`)
- **Database**: `sql.js` (SQLite via WASM), **NOT** `better-sqlite3` or `bun:sqlite`
- **Node built-ins**: Use `node:` prefix (`node:fs`, `node:path`, `node:os`)
- **Local imports**: Use `.ts` extension (`import { x } from "./foo.ts"`)
- **Type imports**: Use `type` prefix (`import type { X } from "./foo.ts"`)
- **No semicolons** in imports/exports
- **API**: Prefer native `fetch` for HTTP, native `WebSocket` for WebSocket

## Architecture (subtrack/src/)

| Layer | File | Responsibility |
|---|---|---|
| Entry | `index.ts` | CLI definition (commander), command routing |
| Commands | `commands.ts` | Command handlers, workflow logic, user interaction |
| Database | `db.ts` | SQLite CRUD, schema, persistence |
| Display | `display.ts` | Table rendering with cli-table3, FX rate conversion |
| Prompts | `prompts.ts` | Input validation, interactive prompts |

## Environment Variables

| Variable | Description |
|---|---|
| `SUBSC_CLI_DB_DIR` | Override database directory (default: `~/.config/subtrack`) |

## Links

- **Published package**: `subtrack` on npm
- **GitHub**: https://github.com/nazozokc/subtrack
