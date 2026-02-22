/**
 * PatchRepository — Persist individual patch / fix records and timeline entries.
 *
 * Each patch (file mutation) applied during remediation is recorded here,
 * along with the per-iteration timeline that the dashboard renders.
 */

import { query, withTransaction } from "./db";
import type pg from "pg";
import type { FixRow, TimelineEntry } from "../types/agent";

export const PatchRepository = {
  /**
   * Bulk-insert patches for a single remediation iteration.
   * Also inserts the corresponding timeline entry atomically.
   */
  async recordIteration(
    runId: string,
    iteration: number,
    patches: FixRow[],
    timelineEntry: TimelineEntry,
    commitSha?: string,
  ): Promise<void> {
    await withTransaction(async (client: pg.PoolClient) => {
      // Insert patches
      for (const p of patches) {
        await client.query(
          `INSERT INTO patches
             (run_id, iteration, file_path, bug_type, line_number, description, status, commit_sha)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            runId,
            iteration,
            p.filePath,
            p.bugType,
            p.lineNumber,
            p.commitMessage,
            p.status,
            commitSha ?? null,
          ],
        );
      }

      // Insert timeline entry
      await client.query(
        `INSERT INTO timeline_entries
           (run_id, iteration, result, retry_count, retry_limit)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          runId,
          timelineEntry.iteration,
          timelineEntry.result,
          timelineEntry.retryCount,
          timelineEntry.retryLimit,
        ],
      );
    });
  },

  /**
   * Fetch all patches for a run.
   */
  async findByRunId(runId: string): Promise<FixRow[]> {
    const { rows } = await query<{
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
    return rows.map((r) => ({
      filePath: r.file_path,
      bugType: r.bug_type as FixRow["bugType"],
      lineNumber: r.line_number,
      commitMessage: r.description,
      status: r.status as "passed" | "failed",
    }));
  },

  /**
   * Fetch all timeline entries for a run.
   */
  async findTimelineByRunId(runId: string): Promise<TimelineEntry[]> {
    const { rows } = await query<{
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
    return rows.map((r) => ({
      iteration: r.iteration,
      result: r.result as "passed" | "failed",
      timestamp: new Date(r.created_at).toISOString(),
      retryCount: r.retry_count,
      retryLimit: r.retry_limit,
    }));
  },
};
