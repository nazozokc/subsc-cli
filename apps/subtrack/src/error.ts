import { consola } from "consola"

/**
 * Report a fatal CLI error and mark the process to exit non-zero.
 *
 * Use this in command handlers instead of `consola.error(...); return`
 * so that scripts can detect failures via exit codes.
 */
export function fail(message: string): void {
  consola.error(message)
  process.exitCode = 1
}
