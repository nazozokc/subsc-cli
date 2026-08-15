// ── Suggest command: manage email-based subscription suggestions ──

import { define } from "gunshi"
import { consola } from "consola"
import { fail } from "../error.ts"
import {
  handleSuggestList,
  handleSuggestView,
  handleSuggestReview,
  handleSuggestDismiss,
  handleSuggestDismissAll,
  handleSuggestAdd,
} from "../suggest/suggest.ts"
import { handleSuggestScan } from "../suggest/scan.ts"

const suggestListCmd = define({
  name: "list",
  description: "List pending suggestions from email scans",
  args: {
    all: { type: "boolean", description: "Show all suggestions (including dismissed/added)" },
    json: { type: "boolean", short: "j", description: "Output as JSON" },
  },
  run: (ctx) => {
    handleSuggestList({ all: ctx.values.all, json: ctx.values.json })
  },
})

const suggestViewCmd = define({
  name: "view",
  description: "View full details of a suggestion",
  args: {
    id: { type: "positional", description: "Suggestion ID", required: true },
  },
  run: (ctx) => {
    const id = Number(ctx.values.id)
    if (isNaN(id)) { fail("Invalid suggestion ID"); return }
    handleSuggestView(id)
  },
})

const suggestAddCmd = define({
  name: "add",
  description: "Add a suggestion as a subscription (non-interactive)",
  args: {
    id: { type: "positional", description: "Suggestion ID", required: true },
  },
  run: (ctx) => {
    const id = Number(ctx.values.id)
    if (isNaN(id)) { fail("Invalid suggestion ID"); return }
    handleSuggestAdd(id)
  },
})

const suggestDismissCmd = define({
  name: "dismiss",
  description: "Dismiss a suggestion",
  args: {
    id: { type: "positional", description: "Suggestion ID", required: false },
    all: { type: "boolean", description: "Dismiss all pending suggestions" },
  },
  run: (ctx) => {
    if (ctx.values.all) {
      handleSuggestDismissAll()
    } else if (ctx.values.id) {
      const id = Number(ctx.values.id)
      if (isNaN(id)) { fail("Invalid suggestion ID"); return }
      handleSuggestDismiss(id)
    } else {
      fail("Specify a suggestion ID or use --all")
    }
  },
})

const suggestScanCmd = define({
  name: "scan",
  description: "Force re-scan emails for new suggestions (ignores cooldown)",
  run: async () => {
    await handleSuggestScan()
  },
})

export const suggestCommand = define({
  name: "suggest",
  description: "Manage subscription suggestions from email scans",
  subCommands: {
    list: suggestListCmd,
    view: suggestViewCmd,
    add: suggestAddCmd,
    dismiss: suggestDismissCmd,
    scan: suggestScanCmd,
  },
  run: async () => {
    // Default: run interactive review
    await handleSuggestReview()
  },
})
