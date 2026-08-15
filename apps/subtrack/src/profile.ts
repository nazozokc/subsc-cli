import { consola } from "consola"
import { fail } from "./error.ts"
import pc from "picocolors"
import { input, select } from "@inquirer/prompts"
import { loadConfig, saveConfig } from "./config.ts"
import type { ProfileFilter, Status } from "./types.ts"

export type { ProfileFilter }

export const PROFILE_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/

function validateName(name: string): boolean {
  return PROFILE_NAME_PATTERN.test(name) && name.length > 0 && name.length <= 50
}

/** Save a new profile or overwrite an existing one. */
export function saveProfile(name: string, filter: ProfileFilter): void {
  if (!validateName(name)) {
    fail(
      "Profile name must be 1-50 characters, using only letters, numbers, hyphens, and underscores",
    )
    return
  }

  const config = loadConfig()
  const profiles = config.profiles ?? {}
  profiles[name] = filter
  config.profiles = profiles
  saveConfig(config)
  consola.success(`Profile "${name}" saved`)
}

/** List all saved profiles. */
export function listProfiles(): void {
  const config = loadConfig()
  const profiles = config.profiles ?? {}

  if (Object.keys(profiles).length === 0) {
    consola.info("No saved profiles")
    return
  }

  consola.log(pc.bold("Saved profiles:"))
  for (const [name, filter] of Object.entries(profiles)) {
    const parts: string[] = []
    if (filter.tags && filter.tags.length > 0) {
      parts.push(`tags: ${filter.tags.join(", ")}`)
    }
    if (filter.status) {
      parts.push(`status: ${filter.status}`)
    }
    if (filter.paymentMethod) {
      parts.push(`method: ${filter.paymentMethod}`)
    }

    const isActive = config.activeProfile === name
    const marker = isActive ? pc.green("●") : " "
    consola.log(`  ${marker} ${pc.bold(name)}  ${pc.dim(parts.join(" | "))}${isActive ? pc.green(" (active)") : ""}`)
  }
}

/** Show details of a specific profile. */
export function showProfile(name: string): void {
  const config = loadConfig()
  const profiles = config.profiles ?? {}
  const filter = profiles[name]

  if (!filter) {
    fail(`Profile "${name}" not found`)
    return
  }

  const isActive = config.activeProfile === name
  consola.log(pc.bold(`Profile: ${name}${isActive ? pc.green(" (active)") : ""}`))
  consola.log(`  tags:          ${filter.tags?.join(", ") || pc.dim("none")}`)
  consola.log(`  status:        ${filter.status || pc.dim("any")}`)
  consola.log(`  payment method: ${filter.paymentMethod || pc.dim("any")}`)
}

/** Switch to a saved profile (sets it as active). */
export function switchProfile(name: string): void {
  const config = loadConfig()
  const profiles = config.profiles ?? {}

  if (!profiles[name]) {
    fail(`Profile "${name}" not found`)
    return
  }

  config.activeProfile = name
  saveConfig(config)
  consola.success(`Switched to profile "${name}"`)
}

/** Delete a saved profile. */
export function deleteProfile(name: string): void {
  const config = loadConfig()
  const profiles = config.profiles ?? {}

  if (!profiles[name]) {
    fail(`Profile "${name}" not found`)
    return
  }

  delete profiles[name]
  config.profiles = profiles

  // Clear activeProfile if it was the deleted one
  if (config.activeProfile === name) {
    config.activeProfile = undefined
  }

  saveConfig(config)
  consola.success(`Profile "${name}" deleted`)
}

/** Get the currently active profile filter, if any. */
export function getActiveFilter(): ProfileFilter | null {
  const config = loadConfig()
  if (!config.activeProfile) return null
  const profiles = config.profiles ?? {}
  return profiles[config.activeProfile] ?? null
}

/** Get the name of the active profile, if any. */
export function getActiveProfileName(): string | null {
  const config = loadConfig()
  return config.activeProfile ?? null
}

/** Apply a profile filter to a subscription query. Returns filter params. */
export function buildFilterParams(
  profile: ProfileFilter,
  existingTags?: string[],
): { tags?: string[]; status?: Status; paymentMethod?: string } {
  return {
    tags: profile.tags?.length ? profile.tags : undefined,
    status: profile.status as Status | undefined,
    paymentMethod: profile.paymentMethod,
  }
}

// ── CLI handler ──────────────────────────────────────────

export type ProfileCommand = "save" | "switch" | "list" | "show" | "delete"

export async function handleProfile(command?: ProfileCommand, name?: string, filter?: ProfileFilter): Promise<void> {
  if (!command) {
    listProfiles()
    return
  }

  switch (command) {
    case "list":
      listProfiles()
      break
    case "save":
      if (!name && !filter) {
        // Interactive save mode
        name = await input({
          message: "Profile name:",
          validate: (v: string) => validateName(v) ? true : "Name must be 1-50 chars (letters, numbers, hyphens, underscores)",
        })
        const tagsStr = await input({ message: "Filter by tags (comma-separated, optional):" })
        const statusVal = await select({
          message: "Filter by status:",
          choices: [
            { name: "Any status", value: "" },
            { name: "Active only", value: "active" },
            { name: "Paused only", value: "paused" },
            { name: "Cancelled only", value: "cancelled" },
          ],
        })
        const method = await input({ message: "Filter by payment method (optional):" })
        const tags = tagsStr.trim() ? tagsStr.split(",").map((t) => t.trim()).filter(Boolean) : undefined
        filter = {
          tags: tags && tags.length > 0 ? tags : undefined,
          status: statusVal || undefined,
          paymentMethod: method.trim() || undefined,
        }
      } else if (!name) {
        fail("Profile name required")
        return
      }
      saveProfile(name, filter ?? {})
      break
    case "show":
      if (!name) {
        fail("Profile name required")
        return
      }
      showProfile(name)
      break
    case "switch":
      if (!name) {
        const config = loadConfig()
        const profiles = Object.keys(config.profiles ?? {})
        if (profiles.length === 0) {
          consola.info("No saved profiles")
          return
        }
        name = await select({
          message: "Select profile:",
          choices: profiles.map((p) => ({ name: p, value: p })),
        })
      }
      switchProfile(name)
      break
    case "delete":
      if (!name) {
        const config = loadConfig()
        const profiles = Object.keys(config.profiles ?? {})
        if (profiles.length === 0) {
          consola.info("No saved profiles")
          return
        }
        name = await select({
          message: "Select profile to delete:",
          choices: profiles.map((p) => ({ name: p, value: p })),
        })
      }
      deleteProfile(name)
      break
  }
}
