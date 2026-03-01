/**
 * DiagnosticsRepository — Persist per-iteration remediation diagnostics.
 *
 * Stores: failure classification, strategy result, patch metadata,
 * commit decisions, git push strategy, and PR links.
 */

import { query } from './db.js';
import type { FailureClassification } from '../services/failureClassifier.js';
import type { PatchMetadata } from '../services/patchGuard.js';
import type { StrategyResult } from '../services/remediationStrategies.js';
import type { CommitDecision } from '../services/commitStrategy.js';
import type { PushResult } from '../services/gitStrategy.js';

export interface DiagnosticsEntry {
  iteration: number;
  failureCategory: string;
  failureSummary: string;
  confidence: number;
  matchedPatterns: string[];
  missingDeps: string[];
  faultFiles: string[];
  strategyUsed: string;
  strategyResult: string;
  commitDecision: string;
  commitReason: string;
  patchApproved: boolean;
  diffSummary: string;
  pushStrategy: string | null;
  prUrl: string | null;
}

export const DiagnosticsRepository = {
  /**
   * Record a single iteration's full diagnostics.
   */
  async recordIteration(
    runId: string,
    iteration: number,
    data: {
      classification?: FailureClassification;
      strategyResult?: StrategyResult;
      patchMetadata?: PatchMetadata;
      commitDecision?: CommitDecision;
      pushResult?: PushResult;
    },
  ): Promise<void> {
    const { classification, strategyResult, patchMetadata, commitDecision, pushResult } = data;

    const diffSummary = patchMetadata
      ? `${patchMetadata.filesChanged} files, +${patchMetadata.linesAdded}/-${patchMetadata.linesRemoved} lines`
      : '';

    await query(
      `INSERT INTO remediation_diagnostics
         (run_id, iteration, failure_category, failure_summary, confidence,
          matched_patterns, missing_deps, fault_files, strategy_used,
          strategy_result, commit_decision, commit_reason, patch_approved,
          diff_summary, push_strategy, pr_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        runId,
        iteration,
        classification?.category ?? null,
        classification?.summary ?? '',
        classification?.confidence ?? 0,
        JSON.stringify(classification?.matchedPatterns ?? []),
        JSON.stringify(classification?.missingDependencies ?? []),
        JSON.stringify(classification?.faultFiles ?? []),
        strategyResult?.strategy ?? '',
        strategyResult?.description ?? '',
        commitDecision?.shouldCommit ? 'COMMIT' : 'WITHHOLD',
        commitDecision?.reason ?? '',
        patchMetadata?.approved ?? false,
        diffSummary,
        pushResult?.strategy ?? null,
        pushResult?.prUrl ?? null,
      ],
    );
  },

  /**
   * Record patch metadata for an iteration.
   */
  async recordPatchMetadata(
    runId: string,
    iteration: number,
    metadata: PatchMetadata,
  ): Promise<void> {
    await query(
      `INSERT INTO patch_metadata
         (run_id, iteration, files_changed, lines_added, lines_removed,
          total_diff_lines, category_targeted, rationale, approved,
          rejection_reason, snapshot_sha, changed_file_paths)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        runId,
        iteration,
        metadata.filesChanged,
        metadata.linesAdded,
        metadata.linesRemoved,
        metadata.totalDiffLines,
        metadata.categoryTargeted,
        metadata.rationale,
        metadata.approved,
        metadata.rejectionReason ?? null,
        metadata.snapshotSha ?? null,
        JSON.stringify(metadata.changedFilePaths),
      ],
    );
  },

  /**
   * Fetch all diagnostics for a run (for the API).
   */
  async findByRunId(runId: string): Promise<DiagnosticsEntry[]> {
    const { rows } = await query<{
      iteration: number;
      failure_category: string | null;
      failure_summary: string;
      confidence: number;
      matched_patterns: string[];
      missing_deps: string[];
      fault_files: string[];
      strategy_used: string;
      strategy_result: string;
      commit_decision: string;
      commit_reason: string;
      patch_approved: boolean;
      diff_summary: string;
      push_strategy: string | null;
      pr_url: string | null;
    }>(
      `SELECT iteration, failure_category, failure_summary, confidence,
              matched_patterns, missing_deps, fault_files, strategy_used,
              strategy_result, commit_decision, commit_reason, patch_approved,
              diff_summary, push_strategy, pr_url
       FROM remediation_diagnostics WHERE run_id = $1 ORDER BY iteration`,
      [runId],
    );

    return rows.map(r => ({
      iteration: r.iteration,
      failureCategory: r.failure_category ?? 'UNKNOWN_FAILURE',
      failureSummary: r.failure_summary,
      confidence: r.confidence,
      matchedPatterns: Array.isArray(r.matched_patterns) ? r.matched_patterns : [],
      missingDeps: Array.isArray(r.missing_deps) ? r.missing_deps : [],
      faultFiles: Array.isArray(r.fault_files) ? r.fault_files : [],
      strategyUsed: r.strategy_used,
      strategyResult: r.strategy_result,
      commitDecision: r.commit_decision,
      commitReason: r.commit_reason,
      patchApproved: r.patch_approved,
      diffSummary: r.diff_summary,
      pushStrategy: r.push_strategy,
      prUrl: r.pr_url,
    }));
  },

  /**
   * Fetch patch metadata history for a run.
   */
  async findPatchMetadataByRunId(runId: string): Promise<Array<{
    iteration: number;
    filesChanged: number;
    linesAdded: number;
    linesRemoved: number;
    approved: boolean;
    rejectionReason?: string;
  }>> {
    const { rows } = await query<{
      iteration: number;
      files_changed: number;
      lines_added: number;
      lines_removed: number;
      approved: boolean;
      rejection_reason: string | null;
    }>(
      `SELECT iteration, files_changed, lines_added, lines_removed, approved, rejection_reason
       FROM patch_metadata WHERE run_id = $1 ORDER BY iteration`,
      [runId],
    );

    return rows.map(r => ({
      iteration: r.iteration,
      filesChanged: r.files_changed,
      linesAdded: r.lines_added,
      linesRemoved: r.lines_removed,
      approved: r.approved,
      rejectionReason: r.rejection_reason ?? undefined,
    }));
  },
};
