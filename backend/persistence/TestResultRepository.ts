/**
 * TestResultRepository — Persist real test / build execution results.
 *
 * Each test execution (baseline and per-iteration verification) is stored
 * as its own row, giving a full audit trail of every test run.
 */

import { query } from "./db";
import type { TestExecutionResult } from "../types/agent";

export const TestResultRepository = {
  /**
   * Insert a test-execution result tied to a specific run and iteration.
   *
   * @param phase  'baseline' for the initial analyzer run,
   *               'verification' for post-patch verifier runs.
   */
  async create(
    runId: string,
    iteration: number,
    phase: "baseline" | "verification",
    result: TestExecutionResult,
  ): Promise<void> {
    await query(
      `INSERT INTO test_results
         (run_id, iteration, phase, passed, exit_code, stdout, stderr,
          duration_ms, failed_tests, error_summary, execution_method)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        runId,
        iteration,
        phase,
        result.passed,
        result.exitCode,
        result.stdout,
        result.stderr,
        result.durationMs,
        JSON.stringify(result.failedTests),
        result.errorSummary,
        result.executionMethod,
      ],
    );
  },

  /**
   * Fetch all test results for a run, ordered by iteration.
   */
  async findByRunId(runId: string): Promise<
    Array<{
      iteration: number;
      phase: string;
      result: TestExecutionResult;
    }>
  > {
    const { rows } = await query<{
      iteration: number;
      phase: string;
      passed: boolean;
      exit_code: number;
      stdout: string;
      stderr: string;
      duration_ms: number;
      failed_tests: string[];
      error_summary: string;
      execution_method: string;
    }>(
      `SELECT iteration, phase, passed, exit_code, stdout, stderr,
              duration_ms, failed_tests, error_summary, execution_method
       FROM test_results WHERE run_id = $1 ORDER BY id`,
      [runId],
    );

    return rows.map((r) => ({
      iteration: r.iteration,
      phase: r.phase,
      result: {
        passed: r.passed,
        exitCode: r.exit_code,
        stdout: r.stdout,
        stderr: r.stderr,
        durationMs: r.duration_ms,
        failedTests: Array.isArray(r.failed_tests) ? r.failed_tests : [],
        errorSummary: r.error_summary,
        executionMethod:
          r.execution_method as TestExecutionResult["executionMethod"],
      },
    }));
  },

  /**
   * Fetch the latest test result for a run.
   */
  async findLatest(runId: string): Promise<TestExecutionResult | null> {
    const { rows } = await query<{
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
       FROM test_results WHERE run_id = $1 ORDER BY id DESC LIMIT 1`,
      [runId],
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      passed: r.passed,
      exitCode: r.exit_code,
      stdout: r.stdout,
      stderr: r.stderr,
      durationMs: r.duration_ms,
      failedTests: Array.isArray(r.failed_tests) ? r.failed_tests : [],
      errorSummary: r.error_summary,
      executionMethod:
        r.execution_method as TestExecutionResult["executionMethod"],
    };
  },
};
