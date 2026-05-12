<div align="center">

<img src="https://img.shields.io/badge/MCP-Server-00d4e8?style=for-the-badge&logoColor=white" />
<img src="https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=node.js&logoColor=white" />
<img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
<img src="https://img.shields.io/badge/License-MIT-f5c842?style=for-the-badge" />

<br /><br />

</div>

---

## ✨ What it does

> 11 tools that let any AI agent query, filter, and inspect the full CBA app portfolio in seconds.

| | Capability |
|:---:|---|
| 🔍 | Query every app's status, store state, iOS/Android version, and key validity |
| 🎯 | AND-filter by version, CBA status, App Store state, iOS membership, type, and business |
| ⏳ | Find apps stuck in publish queues — including `AgreementIsMissing` membership blocks |
| 🔐 | Check Apple push cert and provisioning profile expiry — single app or bulk scan |
| 📊 | Flexible report-style queries across any combination of fields |
| 🏗️ | Trigger iOS/Android builds via Bitrise or Jenkins *(Phase 4)* |

---

## 🚀 Quickstart

> **Prerequisites:** Node.js 20+, AWS S3 read access, Bitrise token *(for build tools)*

### Step 1 — Clone & install

```bash
git clone git@github.com:rasheedcalgary/cbfa-mcp.git
cd cbfa-mcp && npm install
```

### Step 2 — Configure server credentials

```bash
cp .env.example .env
```

| Variable | Purpose |
|---|---|
| `ADMIN_PANEL_DOMAIN` | Admin Panel API base URL |
| `BITRISE_TOKEN` | Bitrise build tools |
| `JENKINS_URL` + `JENKINS_USER` + `JENKINS_API_KEY` | Jenkins *(optional)* |
| `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` + `S3_BUCKET` + `S3_KEY` | CSV data layer |

> 💡 `ADMIN_PANEL_API_KEY` is **not** in `.env` — each user supplies it in their own agent config (Step 4). This is the only value users need to provide.

### Step 3 — Build

```bash
npm run build
```

### Step 4 — Connect to your agent

<details>
<summary><b>🖥️ Cursor / Claude Desktop (stdio)</b> — click to expand</summary>

Add this to `~/.cursor/mcp.json` or `claude_desktop_config.json`:

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

`npm --prefix` sets the working directory automatically — no separate `cwd` needed. Restart your agent and look for a green dot in **Settings → MCP**.

</details>

<details>
<summary><b>🌐 Remote agents — HTTP transport</b> — click to expand</summary>

```bash
TRANSPORT=http npm start
# Server starts on http://localhost:3000
```

| Endpoint | Protocol | Compatible with |
|---|---|---|
| `POST /mcp` | MCP Streamable HTTP | Claude.ai, OpenAI Agents SDK, MCP Inspector |
| `GET /sse` + `POST /message` | MCP SSE (legacy) | LangChain, n8n, older frameworks |
| `GET /health` | HTTP | Load balancers, uptime monitors |

</details>

---

## 🛠️ Available tools

### 📖 Read tools — require `ADMIN_PANEL_API_KEY`

| Tool | What it does |
|---|---|
| `list_apps` | List all CBA apps, filter by type |
| `get_app_info` | Full details — CSV data + live Admin API (push cert, store links, theme config) |
| `get_ios_status` | iOS version, App Store state, iOS membership status, Apple account |
| `get_android_status` | Android version, Play Store state, Play account |
| `get_app_last_updated` | Last iOS/Android publish dates with freshness rating |
| `get_pending_apps` | Apps in publish queues — Apple submission, agreement, missing iOS membership, missing Play key |
| `get_stale_apps` | Apps not updated within a configurable threshold (default 180 days) |
| `get_build_queue` | Live CI build queue — ReadyToBuild / Building / Built / Failed |
| `query_apps` | Flexible AND-filter report: version + status + store state + iOS membership + type + business |
| `check_cert_validity` | Apple push cert + provisioning profile check — single app or bulk scan with expiry threshold |

### ⚡ Action tools — require `BITRISE_TOKEN` or Jenkins credentials

| Tool | What it does |
|---|---|
| `trigger_app_build` | Trigger an iOS or Android build on Bitrise or Jenkins |
| `get_build_status` | Poll build state, duration, and log URL |

---

## 💬 Example queries

> All prompts below are **✅ verified working** — copy and paste directly into your agent.

<details open>
<summary><b>📱 App info</b></summary>

```
Give me all info about com.trainerize.peakfitness
List all enterprise apps
List all ABC studio apps
```

</details>

<details open>
<summary><b>🍎 iOS & Android status</b></summary>

```
Is com.trainerize.peakfitness live on the App Store?
What's the Android status of com.trainerize.workoutanytime?
Show me all apps where iOS store state is ReadyForSale
```

</details>

<details open>
<summary><b>🔢 Version filtering</b></summary>

```
List all iOS 8.16.0 Published apps
Which apps are running Android version 8.10.3?
```

</details>

<details open>
<summary><b>⏳ Queues & stale apps</b></summary>

```
What apps are pending Apple review right now?
Which apps are waiting for artwork?
Which apps have a missing Google Play account?
Which enterprise apps haven't shipped in 6 months?
```

</details>

<details open>
<summary><b>🏗️ Build queue</b></summary>

```
What iOS apps are ready to build in the queue?
Show me apps currently building on Android
Which apps failed their last build?
```

</details>

<details open>
<summary><b>📊 Flexible reports — <code>query_apps</code></b></summary>

```
List all iOS 8.16.0 Published enterprise apps
Show me ABC apps that are WaitingForArtwork
Which Trainerize studio apps are ReadyForSale on iOS?
Top 20 apps with Android 8.12.0 and Published status
```

</details>

<details open>
<summary><b>🔐 Push certs & provisioning — <code>check_cert_validity</code></b></summary>

```
Check cert validity for com.trainerize.peakfitness
Which enterprise apps have push certs expiring in the next 30 days?
Are there any expired push certs across ABC studio apps?
Show all apps with certs expiring within 60 days
```

</details>

<details open>
<summary><b>🪪 iOS membership — <code>AgreementIsMissing</code></b></summary>

```
Which apps have AgreementIsMissing in iOS membership?
Show me ABC studio apps with AgreementIsMissing
What apps are in the MissingIOSMembership pending queue?
Which enterprise apps have an iOS membership issue?
```

</details>

---

## 🗺️ Roadmap

| Phase | Status | Description |
|---|:---:|---|
| 1 — Scaffold | ✅ | Transports, auth guards, tool stubs, structured logging, CLI banner |
| 2 — Data layer | ✅ | S3 CSV downloader, parser, in-memory app registry |
| 3 — Read tools | ✅ | All 10 read tools live with real CSV + Admin API data |
| 3.1 — Reports | ✅ | `query_apps` flexible filter + log redaction security |
| 3.2 — Cert validity | ✅ | `check_cert_validity` via existing Admin API |
| 3.3 — iOS Membership | ✅ | `IOSMembership` mapped; `AgreementIsMissing` filter across tools |
| 4 — Action tools | ⏳ | Bitrise + Jenkins build trigger/status |
| 5 — Deploy | 🔮 | EC2 / Cloud Run with HTTP transport |

---

## 🔧 Development

```bash
npm run dev           # stdio mode + hot reload
npm run dev:http      # HTTP mode + hot reload
npm run build         # production build → dist/
npm run typecheck     # TypeScript check only
```

---

## 🔑 Auth errors

Every tool returns a clear, actionable message when credentials are missing — no silent failures. All API keys and tokens are automatically **redacted from server logs**.

```
Authentication failed — ADMIN_PANEL_API_KEY missing.
Set it in your mcp.json env block:

  ADMIN_PANEL_API_KEY=your-api-key
```

---

## 📁 Project structure

```
cbfa-mcp/
├── src/
│   ├── index.ts            # Entry point — picks transport from TRANSPORT env
│   ├── server.ts           # McpServer + tool proxy for logging
│   ├── config.ts           # Typed env config + credential status log
│   ├── banner.ts           # Decorative CLI startup banner
│   ├── logger.ts           # Structured stderr logging + sensitive field redaction
│   ├── auth/validator.ts   # Auth guards — throws descriptive McpError on missing creds
│   ├── clients/            # Axios clients: admin-panel, bitrise, jenkins
│   ├── data/               # S3 downloader, CSV parser, in-memory app registry
│   ├── tools/read/         # 10 read tools
│   ├── tools/action/       # 2 action tools (stubs)
│   └── transport/          # stdio + HTTP (Streamable + SSE) transports
└── .env.example            # Credential template
```

---

<div align="center">

Built with ❤️ at the **Trainerize CBA Hackathon** · May 2026

**© 2026 ABC Fitness Solutions**

[![GitHub](https://img.shields.io/badge/GitHub-cbfa--mcp-181717?style=flat-square&logo=github)](https://github.com/rasheedcalgary/cbfa-mcp)

</div>
