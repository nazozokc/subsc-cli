/**
 * List supported currencies and their descriptions.
 */

import { consola } from "consola"
import { CURRENCY_CHOICES } from "./prompts.ts"

export type CurrencyListOptions = {
  json?: boolean
}

export function handleCurrencyList(options: CurrencyListOptions = {}): void {
  if (options.json) {
    process.stdout.write(JSON.stringify(CURRENCY_CHOICES, null, 2) + "\n")
    return
  }

  consola.log("── Supported Currencies ──")
  for (const c of CURRENCY_CHOICES) {
    consola.log(`  ${c.value.padEnd(5)} ${c.name}`)
  }
  consola.log(`\n${CURRENCY_CHOICES.length} currencies supported`)
}
