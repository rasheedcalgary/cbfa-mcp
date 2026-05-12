# CBA-MCP

**Custom Branded Apps MCP Server** — gives AI agents (Cursor, Claude Desktop, OpenAI Agents SDK, LangChain, n8n, and any MCP-compatible client) natural-language access to the Trainerize Custom Branded Apps platform.

Built for the Trainerize CBA Hackathon, May 2026.

🌐 **[Live documentation site →](https://rasheedcalgary.github.io/cbfa-mcp/)**

---

## What it does

CBA-MCP exposes 10 tools that let an AI agent:

- **Query** every custom-branded app's status, store state, and key validity — across 30,000+ apps
- **Filter** apps by iOS/Android version, CBA lifecycle status, App Store state, app type, and business type
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

### 2. Configure server credentials

```bash
cp .env.example .env
# Edit .env — this is the server's infra config (operator only)
```

All infrastructure credentials live in the server's `.env` file:

| Variable | Purpose |
|---|---|
| `ADMIN_PANEL_DOMAIN` | Base URL for the Admin Panel API |
| `BITRISE_TOKEN` | Bitrise build tools |
| `JENKINS_URL` + `JENKINS_USER` + `JENKINS_API_KEY` | Jenkins build tools |
| `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` + `S3_BUCKET` + `S3_KEY` | CSV data layer |

`ADMIN_PANEL_API_KEY` is **not** in `.env` — it is the only credential that each end user supplies themselves (see Step 4).

### 3. Build

```bash
npm run build
```

### 4. Connect to your agent

**Cursor / Claude Desktop (stdio)**

Share this snippet with each user. `ADMIN_PANEL_API_KEY` is the **only** value they need to fill in — all server-side credentials are already baked into the deployed server.

```json
{
  "mcpServers": {
    "cba-mcp": {
      "command": "npm",
      "args": ["--prefix", "/absolute/path/to/cbfa-mcp", "start"],
      "env": {
        "ADMIN_PANEL_API_KEY": "your-api-key"
      }
    }
  }
}
```

Replace `/absolute/path/to/cbfa-mcp` with the actual project root. `npm --prefix` sets the working directory automatically so the server finds its `.env` file and loads all AWS/S3, Bitrise, and Jenkins credentials without any additional user config.

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
| `get_app_info` | Full details for one app — CSV data + live Admin API | *"Give me all info about com.trainerize.peakfitness"* |
| `get_ios_status` | iOS version, App Store state, and Apple account | *"Is com.trainerize.peakfitness live on the App Store?"* |
| `get_android_status` | Android version, Play Store state, and Play account | *"What's the Android status of com.trainerize.workoutanytime?"* |
| `get_app_last_updated` | Last iOS and Android publish dates with freshness rating | *"When was com.trainerize.eosfitness last updated?"* |
| `get_pending_apps` | Apps stuck in publish queues (Apple submission, agreement, artwork, missing Play key) | *"What apps are pending Apple review?"* |
| `get_stale_apps` | Apps not updated within a configurable threshold (default 180 days) | *"Which enterprise apps haven't shipped in 6 months?"* |
| `get_build_queue` | Live build queue state — ReadyToBuild / Building / Built / Failed | *"What iOS apps are ready to build?"* |
| `query_apps` | Flexible AND-filter report across version, status, store state, type, and business type | *"List all iOS 8.16.0 Published apps"* |

### Action tools — require `BITRISE_TOKEN` or Jenkins credentials

| Tool | Description | Example prompt |
|---|---|---|
| `trigger_app_build` | Trigger an iOS or Android build on Bitrise or Jenkins | *"Trigger a Bitrise iOS build for com.trainerize.peakfitness"* |
| `get_build_status` | Poll build state, duration, and log URL | *"Is the build for com.trainerize.peakfitness done?"* |

### Post-MVP

| Tool | Description |
|---|---|
| `check_cert_validity` | Apple push cert + provisioning profile expiry per app |

---

## Example queries

Copy any of these directly into Cursor, Claude Desktop, or any connected agent.

### App information

```
Give me all info about com.trainerize.peakfitness
```
```
List all enterprise apps
```
```
List all ABC studio apps
```

### iOS & Android status

```
Is com.trainerize.peakfitness live on the App Store?
```
```
What's the Android status of com.trainerize.workoutanytime?
```
```
Show me all apps where iOS store state is ReadyForSale
```

### Version filtering

```
List all iOS 8.16.0 Published apps
```
```
Which apps are running Android version 8.10.3?
```
```
Show enterprise apps on iOS 8.14.0 or older
```

### Publishing queues & stale apps

```
What apps are pending Apple review right now?
```
```
Which apps are waiting for artwork?
```
```
Which apps are pending the Apple agreement step?
```
```
Which apps have a missing Google Play account?
```
```
Which enterprise apps haven't shipped in 6 months?
```
```
Show me stale studio apps older than 90 days
```

### Build queue

```
What iOS apps are ready to build in the queue?
```
```
Show me apps currently building on Android
```
```
Which apps failed their last build?
```

### Flexible reports (`query_apps`)

```
List all iOS 8.16.0 Published enterprise apps
```
```
Show me ABC apps that are WaitingForArtwork
```
```
Which Trainerize studio apps are ReadyForSale on iOS?
```
```
Top 20 apps with Android version 8.12.0 and Published status
```

### Build actions

```
Trigger a Bitrise iOS build for com.trainerize.peakfitness
```
```
Is the build for com.trainerize.peakfitness done yet?
```

---

## Understanding app status values

### CBA lifecycle status (`status` field)

| Value | Meaning |
|---|---|
| `Published` | App is live on both stores |
| `PendingPublish` | Queued for Trainerize publish action |
| `WaitingForArtwork` | Waiting on artwork assets before build |
| `Submitted` | Submitted to Apple — pending review |
| `Notified` | Awaiting Apple agreement acceptance |
| `Archived` | App has been decommissioned |

### iOS App Store state (`ios_store_status` field)

| Value | Meaning |
|---|---|
| `ReadyForSale` | Live on the App Store |
| `None` | Not yet submitted or removed |
| `DeveloperRemovedFromSale` | Pulled by the developer |
| `PendingDeveloperRelease` | Approved, waiting for manual release |

---

## Project structure

```
cbfa-mcp/
├── src/
│   ├── index.ts                   # Entry point — picks transport from TRANSPORT env
│   ├── server.ts                  # Creates McpServer, wires all tools
│   ├── config.ts                  # Typed env config + startup credential status log
│   ├── banner.ts                  # Decorative CLI startup banner
│   ├── logger.ts                  # Structured stderr logging with sensitive-field redaction
│   ├── auth/
│   │   └── validator.ts           # Auth guards — throws descriptive McpError on missing creds
│   ├── clients/
│   │   ├── admin-panel.ts         # Axios client for Admin Panel API
│   │   ├── bitrise.ts             # Axios client for Bitrise REST API
│   │   └── jenkins.ts             # Axios client for Jenkins REST API
│   ├── data/
│   │   ├── s3Client.ts            # Downloads CSV dump from S3
│   │   ├── csvParser.ts           # Parses CSV into AppRecord[]
│   │   └── appRegistry.ts         # In-memory cache + query helpers
│   ├── tools/
│   │   ├── registry.ts            # Registers all tools in one place
│   │   ├── read/                  # 9 read tools
│   │   └── action/                # 2 action tools
│   ├── transport/
│   │   ├── stdio.ts               # stdio transport (Cursor, Claude Desktop)
│   │   └── http.ts                # HTTP transport (Streamable HTTP + SSE)
│   └── types/
│       └── index.ts               # Shared TypeScript interfaces
├── docs/
│   └── index.html                 # GitHub Pages documentation site
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

If a required credential is missing, every tool returns a specific, actionable message rather than a silent failure:

```
Authentication failed — missing Admin Panel credentials: ADMIN_PANEL_API_KEY.

Read tools require access to the Trainerize Admin Panel API.
Set the following in your mcp.json env block:

  ADMIN_PANEL_API_KEY=your-api-key
```

API clients also intercept 401/403 responses and surface them as clear MCP errors. All sensitive values (API keys, tokens) are automatically redacted from server logs.

---

## Roadmap

| Phase | Status | What |
|---|---|---|
| 1 — Scaffold | ✅ Done | Project structure, transports, auth, tool stubs |
| 2 — Data layer | ✅ Done | S3 CSV downloader, parser, in-memory app registry |
| 3 — Read tools | ✅ Done | All 9 read tools live with real data + Admin API integration |
| 3.1 — Admin API | ✅ Done | `getNativeApp`, `GetNativeAppGroupSettings`, `getAppBuildQueue` integrated |
| 3.2 — Reports | ✅ Done | `query_apps` flexible filter tool + security hardening (log redaction) |
| 4 — Action tools | ⏳ Pending | Implement Bitrise + Jenkins build trigger/status |
| 5 — Polish | ⏳ Pending | Demo script, cert expiry enrichment |
| 6 — Cert validity | 🔮 Post-MVP | Apple push cert + provisioning profile check |
| 7 — Deploy | 🔮 Post-MVP | EC2 / Cloud Run with HTTP transport |
| 8 — Auth | 🔮 Post-MVP | Google OAuth restricted to @trainerize.com |

---

*Trainerize CBA Hackathon — May 2026*
