---
title: Configuration
description: Environment variables and configuration options for subtrack.
---

subtrack follows a **zero-configuration** philosophy. It works out of the box with sensible defaults.

## Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SUBSC_CLI_DB_DIR` | Override the database directory | `~/.config/subtrack` |
| `SUBSC_CLI_DB_PASSPHRASE` | Derive encryption key from a passphrase instead of a key file | none (uses `.key` file) |

### Example usage

```bash
# Use a custom directory for the database
export SUBSC_CLI_DB_DIR=~/project/subtrack-data
subtrack list

# Or set it per-command
SUBSC_CLI_DB_DIR=/tmp/test-db subtrack add \
  --name Spotify \
  --price 980 \
  --currency JPY \
  --cycle monthly

# Use a passphrase instead of a key file
export SUBSC_CLI_DB_PASSPHRASE="my-secure-passphrase"
subtrack list
```

<div class="callout info">
  <strong>💡 Tip:</strong> Changing <code>SUBSC_CLI_DB_DIR</code> lets you maintain separate databases — useful for testing or multi-profile setups.
</div>

<div class="callout warning">
  <strong>⚠️ Important:</strong> If you use <code>SUBSC_CLI_DB_PASSPHRASE</code> or the auto-generated encryption key, <strong>back up the key file</strong> (<code>~/.config/subtrack/.key</code>) or remember your passphrase. Without it, encrypted backups and the database itself cannot be recovered.
</div>

## Database encryption

subtrack automatically encrypts the SQLite database file on disk using **AES-256-GCM**. On first run, a random 256-bit key is generated and stored in:

```text
~/.config/subtrack/.key
```

Alternatively, you can set `SUBSC_CLI_DB_PASSPHRASE` to derive the encryption key from a passphrase (using scrypt key derivation). This is useful for CI environments or when you want to avoid storing a key file.

Backups can also be encrypted with `subtrack backup --encrypt`.

## Configuration management (`subtrack config`)

subtrack provides a `config` command to manage runtime settings stored in `~/.config/subtrack/config.json`:

```bash
# List all config values
subtrack config list

# Get a specific value
subtrack config get defaultCurrency

# Set a value
subtrack config set monthlyBudget 500

# Reset all config to defaults
subtrack config reset
```

See the [Commands reference](/commands#config) for full details.

### Config keys

| Key | Description | Default |
|-----|-------------|---------|
| `defaultCurrency` | Default currency for display and analytics | `USD` |
| `monthlyBudget` | Monthly spending budget in USD (0 = disabled) | `0` |
| `theme` | Display theme preset (`default`, `light`, `high-contrast`, `none`) | `default` |
| `notifyDays` | Default look-ahead days for `subtrack notify` | `7` |
| `notifyChannels` | Notification channels (comma-separated: `os`, `slack`, `webhook`) | `os` |
| `slackWebhook` | Slack webhook URL for Slack notifications | — |
| `webhookUrl` | Generic webhook URL for notifications | — |
| `yearlyBudget` | Yearly budget target in USD | — |
| `profiles` | Saved filter profiles (stored as JSON object) | `{}` |
| `activeProfile` | Currently active filter profile name | — |
| `budgets` | Multiple named budgets for budget-vs-actual tracking | — |
| `tableBorderColor` | Table border color override (color name) | theme default |
| `tableHeaderColor` | Table header color override (color name) | theme default |
| `tableZebraColor` | Zebra stripe background color override (color name) | theme default |
| `accentColor` | Accent color override for headings (color name) | theme default |
| `tableZebra` | Enable/disable zebra striping (`on`/`off`) | `on` |
| `tableMinWidth` | Minimum table width in columns (20–200) | `40` |
| `dateFormat` | Date display format (`iso` or `short`) | `iso` |
| `listShowNotes` | Show notes column in `subtrack list` by default (`on`/`off`) | `off` |
| `listShowMethod` | Show payment method column in `subtrack list` by default (`on`/`off`) | `off` |

Set values with:

```bash
subtrack config set notifyDays 3
subtrack config set defaultCurrency JPY
```

The `config set` command validates input (e.g., currency codes must be ISO 4217, budget must be non-negative).

### Display themes

The `theme` key switches between color presets:

| Preset | Best for |
|--------|----------|
| `default` | Dark terminal backgrounds (default) |
| `light` | Light terminal backgrounds |
| `high-contrast` | Accessibility / high ambient light |
| `none` | Plain monochrome output (piping, screen readers) |

Individual color keys (`tableBorderColor`, `tableHeaderColor`, `tableZebraColor`, `accentColor`) override the preset. Valid color names: `black`, `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `white`, `gray`, and the `bright*` variants.

```bash
# Switch to the light theme
subtrack config set theme light

# Or fine-tune a preset
subtrack config set theme high-contrast
subtrack config set accentColor yellow

# Disable zebra striping
subtrack config set tableZebra off
```

## No config file

subtrack does not use configuration files (`.subtrackrc`, `subtrack.json`, etc.). All settings are controlled via the `config` command, environment variables, or CLI flags. This keeps the tool simple and predictable.

## Currency & cycle choices

### Supported currencies (36)

The interactive prompt provides a curated list of 36 currencies. The `--currency` flag accepts any valid ISO 4217 3-letter code supported by [open.er-api.com](https://open.er-api.com).

```
AED  ARS  AUD  BRL  CAD  CHF  CLP  CNY  COP  CZK
DKK  EGP  EUR  GBP  HKD  HUF  IDR  ILS  INR  JPY
KRW  MXN  MYR  NGN  NOK  NZD  PHP  PLN  SAR  SEK
SGD  THB  TRY  TWD  USD  VND  ZAR
```

View the full list with descriptions using:

```bash
subtrack currency
```

### Supported billing cycles (6)

```
weekly  bi-weekly  monthly  quarterly  semi-annual  yearly
```
