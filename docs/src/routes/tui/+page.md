---
title: Interactive TUI
description: Walkthrough of subtrack's interactive terminal UI — prompts, autocomplete, confirmations, and behaviors.
---

subtrack offers both **interactive** and **non-interactive** modes. The interactive mode uses [@inquirer/prompts](https://github.com/SBoudrias/Inquirer.js) to guide you through each operation with live validation, select menus, and autocomplete hints.

| Command | Interactive | Non-interactive |
|---------|-------------|-----------------|
| `add` | ✅ (default) | ✅ (all flags provided) |
| `edit` | ✅ (default) | ✅ (flags + optional ID) |
| `delete` | ✅ (always) | ✅ (positional IDs) |
| `clone` | ❌ | ✅ (positional ID) |
| `archive` | ❌ | ✅ (positional ID) |
| `unarchive` | ❌ | ✅ (positional ID) |
| `import` | ❌ | ✅ |
| `list` | ❌ | ✅ |
| `tags` | ❌ | ✅ |
| `tag` | ❌ | ✅ |
| `summary` | ❌ | ✅ |
| `export` | ❌ | ✅ |
| `payment` | ❌ | ✅ |
| `backup` | ❌ | ✅ |
| `restore` | ✅ (default) | ✅ (flags provided) |
| `audit list` | ❌ | ✅ |
| `audit prune` | ❌ | ✅ |
| `maintenance` | ❌ | ✅ |
| `cleanup` | ❌ | ✅ |
| `stats` | ❌ | ✅ |
| `currency` | ❌ | ✅ |
| `usage add` | ✅ (default) | ✅ (all flags provided) |
| `usage list` | ❌ | ✅ |
| `usage delete` | ✅ (always) | ✅ (positional IDs) |
| `usage import` | ❌ | ✅ |
| `usage refresh` | ❌ | ✅ |
| `usage total` | ❌ | ✅ |

## `subtrack add` — interactive walkthrough

Running `subtrack add` without flags starts a step-by-step prompt session.

### 1. Name

```
? subscription name Netflix
```

- Text input with live validation
- Cannot be empty
- Max 100 characters
- Validation error on invalid input:

```
ⓧ Name cannot be empty
```

### 2. Price

```
? monthly payment amount 1980
```

- Numeric input
- Validated as a non-negative integer
- Max 99,999,999

### 3. Billing day (optional)

```
? billing day (1-31, optional)
```

- Optional text input
- Leave empty to use the creation date as the billing anchor
- Enter a number between 1 and 31

### 4. Status

```
? status (Use arrow keys)
❯  active
   paused
   cancelled
```

- Select from 3 statuses
- Default is `active`

### 5. Currency

```
? currency (Use arrow keys)
   JPY (日本円)
❯  USD (US Dollar)
   EUR (Euro)
   GBP (British Pound)
   AUD (Australian Dollar)
   CAD (Canadian Dollar)
   KRW (South Korean Won)
   CNY (Chinese Yuan)
   SGD (Singapore Dollar)
   HKD (Hong Kong Dollar)
```

- Select from 36 supported currencies
- Navigate with arrow keys, confirm with Enter

### 6. Cycle

```
? cycle (Use arrow keys)
   weekly
   bi-weekly
❯  monthly
   quarterly
   semi-annual
   yearly
```

- Select from 6 billing cycles

### 7. Tags

```
? tags existing: music, video
```

- Text input with **existing tags shown as hints**
- If you have previously created tags, they appear as `existing: tag1, tag2` to remind you of available values
- Comma-separated, max 10 tags, each max 50 characters
- Can be left blank (press Enter to skip)

### 8. Confirmation

```
? Save "Netflix" (¥1,980, monthly)? (Y/n)
```

If the status is not `active`, it's shown in the confirmation summary:

```
? Save "Adobe CC" (¥6,980, monthly, status: paused)? (Y/n)
```

- Shows a summary of the subscription
- **Default is `Yes`** — pressing Enter saves immediately
- Type `n` to cancel

After confirmation:

```
✔ Added subscription: Netflix
```

### Full-flag mode (no prompts)

When all required flags are provided (`--name`, `--price`, `--currency`, `--cycle`, `--tags`), **no prompts appear** and the subscription is saved immediately without confirmation. Optional flags like `--status`, `--billingDay` can also be included:

```bash
subtrack add \
  --name Netflix \
  --price 1980 \
  --currency JPY \
  --cycle monthly \
  --tags "video,entertainment" \
  --status active \
  --billingDay 15
```

Useful for scripts and automation.

### Partial-flag mode

You can provide some flags and let the rest be prompted. For example:

```bash
subtrack add --name Netflix
```

This prompts for price, currency, cycle, and tags — and shows the confirmation dialog since some fields were interactive.

## `subtrack edit` — interactive walkthrough

Running `subtrack edit` without arguments interactively selects a subscription and lets you pick which fields to update.

### 1. Select subscription

```
? select subscription to edit (Use arrow keys)
❯ Netflix — ¥1,980/month [video, entertainment]
  Spotify — ¥980/month [music]
  AWS — $50/month [cloud]
```

- Single-select with arrow keys
- Each subscription shows: `name — price/cycle [tags]`
- If no subscriptions exist, shows "No subscriptions found" and exits

### 2. Select fields to edit

```
? Select fields to edit: (Use arrow keys, space to select)
❯◯ name (Netflix)
 ◯ price (¥1,980)
 ◯ currency (JPY)
 ◯ cycle (monthly)
 ◯ status (active)
 ◯ billing day (not set)
 ◯ tags (video, entertainment)
```

- **Multi-select** with checkbox (space to toggle, enter to confirm)
- Current values are shown next to each field
- Select one or more fields to update

### 3. Edit each field

Each selected field prompts for a new value with the current value as default:

```
? New name: Netflix
? New price: 2500
? New tags (comma-separated) (existing: music, video) video, entertainment, 4k
```

### 4. Confirmation

```
? Save changes? (Y/n)
```

- **Default is `Yes`** — pressing Enter saves
- Type `n` to cancel

After saving:

```
✔ Updated: Netflix Premium — ¥2,500/month
```

### Non-interactive mode

Provide a subscription ID and flags to update without prompts:

```bash
subtrack edit 3 --price 1500 --tags "music"
```

This updates only the specified fields and skips all prompts.

## `subtrack delete` — interactive walkthrough

When run without arguments, `delete` launches an interactive session. You can also pass positional IDs for non-interactive deletion (e.g. `subtrack delete 3`).

### 1. Select subscriptions

```
? select subscriptions to delete (Use arrow keys to move, space to select)
❯◯ Netflix — ¥1,980/month [video, entertainment]
 ◯ Spotify — ¥980/month [music]
 ◯ AWS — $50/month [cloud]
```

- **Multi-select** with checkbox (space to toggle, enter to confirm)
- Each subscription shows: `name — price/cycle [tags]`
- If no subscriptions exist, shows "No subscriptions found" and exits

### 2. Confirmation

```
? Delete 2 subscriptions? (Netflix, Spotify) (y/N)
```

- Shows count and names of selected subscriptions
- **Default is `No`** — pressing Enter does **not** delete
- Type `y` to confirm

After deletion, each removed subscription is confirmed:

```
✔ Deleted: Netflix
✔ Deleted: Spotify
```

## Tips

- **`add` confirmation defaults to `Yes`** for quick saves, but you can cancel with `n`.
- **`edit` confirmation defaults to `Yes`** after making changes.
- **`delete` confirmation defaults to `No`** to prevent accidental deletion.
- Use **arrow keys** for select menus, **space** for checkboxes, **Enter** to confirm.
- Tags from previous sessions appear as **hints** — use consistent tag names to get autocomplete-like suggestions.
- Validation errors are shown inline in prompts; invalid flag values in non-interactive mode print an error and abort the command.
