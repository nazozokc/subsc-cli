/**
 * MCP module entry point.
 * Re-exports the public API from the mcp/ directory.
 * This barrel file preserves backward compatibility for consumers
 * that import from "./mcp.ts".
 */

export {
  startMcpServer,
  formatDateISO,
} from "./mcp/index.ts"
