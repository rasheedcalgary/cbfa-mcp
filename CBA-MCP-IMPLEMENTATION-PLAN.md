# CBA-MCP Implementation Plan
**Custom Branded Apps — MCP Server for Cursor Agent**

---

## Overview

| Metric | Value |
|---|---|
| Total Phases | 5 |
| Total MCP Tools | 10 |
| Estimated Hackathon Days | 3 |
| Credentials Needed (MVP) | 3 |

> **Hackathon Scope:** MVP runs locally via `stdio` — no deployment, no server, no infrastructure needed.
> 7 of 10 tools work from your existing CSV dump in S3. Only AWS credentials + Bitrise token required
> for a fully working demo.

---

## Implementation Phases

| Phase | Name | What You Build | Est. Time | Dependencies |
|---|---|---|---|---|
| 1 | Project Scaffold | TypeScript MCP server, folder structure, `.env` setup, Cursor `mcp.json` config wired to `stdio` | 2–3 hrs | Node.js installed |
| 2 | Data Layer | S3 CSV downloader, in-memory app registry, CSV parser matching unified schema | 3–4 hrs | AWS credentials, S3 bucket with CSV dump |
| 3 | Read Tools (7 tools) | `list_apps`, `get_app_info`, `get_ios_status`, `get_android_status`, `get_app_last_updated`, `get_pending_apps`, `get_stale_apps` | 4–6 hrs | Phase 2 complete |
| 4 | Action Tools (2 tools) | `trigger_app_build` + `get_build_status` via Bitrise REST API | 2–3 hrs | Bitrise Personal Access Token |
| 5 | Polish & Demo | Error handling, formatted responses, Cursor integration test, hackathon demo script | 2 hrs | All phases complete |

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Language | TypeScript + Node.js | Official MCP SDK is TS-first, best tooling and type safety |
| MCP SDK | `@modelcontextprotocol/sdk` | Official Anthropic SDK — handles all protocol boilerplate, tool registration, stdio transport |
| S3 + CSV | `aws-sdk v3` + `csv-parse` | Download CSV dump from existing S3 bucket, parse into memory |
| Bitrise API | `axios` | REST calls to trigger builds and poll build status |
| Transport | `stdio` (local) | Zero config — Cursor manages the process lifecycle automatically |
| Secrets | `.env` + `dotenv` | API keys injected as env vars, never committed to git |

---

## Credentials Needed

| Credential | Required For | MVP? | Where to Get It |
|---|---|---|---|
| `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` | Download CSV dump from S3 | **Yes** | AWS IAM — read-only S3 access to existing bucket |
| `AWS_REGION` + `S3_BUCKET` + `S3_KEY` | S3 path to the CSV file | **Yes** | Your existing S3 setup in `cbfa-scripts/aws/` |
| `BITRISE_TOKEN` | `trigger_app_build`, `get_build_status` | **Yes (action tools)** | Bitrise → Profile → Security → Personal Access Token |
| App Store Connect `.p8` keys | `get_ios_status` with live real-time data | No — CSV covers this | Already in `apps_prod/<appCode>/<appCode>.p8` |
| Google Play Service Account JSON | `get_android_status` with live real-time data | No — CSV covers this | Already as `GooglePlayKey.json` per app in `apps_prod/` |
| `API_KEY` + `API_DOMAIN` | Trainerize Admin Tool queries | No — CSV covers this | `cbfaTemplate` file — `API_KEY` + `API_DOMAIN` env vars |

> **Minimum to start building right now:** AWS credentials + S3 path to CSV + Bitrise token.
> That gives you 9 of 10 tools working. Everything else is optional for post-hackathon.

---

## Tool Build Order

| # | Tool | Type | Data Source | Difficulty | Phase |
|---|---|---|---|---|---|
| 1 | `list_apps` | Query | CSV from S3 | Easy | 3 |
| 2 | `get_app_info` | Query | CSV from S3 | Easy | 3 |
| 3 | `get_pending_apps` | Query | CSV from S3 | Easy | 3 |
| 4 | `get_ios_status` | Query | CSV from S3 | Easy | 3 |
| 5 | `get_android_status` | Query | CSV from S3 | Easy | 3 |
| 6 | `get_app_last_updated` | Query | CSV from S3 | Medium | 3 |
| 7 | `get_stale_apps` | Intelligence | CSV from S3 | Medium | 3 |
| 8 | `get_build_status` | Query | Bitrise API | Easy | 4 |
| 9 | `trigger_app_build` | Action | Bitrise API | Medium | 4 |
| 10 | `check_cert_validity` | Action | Apple API (`.p8`) | Hard | Post-MVP |

---

## Project Folder Structure

```
cba-mcp/
├── src/
│   ├── index.ts                        # MCP server entry point, registers all tools, starts stdio transport
│   ├── tools/
│   │   ├── list-apps.ts                # list_apps — filter apps by type, return name + bundle ID + team
│   │   ├── get-app-info.ts             # get_app_info — full details for a single app
│   │   ├── get-ios-status.ts           # get_ios_status — iOS version, App Store state, key validity
│   │   ├── get-android-status.ts       # get_android_status — Android version, Play Store state, key validity
│   │   ├── get-app-last-updated.ts     # get_app_last_updated — last release dates iOS + Android
│   │   ├── get-pending-apps.ts         # get_pending_apps — PendingPublishList, PendingAppleSubmission, etc.
│   │   ├── get-stale-apps.ts           # get_stale_apps — cross-reference last update dates against threshold
│   │   ├── trigger-build.ts            # trigger_app_build — fire a Bitrise workflow for an app
│   │   └── get-build-status.ts         # get_build_status — poll Bitrise build status by build number
│   ├── data/
│   │   ├── s3Client.ts                 # AWS S3 CSV downloader using aws-sdk v3
│   │   ├── csvParser.ts                # parse unified CSV into typed AppRecord array
│   │   └── appRegistry.ts             # in-memory store, startup load, refresh-on-demand
│   └── clients/
│       └── bitrise.ts                  # Bitrise REST API client (trigger + status)
├── .env                                # AWS keys, Bitrise token (gitignored)
├── .env.example                        # Template with all required env var names
├── package.json                        # deps: @modelcontextprotocol/sdk, @aws-sdk/client-s3, csv-parse, axios, dotenv
└── tsconfig.json
```

---

## CSV Schema (Unified — One Row Per App)

```
bundle_id, display_name, app_type, team_name, group_id, apple_id, abc_app_type,
ios_version, app_store_state, apple_key_valid, watch_face,
android_version, android_store_state, google_key_valid,
last_ios_updated, last_android_updated,
bitrise_workflow, dump_date
```

### Column Reference

| Column | Type | Source | Used By |
|---|---|---|---|
| `bundle_id` | string | settings file | All tools (primary key) |
| `display_name` | string | settings file | All tools |
| `app_type` | string | `enterprise` / `studio` / `pro` / `abc` | `list_apps`, `get_stale_apps` |
| `team_name` | string | settings file | `get_app_info` |
| `group_id` | string | settings file | `get_app_info` |
| `apple_id` | string | settings file (without @trainerize.com) | `get_app_info`, `get_ios_status` |
| `abc_app_type` | string | settings file (ABC only, else `N/A`) | `list_apps` |
| `ios_version` | string | App Store Connect | `get_ios_status`, `get_app_last_updated` |
| `app_store_state` | string | App Store Connect | `get_ios_status` |
| `apple_key_valid` | string | `.p8` key check | `get_ios_status`, `check_cert_validity` |
| `watch_face` | string | settings file | `get_app_info` |
| `android_version` | string | Google Play API | `get_android_status`, `get_app_last_updated` |
| `android_store_state` | string | Google Play API | `get_android_status` |
| `google_key_valid` | string | `GooglePlayKey.json` check | `get_android_status`, `check_cert_validity` |
| `last_ios_updated` | date | App Store Connect | `get_app_last_updated`, `get_stale_apps` |
| `last_android_updated` | date | Google Play API | `get_app_last_updated`, `get_stale_apps` |
| `bitrise_workflow` | string | settings / type mapping | `trigger_app_build` |
| `dump_date` | datetime | generated at dump time | Tells MCP how fresh the data is |

---

## Cursor mcp.json Config

Add this to `~/.cursor/mcp.json` to connect CBA-MCP to Cursor:

```json
{
  "mcpServers": {
    "cba-mcp": {
      "command": "node",
      "args": ["/path/to/cba-mcp/dist/index.js"],
      "env": {
        "AWS_ACCESS_KEY_ID": "your-key-id",
        "AWS_SECRET_ACCESS_KEY": "your-secret",
        "AWS_REGION": "us-east-1",
        "S3_BUCKET": "your-bucket-name",
        "S3_KEY": "path/to/cba_apps_dump.csv",
        "BITRISE_TOKEN": "your-bitrise-token"
      }
    }
  }
}
```

Cursor auto-starts the server on launch. Green dot in **Cursor Settings → MCP** confirms it's live.

---

## Tool Expected Outputs (Summary)

### `list_apps` — *"List all enterprise apps"*
Returns: table of app code, display name, group ID, team — filtered by type.

### `get_app_info` — *"Give me all info about com.trainerize.peakfitness"*
Returns: full record — bundle ID, display name, app type, team, group ID, Apple account, Bitrise workflow, watch face status.

### `get_ios_status` — *"What's the iOS App Store status of com.trainerize.peakfitness?"*
Returns: current version, App Store state (Ready for Sale / In Review / Rejected), Apple key validity.

### `get_android_status` — *"Is com.trainerize.peakfitness live on Android?"*
Returns: current version, Play Store state, Google Play key validity.

### `get_app_last_updated` — *"When was com.trainerize.peakfitness last updated?"*
Returns: iOS release date + days ago, Android release date + days ago, freshness status.

### `get_pending_apps` — *"What apps are stuck in pending queues?"*
Returns: apps grouped by queue — PendingPublishList, PendingAppleSubmission, PendingAppleAgreement, PendingGooglePlayKey.

### `get_stale_apps` — *"Which enterprise apps haven't been updated in 6 months?"*
Returns: list of apps past threshold with last update dates and days stale.

### `trigger_app_build` — *"Trigger an iOS build for com.trainerize.peakfitness"*
Returns: build number, status (queued), Bitrise build URL.

### `get_build_status` — *"Is the build for com.trainerize.peakfitness done?"*
Returns: build number, status (queued / running / succeeded / failed), duration, logs URL.

### `check_cert_validity` *(Post-MVP)*  — *"Are certs valid for all cba-studio apps?"*
Returns: per-app push cert + provisioning profile validity + expiry countdown.

---

## Post-Hackathon Roadmap

| Phase | What | Effort |
|---|---|---|
| 6 | `check_cert_validity` — Apple push cert + provisioning profile expiry check | 1–2 days |
| 7 | Deploy to EC2 or Cloud Run with HTTP/SSE transport for team-wide access | 1 day |
| 8 | Add Google OAuth restricted to `@trainerize.com` emails | 1 day |
| 9 | Replace CSV with live App Store Connect + Google Play API calls for real-time data | 2–3 days |
| 10 | Migrate app registry to Firestore — auto-sync on every build, no CSV needed | 2 days |

---

## Authentication Strategy

| Stage | Setup | Auth Method | Effort |
|---|---|---|---|
| Hackathon (local) | `stdio` on MacBook | None needed | Zero |
| Team pilot (remote) | EC2 / Cloud Run | Static API key in `Authorization` header | 30 mins |
| Full team rollout | EC2 / Cloud Run | Google OAuth (`@trainerize.com` only) | 1 day |
| Production | EC2 behind VPN | VPN + Google OAuth | 2 days |

---

*Generated: May 12, 2026 — Trainerize CBA Hackathon*
