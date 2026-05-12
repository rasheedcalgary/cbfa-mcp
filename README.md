# CBA-MCP

**Custom Branded Apps MCP Server** — gives AI agents (Cursor, Claude Desktop, OpenAI Agents SDK, LangChain, n8n, and any MCP-compatible client) natural-language access to the Trainerize Custom Branded Apps platform.

Built for the Trainerize CBA Hackathon, May 2026.

---

## What it does

CBA-MCP exposes 9 tools (10 post-MVP) that let an AI agent:

- **Query** every custom-branded app's status, store state, and key validity
- **Find** apps stuck in publishing queues or overdue for a maintenance release
- **Trigger** iOS/Android builds via Bitrise or Jenkins
- **Poll** build status in real time

No SQL. No dashboards. Just ask the agent in plain English.

---

## Quickstart

### Prerequisites

- Node.js 20+
- AWS credentials with read-only S3 access to the CBA CSV dump
- Bitrise Personal Access Token (for build tools)
- Jenkins credentials (optional — alternative CI provider)

### 1. Install

```bash
git clone git@github.com:rasheedcalgary/cbfa-mcp.git
cd cbfa-mcp
npm install
```

### 2. Configure credentials

```bash
cp .env.example .env
# Edit .env and fill in your keys
```

**User-provided** (the only key end users need to set):

| Variable | Required for | Where to get it |
|---|---|---|
| `ADMIN_PANEL_API_KEY` | All read tools | Your Trainerize Admin Panel API key |

**Operator-loaded** (pre-configured in `mcp.json` by the server admin — users don't touch these):

| Variable | Required for |
|---|---|
| `ADMIN_PANEL_DOMAIN` | Base URL for the Admin Panel API |
| `BITRISE_TOKEN` | `trigger_app_build`, `get_build_status` |
| `JENKINS_URL` + `JENKINS_USER` + `JENKINS_API_KEY` | Jenkins build tools |
| `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` + `S3_BUCKET` + `S3_KEY` | CSV data layer |

### 3. Build

```bash
npm run build
```

### 4. Connect to your agent

**Cursor / Claude Desktop (stdio)**

Add to `~/.cursor/mcp.json` (or `claude_desktop_config.json`).

`ADMIN_PANEL_API_KEY` is the only value each user sets themselves. Everything else is filled in once by the server operator.

```json
{
  "mcpServers": {
    "cba-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/cbfa-mcp/dist/index.js"],
      "env": {
        "ADMIN_PANEL_API_KEY": "your-api-key",
        "ADMIN_PANEL_DOMAIN": "https://your-admin-panel.trainerize.com",
        "BITRISE_TOKEN": "your-bitrise-token",
        "AWS_ACCESS_KEY_ID": "your-aws-key-id",
        "AWS_SECRET_ACCESS_KEY": "your-aws-secret",
        "AWS_REGION": "us-east-1",
        "S3_BUCKET": "your-bucket-name",
        "S3_KEY": "path/to/cba_apps_dump.csv"
      }
    }
  }
}
```

Restart Cursor. A green dot in **Settings → MCP** confirms the server is live.

**Remote agents (HTTP)**

```bash
TRANSPORT=http npm start
# Server starts on port 3000 (configurable via PORT env var)
```

| Endpoint | Protocol | Compatible with |
|---|---|---|
| `POST /mcp` | MCP Streamable HTTP | Claude.ai, OpenAI Agents SDK, MCP Inspector |
| `GET /sse` + `POST /message` | MCP SSE (legacy) | LangChain, n8n, older frameworks |
| `GET /health` | HTTP | Load balancers, uptime monitors |

---

## Available tools

### Read tools — require `ADMIN_PANEL_API_KEY`

| Tool | Description | Example prompt |
|---|---|---|
| `list_apps` | List all CBA apps, filter by type | *"List all enterprise apps"* |
| `get_app_info` | Full details for one app | *"Give me all info about com.trainerize.peakfitness"* |
| `get_ios_status` | iOS App Store version + state + key validity | *"Is com.trainerize.peakfitness live on the App Store?"* |
| `get_android_status` | Play Store version + state + key validity | *"What's the Android status of com.trainerize.peakfitness?"* |
| `get_app_last_updated` | Last release dates + days-ago for both platforms | *"When was com.trainerize.peakfitness last updated?"* |
| `get_pending_apps` | Apps stuck in publishing queues | *"What apps are pending Apple review?"* |
| `get_stale_apps` | Apps overdue for a release (configurable threshold) | *"Which enterprise apps haven't shipped in 6 months?"* |

### Action tools — require `BITRISE_TOKEN` or Jenkins credentials

| Tool | Description | Example prompt |
|---|---|---|
| `trigger_app_build` | Trigger an iOS/Android build on Bitrise or Jenkins | *"Trigger a Bitrise iOS build for com.trainerize.peakfitness"* |
| `get_build_status` | Poll build state, duration, and log URL | *"Is the build for com.trainerize.peakfitness done?"* |

### Post-MVP

| Tool | Description |
|---|---|
| `check_cert_validity` | Apple push cert + provisioning profile expiry per app |

---

## Project structure

```
cbfa-mcp/
├── src/
│   ├── index.ts                   # Entry point — picks transport from TRANSPORT env
│   ├── server.ts                  # Creates McpServer, wires all tools
│   ├── config.ts                  # Typed env config + startup credential status log
│   ├── auth/
│   │   └── validator.ts           # Auth guards — throws descriptive McpError on missing creds
│   ├── clients/
│   │   ├── admin-panel.ts         # Axios client for Admin Panel API
│   │   ├── bitrise.ts             # Axios client for Bitrise REST API
│   │   └── jenkins.ts             # Axios client for Jenkins REST API
│   ├── data/
│   │   ├── s3Client.ts            # Downloads CSV dump from S3 (Phase 2)
│   │   ├── csvParser.ts           # Parses CSV into AppRecord[] (Phase 2)
│   │   └── appRegistry.ts        # In-memory cache + query helpers (Phase 2)
│   ├── tools/
│   │   ├── registry.ts            # Registers all tools in one place
│   │   ├── read/                  # 7 read tools
│   │   └── action/                # 2 action tools
│   ├── transport/
│   │   ├── stdio.ts               # stdio transport (Cursor, Claude Desktop)
│   │   └── http.ts                # HTTP transport (Streamable HTTP + SSE)
│   └── types/
│       └── index.ts               # Shared TypeScript interfaces
├── .env.example                   # Credential template — copy to .env
├── package.json
└── tsconfig.json
```

---

## Development

```bash
npm run dev           # stdio mode with hot reload (tsx watch)
npm run dev:http      # HTTP mode with hot reload
npm run typecheck     # TypeScript check without building
npm run build         # Production build → dist/
```

---

## Authentication errors

If a required credential is missing, every tool returns a specific, actionable message rather than a silent failure. Example:

```
Authentication failed — missing Admin Panel credentials: ADMIN_PANEL_API_KEY.

Read tools require access to the Trainerize Admin Panel API.
Set the following in your .env or mcp.json env block:

  ADMIN_PANEL_API_KEY=your-api-key
  ADMIN_PANEL_DOMAIN=https://your-admin-panel.trainerize.com
```

API clients also intercept 401/403 responses and surface them as clear MCP errors.

---

## Roadmap

| Phase | Status | What |
|---|---|---|
| 1 — Scaffold | ✅ Done | Project structure, transports, auth, tool stubs |
| 2 — Data layer | ⏳ Next | S3 CSV downloader, parser, in-memory registry |
| 3 — Read tools | ⏳ Pending | Implement all 7 read tool handlers |
| 4 — Action tools | ⏳ Pending | Implement Bitrise + Jenkins build trigger/status |
| 5 — Polish | ⏳ Pending | Error handling, formatted output, demo script |
| 6 — Cert validity | 🔮 Post-MVP | Apple push cert + provisioning profile check |
| 7 — Deploy | 🔮 Post-MVP | EC2 / Cloud Run with HTTP transport |
| 8 — Auth | 🔮 Post-MVP | Google OAuth restricted to @trainerize.com |

---

*Trainerize CBA Hackathon — May 2026*
