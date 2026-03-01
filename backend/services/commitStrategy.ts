/**
 * commitStrategy.ts — Intelligent Commit Message & Gating.
 *
 * Commits only when:
 *   - Patch reduces failure severity
 *   - Tests pass OR failure category improves
 *
 * Generates structured commit messages:
 *   fix(ci): resolve <failure_category>
 *
 *   Root cause:
 *   ...
 *   Remediation:
 *   ...
 *   Impact:
 *   - files changed: X
 *   - lines modified: Y
 */

import type { FailureCategory } from './failureClassifier.js';
import { severityRank } from './failureClassifier.js';
import type { PatchMetadata } from './patchGuard.js';

/* ── Types ── */

export interface CommitDecision {
  shouldCommit: boolean;
  reason: string;
  message?: string;
  title?: string;
  body?: string;
}

export interface CommitContext {
  /** Failure category before patch */
  previousCategory: FailureCategory;
  /** Failure category after patch (from verification) */
  currentCategory: FailureCategory;
  /** Did tests pass after the patch? */
  testsPass: boolean;
  /** Did tests pass before the patch? */
  testsPreviouslyPassed: boolean;
  /** The patch metadata */
  patchMetadata: PatchMetadata;
  /** Classification summary */
  rootCause: string;
  /** What the remediation strategy did */
  remediationDescription: string;
  /** Iteration number */
  iteration: number;
}

/* ── Public API ── */

/**
 * Decide whether to commit based on improvement criteria.
 * Returns the full structured commit message if committing.
 */
export const makeCommitDecision = (ctx: CommitContext): CommitDecision => {
  // ── Gate 1: Patch must be approved by guardrails ──
  if (!ctx.patchMetadata.approved) {
    return {
      shouldCommit: false,
      reason: `Patch rejected by guardrails: ${ctx.patchMetadata.rejectionReason}`,
    };
  }

  // ── Gate 2: No files changed ──
  if (ctx.patchMetadata.filesChanged === 0) {
    return {
      shouldCommit: false,
      reason: 'No files were changed — nothing to commit',
    };
  }

  // ── Gate 3: Tests pass → always commit ──
  if (ctx.testsPass) {
    const msg = buildCommitMessage(ctx);
    return {
      shouldCommit: true,
      reason: 'Tests pass after remediation',
      ...msg,
    };
  }

  // ── Gate 4: Failure severity improved ──
  const prevSeverity = severityRank(ctx.previousCategory);
  const currSeverity = severityRank(ctx.currentCategory);

  if (currSeverity > prevSeverity) {
    // Higher rank = less severe — improvement
    const msg = buildCommitMessage(ctx);
    return {
      shouldCommit: true,
      reason: `Failure category improved: ${ctx.previousCategory} → ${ctx.currentCategory}`,
      ...msg,
    };
  }

  // ── Gate 5: Same category but was previously failing, still failing ──
  // Only commit if something actually changed (e.g., fewer test failures)
  if (ctx.currentCategory === ctx.previousCategory && !ctx.testsPass) {
    return {
      shouldCommit: false,
      reason: `No improvement — still ${ctx.currentCategory}. Withholding commit.`,
    };
  }

  // ── Gate 6: Severity worsened → do NOT commit ──
  if (currSeverity < prevSeverity) {
    return {
      shouldCommit: false,
      reason: `Failure worsened: ${ctx.previousCategory} → ${ctx.currentCategory}. Rolling back.`,
    };
  }

  return {
    shouldCommit: false,
    reason: 'No measurable improvement detected',
  };
};

/* ── Commit Message Builder ── */

const buildCommitMessage = (ctx: CommitContext): { message: string; title: string; body: string } => {
  const categorySlug = ctx.currentCategory.toLowerCase().replace(/_/g, '-');
  const title = `fix(ci): resolve ${categorySlug}`;

  const body = [
    `Root cause:`,
    `  ${ctx.rootCause}`,
    ``,
    `Remediation:`,
    `  ${ctx.remediationDescription}`,
    ``,
    `Impact:`,
    `  - files changed: ${ctx.patchMetadata.filesChanged}`,
    `  - lines added: ${ctx.patchMetadata.linesAdded}`,
    `  - lines removed: ${ctx.patchMetadata.linesRemoved}`,
    `  - iteration: ${ctx.iteration}`,
    `  - category: ${ctx.currentCategory}`,
    ...(ctx.patchMetadata.changedFilePaths.length <= 10
      ? [`  - modified: ${ctx.patchMetadata.changedFilePaths.join(', ')}`]
      : [`  - modified: ${ctx.patchMetadata.changedFilePaths.length} files`]),
  ].join('\n');

  const message = `${title}\n\n${body}`;

  return { message, title, body };
};
