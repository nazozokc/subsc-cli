import { test, expect, beforeEach, afterEach, vi } from "vitest"
import { consola } from "consola"
import { fail } from "../error.ts"

const errorMessages: string[] = []

beforeEach(() => {
  process.exitCode = 0
  errorMessages.length = 0
  consola.mockTypes((_type: string) => {
    return (...args: unknown[]) => {
      if (_type === "error") errorMessages.push(args.map((a) => String(a)).join(" "))
    }
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  process.exitCode = 0
})

test("fail reports the message via consola.error", () => {
  fail("boom")
  expect(errorMessages).toEqual(["boom"])
})

test("fail marks the process to exit non-zero", () => {
  expect(process.exitCode).toBe(0)
  fail("boom")
  expect(process.exitCode).toBe(1)
})
