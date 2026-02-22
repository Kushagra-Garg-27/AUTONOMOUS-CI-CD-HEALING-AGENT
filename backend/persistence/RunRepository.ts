/**
 * RunRepository — Durable persistence for healing-agent runs.
 *
 * Replaces the volatile in-memory Map<string, RunRecord>.
 * All status transitions are recorded atomically.
 */

import type pg from "pg";
import { query, withTransaction } from "./db";
import type {
  AnalysisSummary,
  RunRecord,
  RunResult,
  RunStatus,
} from "../types/agent";

/* ── Row shape coming from Postgres ── */

interface RunRow {
  id: string;
  repo_url: string;
  team_name: string;
  leader_name: string;
  retry_limit: number;
  status: RunStatus;
  ci_status: string;
  branch_name: string;
  project_type: string;
  failures_count: number;
  fixes_count: number;
  commit_count: number;
  current_iteration: number;
  base_score: number;
  speed_bonus: number;
  efficiency_penalty: number;
  execution_time_s: number;
  analysis_summary: AnalysisSummary;
  error: string | null;
  started_at: string;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

/* ── Mapping helpers ── */

const toRunRecord = (row: RunRow): RunRecord => ({
  id: row.id,
  repoUrl: row.repo_url,
  teamName: row.team_name,
  leaderName: row.leader_name,
  retryLimit: row.retry_limit,
  status: row.status,
  startedAt: new Date(row.started_at).toISOString(),
  finishedAt: row.finished_at
    ? new Date(row.finished_at).toISOString()
    : undefined,
  error: row.error ?? undefined,
  // result is assembled by the caller if needed (joins test_results, patches, etc.)
});

/* ── Repository ─────────────────────────────────────────────────────────── */

export const RunRepository = {
  /**
   * Insert a new run in 'running' status.
   * Also inserts the initial status transition.
   */
  async create(record: {
    id: string;
    repoUrl: string;
    teamName: string;
    leaderName: string;
    retryLimit: number;
    branchName: string;
  }): Promise<void> {
    await withTransaction(async (client: pg.PoolClient) => {
      await client.query(
        `INSERT INTO runs (id, repo_url, team_name, leader_name, retry_limit, status, branch_name)
         VALUES ($1, $2, $3, $4, $5, 'running', $6)`,
        [
          record.id,
          record.repoUrl,
          record.teamName,
          record.leaderName,
          record.retryLimit,
          record.branchName,
        ],
      );
      await client.query(
        `INSERT INTO status_transitions (run_id, from_status, to_status, reason)
         VALUES ($1, NULL, 'running', 'Run created')`,
        [record.id],
      );
    });
  },

  /**
   * Fetch a single run by ID. Returns null if not found.
   */
  async findById(runId: string): Promise<RunRecord | null> {
    const { rows } = await query<RunRow>(`SELECT * FROM runs WHERE id = $1`, [
      runId,
    ]);
    if (rows.length === 0) return null;
    return toRunRecord(rows[0]);
  },

  /**
   * Atomically transition run status.
   * Records the transition in status_transitions for auditability.
   */
  async transitionStatus(
    runId: string,
    toStatus: RunStatus,
    reason: string,
    extras?: {
      error?: string;
      finishedAt?: string;
    },
  ): Promise<void> {
    await withTransaction(async (client: pg.PoolClient) => {
      // Fetch current status for the audit trail
      const { rows } = await client.query<{ status: RunStatus }>(
        `SELECT status FROM runs WHERE id = $1 FOR UPDATE`,
        [runId],
      );
      const fromStatus = rows[0]?.status ?? null;

      const sets: string[] = ["status = $2"];
      const params: unknown[] = [runId, toStatus];
      let idx = 3;

      if (extras?.error !== undefined) {
        sets.push(`error = $${idx}`);
        params.push(extras.error);
        idx++;
      }
      if (extras?.finishedAt !== undefined) {
        sets.push(`finished_at = $${idx}`);
        params.push(extras.finishedAt);
        idx++;
      }

      await client.query(
        `UPDATE runs SET ${sets.join(", ")} WHERE id = $1`,
        params,
      );
      await client.query(
        `INSERT INTO status_transitions (run_id, from_status, to_status, reason)
         VALUES ($1, $2, $3, $4)`,
        [runId, fromStatus, toStatus, reason],
      );
    });
  },

  /**
   * Update counters and analysis after each agent node.
   */
  async updateProgress(
    runId: string,
    data: {
      ciStatus?: string;
      projectType?: string;
      failuresCount?: number;
      fixesCount?: number;
      commitCount?: number;
      currentIteration?: number;
      analysisSummary?: AnalysisSummary;
      branchName?: string;
    },
  ): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [runId];
    let idx = 2;

    const addField = (column: string, value: unknown) => {
      if (value !== undefined) {
        sets.push(`${column} = $${idx}`);
        params.push(value);
        idx++;
      }
    };

    addField("ci_status", data.ciStatus);
    addField("project_type", data.projectType);
    addField("failures_count", data.failuresCount);
    addField("fixes_count", data.fixesCount);
    addField("commit_count", data.commitCount);
    addField("current_iteration", data.currentIteration);
    addField("branch_name", data.branchName);

    if (data.analysisSummary !== undefined) {
      sets.push(`analysis_summary = $${idx}`);
      params.push(JSON.stringify(data.analysisSummary));
      idx++;
    }

    if (sets.length === 0) return;

    await query(`UPDATE runs SET ${sets.join(", ")} WHERE id = $1`, params);
  },

  /**
   * Atomically write final scoring and mark the run completed.
   */
  async finalizeScoring(
    runId: string,
    scoring: {
      baseScore: number;
      speedBonus: number;
      efficiencyPenalty: number;
      executionTimeS: number;
      ciStatus: string;
      failuresCount: number;
    },
  ): Promise<void> {
    await withTransaction(async (client: pg.PoolClient) => {
      const { rows } = await client.query<{ status: RunStatus }>(
        `SELECT status FROM runs WHERE id = $1 FOR UPDATE`,
        [runId],
      );
      const fromStatus = rows[0]?.status ?? null;
      const toStatus: RunStatus = "completed";

      await client.query(
        `UPDATE runs SET
           base_score = $2,
           speed_bonus = $3,
           efficiency_penalty = $4,
           execution_time_s = $5,
           ci_status = $6,
           failures_count = $7,
           status = $8,
           finished_at = now()
         WHERE id = $1`,
        [
          runId,
          scoring.baseScore,
          scoring.speedBonus,
          scoring.efficiencyPenalty,
          scoring.executionTimeS,
          scoring.ciStatus,
          scoring.failuresCount,
          toStatus,
        ],
      );
      await client.query(
        `INSERT INTO status_transitions (run_id, from_status, to_status, reason)
         VALUES ($1, $2, $3, 'Scoring finalized')`,
        [runId, fromStatus, toStatus],
      );
    });
  },

  /**
   * Assemble the full RunResult from joined tables.
   * This is what the API returns.
   */
  async getFullResult(runId: string): Promise<RunResult | null> {
    const { rows: runRows } = await query<RunRow>(
      `SELECT * FROM runs WHERE id = $1`,
      [runId],
    );
    if (runRows.length === 0) return null;
    const run = runRows[0];

    // Patches → FixRow[]
    const { rows: patchRows } = await query<{
      file_path: string;
      bug_type: string;
      line_number: number;
      description: string;
      status: string;
    }>(
      `SELECT file_path, bug_type, line_number, description, status
       FROM patches WHERE run_id = $1 ORDER BY id`,
      [runId],
    );

    // Timeline entries
    const { rows: timelineRows } = await query<{
      iteration: number;
      result: string;
      created_at: string;
      retry_count: number;
      retry_limit: number;
    }>(
      `SELECT iteration, result, created_at, retry_count, retry_limit
       FROM timeline_entries WHERE run_id = $1 ORDER BY id`,
      [runId],
    );

    // Latest test result
    const { rows: testRows } = await query<{
      passed: boolean;
      exit_code: number;
      stdout: string;
      stderr: string;
      duration_ms: number;
      failed_tests: string[];
      error_summary: string;
      execution_method: string;
    }>(
      `SELECT passed, exit_code, stdout, stderr, duration_ms,
              failed_tests, error_summary, execution_method
       FROM test_results WHERE run_id = $1
       ORDER BY id DESC LIMIT 1`,
      [runId],
    );

    const testResult = testRows[0] ?? {
      passed: false,
      exit_code: -1,
      stdout: "",
      stderr: "",
      duration_ms: 0,
      failed_tests: [],
      error_summary: "",
      execution_method: "skipped",
    };

    return {
      executionTime: run.execution_time_s,
      ciStatus: run.ci_status as RunResult["ciStatus"],
      failuresCount: run.failures_count,
      fixesCount: run.fixes_count,
      commitCount: run.commit_count,
      fixesTable: patchRows.map((p) => ({
        filePath: p.file_path,
        bugType: p.bug_type as RunResult["fixesTable"][number]["bugType"],
        lineNumber: p.line_number,
        commitMessage: p.description,
        status: p.status as "passed" | "failed",
      })),
      timeline: timelineRows.map((t) => ({
        iteration: t.iteration,
        result: t.result as "passed" | "failed",
        timestamp: new Date(t.created_at).toISOString(),
        retryCount: t.retry_count,
        retryLimit: t.retry_limit,
      })),
      baseScore: run.base_score,
      speedBonus: run.speed_bonus,
      efficiencyPenalty: run.efficiency_penalty,
      repoUrl: run.repo_url,
      generatedBranchName: run.branch_name,
      analysisSummary: run.analysis_summary,
      testResults: {
        passed: testResult.passed,
        exitCode: testResult.exit_code,
        stdout: testResult.stdout,
        stderr: testResult.stderr,
        durationMs: testResult.duration_ms,
        failedTests: Array.isArray(testResult.failed_tests)
          ? testResult.failed_tests
          : [],
        errorSummary: testResult.error_summary,
        executionMethod:
          testResult.execution_method as RunResult["testResults"]["executionMethod"],
      },
      projectType: run.project_type,
    };
  },

  /**
   * List recent runs, most recent first.
   */
  async listRecent(limit = 50): Promise<RunRecord[]> {
    const { rows } = await query<RunRow>(
      `SELECT * FROM runs ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return rows.map(toRunRecord);
  },
};
