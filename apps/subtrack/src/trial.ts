import { input, confirm, checkbox, select } from "@inquirer/prompts"
import { consola } from "consola"
import { fail } from "./error.ts"
import pc from "picocolors"
import CliTable3 from "cli-table3"
import type { TrialEntry, AddTrialArgs, TrialAddFlags } from "./types.ts"
import { writeTrial, getTrials, getTrial, deleteTrial, getTrialsExpiringSoon } from "./db.ts"
import { formatPrice } from "./price.ts"
import { TABLE_CHARS, TABLE_STYLE } from "./display-constants.ts"
import {
  CURRENCY_CHOICES,
  CYCLE_CHOICES,
  validateTrialName,
  validateExpiresAt,
  validateNotes,
  promptString,
  promptSelect,
} from "./prompts.ts"
import { daysUntil } from "./date-utils.ts"

// ── Helpers ────────────────────────────────────────────

function formatPriceOrDash(price: number | null, currency: string | null, cycle: string | null): string {
  if (price === null || price === undefined) return "—"
  const ccy = currency ?? "USD"
  const cyc = cycle ?? "monthly"
  return `${formatPrice(price, ccy)}/${cyc}`
}

function trialStatusLabel(days: number): string {
  if (days < 0) return pc.red("expired")
  if (days === 0) return pc.red("today")
  if (days <= 3) return pc.red(`${days}d`)
  if (days <= 7) return pc.yellow(`${days}d`)
  return pc.green(`${days}d`)
}

// ── Add workflow ───────────────────────────────────────

async function resolveTrialAddOptions(flags: TrialAddFlags): Promise<AddTrialArgs | null> {
  const nameRes = await promptString(flags.name, "trial name", validateTrialName)
  if (!nameRes) return null

  const expiresRes = await promptString(flags.expiresAt, "expiration date (YYYY-MM-DD)", validateExpiresAt)
  if (!expiresRes) return null

  const prompted = nameRes.prompted || expiresRes.prompted

  // price (optional)
  let price: number | null = null
  const priceStr = flags.price
  if (priceStr !== undefined) {
    const trimmed = priceStr.trim()
    if (trimmed) {
      const num = Number(trimmed)
      if (isNaN(num) || num < 0) { fail("Price must be a non-negative number"); return null }
      price = Math.round(num)
    }
  } else if (prompted) {
    const pStr = await input({
      message: "price after trial (optional, number)",
      validate: (v: string) => !v.trim() || (!isNaN(Number(v)) && Number(v) >= 0) ? true : "Enter a valid non-negative number",
    })
    if (pStr.trim()) price = Math.round(Number(pStr))
  }

  // currency (optional)
  const currencyRes = await promptSelect(
    flags.currency,
    "currency",
    CURRENCY_CHOICES,
    (v: string): v is string => CURRENCY_CHOICES.some((c) => c.value === v),
  )
  const currency = price !== null ? (currencyRes?.value ?? "USD") : null

  // cycle (optional)
  const cycleRes = await promptSelect(
    flags.cycle,
    "cycle",
    CYCLE_CHOICES,
    (v: string): v is string => CYCLE_CHOICES.some((c) => c.value === v),
  )
  const cycle = price !== null ? (cycleRes?.value ?? "monthly") : null

  // notes (optional)
  let notes: string | null = null
  const notesStr = flags.notes
  if (notesStr !== undefined) {
    const trimmed = notesStr.trim()
    if (trimmed) {
      const valid = validateNotes(trimmed)
      if (valid !== true) { fail(valid); return null }
      notes = trimmed
    }
  } else if (prompted) {
    const nStr = await input({
      message: "notes (optional, max 500 chars)",
      validate: validateNotes,
    })
    if (nStr.trim()) notes = nStr.trim()
  }

  if (prompted) {
    const priceDisplay = price !== null ? formatPriceOrDash(price, currency, cycle) : "not set"
    const ok = await confirm({
      message: `Save trial "${nameRes.value}" (expires: ${expiresRes.value}, price: ${priceDisplay})?`,
      default: true,
    })
    if (!ok) { consola.info("Cancelled"); return null }
  }

  return {
    name: nameRes.value.trim(),
    expiresAt: expiresRes.value.trim(),
    price,
    currency,
    cycle,
    notes,
  }
}

// ── Command handlers ───────────────────────────────────

export async function handleTrialAdd(flags: TrialAddFlags): Promise<void> {
  const result = await resolveTrialAddOptions(flags)
  if (!result) return
  try {
    writeTrial(result)
    consola.success(`Added trial: ${result.name}`)
  } catch (error) {
    fail(`Failed to add trial: ${String(error)}`)
  }
}

export function handleTrialList(options: { json?: boolean } = {}): void {
  const trials = getTrials()
  if (trials.length === 0) {
    if (options.json) {
      process.stdout.write(JSON.stringify({ trials: [] }, null, 2) + "\n")
      return
    }
    consola.info("No trials found")
    return
  }

  if (options.json) {
    const data = trials.map((t) => ({
      id: t.id,
      name: t.name,
      expiresAt: t.expiresAt,
      daysLeft: daysUntil(t.expiresAt),
      price: t.price,
      currency: t.currency,
      cycle: t.cycle,
      notes: t.notes,
    }))
    process.stdout.write(JSON.stringify({ trials: data }, null, 2) + "\n")
    return
  }

  renderTrialTable(trials)
}

export function handleTrialExpiring(days: number = 7, options: { json?: boolean } = {}): void {
  const trials = getTrialsExpiringSoon(days)
  if (trials.length === 0) {
    if (options.json) {
      process.stdout.write(JSON.stringify({ trials: [], days }, null, 2) + "\n")
      return
    }
    consola.info(`No trials expiring within ${days} day${days > 1 ? "s" : ""}`)
    return
  }

  if (options.json) {
    const data = trials.map((t) => ({
      id: t.id,
      name: t.name,
      expiresAt: t.expiresAt,
      daysLeft: daysUntil(t.expiresAt),
      price: t.price,
      currency: t.currency,
      cycle: t.cycle,
      notes: t.notes,
    }))
    process.stdout.write(JSON.stringify({ trials: data, days }, null, 2) + "\n")
    return
  }

  consola.info(`Trials expiring within ${days} day${days > 1 ? "s" : ""}:`)
  renderTrialTable(trials)
}

export async function handleTrialDelete(ids?: number[]): Promise<void> {
  if (ids && ids.length > 0) {
    for (const id of ids) {
      const trial = getTrial(id)
      if (!trial) {
        fail(`Trial with id ${id} not found`)
        continue
      }
      deleteTrial(id)
      consola.success(`Deleted trial: ${trial.name}`)
    }
    return
  }

  const all = getTrials()
  if (all.length === 0) {
    consola.info("No trials found")
    return
  }

  const selected = await checkbox({
    message: "select trials to delete",
    choices: all.map((t) => ({
      name: `${t.name} (expires ${t.expiresAt})`,
      value: t,
    })),
  })

  if (selected.length === 0) {
    consola.info("Cancelled")
    return
  }

  const names = selected.map((s) => s.name).join(", ")
  const ok = await confirm({
    message: `Delete ${selected.length} trial${selected.length > 1 ? "s" : ""}? (${names})`,
    default: false,
  })
  if (!ok) { consola.info("Cancelled"); return }

  for (const t of selected) {
    deleteTrial(t.id)
    consola.success(`Deleted trial: ${t.name}`)
  }
}

// ── Table rendering ────────────────────────────────────

function renderTrialTable(trials: TrialEntry[]): void {
  const headers = ["ID", "Name", "Expires", "Days", "Price", "Notes"]
  const rows: string[][] = trials.map((t) => {
    const days = daysUntil(t.expiresAt)
    const statusLabel = trialStatusLabel(days)
    const daysDisplay = days < 0 ? statusLabel : `${statusLabel}`
    return [
      String(t.id),
      t.name,
      t.expiresAt,
      daysDisplay,
      formatPriceOrDash(t.price, t.currency, t.cycle),
      t.notes ?? "",
    ]
  })

  const termWidth = process.stdout.columns ?? 80
  const avail = Math.max(50, termWidth - 14)
  const weights = [4, 20, 12, 6, 16, 20]
  const widths = weights.map((w) => Math.min(w, Math.round((avail * w) / weights.reduce((a, b) => a + b, 0))))

  const table = new CliTable3({
    chars: { ...TABLE_CHARS },
    style: { ...TABLE_STYLE },
    colWidths: widths,
    head: [...headers],
    colAligns: ["right", "left", "left", "left", "right", "left"],
  })

  for (let i = 0; i < rows.length; i++) {
    if (i % 2 === 0) {
      table.push(rows[i].map((cell) => `\x1b[48;5;236m${cell}\x1b[0m`))
    } else {
      table.push(rows[i])
    }
  }

  consola.log(table.toString())
}
