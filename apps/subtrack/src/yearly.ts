import { handleReport } from "./report.ts"

/** Render the annual spending view using the shared report calculation. */
export function handleYearly(year?: number, currency?: string, json?: boolean): Promise<void> {
  return handleReport({ year, currency, json })
}
