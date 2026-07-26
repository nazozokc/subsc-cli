import { describe, test, expect, beforeAll, beforeEach } from "vitest"
import { existsSync, readFileSync, unlinkSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { consola } from "consola"

const testDir = path.join(tmpdir(), `subtrack-profile-test-${Date.now()}`)

let profileModule: typeof import("../profile.ts")
let configModule: typeof import("../config.ts")

beforeAll(async () => {
  mkdirSync(testDir, { recursive: true })
  process.env.SUBSC_CLI_DB_DIR = testDir
  profileModule = await import("../profile.ts")
  configModule = await import("../config.ts")
})

beforeEach(() => {
  const configPath = path.join(testDir, "config.json")
  if (existsSync(configPath)) {
    unlinkSync(configPath)
  }
  configModule.resetConfig()
})

function readConfig(): Record<string, unknown> {
  const configPath = path.join(testDir, "config.json")
  return JSON.parse(readFileSync(configPath, "utf-8"))
}

describe("saveProfile", () => {
  test("saves a profile with tag filter", () => {
    const successLogs: string[] = []
    const origSuccess = consola.success
    consola.success = ((msg: unknown) => {
      successLogs.push(String(msg))
    }) as typeof consola.success

    profileModule.saveProfile("essential", { tags: ["work", "essential"] })

    expect(successLogs.some((l) => l.includes("essential"))).toBe(true)

    const raw = readConfig()
    expect(raw.profiles).toBeDefined()
    expect((raw.profiles as Record<string, unknown>).essential).toEqual({
      tags: ["work", "essential"],
    })

    consola.success = origSuccess
  })

  test("saves a profile with status filter", () => {
    profileModule.saveProfile("active-only", { status: "active" })

    const raw = readConfig()
    expect((raw.profiles as Record<string, unknown>)["active-only"]).toEqual({
      status: "active",
    })
  })

  test("rejects invalid profile names", () => {
    const errLogs: string[] = []
    const origError = consola.error
    consola.error = ((msg: unknown) => {
      errLogs.push(String(msg))
    }) as typeof consola.error

    profileModule.saveProfile("", {})
    expect(errLogs.length).toBeGreaterThan(0)
    profileModule.saveProfile("name with spaces", {})
    expect(errLogs.length).toBeGreaterThan(1)

    consola.error = origError
  })

  test("overwrites existing profile", () => {
    profileModule.saveProfile("test", { tags: ["old"] })
    profileModule.saveProfile("test", { tags: ["new"] })

    const raw = readConfig()
    expect((raw.profiles as Record<string, unknown>).test).toEqual({ tags: ["new"] })
  })
})

describe("listProfiles", () => {
  test("shows info when no profiles exist", () => {
    const infoLogs: string[] = []
    const origInfo = consola.info
    consola.info = ((msg: unknown) => infoLogs.push(String(msg))) as typeof consola.info

    profileModule.listProfiles()

    expect(infoLogs.some((l) => l.includes("No saved profiles"))).toBe(true)
    consola.info = origInfo
  })

  test("lists saved profiles", () => {
    profileModule.saveProfile("a", { tags: ["x"] })
    profileModule.saveProfile("b", { status: "active" })

    const loggedLines: string[] = []
    const origLog = consola.log
    consola.log = ((msg: unknown) => loggedLines.push(String(msg))) as typeof consola.log

    profileModule.listProfiles()

    expect(loggedLines.some((l) => l.includes("a"))).toBe(true)
    expect(loggedLines.some((l) => l.includes("b"))).toBe(true)

    consola.log = origLog
  })
})

describe("showProfile", () => {
  test("shows profile details", () => {
    profileModule.saveProfile("test", {
      tags: ["dev", "tools"],
      status: "active",
    })

    const loggedLines: string[] = []
    const origLog = consola.log
    consola.log = ((msg: unknown) => loggedLines.push(String(msg))) as typeof consola.log

    profileModule.showProfile("test")

    expect(loggedLines.some((l) => l.includes("test"))).toBe(true)
    expect(loggedLines.some((l) => l.includes("dev"))).toBe(true)

    consola.log = origLog
  })

  test("errors on non-existent profile", () => {
    const errLogs: string[] = []
    const origError = consola.error
    consola.error = ((msg: unknown) => errLogs.push(String(msg))) as typeof consola.error

    profileModule.showProfile("nonexistent")

    expect(errLogs.some((l) => l.includes("not found"))).toBe(true)
    consola.error = origError
  })
})

describe("switchProfile", () => {
  test("switches to a saved profile", () => {
    profileModule.saveProfile("test", { tags: ["work"] })

    const successLogs: string[] = []
    const origSuccess = consola.success
    consola.success = ((msg: unknown) =>
      successLogs.push(String(msg))) as typeof consola.success

    profileModule.switchProfile("test")

    expect(successLogs.some((l) => l.includes("test"))).toBe(true)

    const raw = readConfig()
    expect(raw.activeProfile).toBe("test")

    consola.success = origSuccess
  })

  test("errors on non-existent profile", () => {
    const errLogs: string[] = []
    const origError = consola.error
    consola.error = ((msg: unknown) => errLogs.push(String(msg))) as typeof consola.error

    profileModule.switchProfile("nonexistent")

    expect(errLogs.some((l) => l.includes("not found"))).toBe(true)
    consola.error = origError
  })
})

describe("deleteProfile", () => {
  test("deletes a saved profile", () => {
    profileModule.saveProfile("test", { tags: ["x"] })
    profileModule.deleteProfile("test")

    const raw = readConfig()
    expect((raw.profiles as Record<string, unknown>).test).toBeUndefined()
  })

  test("clears activeProfile when deleting active profile", () => {
    profileModule.saveProfile("test", { tags: ["x"] })
    profileModule.switchProfile("test")
    profileModule.deleteProfile("test")

    const raw = readConfig()
    expect(raw.activeProfile).toBeUndefined()
  })
})

describe("getActiveFilter", () => {
  test("returns null when no active profile", () => {
    expect(profileModule.getActiveFilter()).toBeNull()
  })

  test("returns filter for active profile", () => {
    profileModule.saveProfile("test", { tags: ["work"] })
    profileModule.switchProfile("test")
    const filter = profileModule.getActiveFilter()
    expect(filter).not.toBeNull()
    expect(filter!.tags).toEqual(["work"])
  })
})

describe("buildFilterParams", () => {
  test("builds params from profile filter", () => {
    const params = profileModule.buildFilterParams({
      tags: ["work", "essential"],
      status: "active",
    })
    expect(params.tags).toEqual(["work", "essential"])
    expect(params.status).toBe("active")
  })
})
