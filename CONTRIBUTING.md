# Contributing to subtrack

## Branch Policy

- Always create a separate branch for your work — never commit directly to `main`
- Use a descriptive branch name (e.g. `feat/add-xxx`, `fix/xxx`)

## AI Agents

- The use of AI agents (GitHub Copilot, Cline, OpenCode, etc.) is permitted
- However, you **must be able to explain any changes** made with the help of AI
- Do not rely on AI blindly; understand what the generated code does and be prepared to answer questions about it during review

## Before You Start

- Read [`AGENTS.md`](./AGENTS.md) at the repository root to understand the project conventions and setup
- Package manager is `pnpm`, runtime is `Node.js` (do not use `bun` or `deno`)
- Database is `sql.js` (SQLite via WASM); do not use `better-sqlite3` or `bun:sqlite`

## CI

- **Do not merge unless CI passes**
- Before opening a PR, verify locally:
  ```bash
  pnpm build
  pnpm test
  ```
- Ensure the `app-ci` GitHub Actions workflow is green
