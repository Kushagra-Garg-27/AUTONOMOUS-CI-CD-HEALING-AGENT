# Autonomous CI/CD Healing Control Plane

AI-driven system that accepts a GitHub repository URL, analyzes actionable source files in a Docker sandbox, runs a multi-agent remediation pipeline, and presents execution metrics/fixes in a React dashboard.

## Canonical App Structure

- `frontend/` → **Primary dashboard frontend** (active UI)
- `backend/` → Express API + LangGraph multi-agent orchestration
- `runs/` → Per-run `results.json` artifacts
- `src/` → Legacy root frontend code (not the active dashboard target)

## Multi-Agent Architecture

Implemented with LangGraph in `backend/agents/graphAgents.ts`:

1. `planner`
2. `analyzer`
3. `remediator`
4. `scorer`

Flow: `START -> planner -> analyzer -> remediator -> scorer -> END`

## How To Run (Consolidated)

From repo root:

```bash
npm install
npm run dev
```

This now starts:
- backend server (`npm run dev:server`)
- canonical frontend from `frontend/` (`npm run dev:client`)

## Build

From repo root:

```bash
npm run build
```

This builds the canonical `frontend/` app.

## API Endpoints

- `GET /api/agent/health`
- `POST /api/agent/runs`
- `GET /api/agent/runs/:runId`
- `GET /api/agent/runs/:runId/results`

## Notes

- Backend defaults to port `8080`.
- Frontend dev proxy (`frontend/vite.config.js`) forwards `/api` to `http://localhost:8080`.
- Docker must be installed/running for repository analysis.
