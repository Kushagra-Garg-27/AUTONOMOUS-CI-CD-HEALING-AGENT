/**
 * Async GitHub repository existence checker with debounce.
 *
 * Uses the public GitHub API (`GET /repos/:owner/:repo`) which does not
 * require authentication for public repos.  Rate-limited to 60 req/hour per
 * IP — the debounce + caching strategy keeps us well within that budget.
 */

import { normaliseGitHubUrl, sanitise } from "../utils/validation";

/* ═══════════════════════════ Types ═══════════════════════════════════════ */

export type RepoCheckStatus =
  | "idle"
  | "checking"
  | "exists"
  | "not-found"
  | "error";

export interface RepoCheckResult {
  status: RepoCheckStatus;
  message: string;
}

/* ═══════════════════════════ Cache ═══════════════════════════════════════ */

const cache = new Map<string, RepoCheckResult>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
const cacheTimestamps = new Map<string, number>();

function getCached(key: string): RepoCheckResult | null {
  const ts = cacheTimestamps.get(key);
  if (ts && Date.now() - ts < CACHE_TTL_MS) {
    return cache.get(key) ?? null;
  }
  cache.delete(key);
  cacheTimestamps.delete(key);
  return null;
}

function setCache(key: string, result: RepoCheckResult) {
  cache.set(key, result);
  cacheTimestamps.set(key, Date.now());
}

/* ═══════════════════════════ Checker ════════════════════════════════════ */

/**
 * Check whether a GitHub repository exists by hitting the public API.
 * Returns a structured result with status and user-facing message.
 *
 * Abortable via the optional `AbortSignal`.
 */
export async function checkGitHubRepoExists(
  rawUrl: string,
  signal?: AbortSignal,
): Promise<RepoCheckResult> {
  const sanitised = sanitise(rawUrl);
  const parsed = normaliseGitHubUrl(sanitised);

  if (!parsed.valid) {
    return { status: "error", message: parsed.error ?? "Invalid URL." };
  }

  const cacheKey = `${parsed.owner}/${parsed.repo}`.toLowerCase();
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(
      `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`,
      {
        method: "GET",
        headers: { Accept: "application/vnd.github.v3+json" },
        signal,
      },
    );

    let result: RepoCheckResult;

    if (res.status === 200) {
      result = { status: "exists", message: "Repository found." };
    } else if (res.status === 404) {
      result = {
        status: "not-found",
        message: "Repository not found on GitHub.",
      };
    } else if (res.status === 403) {
      // Rate limited — don't cache, allow retry
      return {
        status: "error",
        message: "GitHub rate limit reached. Try again shortly.",
      };
    } else {
      result = {
        status: "error",
        message: `GitHub returned status ${res.status}.`,
      };
    }

    setCache(cacheKey, result);
    return result;
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { status: "idle", message: "" };
    }
    return {
      status: "error",
      message: "Could not reach GitHub. Check your connection.",
    };
  }
}

/* ═══════════════════════════ Debounce helper ════════════════════════════ */

/**
 * Creates a debounced version of `checkGitHubRepoExists`.
 * Each call cancels the previous in-flight request via AbortController.
 */
export function createDebouncedRepoChecker(delayMs = 600) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;

  const check = (
    rawUrl: string,
    onResult: (result: RepoCheckResult) => void,
  ) => {
    // Cancel previous
    if (timer) clearTimeout(timer);
    if (controller) controller.abort();

    controller = new AbortController();
    const signal = controller.signal;

    timer = setTimeout(async () => {
      onResult({ status: "checking", message: "Verifying repository…" });
      const result = await checkGitHubRepoExists(rawUrl, signal);
      if (!signal.aborted) {
        onResult(result);
      }
    }, delayMs);
  };

  const cancel = () => {
    if (timer) clearTimeout(timer);
    if (controller) controller.abort();
  };

  return { check, cancel };
}
