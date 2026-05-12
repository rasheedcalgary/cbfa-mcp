/**
 * stdio transport.
 *
 * Connects the MCP server to stdin/stdout for local agent integration.
 * This is the transport used by Cursor, Claude Desktop, and any agent
 * that manages the server process directly.
 *
 * The process stays alive until stdin is closed by the parent agent.
 * All diagnostic logs go to stderr to avoid polluting the JSON stream.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "../server.js";

export async function startStdioTransport(): Promise<void> {
  const transport = new StdioServerTransport();
  const server = createServer();

  await server.connect(transport);

  console.error("[cba-mcp] stdio transport connected — waiting for agent.");
}
