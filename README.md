# CBA-MCP

**Custom Branded Apps MCP Server** — gives AI agents (Cursor, Claude Desktop, OpenAI Agents SDK, LangChain, n8n, and any MCP-compatible client) natural-language access to the Trainerize Custom Branded Apps platform.

Built for the Trainerize CBA Hackathon, May 2026. · 🌐 **[Live docs →](https://rasheedcalgary.github.io/cbfa-mcp/)**

---

## What it does

10 tools that let an AI agent query 30,000+ custom-branded apps — no SQL, no dashboards, just plain English.

- ✅ Query every app's status, store state, and key validity
- ✅ Filter by iOS/Android version, CBA status, App Store state, iOS membership, app type, and business type
- ✅ Find apps stuck in publishing queues or overdue for a release — including `AgreementIsMissing` membership issues
- ✅ Check Apple push cert and provisioning profile expiry — single app or bulk scan
- ✅ Flexible AND-filter reports across any combination of fields
- ⏳ Trigger iOS/Android builds via Bitrise or Jenkins *(Phase 4)*

---

## Quickstart

**Prerequisites:** Node.js 20+, AWS S3 read access, Bitrise token (for build tools)

### 1. Install
```bash
git clone git@github.com:rasheedcalgary/cbfa-mcp.git
cd cbfa-mcp && npm install
```

### 2. Configure server credentials
```bash
cp .env.example .env   # fill in server-side infra credentials
```

| Variable | Purpose |
|---|---|
| `ADMIN_PANEL_DOMAIN` | Admin Panel API base URL |
| `BITRISE_TOKEN` | Bitrise build tools |
| `JENKINS_URL` + `JENKINS_USER` + `JENKINS_API_KEY` | Jenkins (optional) |
| `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` + `S3_BUCKET` + `S3_KEY` | CSV data layer |

> `ADMIN_PANEL_API_KEY` is **not** in `.env` — each user supplies it themselves in their agent config (Step 4).

### 3. Build
```bash
npm run build
```

### 4. Connect to your agent

**Cursor / Claude Desktop (stdio)**
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
`npm --prefix` sets the working directory automatically — no separate `cwd` needed.

**Remote agents (HTTP)**
```bash
TRANSPORT=http npm start   # listens on :3000 (override with PORT=)
```

| Endpoint | Protocol | Compatible with |
|---|---|---|
| `POST /mcp` | MCP Streamable HTTP | Claude.ai, OpenAI Agents SDK, MCP Inspector |
| `GET /sse` + `POST /message` | MCP SSE (legacy) | LangChain, n8n |
| `GET /health` | HTTP | Load balancers |

---

## Available tools

### ✅ Read tools — require `ADMIN_PANEL_API_KEY`

| Tool | Description |
|---|---|
| `list_apps` | List all CBA apps, filter by type |
| `get_app_info` | Full details — CSV registry + live Admin API (push cert, store links, theme) |
| `get_ios_status` | iOS version, App Store state, iOS membership status, and Apple account |
| `get_android_status` | Android version, Play Store state, Play account |
| `get_app_last_updated` | Last iOS/Android publish dates with freshness rating |
| `get_pending_apps` | Apps stuck in publish queues — Apple submission, agreement, missing iOS membership (`AgreementIsMissing`), or missing Play key |
| `get_stale_apps` | Apps not updated within a configurable threshold (default 180 days) |
| `get_build_queue` | Live build queue state — ReadyToBuild / Building / Built / Failed |
| `query_apps` | Flexible AND-filter report: version + status + store state + iOS membership + type + business |
| `check_cert_validity` | Apple push cert + provisioning profile validity — single app or bulk scan with expiry threshold |

### ⏳ Action tools — require `BITRISE_TOKEN` or Jenkins credentials *(Phase 4 — in progress)*

| Tool | Description |
|---|---|
| `trigger_app_build` | Trigger an iOS or Android build on Bitrise or Jenkins |
| `get_build_status` | Poll build state, duration, and log URL |

---

## Example queries

All prompts below are ✅ verified working.

**App info**
```
Give me all info about com.trainerize.peakfitness
List all enterprise apps
List all ABC studio apps
```

**iOS & Android status**
```
Is com.trainerize.peakfitness live on the App Store?
What's the Android status of com.trainerize.workoutanytime?
Show me all apps where iOS store state is ReadyForSale
```

**Version filtering**
```
List all iOS 8.16.0 Published apps
Which apps are running Android version 8.10.3?
```

**Queues & stale apps**
```
What apps are pending Apple review right now?
Which apps are waiting for artwork?
Which apps have a missing Google Play account?
Which enterprise apps haven't shipped in 6 months?
```

**Build queue**
```
What iOS apps are ready to build in the queue?
Show me apps currently building on Android
Which apps failed their last build?
```

**Flexible reports (`query_apps`)**
```
List all iOS 8.16.0 Published enterprise apps
Show me ABC apps that are WaitingForArtwork
Which Trainerize studio apps are ReadyForSale on iOS?
Top 20 apps with Android 8.12.0 and Published status
```

**Push cert & provisioning profiles (`check_cert_validity`)**
```
Check cert validity for com.trainerize.peakfitness
Which enterprise apps have push certs expiring in the next 30 days?
Are there any expired push certs across ABC studio apps?
Show all apps with certs expiring within 60 days
```

**iOS membership (`query_apps` / `get_pending_apps`)**
```
Which apps have AgreementIsMissing in iOS membership?
Show me ABC studio apps with AgreementIsMissing
What apps are in the MissingIOSMembership pending queue?
Which enterprise apps have an iOS membership issue?
```

---

## Development

```bash
npm run dev           # stdio + hot reload
npm run dev:http      # HTTP + hot reload
npm run build         # production build → dist/
npm run typecheck     # type check only
```

---

## Auth errors

Every tool returns a specific, actionable message on missing credentials — no silent failures. All sensitive values are automatically redacted from server logs.

```
Authentication failed — ADMIN_PANEL_API_KEY missing.
Set it in your mcp.json env block:

  ADMIN_PANEL_API_KEY=your-api-key
```

---

## Roadmap

| Phase | Status | What |
|---|---|---|
| 1 — Scaffold | ✅ Done | Transports, auth guards, tool stubs, logging, CLI banner |
| 2 — Data layer | ✅ Done | S3 CSV downloader, parser, in-memory app registry |
| 3 — Read tools | ✅ Done | All 9 read tools live with real data + Admin API integration |
| 3.1 — Reports | ✅ Done | `query_apps` flexible filter tool + log redaction security |
| 3.2 — Cert validity | ✅ Done | `check_cert_validity` — push cert + provisioning profile check via existing Admin API |
| 3.3 — iOS Membership | ✅ Done | `IOSMembership` field mapped; `AgreementIsMissing` filter in `query_apps`, `get_ios_status`, `get_pending_apps` |
| 4 — Action tools | ⏳ Pending | Bitrise + Jenkins build trigger/status |
| 5 — Deploy | 🔮 Post-MVP | EC2 / Cloud Run with HTTP transport |

---

## Project structure

```
cbfa-mcp/
├── src/
│   ├── index.ts          # Entry point
│   ├── server.ts         # McpServer + tool wiring
│   ├── config.ts         # Env config + credential status
│   ├── banner.ts         # CLI startup banner
│   ├── logger.ts         # Structured stderr logging + redaction
│   ├── auth/validator.ts # Auth guards
│   ├── clients/          # admin-panel / bitrise / jenkins Axios clients
│   ├── data/             # S3 downloader, CSV parser, app registry
│   ├── tools/read/       # 9 read tools
│   ├── tools/action/     # 2 action tools
│   └── transport/        # stdio + HTTP transports
├── docs/index.html       # GitHub Pages site
└── .env.example
```

---

*Trainerize CBA Hackathon — May 2026*
