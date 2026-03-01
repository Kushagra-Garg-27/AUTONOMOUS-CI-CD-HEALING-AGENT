/**
 * gitStrategy.ts — Intelligent Git Push Strategy (Fork + PR).
 *
 * Before pushing, checks write access via the GitHub API.
 * If no write access:
 *   1. Fork the repository
 *   2. Push to the fork
 *   3. Create a Pull Request from fork → upstream
 *   4. Store PR URL in DB
 *
 * If write access:
 *   Push directly.
 *
 * Never fails a run just because push is denied.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT = 60_000;
const API_TIMEOUT = 30_000;

/* ── Types ── */

export type PushStrategy = 'direct' | 'fork';

export interface PushResult {
  success: boolean;
  strategy: PushStrategy;
  prUrl?: string;
  forkUrl?: string;
  error?: string;
  branchName: string;
}

/* ── GitHub API Helpers ── */

interface GitHubApiOptions {
  token: string;
  method?: string;
  body?: Record<string, unknown>;
}

const githubApi = async (
  urlPath: string,
  opts: GitHubApiOptions,
): Promise<{ status: number; data: Record<string, unknown> }> => {
  const url = urlPath.startsWith('https://') ? urlPath : `https://api.github.com${urlPath}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    const response = await fetch(url, {
      method: opts.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${opts.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });

    let data: Record<string, unknown> = {};
    const text = await response.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    return { status: response.status, data };
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * Parse owner/repo from a GitHub HTTPS URL.
 */
const parseGitHubUrl = (repoUrl: string): { owner: string; repo: string } | null => {
  // Handle https://github.com/owner/repo.git or https://github.com/owner/repo
  const match = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?$/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
};

/* ── Write Access Check ── */

/**
 * Check if the authenticated user has write (push) access to the repo.
 */
const checkWriteAccess = async (
  owner: string,
  repo: string,
  token: string,
): Promise<boolean> => {
  try {
    const { status, data } = await githubApi(`/repos/${owner}/${repo}`, { token });
    if (status !== 200) return false;

    const permissions = data.permissions as Record<string, boolean> | undefined;
    return permissions?.push === true || permissions?.admin === true;
  } catch (err) {
    console.warn(`[git-strategy] Write access check failed: ${err instanceof Error ? err.message : 'unknown'}`);
    return false;
  }
};

/* ── Fork Logic ── */

/**
 * Fork a repository. Returns the fork's clone URL.
 * If a fork already exists, GitHub returns it (202 or 200).
 */
const forkRepository = async (
  owner: string,
  repo: string,
  token: string,
): Promise<string | null> => {
  try {
    const { status, data } = await githubApi(`/repos/${owner}/${repo}/forks`, {
      token,
      method: 'POST',
      body: { default_branch_only: false },
    });

    if (status === 202 || status === 200) {
      const cloneUrl = data.clone_url as string | undefined;
      console.log(`[git-strategy] Fork created/found: ${cloneUrl}`);
      return cloneUrl ?? null;
    }

    console.warn(`[git-strategy] Fork failed with status ${status}: ${JSON.stringify(data)}`);
    return null;
  } catch (err) {
    console.error(`[git-strategy] Fork error: ${err instanceof Error ? err.message : 'unknown'}`);
    return null;
  }
};

/**
 * Wait for a fork to become ready (GitHub processes forks asynchronously).
 */
const waitForFork = async (
  owner: string,
  repo: string,
  token: string,
  maxWaitMs = 60_000,
): Promise<boolean> => {
  const start = Date.now();
  const pollInterval = 3_000;

  while (Date.now() - start < maxWaitMs) {
    try {
      const { status } = await githubApi(`/repos/${owner}/${repo}`, { token });
      if (status === 200) return true;
    } catch { /* keep polling */ }
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  return false;
};

/* ── Pull Request Logic ── */

const createPullRequest = async (
  upstreamOwner: string,
  upstreamRepo: string,
  forkOwner: string,
  branchName: string,
  title: string,
  body: string,
  token: string,
): Promise<string | null> => {
  try {
    const { status, data } = await githubApi(`/repos/${upstreamOwner}/${upstreamRepo}/pulls`, {
      token,
      method: 'POST',
      body: {
        title,
        body,
        head: `${forkOwner}:${branchName}`,
        base: 'main',  // fallback — will try master if this fails
        maintainer_can_modify: true,
      },
    });

    if (status === 201) {
      const prUrl = data.html_url as string;
      console.log(`[git-strategy] PR created: ${prUrl}`);
      return prUrl;
    }

    // If "main" branch doesn't exist, try "master"
    if (status === 422) {
      const { status: s2, data: d2 } = await githubApi(`/repos/${upstreamOwner}/${upstreamRepo}/pulls`, {
        token,
        method: 'POST',
        body: {
          title,
          body,
          head: `${forkOwner}:${branchName}`,
          base: 'master',
          maintainer_can_modify: true,
        },
      });

      if (s2 === 201) {
        const prUrl = d2.html_url as string;
        console.log(`[git-strategy] PR created (master branch): ${prUrl}`);
        return prUrl;
      }
      console.warn(`[git-strategy] PR creation failed (master attempt): ${s2} ${JSON.stringify(d2)}`);
    } else {
      console.warn(`[git-strategy] PR creation failed: ${status} ${JSON.stringify(data)}`);
    }

    return null;
  } catch (err) {
    console.error(`[git-strategy] PR creation error: ${err instanceof Error ? err.message : 'unknown'}`);
    return null;
  }
};

/* ── Get Authenticated User ── */

const getAuthenticatedUser = async (token: string): Promise<string | null> => {
  try {
    const { status, data } = await githubApi('/user', { token });
    if (status === 200) return data.login as string;
    return null;
  } catch {
    return null;
  }
};

/* ── Public API ── */

/**
 * Intelligently push a branch to GitHub, using direct push or fork+PR
 * based on the user's access level. Never fails a run due to push denial.
 */
export const pushWithStrategy = async (input: {
  repoPath: string;
  branchName: string;
  repoUrl: string;
  token: string;
  commitTitle: string;
  commitBody: string;
}): Promise<PushResult> => {
  const { repoPath, branchName, repoUrl, token, commitTitle, commitBody } = input;

  const parsed = parseGitHubUrl(repoUrl);
  if (!parsed) {
    console.warn(`[git-strategy] Cannot parse GitHub URL: ${repoUrl} — attempting direct push`);
    return attemptDirectPush(repoPath, branchName, repoUrl, token);
  }

  const { owner, repo } = parsed;
  console.log(`[git-strategy] Checking write access for ${owner}/${repo}...`);

  const hasWriteAccess = await checkWriteAccess(owner, repo, token);

  if (hasWriteAccess) {
    console.log('[git-strategy] Write access confirmed — using direct push strategy');
    return attemptDirectPush(repoPath, branchName, repoUrl, token);
  }

  // ── Fork + PR Strategy ──
  console.log('[git-strategy] No write access — using fork + PR strategy');

  const username = await getAuthenticatedUser(token);
  if (!username) {
    return {
      success: false,
      strategy: 'fork',
      error: 'Cannot determine authenticated GitHub username',
      branchName,
    };
  }

  // Fork the repository
  const forkUrl = await forkRepository(owner, repo, token);
  if (!forkUrl) {
    return {
      success: false,
      strategy: 'fork',
      error: 'Failed to fork repository',
      branchName,
    };
  }

  // Wait for fork to be ready
  const forkReady = await waitForFork(username, repo, token);
  if (!forkReady) {
    console.warn('[git-strategy] Fork not ready after timeout — attempting push anyway');
  }

  // Configure remote to point to fork
  const authenticatedForkUrl = forkUrl.replace(
    /^https:\/\//,
    `https://x-access-token:${token}@`,
  );

  try {
    // Add fork as a remote
    try {
      await execFileAsync('git', ['remote', 'remove', 'fork'], {
        cwd: repoPath,
        timeout: GIT_TIMEOUT,
      });
    } catch { /* remote might not exist yet */ }

    await execFileAsync('git', ['remote', 'add', 'fork', authenticatedForkUrl], {
      cwd: repoPath,
      timeout: GIT_TIMEOUT,
    });

    // Push to fork
    await execFileAsync('git', ['push', '--set-upstream', 'fork', branchName], {
      cwd: repoPath,
      timeout: GIT_TIMEOUT * 2,
    });

    console.log(`[git-strategy] Pushed to fork: ${forkUrl}`);

    // Create the Pull Request
    const prUrl = await createPullRequest(
      owner,
      repo,
      username,
      branchName,
      commitTitle,
      commitBody,
      token,
    );

    return {
      success: true,
      strategy: 'fork',
      prUrl: prUrl ?? undefined,
      forkUrl,
      branchName,
    };
  } catch (err) {
    return {
      success: false,
      strategy: 'fork',
      forkUrl,
      error: `Fork push failed: ${err instanceof Error ? err.message : 'unknown'}`,
      branchName,
    };
  }
};

/* ── Direct Push Helper ── */

const attemptDirectPush = async (
  repoPath: string,
  branchName: string,
  repoUrl: string,
  token: string,
): Promise<PushResult> => {
  const authenticatedUrl = repoUrl.replace(
    /^https:\/\//,
    `https://x-access-token:${token}@`,
  );

  try {
    await execFileAsync('git', ['remote', 'set-url', 'origin', authenticatedUrl], {
      cwd: repoPath,
      timeout: GIT_TIMEOUT,
    });

    await execFileAsync('git', ['push', '--set-upstream', 'origin', branchName], {
      cwd: repoPath,
      timeout: GIT_TIMEOUT * 2,
    });

    return {
      success: true,
      strategy: 'direct',
      branchName,
    };
  } catch (err) {
    return {
      success: false,
      strategy: 'direct',
      error: `Direct push failed: ${err instanceof Error ? err.message : 'unknown'}`,
      branchName,
    };
  }
};
