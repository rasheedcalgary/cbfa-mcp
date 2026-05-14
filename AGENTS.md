# AGENTS.md — CBA-MCP Codebase Guide for AI Agents

This file gives AI coding assistants (Cursor, Claude, Copilot, etc.) the full context
needed to work effectively on this repository. Read this before making any changes.

---

## What this project is

**CBA-MCP** is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server
for the Trainerize **Custom Branded Apps (CBA)** platform. It exposes 14 tools that let
AI agents query app status, publishing queues, build pipelines, trigger CI/CD jobs,
analyse build logs, and debug Glofox CircleCI failures — all via natural language.

**Live site & interactive demo:** <https://cba-mcp.web.app/>

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
│   │   ├── jenkins.ts        ← Axios instance for Jenkins API (HTTP Basic Auth).
│   │   └── circleci.ts       ← Two axios instances: v2 (metadata) + v1.1 (job step output). Circle-Token header.
│   ├── data/
│   │   ├── s3Client.ts       ← Downloads CSV dump from AWS S3.
│   │   ├── csvParser.ts      ← Parses raw CSV string into AppRecord[].
│   │   └── appRegistry.ts   ← In-memory store. getAllApps(), getAppByBundleId(), getAppsByName().
│   ├── utils/
│   │   └── csv.ts            ← RFC 4180 CSV serialiser. toCSV(headers, rows) used by report tools.
│   ├── tools/
│   │   ├── registry.ts       ← Imports every tool and calls registerXxx(server). Add new tools here.
│   │   ├── read/             ← Tools that only read data (require Admin Panel API key).
│   │   │   ├── list-apps.ts          ← format: "table" | "csv"
│   │   │   ├── get-app-info.ts
│   │   │   ├── get-ios-status.ts
│   │   │   ├── get-android-status.ts
│   │   │   ├── get-app-last-updated.ts
│   │   │   ├── get-pending-apps.ts   ← format: "table" | "csv"
│   │   │   ├── get-stale-apps.ts     ← format: "table" | "csv"
│   │   │   └── query-apps.ts         ← display_name search + format: "table" | "csv"
│   │   └── action/           ← Tools that trigger side effects (require Bitrise or Jenkins creds).
│   │       ├── trigger-build.ts           ← Bitrise iOS: New_App_Creation_Flow / DEPLOY_testflight_S3_2026
│   │       ├── get-build-status.ts       ← Polls Bitrise build; suggests log analysis on failure
│   │       ├── analyze-build-log.ts      ← Fetches + analyses Bitrise/Jenkins logs; 25+ error patterns
│   │       └── analyze-circleci-build.ts ← Debugs Glofox CircleCI failures; walks pipeline→workflow→job; 30+ patterns
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
| CircleCI | `validateCircleCiAuth()` | `InternalError` | Server operator |
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
import { getAllApps, getAppByBundleId, getAppsByName } from "../../data/appRegistry.js";

const apps = await getAllApps("enterprise");       // all enterprise apps
const app  = await getAppByBundleId(bundle_id);   // throws McpError if not found
const hits = await getAppsByName("goodlife");      // partial, case-insensitive name match
```

The registry loads the CSV from S3 on first call and caches it in memory.

### 4a. CSV export — use the shared utility

Report tools that support `format: "csv"` use `src/utils/csv.ts`:

```typescript
import { toCSV } from "../../utils/csv.js";

const csvText = toCSV(
  ["bundle_id", "display_name", "ios_version"],   // header row
  apps.map((a) => [a.bundle_id, a.display_name, a.ios_version])
);
return { content: [{ type: "text" as const, text: "```csv\n" + csvText + "\n```" }] };
```

`toCSV` handles RFC 4180 quoting and escaping automatically.

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
BITRISE_TOKEN, BITRISE_APP_SLUG,
JENKINS_URL, JENKINS_USER, JENKINS_API_KEY,
CIRCLE_CI_TOKEN,
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
config.bitriseAppSlug     // string | undefined  ← from server .env (e.g. de36db0d3356751f)
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
| 3 — Read tools | ✅ Complete | All 10 tools in `src/tools/read/` return real data; `get_app_info` merges CSV + live API |
| 3.1 — Admin API | ✅ Complete | `src/clients/admin-panel.ts` — `getNativeApp`, `GetNativeAppGroupSettings`, `getAppBuildQueue`; `get_build_queue` tool |
| 3.2 — Name search | ✅ Complete | `getAppsByName()` in registry; `display_name` param on `query_apps` |
| 3.3 — CSV export | ✅ Complete | `src/utils/csv.ts`; `format: "csv"` on `list_apps`, `query_apps`, `get_pending_apps`, `get_stale_apps` |
| 4 — Action tools | ✅ Complete | `trigger_app_build` (Bitrise iOS), `get_build_status` (Bitrise poll), `analyze_build_log` (Bitrise + Jenkins) |
| 4.1 — CircleCI debugger | ✅ Complete | `analyze_circleci_build` — Glofox CBA pipeline/workflow/job debugger via CircleCI API v2 + v1.1 |
| 5 — Deploy | ✅ Complete | EC2 (HTTP transport) — live at `http://34.219.106.183:3000` |

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

The MCP server is **already hosted on EC2** at `http://34.219.106.183:3000`.
No local setup or deployment is needed — just add one block to your agent config.

**Cursor / Claude Desktop** — add to `~/.cursor/mcp.json` or `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "cba-mcp-remote": {
      "url": "http://34.219.106.183:3000/mcp",
      "headers": { "X-Admin-Panel-Api-Key": "your-api-key" }
    }
  }
}
```

Replace `your-api-key` with your Admin Panel API key — that's the **only** value you supply.
All other credentials (AWS, Bitrise, Jenkins, CircleCI) are pre-loaded on the server.

**HTTP agents (OpenAI Agents SDK, LangChain, n8n)** — point directly at the hosted endpoints:
- `POST http://34.219.106.183:3000/mcp` — Streamable HTTP (current MCP standard)
- `GET http://34.219.106.183:3000/sse` — SSE (legacy)
- `GET http://34.219.106.183:3000/health` — liveness probe

---

## Action tool implementation notes

### `trigger_app_build`
- Uses `BITRISE_APP_SLUG` + `BITRISE_TOKEN` from `config`.
- `build_type=new_app` → workflow `New_App_Creation_Flow`.
- `build_type=update` → workflow `DEPLOY_testflight_S3_2026`.
- Passes `BUNDLE_ID`, `APP_NAME`, `BITRISE_WORKFLOW` as Bitrise env vars.
- Returns build number, slug, and Bitrise URL.

### `get_build_status`
- Accepts a full Bitrise URL or raw build slug.
- `parseBuildSlug` regex: `/\/build\/([a-f0-9-]+)/i` — handles UUID hyphens.
- Returns status, duration, workflow, branch, and a hint to run `analyze_build_log` on failure.

### `analyze_build_log`
- Auto-detects provider from URL (`app.bitrise.io` → Bitrise; otherwise Jenkins).
- **Bitrise**: fetches log metadata from `/apps/{slug}/builds/{buildSlug}/log`, downloads from `expiring_raw_log_url` (S3) for archived builds or streams chunks for live builds.
- **Jenkins**: fetches `/consoleText` via HTTP Basic Auth.
- Error extraction uses 25+ regex patterns: Xcode errors, code-sign failures, pod install issues, Gradle task failures, lint errors, and more.
- Returns labelled findings with line numbers, severity (`error` / `warning`), and configurable context lines.

### `analyze_circleci_build`
- Targets **Glofox CBA** builds: `glofoxinc/standalone-app-builder` pipeline only.
- Auth: `validateCircleCiAuth()` — requires `CIRCLE_CI_TOKEN` in server `.env`.
- **URL parsing**: supports all four shapes — pipeline (`…/{n}`), workflow (`…/{n}/workflows/{uuid}`), job (`…/{n}/workflows/{uuid}/jobs/{n2}`), legacy (`circleci.com/gh/glofoxinc/standalone-app-builder/{n}`).
- **API walk**: `GET /api/v2/project/{slug}/pipeline/{n}` → pipeline → workflows → jobs → finds all with `status: "failed"`.
- **Log fetching**: uses v1.1 API (`GET /api/v1.1/project/{slug}/{job-number}/output/{step}/{index}`) for each step/action separately to avoid truncation.
- **Error patterns**: 30+ rules across Node/npm, React Native, Android/Gradle, iOS/Xcode, Docker, Jest, network, Fastlane, shell.
- Returns a structured markdown report: pipeline summary → workflow status → per-job error findings with context → root-cause summary at the bottom.
- Clients: `getCircleCiV2Client()` and `getCircleCiV1Client()` from `src/clients/circleci.ts`.

---

**Website:** <https://cba-mcp.web.app/> · **GitHub:** <https://github.com/rasheedcalgary/cbfa-mcp>

*Last updated: May 2026 — Trainerize CBA Hackathon*
