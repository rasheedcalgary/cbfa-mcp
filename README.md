<div align="center">

<img src="https://img.shields.io/badge/MCP-Server-00d4e8?style=for-the-badge&logoColor=white" />
<img src="https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=node.js&logoColor=white" />
<img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
<img src="https://img.shields.io/badge/License-MIT-f5c842?style=for-the-badge" />

<br />

**🌐 [cba-mcp.web.app](https://cba-mcp.web.app/) — live demo & docs**

<br />

</div>

---

## ✨ What it does

> 14 tools that let any AI agent query, filter, inspect, build, and diagnose the full CBA app portfolio in seconds.

| | Capability |
|:---:|---|
| 🔍 | Query every app by bundle ID **or by name** — `"Show me all GoodLife apps"` just works |
| 🎯 | AND-filter by version, CBA status, App Store state, iOS membership, type, and business |
| ⏳ | Find apps stuck in publish queues — including `AgreementIsMissing` membership blocks |
| 🔐 | Check Apple push cert and provisioning profile expiry — single app or bulk scan |
| 📊 | Flexible report queries — export to **CSV** or formatted table |
| ⚡ | Trigger iOS builds on Bitrise (`New_App_Creation_Flow` / `DEPLOY_testflight_S3_2026`) |
| 🔎 | Analyse Bitrise (iOS) and Jenkins (Android) build logs — auto-extracts errors with line numbers |
| 🟣 | Debug Glofox CBA CircleCI failures — walks pipeline → workflow → job, extracts root cause |

---

## 🚀 Quickstart

> The MCP server is **already hosted on EC2**. No cloning, no building, no `.env` files.
> All you need is your Admin Panel API key.

### Step 1 — Add one block to your agent config

**Cursor** — open `~/.cursor/mcp.json` and add:

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

**Claude Desktop** — same snippet in `claude_desktop_config.json` under `"mcpServers"`.

Replace `your-api-key` with your Admin Panel API key — that is the **only** credential you need to provide. Everything else (AWS, Bitrise, Jenkins, CircleCI) is already configured on the server.

### Step 2 — Restart your agent

Reload Cursor or Claude Desktop. Look for a green dot next to **cba-mcp-remote** in **Settings → MCP**.

### Step 3 — Start querying

```
Give me all info about com.trainerize.peakfitness
Which enterprise apps have push certs expiring in the next 30 days?
Why did this CircleCI build fail? https://app.circleci.com/pipelines/github/glofoxinc/standalone-app-builder/10014
```

---

<details>
<summary><b>🌐 HTTP / remote agents (OpenAI Agents SDK, LangChain, n8n)</b> — click to expand</summary>

Point your agent directly at the hosted server:

| Endpoint | Protocol | Compatible with |
|---|---|---|
| `POST http://34.219.106.183:3000/mcp` | MCP Streamable HTTP | Claude.ai, OpenAI Agents SDK, MCP Inspector |
| `GET http://34.219.106.183:3000/sse` | MCP SSE (legacy) | LangChain, n8n, older frameworks |
| `GET http://34.219.106.183:3000/health` | HTTP | Load balancers, uptime monitors |

Pass your API key on every request via the `X-Admin-Panel-Api-Key` header (or `Authorization: Bearer <key>`).

</details>

<details>
<summary><b>🔧 Self-hosting / contributing</b> — click to expand</summary>

```bash
git clone git@github.com:rasheedcalgary/cbfa-mcp.git
cd cbfa-mcp && npm install
cp .env.example .env   # fill in AWS, Bitrise, Jenkins, CircleCI, Admin Panel creds
npm run build
TRANSPORT=http npm start
```

| Variable | Purpose |
|---|---|
| `ADMIN_PANEL_DOMAIN` | Admin Panel API base URL |
| `BITRISE_TOKEN` + `BITRISE_APP_SLUG` | Bitrise iOS build trigger, status, log analysis |
| `JENKINS_URL` + `JENKINS_USER` + `JENKINS_API_KEY` | Jenkins Android builds |
| `CIRCLE_CI_TOKEN` | Glofox CircleCI build debugging |
| `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` + `S3_BUCKET` + `S3_KEY` | CSV data layer |

</details>

---

## 🛠️ Available tools

### 📖 Read tools — require `ADMIN_PANEL_API_KEY`

| Tool | What it does |
|---|---|
| `list_apps` | List all CBA apps — filter by type, export as `csv` or `table` |
| `get_app_info` | Full details — CSV data + live Admin API (push cert, store links, theme config) |
| `get_ios_status` | iOS version, App Store state, iOS membership status, Apple account |
| `get_android_status` | Android version, Play Store state, Play account |
| `get_app_last_updated` | Last iOS/Android publish dates with freshness rating |
| `get_pending_apps` | Apps in publish queues — Apple submission, agreement, missing iOS membership, missing Play key. Export as `csv` |
| `get_stale_apps` | Apps not updated within a configurable threshold (default 180 days). Export as `csv` |
| `get_build_queue` | Live CI build queue — ReadyToBuild / Building / Built / Failed |
| `query_apps` | Flexible AND-filter: version + status + store state + iOS membership + **name search** + type + business. Export as `csv` |
| `check_cert_validity` | Apple push cert + provisioning profile — single app or bulk scan with expiry threshold |

### ⚡ Action tools — require `BITRISE_TOKEN` / Jenkins credentials

| Tool | What it does |
|---|---|
| `trigger_app_build` | Trigger an iOS build on Bitrise. `build_type=new_app` → `New_App_Creation_Flow`. `build_type=update` → `DEPLOY_testflight_S3_2026` |
| `get_build_status` | Poll Bitrise build state, duration, workflow, and branch. Suggests log analysis on failure |
| `analyze_build_log` | **Fetch and analyse Bitrise (iOS) or Jenkins (Android) build log.** Auto-detects provider from URL. Extracts 25+ error patterns with line numbers and context |
| `analyze_circleci_build` | **Debug a failed CircleCI build for Glofox CBA apps.** Accepts any `glofoxinc/standalone-app-builder` URL (pipeline / workflow / job). Walks the API tree, fetches step-level logs, applies 30+ error patterns, returns a root-cause summary |

---

## 💬 Example queries

> All prompts below are **✅ verified working** — copy and paste directly into your agent.

<details open>
<summary><b>📱 App info — by name or bundle ID</b></summary>

```
Give me all info about com.trainerize.peakfitness
List all enterprise apps
Find all GoodLife apps
Show apps named "Equinox"
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
<summary><b>📁 CSV exports</b></summary>

```
Export all AgreementIsMissing apps to CSV
Give me a CSV of all stale enterprise apps older than 180 days
Export the pending Apple review queue to CSV
List all studio apps as a CSV file
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

<details open>
<summary><b>⚡ Build triggering & log analysis</b></summary>

```
Trigger a new app build for com.trainerize.peakfitness
Deploy com.trainerize.abcplus to TestFlight
Is the Bitrise build abc123 done?
Why did build https://app.bitrise.io/build/abc123 fail?
Analyse the Jenkins build https://jenkins.example.com/job/CBFA-Android/42/
What went wrong with this build? https://app.bitrise.io/app/de36db0d3356751f/build/dcf6c9e0-...
```

</details>

<details open>
<summary><b>🟣 Glofox CircleCI build debugging</b></summary>

```
Why did this Glofox build fail? https://app.circleci.com/pipelines/github/glofoxinc/standalone-app-builder/10021
Check this CircleCI workflow: https://app.circleci.com/pipelines/github/glofoxinc/standalone-app-builder/10021/workflows/4a76d24d-6b36-427f-a6a9-f1c8e703635e
Debug the failed job in pipeline 10021
```

</details>

---

## 🗺️ Roadmap

| Phase | Status | Description |
|---|:---:|---|
| 1 — Scaffold | ✅ | Transports, auth guards, tool stubs, structured logging, CLI banner |
| 2 — Data layer | ✅ | S3 CSV downloader, parser, in-memory app registry |
| 3 — Read tools | ✅ | All 10 read tools live with real CSV + Admin API data |
| 3.1 — Reports | ✅ | `query_apps` flexible filter + CSV export + name/display_name search |
| 3.2 — Cert validity | ✅ | `check_cert_validity` via existing Admin API |
| 3.3 — iOS Membership | ✅ | `IOSMembership` mapped; `AgreementIsMissing` filter across tools |
| 4 — Action tools | ✅ | Bitrise iOS build trigger, status polling, log analysis (Bitrise + Jenkins) |
| 4.1 — CircleCI debugger | ✅ | `analyze_circleci_build` — Glofox CBA pipeline debugging via CircleCI API |
| 5 — Deploy | ✅ | EC2 with HTTP transport — live at `http://34.219.106.183:3000` |

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
│   ├── index.ts              # Entry point — picks transport from TRANSPORT env
│   ├── server.ts             # McpServer + tool proxy for logging
│   ├── config.ts             # Typed env config + credential status log
│   ├── banner.ts             # Decorative CLI startup banner
│   ├── logger.ts             # Structured stderr logging + sensitive field redaction
│   ├── auth/validator.ts     # Auth guards — throws descriptive McpError on missing creds
│   ├── clients/              # Axios singletons: admin-panel, bitrise, jenkins, circleci
│   ├── data/                 # S3 downloader, CSV parser, in-memory app registry
│   ├── utils/csv.ts          # RFC 4180 CSV serialiser (toCSV helper)
│   ├── tools/read/           # 10 read tools (list, query, status, certs, queues…)
│   ├── tools/action/         # 4 action tools: trigger-build, get-build-status, analyze-build-log, analyze-circleci-build
│   └── transport/            # stdio + HTTP (Streamable + SSE) transports
└── .env.example              # Credential template
```

---

<div align="center">

Built with ❤️ at the **Trainerize CBA Hackathon** · May 2026

**© 2026 ABC Fitness Solutions**

[![Website](https://img.shields.io/badge/Website-cba--mcp.web.app-00d4e8?style=flat-square&logo=firebase&logoColor=white)](https://cba-mcp.web.app/)
[![GitHub](https://img.shields.io/badge/GitHub-cbfa--mcp-181717?style=flat-square&logo=github)](https://github.com/rasheedcalgary/cbfa-mcp)

</div>
