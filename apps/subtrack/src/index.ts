#!/usr/bin/env node
import { cli, define } from "gunshi"
import { consola } from "consola"
import { saveDb } from "./db.ts"
import { subCommands } from "./commands/index.ts"

const mainCommand = define({
  name: "subtrack",
  description: "Manage subscription services from your terminal",
  run: () => consola.info('Run "subtrack --help" for available commands'),
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
    version: "7.0.8",
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
  throw error
}
