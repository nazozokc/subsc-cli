import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { consola } from "consola"
import { safeJsonParse } from "./safe-json.ts"
import { encryptBuffer, decryptBuffer, hasEncryptionKey } from "./crypto.ts"
import { logAudit } from "./audit.ts"
import type { SubtrackConfig } from "./types.ts"

export const CONFIG_KEYS = [
  "defaultCurrency",
  "monthlyBudget",
  "theme",
  "notifyDays",
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

export function setConfig(key: string, value: string): boolean {
  const config = loadConfig()

  switch (key) {
    case "defaultCurrency": {
      if (!/^[A-Z]{3}$/.test(value)) {
        consola.error(`Invalid currency code: "${value}"`)
        return false
      }
      config.defaultCurrency = value
      break
    }
    case "monthlyBudget": {
      const num = Number(value)
      if (isNaN(num) || num < 0) {
        consola.error("monthlyBudget must be a non-negative number")
        return false
      }
      config.monthlyBudget = num
      break
    }
    case "theme":
      config.theme = value
      break
    case "notifyDays": {
      const num = Number(value)
      if (isNaN(num) || num < 0 || !Number.isInteger(num)) {
        consola.error("notifyDays must be a non-negative integer")
        return false
      }
      config.notifyDays = num
      break
    }
    case "imapHost":
      if (!value) { consola.error("imapHost must not be empty"); return false }
      config.imap = { ...config.imap, host: value, port: config.imap?.port ?? 993, tls: config.imap?.tls ?? true, username: config.imap?.username ?? "" }
      break
    case "imapPort": {
      const port = Number(value)
      if (isNaN(port) || port < 1 || port > 65535 || !Number.isInteger(port)) {
        consola.error("imapPort must be an integer between 1 and 65535")
        return false
      }
      config.imap = { ...config.imap, host: config.imap?.host ?? "", port, tls: config.imap?.tls ?? true, username: config.imap?.username ?? "" }
      break
    }
    case "imapTls":
      if (value !== "true" && value !== "false") {
        consola.error("imapTls must be 'true' or 'false'")
        return false
      }
      config.imap = { ...config.imap, host: config.imap?.host ?? "", port: config.imap?.port ?? 993, tls: value === "true", username: config.imap?.username ?? "" }
      break
    case "imapUsername":
      if (!value) { consola.error("imapUsername must not be empty"); return false }
      config.imap = { ...config.imap, host: config.imap?.host ?? "", port: config.imap?.port ?? 993, tls: config.imap?.tls ?? true, username: value }
      break
    default:
      consola.error(`Unknown config key: "${key}"`)
      return false
  }

  saveConfig(config)
  logAudit("config.set", { details: `${key} = ${value}` })
  consola.success(`Set ${key} = ${value}`)
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
    consola.log(`${key}: ${config[key]}`)
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
         (IMAP_KEYS as readonly string[]).includes(key as typeof IMAP_KEYS[number])
}

function getConfigDisplayValue(key: string, config: SubtrackConfig): string {
  switch (key) {
    case "imapHost": return config.imap?.host ?? "(not set)"
    case "imapPort": return String(config.imap?.port ?? 993)
    case "imapTls": return String(config.imap?.tls ?? true)
    case "imapUsername": return config.imap?.username ?? "(not set)"
    default: return String((config as Record<string, unknown>)[key] ?? "")
  }
}

export function handleConfigGet(key: string): void {
  const config = loadConfig()
  if (!isKnownKey(key)) {
    consola.error(`Unknown config key: "${key}". Valid: ${[...CONFIG_KEYS, ...IMAP_KEYS].join(", ")}`)
    return
  }
  consola.log(`${key}: ${getConfigDisplayValue(key, config)}`)
}

export function handleConfigSet(key: string, value: string): void {
  if (!isKnownKey(key)) {
    consola.error(`Unknown config key: "${key}". Valid: ${[...CONFIG_KEYS, ...IMAP_KEYS].join(", ")}`)
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
      consola.error(`Failed to remove config file: ${err instanceof Error ? err.message : String(err)}`)
      return
    }
  }
  resetConfig()
  logAudit("config.reset", { details: "Config reset to defaults" })
  consola.success("Config reset to defaults")
}
