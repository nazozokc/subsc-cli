import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { consola } from "consola"
import { safeJsonParse } from "./safe-json.ts"
import { encryptBuffer, decryptBuffer, hasEncryptionKey } from "./crypto.ts"
import { logAudit } from "./audit.ts"
import { fail } from "./error.ts"
import { isColorName } from "./color.ts"
import type { SubtrackConfig } from "./types.ts"

export const CONFIG_KEYS = [
  "defaultCurrency",
  "monthlyBudget",
  "yearlyBudget",
  "theme",
  "notifyDays",
  "notifyChannels",
  "slackWebhook",
  "webhookUrl",
  "tableBorderColor",
  "tableHeaderColor",
  "tableZebraColor",
  "accentColor",
  "tableZebra",
  "tableMinWidth",
  "dateFormat",
  "listShowNotes",
  "listShowMethod",
] as const

/** IMAP-related config keys (not stored directly on SubtrackConfig). */
export const IMAP_KEYS = ["imapHost", "imapPort", "imapTls", "imapUsername"] as const

export type ConfigKey = (typeof CONFIG_KEYS)[number]

const DEFAULT_CONFIG: SubtrackConfig = {
  defaultCurrency: "USD",
  monthlyBudget: 0,
  theme: "default",
  notifyDays: 7,
}

function getConfigDir(): string {
  return process.env.SUBSC_CLI_DB_DIR ?? path.join(homedir(), ".config", "subtrack")
}

export function getConfigPath(): string {
  return path.join(getConfigDir(), "config.json")
}

let _config: SubtrackConfig | null = null

const ENC_MAGIC = Buffer.from("SUBCCFG\x00\x00\x00\x00\x00\x00\x00\x00")

/** Check if a config file buffer is encrypted (has our magic header). */
function isConfigEncrypted(buf: Buffer): boolean {
  return buf.length >= 16 && buf.subarray(0, 8).equals(ENC_MAGIC.subarray(0, 8))
}

export function loadConfig(): SubtrackConfig {
  if (_config) return _config

  const configPath = getConfigPath()
  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath)
      let text: string

      if (isConfigEncrypted(raw)) {
        const payload = raw.subarray(ENC_MAGIC.length)
        const decrypted = decryptBuffer(payload)
        text = decrypted.toString("utf-8")
      } else if (raw[0] === 0x7b || raw[0] === 0xef) {
        // Plain JSON (possibly with BOM)
        text = raw.toString("utf-8")
      } else {
        consola.warn("Config file format not recognized, using defaults")
        _config = { ...DEFAULT_CONFIG }
        return _config
      }

      const parsed = safeJsonParse<Partial<SubtrackConfig>>(text)
      _config = { ...DEFAULT_CONFIG, ...parsed }
      return _config
    } catch {
      consola.warn("Failed to read config, using defaults")
    }
  }

  _config = { ...DEFAULT_CONFIG }
  return _config
}

export function resetConfig(): void {
  _config = null
}

function mergeImapConfig(config: SubtrackConfig, patch: Partial<import("./types.ts").ImapConfig>): import("./types.ts").ImapConfig {
  return {
    host: patch.host ?? config.imap?.host ?? "",
    port: patch.port ?? config.imap?.port ?? 993,
    tls: patch.tls ?? config.imap?.tls ?? true,
    username: patch.username ?? config.imap?.username ?? "",
  }
}

export function setConfig(key: string, value: string): boolean {
  const config = loadConfig()

  switch (key) {
    case "defaultCurrency": {
      if (!/^[A-Z]{3}$/.test(value)) {
        fail(`Invalid currency code: "${value}"`)
        return false
      }
      config.defaultCurrency = value
      break
    }
    case "monthlyBudget": {
      const num = Number(value)
      if (isNaN(num) || num < 0) {
        fail("monthlyBudget must be a non-negative number")
        return false
      }
      config.monthlyBudget = num
      break
    }
    case "yearlyBudget": {
      const num = Number(value)
      if (isNaN(num) || num < 0) {
        fail("yearlyBudget must be a non-negative number")
        return false
      }
      config.yearlyBudget = num
      break
    }
    case "budgets": {
      const parsed = parseBudgets(value)
      if (!parsed) return false
      config.budgets = parsed
      break
    }
    case "theme": {
      const validThemes = ["default", "light", "high-contrast", "none"]
      if (!validThemes.includes(value)) {
        fail(`theme must be one of: ${validThemes.join(", ")}`)
        return false
      }
      config.theme = value
      break
    }
    case "tableBorderColor":
    case "tableHeaderColor":
    case "tableZebraColor":
    case "accentColor": {
      if (!isColorName(value)) {
        fail(`"${key}" must be a color name: black, red, green, yellow, blue, magenta, cyan, white, gray, brightRed, brightGreen, brightYellow, brightBlue, brightMagenta, brightCyan, brightWhite`)
        return false
      }
      config[key] = value
      break
    }
    case "tableZebra":
      if (value !== "on" && value !== "off") {
        fail("tableZebra must be 'on' or 'off'")
        return false
      }
      config.tableZebra = value
      break
    case "tableMinWidth": {
      const num = Number(value)
      if (isNaN(num) || num < 20 || num > 200 || !Number.isInteger(num)) {
        fail("tableMinWidth must be an integer between 20 and 200")
        return false
      }
      config.tableMinWidth = num
      break
    }
    case "dateFormat":
      if (value !== "iso" && value !== "short") {
        fail("dateFormat must be 'iso' or 'short'")
        return false
      }
      config.dateFormat = value
      break
    case "listShowNotes":
    case "listShowMethod":
      if (value !== "on" && value !== "off") {
        fail(`"${key}" must be 'on' or 'off'`)
        return false
      }
      config[key] = value
      break
    case "notifyDays": {
      const num = Number(value)
      if (isNaN(num) || num < 0 || !Number.isInteger(num)) {
        fail("notifyDays must be a non-negative integer")
        return false
      }
      config.notifyDays = num
      break
    }
    case "notifyChannels": {
      const channels = value.split(",").map((c) => c.trim().toLowerCase()).filter(Boolean)
      if (channels.length === 0 || channels.some((c) => !["os", "slack", "webhook"].includes(c))) {
        fail("notifyChannels must be a comma-separated list of: os, slack, webhook")
        return false
      }
      config.notifyChannels = channels as import("./types.ts").NotifyChannel[]
      break
    }
    case "slackWebhook":
      if (!value.startsWith("https://")) {
        fail("slackWebhook must be an https:// URL")
        return false
      }
      config.slackWebhook = value
      break
    case "webhookUrl":
      if (!value.startsWith("https://")) {
        fail("webhookUrl must be an https:// URL")
        return false
      }
      config.webhookUrl = value
      break
    case "imapHost":
      if (!value) { fail("imapHost must not be empty"); return false }
      config.imap = mergeImapConfig(config, { host: value })
      break
    case "imapPort": {
      const port = Number(value)
      if (isNaN(port) || port < 1 || port > 65535 || !Number.isInteger(port)) {
        fail("imapPort must be an integer between 1 and 65535")
        return false
      }
      config.imap = mergeImapConfig(config, { port })
      break
    }
    case "imapTls":
      if (value !== "true" && value !== "false") {
        fail("imapTls must be 'true' or 'false'")
        return false
      }
      config.imap = mergeImapConfig(config, { tls: value === "true" })
      break
    case "imapUsername":
      if (!value) { fail("imapUsername must not be empty"); return false }
      config.imap = mergeImapConfig(config, { username: value })
      break
    default:
      fail(`Unknown config key: "${key}"`)
      return false
  }

  saveConfig(config)
  // Mask secrets in terminal output and audit log
  const displayValue = key === "slackWebhook" || key === "webhookUrl" ? maskSecret(value) : value
  logAudit("config.set", { details: `${key} = ${displayValue}` })
  consola.success(`Set ${key} = ${displayValue}`)
  return true
}

function serializeConfig(config: SubtrackConfig): Buffer {
  const json = JSON.stringify(config, null, 2) + "\n"
  if (hasEncryptionKey()) {
    const encrypted = encryptBuffer(Buffer.from(json, "utf-8"))
    return Buffer.concat([ENC_MAGIC, encrypted])
  }
  return Buffer.from(json, "utf-8")
}

export function saveConfig(config: SubtrackConfig): void {
  const configPath = getConfigPath()
  const dir = path.dirname(configPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
  }
  writeFileSync(configPath, serializeConfig(config), { mode: 0o600 })
  _config = config
}

// ── CLI handler functions ─────────────────────────────────

export function handleConfigList(): void {
  const config = loadConfig()
  for (const key of CONFIG_KEYS) {
    consola.log(`${key}: ${getConfigDisplayValue(key, config)}`)
  }
  // Show named budgets
  if (config.budgets && config.budgets.length > 0) {
    for (const b of config.budgets) {
      const cat = b.categories?.length ? ` (categories: ${b.categories.join(", ")})` : ""
      consola.log(`budgets: ${b.name} = ${b.amount} ${b.currency}/${b.period ?? "monthly"}${cat}`)
    }
  } else {
    consola.log(`budgets: (not set)`)
  }
  // Show IMAP config
  if (config.imap) {
    consola.log(`imapHost: ${config.imap.host}`)
    consola.log(`imapPort: ${config.imap.port}`)
    consola.log(`imapTls: ${config.imap.tls}`)
    consola.log(`imapUsername: ${config.imap.username}`)
  } else {
    consola.log(`imapHost: (not set)`)
    consola.log(`imapPort: 993`)
    consola.log(`imapTls: true`)
    consola.log(`imapUsername: (not set)`)
  }
}

function isKnownKey(key: string): boolean {
  return (CONFIG_KEYS as readonly string[]).includes(key as ConfigKey) ||
         (IMAP_KEYS as readonly string[]).includes(key as typeof IMAP_KEYS[number]) ||
         key === "budgets"
}

/**
 * Parse a JSON array of named budget entries, e.g.
 * `[{"name":"entertainment","amount":5000,"currency":"JPY","period":"monthly","categories":["video","music"]}]`
 * Returns null (after reporting) when the value is invalid.
 */
function parseBudgets(value: string): import("./types.ts").BudgetEntry[] | null {
  let parsed: unknown
  try {
    parsed = safeJsonParse<unknown>(value)
  } catch {
    fail("budgets must be a valid JSON array of budget entries")
    return null
  }
  if (!Array.isArray(parsed)) {
    fail("budgets must be a valid JSON array of budget entries")
    return null
  }
  const entries: import("./types.ts").BudgetEntry[] = []
  for (const item of parsed) {
    const entry = item as Record<string, unknown>
    if (!entry || typeof entry !== "object") {
      fail("Each budget entry must be an object with name, amount, currency")
      return null
    }
    if (typeof entry.name !== "string" || entry.name.trim() === "") {
      fail("Each budget entry needs a non-empty name")
      return null
    }
    if (typeof entry.amount !== "number" || !isFinite(entry.amount) || entry.amount < 0) {
      fail(`Budget "${entry.name}": amount must be a non-negative number`)
      return null
    }
    if (typeof entry.currency !== "string" || !/^[A-Z]{3}$/.test(entry.currency)) {
      fail(`Budget "${entry.name}": currency must be a 3-letter code (e.g. JPY)`)
      return null
    }
    if (entry.period !== undefined && entry.period !== "monthly" && entry.period !== "yearly") {
      fail(`Budget "${entry.name}": period must be "monthly" or "yearly"`)
      return null
    }
    if (entry.categories !== undefined &&
        (!Array.isArray(entry.categories) || entry.categories.some((c) => typeof c !== "string"))) {
      fail(`Budget "${entry.name}": categories must be an array of tag names`)
      return null
    }
    entries.push({
      name: entry.name,
      amount: entry.amount,
      currency: entry.currency,
      period: entry.period as "monthly" | "yearly" | undefined,
      categories: entry.categories as string[] | undefined,
    })
  }
  return entries
}

/**
 * Mask webhook URLs (bearer-like secrets) so they never leak into
 * terminal output / scrollback / shell history.
 */
function maskSecret(value: string | undefined): string {
  if (!value) return "(not set)"
  try {
    const url = new URL(value)
    // Keep scheme + host, mask the path (Slack tokens live in the path)
    const maskedPath = url.pathname === "/" ? "" : "/***"
    return `${url.protocol}//${url.host}${maskedPath}`
  } catch {
    return "(set)"
  }
}

function getConfigDisplayValue(key: string, config: SubtrackConfig): string {
  switch (key) {
    case "imapHost": return config.imap?.host ?? "(not set)"
    case "imapPort": return String(config.imap?.port ?? 993)
    case "imapTls": return String(config.imap?.tls ?? true)
    case "imapUsername": return config.imap?.username ?? "(not set)"
    case "notifyChannels": return config.notifyChannels?.length ? config.notifyChannels.join(",") : "(not set)"
    case "slackWebhook": return maskSecret(config.slackWebhook)
    case "webhookUrl": return maskSecret(config.webhookUrl)
    default: {
      const v = (config as Record<string, unknown>)[key]
      return v === undefined || v === null || v === "" ? "(not set)" : String(v)
    }
  }
}

export function handleConfigGet(key: string): void {
  const config = loadConfig()
  if (!isKnownKey(key)) {
    fail(`Unknown config key: "${key}". Valid: ${[...CONFIG_KEYS, ...IMAP_KEYS].join(", ")}`)
    return
  }
  consola.log(`${key}: ${getConfigDisplayValue(key, config)}`)
}

export function handleConfigSet(key: string, value: string): void {
  if (!isKnownKey(key)) {
    fail(`Unknown config key: "${key}". Valid: ${[...CONFIG_KEYS, ...IMAP_KEYS].join(", ")}`)
    return
  }
  setConfig(key, value)
}

export async function handleConfigReset(): Promise<void> {
  const configPath = getConfigPath()
  if (existsSync(configPath)) {
    try {
      unlinkSync(configPath)
      // Also remove encrypted sidecar if present
      const shaPath = configPath + ".sha256"
      if (existsSync(shaPath)) unlinkSync(shaPath)
    } catch (err) {
      fail(`Failed to remove config file: ${err instanceof Error ? err.message : String(err)}`)
      return
    }
  }
  resetConfig()
  logAudit("config.reset", { details: "Config reset to defaults" })
  consola.success("Config reset to defaults")
}
