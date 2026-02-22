import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT = 60_000;

/* ── Configure committer identity inside the cloned repo ── */

export const configureGitIdentity = async (repoPath: string): Promise<void> => {
  await execFileAsync("git", ["config", "user.name", "AI Healing Agent"], {
    cwd: repoPath,
    timeout: GIT_TIMEOUT,
  });
  await execFileAsync(
    "git",
    ["config", "user.email", "ai-agent@users.noreply.github.com"],
    {
      cwd: repoPath,
      timeout: GIT_TIMEOUT,
    },
  );
};

/* ── Create a new branch for the fix ── */

export const createBranch = async (
  repoPath: string,
  branchName: string,
): Promise<void> => {
  await execFileAsync("git", ["checkout", "-b", branchName], {
    cwd: repoPath,
    timeout: GIT_TIMEOUT,
  });
};

/* ── Stage all changes, commit, and return the SHA + count of changed files ── */

export const stageAndCommit = async (
  repoPath: string,
  message: string,
): Promise<{ commitSha: string; filesChanged: number }> => {
  await execFileAsync("git", ["add", "-A"], {
    cwd: repoPath,
    timeout: GIT_TIMEOUT,
  });

  // `git diff --cached --quiet` exits 0 when there are NO staged changes.
  try {
    await execFileAsync("git", ["diff", "--cached", "--quiet"], {
      cwd: repoPath,
      timeout: GIT_TIMEOUT,
    });
    // No staged changes — nothing to commit.
    return { commitSha: "", filesChanged: 0 };
  } catch {
    // Non-zero exit means changes are staged — proceed.
  }

  const { stdout: nameOnly } = await execFileAsync(
    "git",
    ["diff", "--cached", "--name-only"],
    {
      cwd: repoPath,
      timeout: GIT_TIMEOUT,
    },
  );
  const filesChanged = nameOnly.trim().split("\n").filter(Boolean).length;

  await execFileAsync("git", ["commit", "-m", message], {
    cwd: repoPath,
    timeout: GIT_TIMEOUT,
  });

  const { stdout: sha } = await execFileAsync("git", ["rev-parse", "HEAD"], {
    cwd: repoPath,
    timeout: GIT_TIMEOUT,
  });

  return { commitSha: sha.trim(), filesChanged };
};

/* ── Push the fix branch to the remote origin ── */

export const pushBranch = async (
  repoPath: string,
  branchName: string,
  repoUrl: string,
  token: string,
): Promise<void> => {
  const authenticatedUrl = repoUrl.replace(
    /^https:\/\//,
    `https://x-access-token:${token}@`,
  );

  await execFileAsync(
    "git",
    ["remote", "set-url", "origin", authenticatedUrl],
    {
      cwd: repoPath,
      timeout: GIT_TIMEOUT,
    },
  );

  await execFileAsync("git", ["push", "--set-upstream", "origin", branchName], {
    cwd: repoPath,
    timeout: GIT_TIMEOUT * 2,
  });
};
