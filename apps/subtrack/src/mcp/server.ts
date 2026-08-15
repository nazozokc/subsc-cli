/**
 * MCP server setup: creates the MCP server, registers request handlers
 * for ListTools and CallTool, and exports startMcpServer.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"

import { rateLimiter, validateArgs, INPUT_VALIDATIONS, MAX_REQUEST_SIZE } from "./security.ts"
import { TOOLS } from "./tools.ts"
import { HANDLER_MAP } from "./handlers.ts"

const server = new Server(
  { name: "subtrack-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS }
})

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  // Rate limiting
  if (!rateLimiter.tryConsume()) {
    return {
      content: [{ type: "text", text: "Rate limit exceeded. Please slow down." }],
      isError: true,
    }
  }

  // Request size check
  const rawSize = JSON.stringify(request.params).length
  if (rawSize > MAX_REQUEST_SIZE) {
    return {
      content: [{ type: "text", text: `Request too large (${rawSize} bytes, max ${MAX_REQUEST_SIZE})` }],
      isError: true,
    }
  }

  // Input validation per tool
  if (args) {
    const schema = INPUT_VALIDATIONS[name]
    if (schema) {
      const err = validateArgs(args as Record<string, unknown>, schema)
      if (err) {
        return {
          content: [{ type: "text", text: `Validation error: ${err}` }],
          isError: true,
        }
      }
    }
  }

  // Route to handler
  const handler = HANDLER_MAP[name]
  if (!handler) {
    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    }
  }

  try {
    return await handler(args as Record<string, unknown> | undefined)
  } catch (error) {
    return {
      content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
      isError: true,
    }
  }
})

export async function startMcpServer(): Promise<void> {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

export function formatDateISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}
