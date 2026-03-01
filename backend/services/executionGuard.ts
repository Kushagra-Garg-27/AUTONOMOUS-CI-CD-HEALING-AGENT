/**
 * executionGuard.ts — Execution Safety Constraints.
 *
 * Enforces:
 *   - Max repo size (MB)
 *   - Max dependency install time
 *   - Max memory threshold (best effort)
 *   - Max subprocess duration per step
 *   - Kill runaway processes
 *   - Dependency install caching
 */

import { stat } from 'node:fs/promises';
import path from 'node:path';
import { execFile, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/* ── Configuration ── */

export interface ExecutionConstraints {
  /** Maximum repo size in MB */
  maxRepoSizeMB: number;
  /** Maximum dependency install time in ms */
  maxInstallTimeMs: number;
  /** Maximum subprocess duration per step in ms */
  maxStepDurationMs: number;
  /** Maximum total memory usage in MB (best effort) */
  maxMemoryMB: number;
}

export const DEFAULT_CONSTRAINTS: ExecutionConstraints = {
  maxRepoSizeMB: Number(process.env.MAX_REPO_SIZE_MB ?? 500),
  maxInstallTimeMs: Number(process.env.MAX_INSTALL_TIME_MS ?? 300_000),
  maxStepDurationMs: Number(process.env.MAX_STEP_DURATION_MS ?? 600_000),
  maxMemoryMB: Number(process.env.MAX_MEMORY_MB ?? 2048),
};

/* ── Repo Size Check ── */

/**
 * Estimate the repo size by checking the folder size (not .git).
 * Returns size in MB.
 */
export const estimateRepoSize = async (repoPath: string): Promise<number> => {
  try {
    // Quick estimate: sum sizes of files in the root level only (fast heuristic)
    const { stdout } = await execFileAsync(
      process.platform === 'win32' ? 'cmd' : 'du',
      process.platform === 'win32'
        ? ['/c', `dir /s /a "${repoPath}" | findstr "File(s)"` ]
        : ['-sm', repoPath],
      { timeout: 30_000 },
    );

    if (process.platform === 'win32') {
      // Parse Windows dir output
      const match = stdout.match(/([\d,]+)\s+bytes/);
      if (match) {
        const bytes = parseInt(match[1].replace(/,/g, ''), 10);
        return bytes / (1024 * 1024);
      }
      return 0;
    }

    // Parse du -sm output: "123\t/path"
    const sizeStr = stdout.trim().split('\t')[0];
    return parseInt(sizeStr, 10) || 0;
  } catch {
    // Fallback: check .git directory as proxy
    try {
      const gitStat = await stat(path.join(repoPath, '.git'));
      return gitStat.size / (1024 * 1024);
    } catch {
      return 0;
    }
  }
};

/**
 * Validate repo size is within limits.
 */
export const validateRepoSize = async (
  repoPath: string,
  constraints: ExecutionConstraints = DEFAULT_CONSTRAINTS,
): Promise<{ ok: boolean; sizeMB: number; limitMB: number }> => {
  const sizeMB = await estimateRepoSize(repoPath);
  return {
    ok: sizeMB <= constraints.maxRepoSizeMB,
    sizeMB: Math.round(sizeMB),
    limitMB: constraints.maxRepoSizeMB,
  };
};

/* ── Process Tracking ── */

const activeProcesses = new Set<ChildProcess>();

/**
 * Register a child process for kill-on-timeout tracking.
 */
export const trackProcess = (proc: ChildProcess): void => {
  activeProcesses.add(proc);
  proc.on('exit', () => activeProcesses.delete(proc));
};

/**
 * Kill all tracked runaway processes.
 */
export const killAllTrackedProcesses = (): number => {
  let killed = 0;
  for (const proc of activeProcesses) {
    try {
      proc.kill('SIGKILL');
      killed++;
    } catch { /* already dead */ }
  }
  activeProcesses.clear();
  return killed;
};

/* ── Memory Check (Best Effort) ── */

/**
 * Check current process memory usage.
 * Returns RSS in MB.
 */
export const getCurrentMemoryMB = (): number => {
  const usage = process.memoryUsage();
  return Math.round(usage.rss / (1024 * 1024));
};

/**
 * Check if memory usage is within limits.
 */
export const validateMemory = (
  constraints: ExecutionConstraints = DEFAULT_CONSTRAINTS,
): { ok: boolean; usedMB: number; limitMB: number } => {
  const usedMB = getCurrentMemoryMB();
  return {
    ok: usedMB <= constraints.maxMemoryMB,
    usedMB,
    limitMB: constraints.maxMemoryMB,
  };
};

/* ── Dependency Install Cache ── */

/**
 * Hash-based install cache to avoid re-running npm install / pip install
 * when dependency files haven't changed between iterations.
 */
const installCache = new Map<string, string>();

/**
 * Compute a simple hash of a dependency file to detect changes.
 */
export const hashFile = async (filePath: string): Promise<string | null> => {
  try {
    const { createHash } = await import('node:crypto');
    const { readFile } = await import('node:fs/promises');
    const content = await readFile(filePath, 'utf8');
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
  } catch {
    return null;
  }
};

/**
 * Check if dependency install can be skipped for this run.
 * Returns true if the manifest file hasn't changed since last install.
 */
export const canSkipInstall = async (
  runId: string,
  manifestPath: string,
): Promise<boolean> => {
  const hash = await hashFile(manifestPath);
  if (!hash) return false;

  const cacheKey = `${runId}:${manifestPath}`;
  const cached = installCache.get(cacheKey);

  if (cached === hash) {
    console.log(`[execution-guard] Install cache HIT for ${manifestPath}`);
    return true;
  }

  return false;
};

/**
 * Record that install was performed for the given manifest file.
 */
export const recordInstall = async (
  runId: string,
  manifestPath: string,
): Promise<void> => {
  const hash = await hashFile(manifestPath);
  if (hash) {
    const cacheKey = `${runId}:${manifestPath}`;
    installCache.set(cacheKey, hash);
    console.log(`[execution-guard] Install recorded for ${manifestPath}`);
  }
};

/**
 * Clear the install cache for a run (call on cleanup).
 */
export const clearInstallCache = (runId: string): void => {
  for (const key of installCache.keys()) {
    if (key.startsWith(`${runId}:`)) {
      installCache.delete(key);
    }
  }
};
