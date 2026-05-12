/**
 * HTTP transport.
 *
 * Starts an Express server that exposes two MCP endpoints:
 *
 *   POST /mcp   — MCP Streamable HTTP (current standard, supported by Claude.ai,
 *                 OpenAI Agents SDK, and most modern frameworks)
 *
 *   GET  /sse   — MCP SSE (legacy standard, supported by LangChain, n8n, older
 *                 agent frameworks, and any client that opens a persistent stream)
 *   POST /message?sessionId=<id>  — paired message handler for SSE sessions
 *
 *   GET  /health — simple liveness probe (no auth required)
 *
 * Both endpoints are stateless — a fresh McpServer instance is created per
 * connection, so the server can be scaled horizontally if needed.
 *
 * Set TRANSPORT=http in your environment to activate this mode.
 */

import express, { type Request, type Response, type NextFunction } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createServer } from "../server.js";
import { config } from "../config.js";
import { logger } from "../logger.js";

// ─── SSE Session Store ────────────────────────────────────────────────────────

/**
 * Maps session IDs to active SSE transports.
 * Required so that POST /message can route responses back to the correct stream.
 */
const sseSessions = new Map<string, SSEServerTransport>();

// ─── Server ───────────────────────────────────────────────────────────────────

export async function startHttpTransport(): Promise<void> {
  const app = express();

  app.use(express.json());

  // ── Request logger middleware ──────────────────────────────────────────────
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on("finish", () => {
      logger.httpRequest(req.method, req.path, res.statusCode, Date.now() - start);
    });
    next();
  });

  // ── Health check ──────────────────────────────────────────────────────────
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      server: "cba-mcp",
      version: "0.1.0",
      transport: "http",
    });
  });

  // ── MCP Streamable HTTP (current standard) ────────────────────────────────
  // Compatible with: Claude.ai, OpenAI Agents SDK, MCP Inspector, and any
  // client that sends JSON-RPC messages via POST.
  app.post("/mcp", async (req: Request, res: Response) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless — each POST is independent
    });

    const server = createServer();

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } finally {
      // Clean up once the response is sent
      res.on("finish", () => {
        server.close().catch(() => {});
      });
    }
  });

  // ── MCP SSE — open stream (legacy standard) ───────────────────────────────
  // Compatible with: LangChain, n8n, older agent frameworks, and any client
  // that opens a persistent EventSource connection.
  app.get("/sse", async (req: Request, res: Response) => {
    const transport = new SSEServerTransport("/message", res);
    const server = createServer();

    await server.connect(transport);

    // Track session so POST /message can route to it
    sseSessions.set(transport.sessionId, transport);

    res.on("close", () => {
      sseSessions.delete(transport.sessionId);
      server.close().catch(() => {});
    });
  });

  // ── MCP SSE — message handler (legacy standard) ───────────────────────────
  app.post("/message", async (req: Request, res: Response) => {
    const sessionId = req.query["sessionId"] as string | undefined;

    if (!sessionId) {
      res.status(400).json({ error: "Missing required query param: sessionId" });
      return;
    }

    const transport = sseSessions.get(sessionId);

    if (!transport) {
      res.status(404).json({
        error: `Session "${sessionId}" not found. The SSE connection may have closed.`,
      });
      return;
    }

    await transport.handlePostMessage(req, res);
  });

  // ── Start listening ───────────────────────────────────────────────────────
  app.listen(config.port, () => {
    console.error(`[cba-mcp] HTTP transport listening on port ${config.port}`);
    console.error(`[cba-mcp] Endpoints:`);
    console.error(`  Streamable HTTP : POST http://localhost:${config.port}/mcp`);
    console.error(`  SSE stream      : GET  http://localhost:${config.port}/sse`);
    console.error(`  SSE message     : POST http://localhost:${config.port}/message?sessionId=<id>`);
    console.error(`  Health check    : GET  http://localhost:${config.port}/health`);
  });
}
