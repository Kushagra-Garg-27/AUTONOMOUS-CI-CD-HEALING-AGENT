/**
 * patchGuard.ts — Minimal Patch Enforcement & Diff Guardrails.
 *
 * Enforces strict limits on patch size to prevent destructive behaviour:
 *   - Max changed files per iteration
 *   - Max LOC diff per iteration
 *   - Never modify lock files unless dependency failure
 *   - Never modify unrelated directories
 *   - Structured patch metadata for audit
 *
 * All patch operations MUST pass through validatePatchImpact() before commit.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { FailureCategory } from './failureClassifier.js';

const execFileAsync = promisify(execFile);

/* ── Configuration (overridable via env) ── */

export interface PatchGuardConfig {
  /** Maximum files changed in a single remediation iteration */
  maxChangedFiles: number;
  /** Maximum total lines of diff (added + removed) per iteration */
  maxDiffLines: number;
  /** File patterns that may never be modified */
  neverModifyPatterns: RegExp[];
  /** Lock files — only modifiable when category is DEPENDENCY_INSTALL_ERROR */
  lockFilePatterns: RegExp[];
  /** Directories that should never be touched by patches */
  forbiddenDirectories: string[];
}

export const DEFAULT_PATCH_GUARD_CONFIG: PatchGuardConfig = {
  maxChangedFiles: Number(process.env.PATCH_MAX_FILES ?? 10),
  maxDiffLines: Number(process.env.PATCH_MAX_DIFF_LINES ?? 500),
  neverModifyPatterns: [
    /\.git\//,
    /\.github\/workflows\//,
    /node_modules\//,
    /\.env$/,
    /\.env\..+$/,
    /secrets?\./i,
  ],
  lockFilePatterns: [
    /package-lock\.json$/,
    /yarn\.lock$/,
    /pnpm-lock\.yaml$/,
    /Pipfile\.lock$/,
    /poetry\.lock$/,
    /Cargo\.lock$/,
    /go\.sum$/,
    /Gemfile\.lock$/,
  ],
  forbiddenDirectories: [
    '.git',
    'node_modules',
    '__pycache__',
    '.venv',
    'venv',
    'dist',
    'build',
    'coverage',
  ],
};

/* ── Patch Metadata ── */

export interface PatchMetadata {
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  totalDiffLines: number;
  categoryTargeted: FailureCategory;
  rationale: string;
  changedFilePaths: string[];
  /** Whether the patch passed all guardrail checks */
  approved: boolean;
  /** Rejection reason if not approved */
  rejectionReason?: string;
  /** Snapshot SHA before patch (for rollback) */
  snapshotSha?: string;
  timestamp: string;
}

/* ── Core Validation ── */

/**
 * Analyse git diff in the working tree and validate against guardrails.
 * Returns structured metadata. If `approved` is false, the patch MUST NOT be committed.
 */
export const validatePatchImpact = async (
  repoPath: string,
  category: FailureCategory,
  rationale: string,
  config: PatchGuardConfig = DEFAULT_PATCH_GUARD_CONFIG,
): Promise<PatchMetadata> => {
  const timestamp = new Date().toISOString();

  // Get the current HEAD SHA as a rollback snapshot
  let snapshotSha: string | undefined;
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoPath, timeout: 10_000 });
    snapshotSha = stdout.trim();
  } catch { /* no commits yet — skip */ }

  // Get list of changed files (staged + unstaged)
  let changedFilePaths: string[] = [];
  try {
    // Stage everything to capture the full picture
    await execFileAsync('git', ['add', '-A'], { cwd: repoPath, timeout: 30_000 });

    const { stdout: nameOnly } = await execFileAsync(
      'git', ['diff', '--cached', '--name-only'],
      { cwd: repoPath, timeout: 30_000 },
    );
    changedFilePaths = nameOnly.trim().split('\n').filter(Boolean);
  } catch {
    changedFilePaths = [];
  }

  const filesChanged = changedFilePaths.length;

  // Get diff stats (lines added/removed)
  let linesAdded = 0;
  let linesRemoved = 0;
  try {
    const { stdout: diffStat } = await execFileAsync(
      'git', ['diff', '--cached', '--numstat'],
      { cwd: repoPath, timeout: 30_000 },
    );
    for (const line of diffStat.trim().split('\n').filter(Boolean)) {
      const [added, removed] = line.split('\t');
      if (added !== '-') linesAdded += parseInt(added, 10) || 0;
      if (removed !== '-') linesRemoved += parseInt(removed, 10) || 0;
    }
  } catch { /* failed to get stats */ }

  const totalDiffLines = linesAdded + linesRemoved;

  const base: PatchMetadata = {
    filesChanged,
    linesAdded,
    linesRemoved,
    totalDiffLines,
    categoryTargeted: category,
    rationale,
    changedFilePaths,
    approved: true,
    snapshotSha,
    timestamp,
  };

  // ── Guardrail 1: Max changed files ──
  if (filesChanged > config.maxChangedFiles) {
    return {
      ...base,
      approved: false,
      rejectionReason: `Too many files changed: ${filesChanged} > limit of ${config.maxChangedFiles}`,
    };
  }

  // ── Guardrail 2: Max diff size ──
  if (totalDiffLines > config.maxDiffLines) {
    return {
      ...base,
      approved: false,
      rejectionReason: `Diff too large: ${totalDiffLines} LOC > limit of ${config.maxDiffLines}`,
    };
  }

  // ── Guardrail 3: Never-modify patterns ──
  for (const filePath of changedFilePaths) {
    for (const pattern of config.neverModifyPatterns) {
      if (pattern.test(filePath)) {
        return {
          ...base,
          approved: false,
          rejectionReason: `Forbidden file modified: ${filePath} (matches ${pattern.source})`,
        };
      }
    }
  }

  // ── Guardrail 4: Lock files only for dependency failures ──
  if (category !== 'DEPENDENCY_INSTALL_ERROR') {
    for (const filePath of changedFilePaths) {
      for (const pattern of config.lockFilePatterns) {
        if (pattern.test(filePath)) {
          return {
            ...base,
            approved: false,
            rejectionReason: `Lock file ${filePath} modified but category is ${category} (only allowed for DEPENDENCY_INSTALL_ERROR)`,
          };
        }
      }
    }
  }

  // ── Guardrail 5: Forbidden directories ──
  for (const filePath of changedFilePaths) {
    for (const dir of config.forbiddenDirectories) {
      if (filePath.startsWith(`${dir}/`) || filePath === dir) {
        return {
          ...base,
          approved: false,
          rejectionReason: `File in forbidden directory: ${filePath} (directory: ${dir})`,
        };
      }
    }
  }

  // ── Guardrail 6: No changes at all ──
  if (filesChanged === 0) {
    return {
      ...base,
      approved: false,
      rejectionReason: 'No files were changed — nothing to commit',
    };
  }

  return base;
};

/**
 * Rollback all staged + unstaged changes to the snapshot SHA.
 * Used when post-patch tests fail worse than pre-patch.
 */
export const rollbackToSnapshot = async (
  repoPath: string,
  snapshotSha: string,
): Promise<void> => {
  await execFileAsync('git', ['reset', '--hard', snapshotSha], {
    cwd: repoPath,
    timeout: 30_000,
  });
  console.log(`[patch-guard] Rolled back to ${snapshotSha.slice(0, 8)}`);
};

/**
 * Discard all staged changes without committing (soft rollback).
 */
export const discardStagedChanges = async (repoPath: string): Promise<void> => {
  await execFileAsync('git', ['reset', 'HEAD'], { cwd: repoPath, timeout: 10_000 });
  await execFileAsync('git', ['checkout', '--', '.'], { cwd: repoPath, timeout: 10_000 });
  console.log('[patch-guard] Discarded all staged changes');
};

/**
 * Take a pre-patch snapshot SHA for potential rollback.
 */
export const takeSnapshot = async (repoPath: string): Promise<string | null> => {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: repoPath,
      timeout: 10_000,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
};
