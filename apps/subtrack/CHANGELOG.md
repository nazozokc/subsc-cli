# Changelog

## 9.0.0 (unreleased)

### ✨ Features

- **Budget Command**: `subtrack budget` compares spending against configured budgets with overrun detection. `--check` exits with code 1 when over budget (cron/scripts), `--period monthly|yearly`, `-c/--currency` conversion, `--name` for named budgets, `-j/--json`. ([PR #104](https://github.com/nazozokc/subtrack/pull/104))
- **Named Budgets**: `subtrack config set budgets '<json>'` stores named budgets with amount, currency, optional period and category (tag) filters; `subtrack config set yearlyBudget <amount>` for yearly targets. Both shown in `config list`. ([PR #104](https://github.com/nazozokc/subtrack/pull/104))
- **Duplicate Detection**: `subtrack dedupe` finds duplicate subscriptions by normalized-name Levenshtein similarity (default threshold 0.8, same vendor URL boosted). `subtrack dedupe merge <keepId> <removeId>` merges duplicates transactionally, preserving price history and tags. ([PR #104](https://github.com/nazozokc/subtrack/pull/104))
- **Guided Cancellation**: `subtrack cancel <id>` cancels with a checklist — optional CSV export, alternative-service check, cancellation-date note, final confirmation. Marks as `cancelled`, sets `contractEnd`, writes audit log. `-f/--force` skips the checklist; `-j/--json` previews without changes. ([PR #104](https://github.com/nazozokc/subtrack/pull/104))
- **Yearly Report**: `subtrack report` shows total spending, monthly bar chart, top 5 subscriptions by yearly cost, added/cancelled during the year, price changes, and budget comparison. `--year`, `-c/--currency`, `-j/--json`. ([PR #104](https://github.com/nazozokc/subtrack/pull/104))
- **MCP Server**: tag and usage tools, enum validation, and paging support. ([`ce1dafa`](https://github.com/nazozokc/subtrack/commit/ce1dafa))
- **Usage Commands**: `usage edit`, token totals, and paging. ([`f2ba913`](https://github.com/nazozokc/subtrack/commit/f2ba913))
- **List/Analytics/Forecast**: list filters (`--limit`, `--offset`), forecast currency conversion, analytics period options. ([`58aab5b`](https://github.com/nazozokc/subtrack/commit/58aab5b))

### 🐛 Bug Fixes

- Exclude cancelled subscriptions from payment summaries; validate edit flags. ([`09583ba`](https://github.com/nazozokc/subtrack/commit/09583ba))
- Correct billing date calculations in `upcoming` and `calendar`. ([`c08ad7f`](https://github.com/nazozokc/subtrack/commit/c08ad7f))
- Exclude dist output from type check. ([`66c874c`](https://github.com/nazozokc/subtrack/commit/66c874c))
- Add `--force` flag to bulk tag commands. ([`64751e4`](https://github.com/nazozokc/subtrack/commit/64751e4))
- Convert API usage cost from cents to dollars. ([`4f90970`](https://github.com/nazozokc/subtrack/commit/4f90970))
- Accept export CSV format in import. ([`dbdb5e8`](https://github.com/nazozokc/subtrack/commit/dbdb5e8))

### 📝 Documentation

- Commands, development, and MCP documentation updates. ([`ac2c325`](https://github.com/nazozokc/subtrack/commit/ac2c325))

## 8.4.0 (2026-08-15)

### ✨ Features

- **Extended Subscription Fields**: vendor, plan tier, discounts, contract dates, and auto-renewal with notification config. ([`e45a853`](https://github.com/nazozokc/subtrack/commit/e45a853))
- **Interactive Category Menu**: replaced the TUI with an interactive main menu. ([`791aa6b`](https://github.com/nazozokc/subtrack/commit/791aa6b))

### 🐛 Bug Fixes

- Harden against decompression bombs, secret leaks, and formula injection. ([`205ae33`](https://github.com/nazozokc/subtrack/commit/205ae33))
- Reject drive roots on Windows when validating the DB directory. ([`72ef676`](https://github.com/nazozokc/subtrack/commit/72ef676))
- Raise scrypt memory limit for passphrase-derived keys. ([`26f137e`](https://github.com/nazozokc/subtrack/commit/26f137e))
- Set non-zero exit code on CLI errors. ([`8652dce`](https://github.com/nazozokc/subtrack/commit/8652dce))
- Remove email notification channel. ([`085f585`](https://github.com/nazozokc/subtrack/commit/085f585))

### 📝 Documentation

- Migrate documentation site from SvelteKit to VitePress. ([`7446e23`](https://github.com/nazozokc/subtrack/commit/7446e23))

## 8.2.0 (2026-07-26)

### ✨ Features

- **Email Suggestion**: `subtrack suggest` scans email via IMAP and suggests subscription candidates. ([`6a9ad3d`](https://github.com/nazozokc/subtrack/commit/6a9ad3d))

### 🔧 CI & Supply Chain

- Correct `pnpm-lock.yaml` path in `lint:lockfile` script. ([`0f3e1b6`](https://github.com/nazozokc/subtrack/commit/0f3e1b6))

## 8.1.0 (2026-07-05)

### ✨ Features

- **Archive/Unarchive**: Archive subscriptions without deleting. `subtrack archive <id>` / `subtrack unarchive <id>`. List hides archived by default; use `--include-archived` to show. Archived entries appear dimmed in display. ([`e247642`](https://github.com/nazozokc/subtrack/commit/e247642))
- **Tag Merge**: Merge one tag into another with `subtrack tag merge <source> <target>`. Uses transactional DB write. ([`e247642`](https://github.com/nazozokc/subtrack/commit/e247642))
- **Cleanup Command**: One-command maintenance — `subtrack cleanup` runs integrity check + VACUUM + audit log prune + orphaned tag prune. Supports `--vacuum`, `--audit-days`, `--json` flags. ([`e247642`](https://github.com/nazozokc/subtrack/commit/e247642))
- **Stats Command**: `subtrack stats` shows subscription counts by status, tag/trial/usage counts, price range, and DB size. `--json` flag for machine-readable output. ([`e247642`](https://github.com/nazozokc/subtrack/commit/e247642))
- **Currency List Command**: `subtrack currency` displays all 37 supported currencies. `--json` flag. ([`e247642`](https://github.com/nazozokc/subtrack/commit/e247642))
- **Usage Total Command**: `subtrack usage total` aggregates LLM API usage by period with `--from`, `--to`, `--period`, and `--json` flags. ([`e247642`](https://github.com/nazozokc/subtrack/commit/e247642))
- **List Pagination**: Add `--limit <N>` and `--offset <N>` flags to `subtrack list` for paginated output. ([`e247642`](https://github.com/nazozokc/subtrack/commit/e247642))
- **Subscription Clone**: `subtrack clone <id>` copies an existing subscription with optional overrides (`--name`, `--price`, `--currency`, `--cycle`, `--tags`). ([`e247642`](https://github.com/nazozokc/subtrack/commit/e247642))
- **Audit Log System**: New `audit_log` table tracks all mutations with timestamp, action type, target, and details. `subtrack audit list|prune` commands for querying and cleaning logs. Integrated into add/edit/delete/import/bulk/tag/config/backup/usage operations. ([`e247642`](https://github.com/nazozokc/subtrack/commit/e247642))
- **JSON Output Across All Commands**: `subtrack payment --json`, `subtrack summary --json`, `subtrack upcoming --json`, `subtrack analytics --json`, `subtrack compare --json`, `subtrack list --json`, `subtrack stats --json`, `subtrack currency --json`, `subtrack usage total --json`. ([`3df1cc4`](https://github.com/nazozokc/subtrack/commit/3df1cc4))
- **Currency Conversion**: `--currency` flag on `subtrack export`, `subtrack payment`, `subtrack upcoming`, `subtrack compare`, `subtrack list` for automatic FX rate conversion. ([`3df1cc4`](https://github.com/nazozokc/subtrack/commit/3df1cc4))
- **Status Filters**: `--status` flag on `subtrack export` to filter by subscription status. ([`3df1cc4`](https://github.com/nazozokc/subtrack/commit/3df1cc4))
- **Payment Method Analysis**: `--method` flag on `subtrack payment` to group totals by payment method. ([`3df1cc4`](https://github.com/nazozokc/subtrack/commit/3df1cc4))
- **Interactive Mode Enhancements**: Interactive prompts with suggestions, validation, and confirmation for add/edit/delete workflows. ([`3df1cc4`](https://github.com/nazozokc/subtrack/commit/3df1cc4))
- **DB Integrity Verification**: SHA-256 sidecar file tracked alongside the encrypted database. Hash verified on load and written on every save. ([`e247642`](https://github.com/nazozokc/subtrack/commit/e247642))
- **Config File Encryption**: `config.json` automatically encrypted with AES-256-GCM when an encryption key exists (magic header `SUBCCFG` for detection). Backward-compatible with plain JSON. ([`e247642`](https://github.com/nazozokc/subtrack/commit/e247642))
- **MCP Server Security**: Token-bucket rate limiter (60 req/min), 100 KB request size limit, per-tool input schema validation with field length and type checks. ([`e247642`](https://github.com/nazozokc/subtrack/commit/e247642))
- **CSV Import Hardening**: Row limit (10,000), field length limit (500), control character stripping, whitespace-prefixed formula injection detection, duplicate detection with `--deduplicate` flag. ([`e247642`](https://github.com/nazozokc/subtrack/commit/e247642))
- **Maintenance Command**: `subtrack maintenance` runs `PRAGMA integrity_check`. `--vacuum` flag for DB space reclamation with size before/after reporting. ([`e247642`](https://github.com/nazozokc/subtrack/commit/e247642))
- **Calendar Currency Support**: `--currency` flag for currency conversion in calendar view. ([`3df1cc4`](https://github.com/nazozokc/subtrack/commit/3df1cc4))
- **CSV Export Injection Protection**: `escapeCsv()` now strips control characters, detects formula injection vectors, and handles `\r` correctly. ([`e247642`](https://github.com/nazozokc/subtrack/commit/e247642))

### 🐛 Bug Fixes

- Fix lock recursion in `getDb()` → `verifyDbHash()` → `getDbPath()` → `getDb()` cycle on second+ run ([`e247642`](https://github.com/nazozokc/subtrack/commit/e247642))
- Fix `last_insert_rowid()` returning wrong ID when tag inserts precede subscription insert ([`e247642`](https://github.com/nazozokc/subtrack/commit/e247642))
- Fix `addAuditLog()` never calling `saveDb()` — audit entries lost on process exit ([`e247642`](https://github.com/nazozokc/subtrack/commit/e247642))
- Fix MCP `getSubscriptions()` call with old positional argument signature ([`e247642`](https://github.com/nazozokc/subtrack/commit/e247642))
- Fix TUI `list.tsx` calling `getSubscriptions()` with old two-arg format ([`e247642`](https://github.com/nazozokc/subtrack/commit/e247642))
- Fix profile `--tag` array arg failing when passed as single string by gunshi ([`e247642`](https://github.com/nazozokc/subtrack/commit/e247642))
- Fix TUI status maps missing `"archived"` entry — archive cycle now available in UI ([`e247642`](https://github.com/nazozokc/subtrack/commit/e247642))
- Fix `list --json` flag defined but never handled — now outputs JSON as documented ([`e247642`](https://github.com/nazozokc/subtrack/commit/e247642))
- Fix release tag verification non-blocking for lightweight unsigned tags from GitHub Releases ([`7578918`](https://github.com/nazozokc/subtrack/commit/7578918))
- Fix pre-existing type check error in TUI — `HTMLInputElement` type replaced with minimal interface to avoid DOM lib dependency ([`e247642`](https://github.com/nazozokc/subtrack/commit/e247642))
- Fix pre-existing test failures: `handleImport` CSV header mismatch and `handleAdd` prompt mock mismatch ([`e247642`](https://github.com/nazozokc/subtrack/commit/e247642))

### 🔧 CI & Supply Chain

- Pin `google/osv-scanner-action` to SHA `e4ad0de` in scheduled CI ([`e247642`](https://github.com/nazozokc/subtrack/commit/e247642))
- Add `npm audit --verify-provenance` step to check workflow ([`e247642`](https://github.com/nazozokc/subtrack/commit/e247642))
- Add license allowlist to dependency review action (MIT, Apache-2.0, BSD, ISC, and other permissive licenses) ([`e247642`](https://github.com/nazozokc/subtrack/commit/e247642))
- Increase Renovate `minimumReleaseAge` from 7 to 14 days, enable `fetchReleaseNotes` ([`e247642`](https://github.com/nazozokc/subtrack/commit/e247642))
- Integrate `step-security/harden-runner` in check workflow ([`3df1cc4`](https://github.com/nazozokc/subtrack/commit/3df1cc4))
- Add Trojan Source (Unicode control character) detection to CI ([`3df1cc4`](https://github.com/nazozokc/subtrack/commit/3df1cc4))

### 📝 Documentation

- Add comprehensive docs for all commands, data layer, MCP server, guides, and FAQ ([`c9ca008`](https://github.com/nazozokc/subtrack/commit/c9ca008))

### 📦 Full Changelog

**Full Changelog**: https://github.com/nazozokc/subtrack/compare/8.0.2...8.1.0
