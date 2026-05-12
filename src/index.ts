/**
 * CBA-MCP — Entry point.
 *
 * Reads the TRANSPORT environment variable and starts the appropriate
 * MCP server transport:
 *
 *   stdio (default) — for Cursor, Claude Desktop, and any agent that
 *                     spawns and manages the server process directly.
 *
 *   http            — for remote agents, n8n, LangChain, OpenAI Agents SDK,
 *                     and any client that connects over HTTP.
 *                     Set TRANSPORT=http to activate.
 *
 * All startup logs go to stderr to keep stdout clean for the MCP protocol.
 */

import "dotenv/config";
import { config, logConfigStatus } from "./config.js";
import { startStdioTransport } from "./transport/stdio.js";
import { startHttpTransport } from "./transport/http.js";
import { logger } from "./logger.js";
import { printBanner } from "./banner.js";

async function main(): Promise<void> {
  printBanner();
  logger.info(`Transport: ${config.transport}`);
  console.error("");

  logConfigStatus();

  if (config.transport === "http") {
    await startHttpTransport();
  } else {
    await startStdioTransport();
  }
}

main().catch((error: unknown) => {
  console.error("[cba-mcp] Fatal startup error:", error);
  process.exit(1);
});
