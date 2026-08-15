#!/usr/bin/env node
import { cli, define } from "gunshi"
import { consola } from "consola"
import { createRequire } from "node:module"
import { saveDb } from "./db.ts"
import { subCommands } from "./commands/index.ts"

// Single source of truth for the version is package.json
const require = createRequire(import.meta.url)
const pkg = require("../package.json") as { version: string }

const mainCommand = define({
  name: "subtrack",
  description: "Manage subscription services from your terminal",
  run: async () => {
    const { handleMenu } = await import("./menu.ts")
    return handleMenu()
  },
})

// Signal handlers for clean shutdown
let exiting = false
const handleSignal = (signal: string) => {
  if (exiting) return
  exiting = true
  consola.info(`Received ${signal}, saving data...`)
  try { saveDb() } catch { /* best-effort */ }
  process.exit(0)
}
process.on("SIGINT", () => handleSignal("SIGINT"))
process.on("SIGTERM", () => handleSignal("SIGTERM"))

// Restrict file permissions for all created files
process.umask(0o077)

try {
  await cli(process.argv.slice(2), mainCommand, {
    name: "subtrack",
    version: pkg.version,
    subCommands,
  })
} catch (error) {
  if (error instanceof Error && error.name === "ExitPromptError") {
    process.exit(0)
  }
  if (error instanceof AggregateError) {
    for (const e of error.errors) { consola.error(String(e)) }
    process.exit(1)
  }
  // Unexpected error: report cleanly and exit non-zero
  consola.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
