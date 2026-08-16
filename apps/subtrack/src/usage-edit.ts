/**
 * Usage edit command — update fields of an existing LLM API usage entry.
 * Flag-based only: each provided flag updates the corresponding field.
 */

import { consola } from "consola"
import { fail } from "./error.ts"
import type { UsageAddFlags, AddLlmUsageArgs } from "./types.ts"
import { updateLlmUsage } from "./db.ts"
import { logAudit } from "./audit.ts"
import {
  LLM_PROVIDER_CHOICES,
  validateTokens,
  validateDate,
  validateModelName,
} from "./prompts.ts"

export async function handleUsageEdit(id: number, flags: UsageAddFlags): Promise<void> {
  if (!Number.isInteger(id) || id < 1) {
    fail("id must be a positive integer")
    return
  }

  const fields: Partial<AddLlmUsageArgs> = {}

  if (flags.provider !== undefined) {
    if (!LLM_PROVIDER_CHOICES.some((c) => c.value === flags.provider)) {
      fail(
        `Invalid provider "${flags.provider}". Use one of: openai, anthropic, google-ai, mistral, groq, together, deepseek, cohere, or a custom name.`,
      )
      return
    }
    fields.provider = flags.provider
  }

  if (flags.model !== undefined) {
    const err = validateModelName(flags.model)
    if (err !== true) {
      fail(`Invalid model: ${err}`)
      return
    }
    fields.model = flags.model
  }

  if (flags.inputTokens !== undefined) {
    const err = validateTokens(flags.inputTokens)
    if (err !== true) {
      fail(`Invalid input tokens: ${err}`)
      return
    }
    fields.input_tokens = Number(flags.inputTokens)
  }

  if (flags.outputTokens !== undefined) {
    const err = validateTokens(flags.outputTokens)
    if (err !== true) {
      fail(`Invalid output tokens: ${err}`)
      return
    }
    fields.output_tokens = Number(flags.outputTokens)
  }

  if (flags.date !== undefined) {
    const err = validateDate(flags.date)
    if (err !== true) {
      fail(`Invalid date: ${err}`)
      return
    }
    fields.date = flags.date
  }

  if (flags.cost !== undefined) {
    const costNum = Number(flags.cost)
    if (isNaN(costNum) || costNum < 0) {
      fail("Invalid cost. Enter a non-negative number (e.g. 0.50 for 50 cents)")
      return
    }
    fields.cost = Math.round(costNum * 100)
  }

  if (flags.description !== undefined) {
    const trimmed = flags.description.trim()
    fields.description = trimmed || null
  }

  if (Object.keys(fields).length === 0) {
    fail(
      "No fields to update. Provide at least one flag (e.g. usage edit 5 --cost 0.50 --description 'refined prompt')",
    )
    return
  }

  const ok = updateLlmUsage(id, fields)
  if (!ok) {
    fail(`Usage entry with id ${id} not found`)
    return
  }

  logAudit("usage.edit", {
    targetType: "usage",
    targetId: id,
    details: Object.keys(fields).join(", "),
  })
  consola.success(`Updated usage entry: ${id}`)
}