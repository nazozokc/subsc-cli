// ── Import/Export commands ─────────────────────────────
import { define } from "gunshi"
import { consola } from "consola"
import { handleExport } from "../export.ts"
import { handleImport } from "../import-csv.ts"

export const exportCommand = define({
  name: "export",
  description: "Export subscriptions",
  args: {
    format: { type: "positional", description: "Export format: csv, json, md, excel, ics" },
    currency: { type: "string", short: "c", description: "Convert all prices to target currency" },
    tags: { type: "string", description: "Filter by comma-separated tags" },
    status: { type: "string", description: "Filter by status: active, paused, cancelled (comma-separated)" },
    output: { type: "string", short: "o", description: "Output file path (default: stdout)" },
  },
  run: (ctx) => handleExport(ctx.values.format, {
    currency: ctx.values.currency,
    tags: ctx.values.tags,
    status: ctx.values.status,
    output: ctx.values.output,
  }),
})

export const importCommand = define({
  name: "import",
  description: "Import subscriptions from CSV",
  toKebab: true,
  args: {
    file: { type: "positional", description: "CSV file to import" },
    dryRun: { type: "boolean", description: "Validate without importing" },
    deduplicate: { type: "boolean", description: "Skip or update existing subscriptions with the same name" },
  },
  run: (ctx) => handleImport(ctx.values.file, {
    dryRun: ctx.values.dryRun,
    deduplicate: ctx.values.deduplicate,
  }),
})
