import { input, select, confirm, search } from "@inquirer/prompts"
import { consola } from "consola"
import type { UsageAddFlags } from "./types.ts"
import { addLlmUsage } from "./db.ts"
import { logAudit } from "./audit.ts"
import {
  LLM_PROVIDER_CHOICES,
  validateTokens,
  validateDate,
} from "./prompts.ts"
import {
  ensurePricingCache,
  searchPricingModels,
  getModelPricing,
  calculateCostCents,
  lookupModelKey,
} from "./pricing.ts"

// ── Workflow ──────────────────────────────────────────────

async function resolveUsageAddOptions(flags: UsageAddFlags) {
  let manualCostCents: number | null = null
  if (flags.cost !== undefined) {
    const costNum = Number(flags.cost)
    if (isNaN(costNum) || costNum < 0) {
      consola.error("Invalid cost. Enter a non-negative number (e.g. 0.50 for 50 cents)")
      return null
    }
    manualCostCents = Math.round(costNum * 100)
  }

  // Provider
  let provider = flags.provider
  let prompted = false
  if (provider && !LLM_PROVIDER_CHOICES.some((c) => c.value === provider)) {
    consola.error(`Invalid provider "${provider}". Use one of: openai, anthropic, google-ai, mistral, groq, together, deepseek, cohere, or omit for interactive.`)
    return null
  }
  if (!provider) {
    prompted = true
    const picked = await select({
      message: "Provider",
      choices: LLM_PROVIDER_CHOICES,
    })
    if (picked === "__other__") {
      provider = await input({
        message: "Custom provider name",
        validate: (v) => (v.trim() ? true : "Provider name cannot be empty"),
      })
    } else {
      provider = picked
    }
  }

  // Load pricing cache for model search/lookup
  const cache = await ensurePricingCache()

  // Model — search prompt (interactive) or direct lookup (flag)
  let model: string
  let pricing: ReturnType<typeof getModelPricing> = null
  let costCents: number | null = null

  if (flags.model !== undefined) {
    // Non-interactive: look up model in cache
    model = flags.model
    if (cache) {
      const modelKey = lookupModelKey(cache, model, provider)
      if (modelKey) {
        model = modelKey
        pricing = getModelPricing(cache, modelKey)
      }
    }
  } else {
    // Interactive: search prompt
    prompted = true
    if (!cache || Object.keys(cache).length === 0) {
      consola.error("No pricing data available. Cannot look up models.")
      return null
    }

    const selected = await search({
      message: "Search and select a model",
      source: (input) => {
        const q = (input ?? "").trim()
        // Return models filtered by provider from cache
        return searchPricingModels(cache!, q, provider === "__other__" ? undefined : provider)
      },
      pageSize: 20,
    })
    model = selected
    pricing = getModelPricing(cache, model)
  }

  // Input tokens
  let inputTokens: number
  if (flags.inputTokens !== undefined) {
    const result = validateTokens(flags.inputTokens)
    if (result !== true) { consola.error(result); return null }
    inputTokens = Number(flags.inputTokens)
  } else {
    prompted = true
    const str = await input({
      message: "Input tokens used",
      default: "0",
      validate: validateTokens,
    })
    inputTokens = Number(str)
  }

  // Output tokens
  let outputTokens: number
  if (flags.outputTokens !== undefined) {
    const result = validateTokens(flags.outputTokens)
    if (result !== true) { consola.error(result); return null }
    outputTokens = Number(flags.outputTokens)
  } else {
    prompted = true
    const str = await input({
      message: "Output tokens used",
      default: "0",
      validate: validateTokens,
    })
    outputTokens = Number(str)
  }

  // Date
  let date: string
  const today = new Date().toISOString().split("T")[0]
  if (flags.date !== undefined) {
    const result = validateDate(flags.date)
    if (result !== true) { consola.error(result); return null }
    date = flags.date
  } else {
    date = today
  }

  // Description
  let description: string | null = flags.description ?? null
  if (flags.description === undefined && prompted) {
    const str = await input({
      message: "Description (optional)",
      default: "",
    })
    description = str.trim() || null
  }

  // Cost calculation
  let manualCost = false
  if (pricing) {
    costCents = calculateCostCents(pricing, inputTokens, outputTokens)
  }

  if (costCents === null) {
    // Fallback: --cost flag or manual input
    if (manualCostCents !== null) {
      costCents = manualCostCents
      manualCost = true
    } else if (!prompted) {
      consola.error(
        `Could not find pricing for "${model}". Provide --cost to set cost manually (e.g. --cost 0.50 for 50 cents).`,
      )
      return null
    } else {
      consola.warn(
        `Could not find pricing for "${model}" in LiteLLM data. Enter cost manually.`,
      )
      const costStr = await input({
        message: "Total cost in USD (e.g. 0.50 for 50 cents)",
        validate: (v) =>
          !isNaN(Number(v)) && Number(v) >= 0 ? true : "Enter a valid non-negative number",
      })
      costCents = Math.round(Number(costStr) * 100)
      manualCost = true
    }
  }

  // Confirm (only when interactive)
  if (prompted) {
    const costDisplay = manualCost
      ? `$${((costCents ?? 0) / 100).toFixed(2)} (manual)`
      : `$${((costCents ?? 0) / 100).toFixed(4)}`
    consola.info(
      `Cost: ${costDisplay} (${(inputTokens ?? 0).toLocaleString()} in / ${(outputTokens ?? 0).toLocaleString()} out)`,
    )
    const ok = await confirm({
      message: `Save this usage entry (${provider}, ${model})?`,
      default: true,
    })
    if (!ok) {
      consola.info("Cancelled")
      return null
    }
  }

  return {
    provider,
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost: costCents ?? 0,
    date,
    description,
  }
}

// ── Handler ──────────────────────────────────────────────

export async function handleUsageAdd(flags: UsageAddFlags) {
  const result = await resolveUsageAddOptions(flags)
  if (!result) return
  try {
    addLlmUsage(result)
    logAudit("usage.add", {
      targetType: "usage",
      details: `${result.provider}/${result.model}: $${(result.cost / 100).toFixed(4)} on ${result.date}`,
    })
    consola.success(
      `Added usage: ${result.provider}/${result.model} — $${(result.cost / 100).toFixed(4)} on ${result.date}`,
    )
  } catch (error) {
    consola.error("Failed to add usage entry:", error)
  }
}
