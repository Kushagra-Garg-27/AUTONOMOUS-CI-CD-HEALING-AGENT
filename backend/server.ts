import "dotenv/config";
import cors from "cors";
import express from "express";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { AGENT_PIPELINE, runAgentGraph } from "./agents/graphAgents";
import { generateBranchName } from "./services/branch";
import { RunRepository, closePool, initPool, isPoolReady } from "./persistence";
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

/* ── CORS — Enterprise-grade, environment-aware configuration ────────────
 *
 * • Production:  only the Vercel frontend is allowed.
 * • Development: localhost origins on common dev ports are also allowed.
 * • Origins are read from the CORS_ALLOWED_ORIGINS env var (comma-separated)
 *   so they can be rotated without a code change.
 * • The middleware is scoped to the /api namespace only — static assets and
 *   health-check HTML pages are never decorated with CORS headers.
 * ────────────────────────────────────────────────────────────────────────── */

const PRODUCTION_ORIGINS = [
  "https://autonomous-ci-cd-healing-agent.vercel.app",
];

const DEV_ORIGINS = [
  "http://localhost:5173", // Vite default
  "http://localhost:3000",
  "http://localhost:4173", // Vite preview
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
];

const isProduction = process.env.NODE_ENV === "production";

/** Build the final allowlist from env + hard-coded safe defaults. */
const buildAllowedOrigins = (): Set<string> => {
  const origins = new Set<string>(PRODUCTION_ORIGINS);

  // Merge any extra origins supplied via env (useful for staging / preview URLs)
  const envOrigins = process.env.CORS_ALLOWED_ORIGINS;
  if (envOrigins) {
    envOrigins
      .split(",")
      .map((o) => o.trim().replace(/\/+$/, ""))
      .filter(Boolean)
      .forEach((o) => origins.add(o));
  }

  // In non-production environments, also allow localhost origins
  if (!isProduction) {
    DEV_ORIGINS.forEach((o) => origins.add(o));
  }

  return origins;
};

const allowedOrigins = buildAllowedOrigins();

console.log(
  `[cors] Allowed origins (${isProduction ? "production" : "development"}):`,
  [...allowedOrigins],
);

const corsOptions: cors.CorsOptions = {
  /**
   * Dynamic origin validation — never falls back to wildcard "*".
   * If the request origin is not in the allowlist the callback receives
   * `false`, which causes the cors package to omit the
   * Access-Control-Allow-Origin header entirely (browser blocks the request).
   */
  origin(requestOrigin, callback) {
    // Server-to-server calls (curl, Postman, etc.) have no Origin header.
    // Allow these — they are not subject to browser CORS enforcement.
    if (!requestOrigin) {
      return callback(null, true);
    }
    if (allowedOrigins.has(requestOrigin)) {
      return callback(null, requestOrigin);
    }
    console.warn(`[cors] Blocked request from disallowed origin: ${requestOrigin}`);
    return callback(new Error("CORS: origin not allowed"), false);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: true,
  optionsSuccessStatus: 204, // Some legacy browsers choke on 200 for preflight
  maxAge: 86400, // Cache preflight for 24 h — reduces OPTIONS traffic
};

// Scoped to /api — only API routes get CORS headers
app.use("/api", cors(corsOptions));

// Explicit preflight handler for the /api namespace so that
// no downstream route accidentally shadows the OPTIONS response.
app.options("/api/*", cors(corsOptions));

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
      status: "ok",
      persistence: "postgres",
      poolReady: isPoolReady(),
      defaultRetryLimit: DEFAULT_RETRY_LIMIT,
      activeRuns: Number(rows[0]?.count ?? 0),
      orchestration: {
        framework: "langgraph",
        mode: "multi-agent",
        agents: [...AGENT_PIPELINE],
      },
    });
  } catch (err) {
    console.error("[health] DB query failed:", err);
    res.status(503).json({
      status: "error",
      persistence: "postgres",
      poolReady: isPoolReady(),
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

/* ── Boot: verify DB then start listening ── */

const boot = async () => {
  try {
    await initPool();
    console.log("[server] Database connection verified — starting HTTP server");
  } catch (err) {
    console.error(
      "[server] ⚠ Database connection failed at startup. " +
        "Server will start anyway, but /api/agent/health will report unhealthy.",
    );
    console.error("[server] Fix DATABASE_URL and redeploy.");
  }
};

let server: ReturnType<typeof app.listen>;

boot().then(() => {
  server = app.listen(port, () => {
    console.log(`Agent API listening on http://localhost:${port}`);
  });
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
  if (server) server.close();
  await closePool();
  process.exit(0);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
