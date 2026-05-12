/**
 * MCP server factory.
 *
 * Creates a McpServer with all tools registered. Every tool call is
 * transparently wrapped with logging — name, params, duration, and
 * success/error are printed to stderr.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllTools } from "./tools/registry.js";
import { logger } from "./logger.js";

const SERVER_NAME = "cba-mcp";
const SERVER_VERSION = "0.1.0";

/**
 * Returns a McpServer with a logging proxy applied to `tool()`.
 * The proxy intercepts each tool registration and wraps its handler
 * so every call is logged with params, duration, and outcome.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  // Wrap server.tool() so logging is applied to every registered tool
  // without touching any individual tool file.
  const proxied = new Proxy(server, {
    get(target, prop, receiver) {
      if (prop !== "tool") return Reflect.get(target, prop, receiver);

      // Return a wrapper that matches the 4-arg overload we always use:
      // tool(name, description, paramsSchema, handler)
      return (
        name: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...rest: any[]
      ) => {
        // The handler is always the last argument
        const handler = rest[rest.length - 1] as (...a: unknown[]) => Promise<unknown>;
        const argsBeforeHandler = rest.slice(0, -1);

        const wrappedHandler = async (params: unknown) => {
          logger.toolCall(name, params);
          const start = Date.now();
          try {
            const result = await handler(params);
            logger.toolOk(name, Date.now() - start);
            return result;
          } catch (err) {
            logger.toolError(name, Date.now() - start, err);
            throw err;
          }
        };

        // Re-apply the original call with the wrapped handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (target.tool as any)(name, ...argsBeforeHandler, wrappedHandler);
      };
    },
  });

  registerAllTools(proxied as McpServer);

  return server;
}
