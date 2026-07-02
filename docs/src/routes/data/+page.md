---
title: Data & Storage
description: How subtrack stores data, database location, backup and restore.
---

## Database location

All subscription data is stored in a single SQLite database file at:

```
~/.config/subtrack/subtrack.db
```

The database is created automatically on first use. No database server or configuration is required.

## Database structure

Four tables — three for subscriptions with a many-to-many relationship, and one for LLM API usage tracking:

```
subscriptions
├── id             INTEGER PRIMARY KEY AUTOINCREMENT
├── name           TEXT NOT NULL
├── price          INTEGER NOT NULL
├── currency       TEXT NOT NULL
├── cycle          TEXT NOT NULL
├── status         TEXT NOT NULL DEFAULT 'active'
├── billing_day    INTEGER
└── created_at     TEXT NOT NULL DEFAULT (date('now'))

tags
├── id   INTEGER PRIMARY KEY AUTOINCREMENT
└── name TEXT NOT NULL UNIQUE

subscription_tags
├── subscription_id  INTEGER NOT NULL (FK → subscriptions.id)
└── tag_id           INTEGER NOT NULL (FK → tags.id)
│                    PRIMARY KEY (subscription_id, tag_id)

llm_usage
├── id             INTEGER PRIMARY KEY AUTOINCREMENT
├── provider       TEXT NOT NULL
├── model          TEXT NOT NULL
├── input_tokens   INTEGER NOT NULL DEFAULT 0
├── output_tokens  INTEGER NOT NULL DEFAULT 0
├── cost           REAL NOT NULL
├── date           TEXT NOT NULL
├── description    TEXT
└── generation_id  TEXT (nullable, unique index for dedup)
```

### Status

Each subscription has a `status` field: `active`, `paused`, or `cancelled`. Only active and paused subscriptions are included in payment calculations and upcoming bills. Cancelled subscriptions are preserved for record-keeping but excluded from totals.

### Billing day

The `billing_day` column stores the day of month (1–31) when the subscription is billed. If not set, the creation date is used as the anchor for billing calculations. This is particularly relevant for the `upcoming` command, which predicts when your next bill is due.

### Deletion behavior

Deleting a subscription automatically removes its tag associations via `ON DELETE CASCADE`. Orphaned tags (with no subscriptions) can be cleaned up with `subtrack tag prune`.

## Prices are stored as integers

Prices are stored as whole numbers (integers) in the database. This avoids floating-point precision issues. For display, prices are formatted with the appropriate currency symbol and decimal places using `Intl.NumberFormat`.

## Encryption

subtrack automatically encrypts the database file on disk using **AES-256-GCM**. The encryption key is either:

- Auto-generated and stored at `~/.config/subtrack/.key` (on first run)
- Derived from `SUBSC_CLI_DB_PASSPHRASE` environment variable via scrypt

This means your subscription data is encrypted at rest. Backups can also be encrypted with `subtrack backup --encrypt`.

### Key integrity verification

subtrack maintains a SHA-256 integrity hash for the encryption key file at `~/.config/subtrack/.key.sha256`. On every startup, the key's SHA-256 hash is compared against the stored hash:

- **Hash matches** — key is intact, operation proceeds normally
- **No sidecar file** (first run or migration) — sidecar is created automatically
- **Hash mismatch** — an error is shown and the operation is aborted

This detects file corruption and tampering before any encryption/decryption operation. If the integrity check fails, restore the `.key` file from a backup, or delete it to generate a new key (note: this will make encrypted backups unrecoverable).

> ⚠️ **Back up your key file or remember your passphrase.** Without it, the database and encrypted backups cannot be recovered. Consider backing up both `.key` and `.key.sha256` together.

## Backup

Use the `backup` command to create a timestamped copy of your database:

```bash
# Backup to the default directory (~/.config/subtrack/backups/)
subtrack backup
# Creates: ~/.config/subtrack/backups/subtrack_20260617_143000.db.gz

# Backup to a custom directory
subtrack backup ~/backups
# Creates: ~/backups/subtrack_20260617_143000.db.gz

# Encrypted backup
subtrack backup --encrypt
# Creates: ~/.config/subtrack/backups/subtrack_20260617_143000.db.enc
```

If no destination is specified, backups are saved to `~/.config/subtrack/backups/` (created automatically). Backups use exclusive file creation, so they will never overwrite an existing file. Each backup has a SHA-256 hash sidecar (`<backup>.sha256`) for integrity verification. See the [Commands](/commands) reference for full details.

## Restore from backup

Use the `restore` command to restore from a backup. Without arguments, it interactively lists available backups:

```bash
# Interactive: select from available backups
subtrack restore

# Restore from a specific file
subtrack restore ~/backups/subtrack_20260617_143000.db.gz
```

Before restoring, the current database is automatically backed up as a safety measure. You can also restore manually:

```bash
# Stop subtrack (close all running instances)
cp ~/backups/subtrack_20260617_143000.db.gz ~/.config/subtrack/subtrack.db.gz
gunzip -k ~/.config/subtrack/subtrack.db.gz
```

Make sure subtrack is not running when you restore, as changes are written to the database file on every command.

## Custom database directory

Override the default `~/.config/subtrack` directory with the `SUBSC_CLI_DB_DIR` environment variable:

```bash
SUBSC_CLI_DB_DIR=/path/to/custom/dir subtrack list
```

See [Configuration](/configuration) for more details.
