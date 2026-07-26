/**
 * Shared types for the MCP module.
 */

export type ToolInputSchema = {
  type: "object"
  properties: Record<string, { type: string; description: string }>
  required?: string[]
}

export type Tool = {
  name: string
  description: string
  inputSchema: ToolInputSchema
}

export type McpContent = {
  type: "text"
  text: string
}

export type McpResponse = {
  content: McpContent[]
  isError?: boolean
}
