/**
 * MCP server factory.
 *
 * Creates and configures a new McpServer instance with all tools registered.
 * Called once for stdio transport, or once per HTTP connection for HTTP transport.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllTools } from "./tools/registry.js";

const SERVER_NAME = "cba-mcp";
const SERVER_VERSION = "0.1.0";

/**
 * Creates a new McpServer with all CBA tools registered and ready.
 *
 * For stdio: call this once and connect to StdioServerTransport.
 * For HTTP:  call this once per incoming connection (stateless mode).
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerAllTools(server);

  return server;
}
