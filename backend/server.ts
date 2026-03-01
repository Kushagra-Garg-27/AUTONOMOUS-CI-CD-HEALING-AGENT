import "dotenv/config";
import cors from "cors";
import express from "express";
import { randomUUID } from "node:crypto";
import { AGENT_PIPELINE } from "./agents/graphAgents.js";
import { generateBranchName } from "./services/branch.js";
import {
  RunRepository,
  DiagnosticsRepository,
  closePool,
  initPool,
  isPoolReady,
} from "./persistence/index.js";
import { validateRunPayload } from "./services/validatePayload.js";
import { enqueueRun, remediationQueue } from "./queue/runQueue.js";
import { remediationWorker } from "./queue/worker.js";

const app = express();
const port = Number(process.env.PORT ?? 8080);
const DEFAULT_RETRY_LIMIT = Number(process.env.AGENT_RETRY_LIMIT ?? 5);

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

app.get("/api/agent/health", async (_req, res) => {
  try {
    const { query: dbQuery } = await import("./persistence/db.js");
    const { rows } = await dbQuery<{ count: string }>(
      `SELECT count(*) FROM runs WHERE status = 'running'`,
    );
    const queueCounts = await remediationQueue.getJobCounts();
    res.json({
      status: "ok",
      persistence: "postgres",
      poolReady: isPoolReady(),
      defaultRetryLimit: DEFAULT_RETRY_LIMIT,
      activeRuns: Number(rows[0]?.count ?? 0),
      queue: {
        waiting: queueCounts.waiting,
        active: queueCounts.active,
        completed: queueCounts.completed,
        failed: queueCounts.failed,
        workerRunning: remediationWorker.isRunning(),
      },
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

  // ── Persist the run in Postgres with status 'queued' ──
  await RunRepository.create({
    id: runId,
    repoUrl,
    teamName,
    leaderName,
    retryLimit,
    branchName,
  });

  // ── Enqueue the job for the BullMQ worker — returns immediately ──
  try {
    await enqueueRun({ runId, repoUrl, teamName, leaderName, retryLimit });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Queue enqueue failed";
    console.error(`[server] Failed to enqueue run ${runId}: ${errorMsg}`);
    await RunRepository.transitionStatus(runId, "failed", errorMsg);
    res.status(503).json({ runId, status: "failed", error: errorMsg });
    return;
  }

  // Respond immediately — the worker will process the job asynchronously
  res.status(202).json({ runId, status: "queued" });
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

/* ── Phase 6: Diagnostics API — Structured Observability ── */

app.get("/api/agent/runs/:runId/diagnostics", async (req, res) => {
  try {
    const run = await RunRepository.findById(req.params.runId);
    if (!run) {
      res.status(404).json({ error: "Run not found" });
      return;
    }

    const diagnostics = await DiagnosticsRepository.findByRunId(req.params.runId);
    const patchMetadata = await DiagnosticsRepository.findPatchMetadataByRunId(req.params.runId);

    // Find final push info from diagnostics
    const pushDiagnostic = diagnostics.find(d => d.pushStrategy);

    res.json({
      runId: req.params.runId,
      status: run.status,
      failureCategory: diagnostics[0]?.failureCategory ?? null,
      remediationAttempts: diagnostics.filter(d => d.iteration > 0 && d.iteration < 100).length,
      patchMetadata,
      diagnostics: diagnostics.map(d => ({
        iteration: d.iteration,
        failureCategory: d.failureCategory,
        failureSummary: d.failureSummary,
        confidence: d.confidence,
        strategy: d.strategyUsed,
        strategyResult: d.strategyResult,
        commitDecision: d.commitDecision,
        commitReason: d.commitReason,
        patchApproved: d.patchApproved,
        diffSummary: d.diffSummary,
      })),
      gitStrategy: pushDiagnostic?.pushStrategy ?? null,
      prUrl: pushDiagnostic?.prUrl ?? null,
    });
  } catch (err) {
    console.error("[diagnostics] Error:", err);
    res.status(500).json({ error: "Failed to retrieve diagnostics" });
  }
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

  // Drain the worker: finish active jobs but accept no new ones
  console.log("[server] Closing BullMQ worker…");
  await remediationWorker.close();
  console.log("[server] Closing BullMQ queue…");
  await remediationQueue.close();

  await closePool();
  process.exit(0);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
