import "dotenv/config";
import cors from "cors";
import express from "express";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { AGENT_PIPELINE, runAgentGraph } from "./agents/graphAgents";
import { generateBranchName } from "./services/branch";
import { RunRepository, closePool } from "./persistence";
import { validateRunPayload } from "./services/validatePayload";
import type { RunResult } from "./types/agent";

const app = express();
const port = Number(process.env.PORT ?? 8080);
const DEFAULT_RETRY_LIMIT = Number(process.env.AGENT_RETRY_LIMIT ?? 5);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..");
const runsRoot = path.join(workspaceRoot, "runs");
const publicResultsPath = path.join(workspaceRoot, "public", "results.json");

app.use(cors());
app.use(express.json());

const clampRetryLimit = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_RETRY_LIMIT;
  }
  return Math.min(20, Math.max(1, Math.floor(parsed)));
};

const persistRunResult = async (runId: string, result: unknown) => {
  const runDir = path.join(runsRoot, runId);
  await mkdir(runDir, { recursive: true });
  await writeFile(
    path.join(runDir, "results.json"),
    JSON.stringify(result, null, 2),
    "utf8",
  );
  await writeFile(publicResultsPath, JSON.stringify(result, null, 2), "utf8");
};

app.get("/api/agent/health", async (_req, res) => {
  try {
    const { query: dbQuery } = await import("./persistence/db");
    const { rows } = await dbQuery<{ count: string }>(
      `SELECT count(*) FROM runs WHERE status = 'running'`,
    );
    res.json({
      ok: true,
      defaultRetryLimit: DEFAULT_RETRY_LIMIT,
      activeRuns: Number(rows[0]?.count ?? 0),
      persistence: "postgres",
      orchestration: {
        framework: "langgraph",
        mode: "multi-agent",
        agents: [...AGENT_PIPELINE],
      },
    });
  } catch (err) {
    res.status(503).json({
      ok: false,
      error: err instanceof Error ? err.message : "Database unreachable",
    });
  }
});

app.post("/api/agent/runs", validateRunPayload, async (req, res) => {
  // Values are already sanitised & normalised by validateRunPayload middleware
  const repoUrl = req.body.repoUrl as string;
  const teamName = req.body.teamName as string;
  const leaderName = req.body.leaderName as string;
  const retryLimit = clampRetryLimit(req.body?.retryLimit);

  const runId = randomUUID();
  const branchName = generateBranchName(teamName, leaderName);

  // ── Persist the run in Postgres before starting ──
  await RunRepository.create({
    id: runId,
    repoUrl,
    teamName,
    leaderName,
    retryLimit,
    branchName,
  });

  try {
    const result = await runAgentGraph({
      runId,
      repoUrl,
      teamName,
      leaderName,
      retryLimit,
    });

    // The orchestration layer already persists intermediate state to Postgres.
    // Here we just write the final JSON files for backward compatibility.
    await persistRunResult(runId, result);

    res.status(201).json({ runId, status: "completed", result });
  } catch (error) {
    const fallbackResult: RunResult = {
      executionTime: 0,
      ciStatus: "failed",
      failuresCount: 1,
      fixesCount: 0,
      commitCount: 0,
      fixesTable: [],
      timeline: [
        {
          iteration: 1,
          result: "failed",
          timestamp: new Date().toISOString(),
          retryCount: 1,
          retryLimit,
        },
      ],
      baseScore: 100,
      speedBonus: 0,
      efficiencyPenalty: 0,
      repoUrl,
      generatedBranchName: generateBranchName(teamName, leaderName),
      analysisSummary: {
        totalFiles: 0,
        dominantLanguage: "Unknown",
        samplePaths: [],
        detectedIssues: [],
      },
      testResults: {
        passed: false,
        exitCode: -1,
        stdout: "",
        stderr: error instanceof Error ? error.message : "Unknown run error",
        durationMs: 0,
        failedTests: [],
        errorSummary:
          error instanceof Error ? error.message : "Unknown run error",
        executionMethod: "skipped",
      },
      projectType: "unknown",
    };

    const errorMsg =
      error instanceof Error ? error.message : "Unknown run error";

    await RunRepository.transitionStatus(runId, "failed", errorMsg, {
      error: errorMsg,
      finishedAt: new Date().toISOString(),
    });
    await persistRunResult(runId, fallbackResult);
    res.status(500).json({ runId, status: "failed", error: errorMsg });
  }
});

app.get("/api/agent/runs/:runId", async (req, res) => {
  const run = await RunRepository.findById(req.params.runId);
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  res.json(run);
});

app.get("/api/agent/runs/:runId/results", async (req, res) => {
  const result = await RunRepository.getFullResult(req.params.runId);
  if (!result) {
    res.status(404).json({ error: "Run result not found" });
    return;
  }
  res.json(result);
});

const server = app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Agent API listening on http://localhost:${port}`);
});

app.post("/api/sandbox/callback", async (req, res) => {
  const { runId, status } = req.body;

  console.log("Sandbox callback received:", req.body);

  const run = await RunRepository.findById(runId);

  if (!run) {
    return res.status(404).json({ error: "Run not found" });
  }

  await RunRepository.transitionStatus(
    runId,
    status ?? "completed",
    "Sandbox callback",
    { finishedAt: new Date().toISOString() },
  );

  res.json({ ok: true });
});

/* ── Graceful shutdown ── */

const gracefulShutdown = async (signal: string) => {
  console.log(`\n[server] ${signal} received — shutting down…`);
  server.close();
  await closePool();
  process.exit(0);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
