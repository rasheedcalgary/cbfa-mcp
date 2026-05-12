# AGENTS.md — CBA-MCP Codebase Guide for AI Agents

This file gives AI coding assistants (Cursor, Claude, Copilot, etc.) the full context
needed to work effectively on this repository. Read this before making any changes.

---

## What this project is

**CBA-MCP** is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server
for the Trainerize **Custom Branded Apps (CBA)** platform. It exposes 9 tools that let
AI agents query app status, publishing queues, build pipelines, and trigger CI/CD jobs
— all via natural language.

Built in TypeScript using the official `@modelcontextprotocol/sdk`. Supports two transports:
- **stdio** — for local agents (Cursor, Claude Desktop). Default.
- **HTTP** — for remote agents (OpenAI Agents SDK, LangChain, n8n). Set `TRANSPORT=http`.

---

## Repository layout

```
cbfa-mcp/
├── src/
│   ├── index.ts              ← Entry point. Reads TRANSPORT env, starts the right transport.
│   ├── server.ts             ← Creates McpServer instance, calls registerAllTools().
│   ├── config.ts             ← Typed env config object. Single source of truth for all env vars.
│   ├── auth/
│   │   └── validator.ts      ← Auth guard functions. Throw McpError with helpful messages.
│   ├── clients/
│   │   ├── admin-panel.ts    ← Axios instance for Admin Panel API (Bearer token auth).
│   │   ├── bitrise.ts        ← Axios instance for Bitrise API (token in Authorization header).
│   │   └── jenkins.ts        ← Axios instance for Jenkins API (HTTP Basic Auth).
│   ├── data/
│   │   ├── s3Client.ts       ← Downloads CSV dump from AWS S3.
│   │   ├── csvParser.ts      ← Parses raw CSV string into AppRecord[].
│   │   └── appRegistry.ts   ← In-memory store. getAllApps(), getAppByBundleId().
│   ├── tools/
│   │   ├── registry.ts       ← Imports every tool and calls registerXxx(server). Add new tools here.
│   │   ├── read/             ← Tools that only read data (require Admin Panel API key).
│   │   │   ├── list-apps.ts
│   │   │   ├── get-app-info.ts
│   │   │   ├── get-ios-status.ts
│   │   │   ├── get-android-status.ts
│   │   │   ├── get-app-last-updated.ts
│   │   │   ├── get-pending-apps.ts
│   │   │   └── get-stale-apps.ts
│   │   └── action/           ← Tools that trigger side effects (require Bitrise or Jenkins creds).
│   │       ├── trigger-build.ts
│   │       └── get-build-status.ts
│   ├── transport/
│   │   ├── stdio.ts          ← Connects McpServer to StdioServerTransport.
│   │   └── http.ts           ← Express server with POST /mcp (Streamable HTTP) + GET /sse (legacy).
│   └── types/
│       └── index.ts          ← Shared interfaces: AppRecord, BuildStatus, CiProvider, etc.
├── .env.example              ← Credential template. Copy to .env, never commit .env.
├── package.json
└── tsconfig.json
```

---

## Core patterns — follow these everywhere

### 1. Tool structure

Every tool lives in its own file under `src/tools/read/` or `src/tools/action/`.
Each file exports a single `registerXxx(server: McpServer): void` function.

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { validateAdminPanelAuth } from "../../auth/validator.js";

export function registerMyTool(server: McpServer): void {
  server.tool(
    "tool_name",                  // snake_case, matches MCP convention
    "Agent-facing description.",  // clear, concise, tells the agent when to use it
    {
      param: z.string().describe("What this param does"),
    },
    async ({ param }) => {
      validateAdminPanelAuth();   // ALWAYS validate auth first, before any logic

      // ... tool logic ...

      return {
        content: [{ type: "text" as const, text: "result" }],
      };
    }
  );
}
```

After creating the file, import and call the register function in `src/tools/registry.ts`.

### 2. Auth guards — call at the top of every handler

Credential ownership model:
- **`ADMIN_PANEL_API_KEY`** — the only user-supplied credential. Each end user sets this themselves.
- **Everything else** — operator-supplied (S3, Bitrise, Jenkins, Admin Panel domain). Pre-loaded in `mcp.json` by the server admin. If these are missing it is a server configuration error (`ErrorCode.InternalError`), not a user error.

| Service | Validator | Error code | Who fixes it |
|---|---|---|---|
| Admin Panel API key | `validateAdminPanelAuth()` | `InvalidRequest` | End user |
| Bitrise | `validateBitriseAuth()` | `InternalError` | Server operator |
| Jenkins | `validateJenkinsAuth()` | `InternalError` | Server operator |
| AWS / S3 | `validateAwsAuth()` | `InternalError` | Server operator |

Validators throw `McpError` with a multi-line human-readable message if credentials are
missing or incomplete. Do not wrap them in try/catch — let them propagate.

### 3. API clients — use the singletons

Never construct axios instances directly in tool files.
Use the singleton getters from `src/clients/`:

```typescript
import { getAdminPanelClient } from "../../clients/admin-panel.js";
const client = getAdminPanelClient();
const { data } = await client.get("/apps");
```

The clients already have 401/403 interceptors that convert HTTP errors into McpErrors.

### 4. Data layer — read tools use the registry

Read tools should query `src/data/appRegistry.ts`, not the API client directly:

```typescript
import { getAllApps, getAppByBundleId } from "../../data/appRegistry.js";

const apps = await getAllApps("enterprise");       // all enterprise apps
const app  = await getAppByBundleId(bundle_id);   // throws McpError if not found
```

The registry loads the CSV from S3 on first call and caches it in memory.

### 5. Error handling

- Throw `McpError` (from `@modelcontextprotocol/sdk/types.js`) for user-facing errors.
- Use `ErrorCode.InvalidRequest` for bad inputs / missing credentials.
- Use `ErrorCode.InternalError` for unexpected server-side failures.
- Regular `Error` throws are also caught by the SDK and returned as `InternalError`.
- Never swallow errors silently.

### 6. TypeScript conventions

- `"type": "module"` — always use `.js` extensions in imports (even for `.ts` source files).
- `strict: true` — no implicit any, no unchecked nulls.
- `as const` — required on `type: "text"` in tool return values to satisfy SDK types.
- All new types go in `src/types/index.ts`.

---

## Environment variables

Two separate sources — never mix them:

**Server `.env`** (operator-managed infra, loaded by `dotenv/config` at startup):
```
TRANSPORT, PORT,
ADMIN_PANEL_DOMAIN,
BITRISE_TOKEN,
JENKINS_URL, JENKINS_USER, JENKINS_API_KEY,
AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, S3_BUCKET, S3_KEY
```

**User's `mcp.json` env block** (the only thing end users configure):
```
ADMIN_PANEL_API_KEY
```

All vars are read once in `src/config.ts` and exposed via the `config` object.
Never call `process.env` directly outside of `config.ts`.

```typescript
import { config } from "../config.js";
config.adminPanelApiKey   // string | undefined  ← from user's mcp.json
config.adminPanelDomain   // string | undefined  ← from server .env
config.bitriseToken       // string | undefined  ← from server .env
```

`logConfigStatus()` prints a two-section checklist to stderr at startup — one section
for server infra vars, one for the user-supplied API key.

---

## Data model

The core data type is `AppRecord` (`src/types/index.ts`). One record per CBA app.

| Field | Type | Description |
|---|---|---|
| `bundle_id` | `string` | Primary key — reverse-DNS, e.g. `com.trainerize.peakfitness` |
| `display_name` | `string` | Human-readable app name |
| `app_type` | `"enterprise" \| "studio" \| "pro" \| "abc"` | Product line |
| `team_name` | `string` | Gym / business name |
| `group_id` | `string` | Gym group identifier |
| `apple_id` | `string` | Apple account email (without @trainerize.com) |
| `abc_app_type` | `string` | ABC sub-type, or `"N/A"` |
| `ios_version` | `string` | Current App Store version |
| `app_store_state` | `string` | e.g. `"Ready for Sale"`, `"In Review"` |
| `apple_key_valid` | `string` | `.p8` key validity status |
| `watch_face` | `string` | Watch face support flag |
| `android_version` | `string` | Current Play Store version |
| `android_store_state` | `string` | e.g. `"Published"`, `"Draft"` |
| `google_key_valid` | `string` | Service account key validity |
| `last_ios_updated` | `string` | ISO date of last iOS release |
| `last_android_updated` | `string` | ISO date of last Android release |
| `bitrise_workflow` | `string` | Bitrise workflow name for this app |
| `dump_date` | `string` | ISO datetime when the CSV was generated |

---

## Implementation status

| Phase | Status | Files |
|---|---|---|
| 1 — Scaffold | ✅ Complete | Project structure, transports, auth, tool stubs, structured logging, CLI banner |
| 2 — Data layer | ✅ Complete | `src/data/` — S3 download, CSV parse (`relax_column_count`), in-memory registry with query helpers |
| 3 — Read tools | ✅ Complete | All 7 tools in `src/tools/read/` return real data; `get_app_info` merges CSV + live API |
| 3.1 — Admin API | ✅ Complete | `src/clients/admin-panel.ts` — `getNativeApp`, `GetNativeAppGroupSettings`, `getAppBuildQueue`; new `get_build_queue` tool |
| 4 — Action tools | ⏳ Pending | `src/tools/action/` — auth guards in place, API calls not yet implemented |
| 5 — Polish | ⏳ Pending | Demo script, display-name enrichment in `get_build_queue` cross-reference |

When implementing a Phase 4 tool, the handler should:
1. Call the auth validator for the chosen provider (already in place).
2. Look up the app's `bitrise_workflow` from the registry via `getAppByBundleId()`.
3. Call the provider client (`getBitriseClient()` or `getJenkinsClient()`).
4. Return structured build info matching `BuildTriggerResult` or `BuildStatusResult`.

---

## Adding a new tool — checklist

1. Create `src/tools/read/my-tool.ts` or `src/tools/action/my-tool.ts`.
2. Export `registerMyTool(server: McpServer): void`.
3. Define the Zod input schema inline in `server.tool(...)`.
4. Call the correct auth validator at the top of the handler.
5. Import and call `registerMyTool(server)` in `src/tools/registry.ts`.
6. Run `npm run typecheck` — must pass with zero errors.

---

## Scripts

```bash
npm run dev          # stdio mode, hot reload (tsx watch)
npm run dev:http     # HTTP mode, hot reload
npm run build        # production build → dist/index.js
npm run typecheck    # tsc --noEmit, zero tolerance for errors
npm start            # run built dist (stdio)
npm run start:http   # run built dist (HTTP)
```

---

## Agent connection configs

**Cursor / Claude Desktop** — add to `~/.cursor/mcp.json` or `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "cba-mcp": {
      "command": "npm",
      "args": ["--prefix", "/absolute/path/to/cbfa-mcp", "start"],
      "env": { "ADMIN_PANEL_API_KEY": "your-api-key" }
    }
  }
}
```

**HTTP agents** — start with `TRANSPORT=http npm start` then point your agent at:
- `POST http://localhost:3000/mcp` — Streamable HTTP (current MCP standard)
- `GET http://localhost:3000/sse` — SSE (legacy, for LangChain / n8n)

---

*Last updated: May 2026 — Trainerize CBA Hackathon*
