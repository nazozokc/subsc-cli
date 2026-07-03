import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { consola } from "consola"
import { safeJsonParse } from "./safe-json.ts"
import type { SubtrackConfig, NotifyChannel } from "./types.ts"

export const CONFIG_KEYS = [
  "defaultCurrency",
  "monthlyBudget",
  "theme",
  "notifyDays",
  "yearlyBudget",
  "notifyEmail",
  "slackWebhook",
  "webhookUrl",
  "notifyChannels",
] as const

export type ConfigKey = (typeof CONFIG_KEYS)[number]

const DEFAULT_CONFIG: SubtrackConfig = {
  defaultCurrency: "USD",
  monthlyBudget: 0,
  theme: "default",
  notifyDays: 7,
  yearlyBudget: 0,
  notifyEmail: "",
  slackWebhook: "",
  webhookUrl: "",
}

function getConfigDir(): string {
  return process.env.SUBSC_CLI_DB_DIR ?? path.join(homedir(), ".config", "subtrack")
}

export function getConfigPath(): string {
  return path.join(getConfigDir(), "config.json")
}

let _config: SubtrackConfig | null = null

export function loadConfig(): SubtrackConfig {
  if (_config) return _config

  const configPath = getConfigPath()
  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, "utf-8")
      const parsed = safeJsonParse<Partial<SubtrackConfig>>(raw)
      _config = { ...DEFAULT_CONFIG, ...parsed }
      return _config
    } catch {
      // corrupt config — use defaults
    }
  }

  _config = { ...DEFAULT_CONFIG }
  return _config
}

export function resetConfig(): void {
  _config = null
}

export function setConfig(key: ConfigKey, value: string): boolean {
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
    case "yearlyBudget": {
      const num = Number(value)
      if (isNaN(num) || num < 0) {
        consola.error("yearlyBudget must be a non-negative number")
        return false
      }
      config.yearlyBudget = num
      break
    }
    case "notifyEmail": {
      config.notifyEmail = value
      break
    }
    case "slackWebhook": {
      config.slackWebhook = value
      break
    }
    case "webhookUrl": {
      config.webhookUrl = value
      break
    }
    case "notifyChannels": {
      const channels = value.split(",").map((s) => s.trim().toLowerCase()) as NotifyChannel[]
      const valid: NotifyChannel[] = ["os", "email", "slack", "webhook"]
      for (const c of channels) {
        if (!(valid as string[]).includes(c)) {
          consola.error(`Invalid notify channel: "${c}". Valid: ${valid.join(", ")}`)
          return false
        }
      }
      config.notifyChannels = channels
      break
    }
    default:
      consola.error(`Unknown config key: "${key}"`)
      return false
  }

  saveConfig(config)
  consola.success(`Set ${key} = ${value}`)
  return true
}

export function saveConfig(config: SubtrackConfig): void {
  const configPath = getConfigPath()
  const dir = path.dirname(configPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
  }
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 })
  _config = config
}

// ── CLI handler functions ─────────────────────────────────

export function handleConfigList(): void {
  const config = loadConfig()
  for (const key of CONFIG_KEYS) {
    consola.log(`${key}: ${config[key]}`)
  }
}

export function handleConfigGet(key: string): void {
  const config = loadConfig()
  if (!(CONFIG_KEYS as readonly string[]).includes(key)) {
    consola.error(`Unknown config key: "${key}". Valid: ${CONFIG_KEYS.join(", ")}`)
    return
  }
  consola.log(`${key}: ${config[key as keyof SubtrackConfig]}`)
}

export function handleConfigSet(key: string, value: string): void {
  if (!(CONFIG_KEYS as readonly string[]).includes(key)) {
    consola.error(`Unknown config key: "${key}". Valid: ${CONFIG_KEYS.join(", ")}`)
    return
  }
  setConfig(key as ConfigKey, value)
}

export async function handleConfigReset(): Promise<void> {
  const configPath = getConfigPath()
  if (existsSync(configPath)) {
    try {
      unlinkSync(configPath)
    } catch (err) {
      consola.error(`Failed to remove config file: ${err instanceof Error ? err.message : String(err)}`)
      return
    }
  }
  resetConfig()
  consola.success("Config reset to defaults")
}
