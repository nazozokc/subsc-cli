// ── Trial commands ─────────────────────────────────────
import { define } from "gunshi"
import { consola } from "consola"
import { handleTrialAdd, handleTrialList, handleTrialExpiring, handleTrialDelete } from "../trial.ts"

const trialAddCmd = define({
  name: "add",
  description: "Add a free trial",
  toKebab: true,
  args: {
    name: { type: "string", description: "Trial name" },
    expiresAt: { type: "string", description: "Expiration date (YYYY-MM-DD)" },
    price: { type: "string", description: "Price after trial ends" },
    currency: { type: "string", description: "Currency" },
    cycle: { type: "string", description: "Billing cycle" },
    notes: { type: "string", description: "Notes" },
  },
  run: (ctx) => handleTrialAdd(ctx.values),
})

const trialListCmd = define({
  name: "list",
  description: "List all free trials",
  run: () => handleTrialList(),
})

const trialExpiringCmd = define({
  name: "expiring",
  description: "Show trials expiring within a number of days",
  args: {
    days: { type: "positional", description: "Number of days (default: 7)", required: false },
  },
  run: (ctx) => {
    const days = ctx.values.days !== undefined ? Number(ctx.values.days) : 7
    handleTrialExpiring(days)
  },
})

const trialDeleteCmd = define({
  name: "delete",
  description: "Delete free trials",
  args: {
    id: { type: "positional", array: true, description: "Trial ID(s) to delete (omit for interactive selection)", required: false },
  },
  run: (ctx) => {
    const ids = ctx.positionals.slice(1).map(Number).filter((n: number) => !isNaN(n))
    handleTrialDelete(ids.length > 0 ? ids : undefined)
  },
})

export const trialCommand = define({
  name: "trial",
  description: "Manage free trials",
  subCommands: {
    add: trialAddCmd,
    list: trialListCmd,
    expiring: trialExpiringCmd,
    delete: trialDeleteCmd,
  },
  run: () => consola.info("Usage: subtrack trial add|list|expiring|delete"),
})
