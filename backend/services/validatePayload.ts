/**
 * Backend validation middleware.
 *
 * Re-uses the EXACT same validation logic from the shared module so that
 * direct API calls cannot bypass any frontend checks.
 *
 * Usage in server.ts:
 *   import { validateRunPayload } from "./services/validatePayload";
 *   app.post("/api/agent/runs", validateRunPayload, async (req, res) => { ... });
 */

import type { Request, Response, NextFunction } from "express";

// ── Inline the shared validation logic so the backend is self-contained ──
// This is an intentional duplication of src/utils/validation.ts to ensure
// the backend validates identically without cross-project import issues.

const MAX_FIELD_BYTES = 2048;

const LIMITS = {
  repoUrl: { min: 19, max: 256 },
  teamName: { min: 2, max: 80 },
  leaderName: { min: 2, max: 80 },
} as const;

const INVISIBLE_OR_DANGEROUS_RE =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202F\u2060-\u2064\u2066-\u2069\uFEFF\uFFF9-\uFFFB\uFFFC\uFFFD]|\uDB40[\uDC01-\uDC7F]/g;

const SAFE_NAME_RE = /^[\p{Letter}\p{Mark}\s'.,-]+$/u;
const GH_SEGMENT_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]*[a-zA-Z0-9])?$/;
const HTML_TAG_RE = /<\/?[a-z][^>]*>/gi;

interface FieldError {
  field: "repoUrl" | "teamName" | "leaderName";
  code: string;
  message: string;
}

interface ValidationResult {
  valid: boolean;
  errors: FieldError[];
  sanitised: { repoUrl: string; teamName: string; leaderName: string };
}

function sanitise(raw: unknown): string {
  if (typeof raw !== "string") return "";
  if (Buffer.byteLength(raw, "utf8") > MAX_FIELD_BYTES) {
    return raw.slice(0, MAX_FIELD_BYTES).replace(INVISIBLE_OR_DANGEROUS_RE, "").replace(/\s+/g, " ").trim();
  }
  return raw.replace(INVISIBLE_OR_DANGEROUS_RE, "").replace(HTML_TAG_RE, "").replace(/\s+/g, " ").trim();
}

function normaliseGitHubUrl(raw: string) {
  const fail = (error: string) => ({ valid: false as const, normalised: "", owner: "", repo: "", error });
  const trimmed = raw.trim();
  if (!trimmed) return fail("URL is required.");

  let url: URL;
  try { url = new URL(trimmed); } catch { return fail("Not a valid URL."); }

  if (url.protocol !== "https:") return fail("Only HTTPS GitHub URLs are accepted.");
  if (url.username || url.password) return fail("URLs must not contain credentials.");

  const host = url.hostname.toLowerCase();
  if (host !== "github.com" && host !== "www.github.com") return fail("URL must point to github.com.");

  const segments = url.pathname.replace(/\.git\/?$/, "").split("/").filter(Boolean);
  if (segments.length < 2) return fail("URL must include owner and repository (github.com/owner/repo).");

  const [owner, repo] = segments;
  if (!GH_SEGMENT_RE.test(owner)) return fail(`Invalid GitHub owner "${owner}".`);
  if (!GH_SEGMENT_RE.test(repo)) return fail(`Invalid GitHub repository name "${repo}".`);
  if (owner.length > 39) return fail("GitHub owner name too long (max 39 chars).");
  if (repo.length > 100) return fail("GitHub repository name too long (max 100 chars).");
  if (url.search.length > 1 || url.hash.length > 1) return fail("URL must not contain query parameters or fragments.");

  return { valid: true as const, normalised: `https://github.com/${owner}/${repo}`, owner, repo };
}

function validateRepoUrl(raw: string): FieldError | null {
  const value = sanitise(raw);
  if (!value) return { field: "repoUrl", code: "REQUIRED", message: "GitHub URL is required." };
  if (value.length > LIMITS.repoUrl.max) return { field: "repoUrl", code: "TOO_LONG", message: `URL exceeds ${LIMITS.repoUrl.max} characters.` };
  const result = normaliseGitHubUrl(value);
  if (!result.valid) return { field: "repoUrl", code: "INVALID_URL", message: result.error! };
  return null;
}

function validateName(raw: string, field: "teamName" | "leaderName", label: string): FieldError | null {
  const value = sanitise(raw);
  if (!value) return { field, code: "REQUIRED", message: `${label} is required.` };
  if (value.length < LIMITS[field].min) return { field, code: "TOO_SHORT", message: `${label} must be at least ${LIMITS[field].min} characters.` };
  if (value.length > LIMITS[field].max) return { field, code: "TOO_LONG", message: `${label} must be at most ${LIMITS[field].max} characters.` };
  if (HTML_TAG_RE.test(raw)) { HTML_TAG_RE.lastIndex = 0; return { field, code: "HTML_INJECTION", message: `${label} must not contain HTML.` }; }
  HTML_TAG_RE.lastIndex = 0;
  if (!SAFE_NAME_RE.test(value)) return { field, code: "INVALID_CHARS", message: `${label} contains invalid characters.` };
  return null;
}

function validateInputs(repoUrl: string, teamName: string, leaderName: string): ValidationResult {
  const errors: FieldError[] = [];
  const sRepoUrl = sanitise(repoUrl);
  const sTeamName = sanitise(teamName);
  const sLeaderName = sanitise(leaderName);

  const urlErr = validateRepoUrl(repoUrl);  if (urlErr) errors.push(urlErr);
  const teamErr = validateName(teamName, "teamName", "Team name");  if (teamErr) errors.push(teamErr);
  const leaderErr = validateName(leaderName, "leaderName", "Leader name");  if (leaderErr) errors.push(leaderErr);

  const urlResult = normaliseGitHubUrl(sRepoUrl);
  return {
    valid: errors.length === 0,
    errors,
    sanitised: {
      repoUrl: urlResult.valid ? urlResult.normalised : sRepoUrl,
      teamName: sTeamName,
      leaderName: sLeaderName,
    },
  };
}

/**
 * Express middleware that validates & sanitises the run payload.
 *
 * On success, it replaces `req.body.{repoUrl,teamName,leaderName}` with the
 * sanitised + normalised values so downstream handlers never see raw input.
 *
 * On failure, responds 400 with structured error details.
 */
export function validateRunPayload(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const body = req.body;

  // ── Raw type guard ──
  if (typeof body !== "object" || body === null) {
    res.status(400).json({
      error: "Request body must be a JSON object.",
      code: "INVALID_BODY",
    });
    return;
  }

  const rawRepo = body.repoUrl;
  const rawTeam = body.teamName;
  const rawLeader = body.leaderName;

  // ── Byte-length abuse check (before any processing) ──
  for (const [label, raw] of [
    ["repoUrl", rawRepo],
    ["teamName", rawTeam],
    ["leaderName", rawLeader],
  ] as const) {
    if (typeof raw === "string") {
      const byteLen = Buffer.byteLength(raw, "utf8");
      if (byteLen > MAX_FIELD_BYTES) {
        res.status(400).json({
          error: `${label} exceeds maximum payload size (${MAX_FIELD_BYTES} bytes).`,
          code: "PAYLOAD_TOO_LARGE",
          field: label,
        });
        return;
      }
    }
  }

  // ── Run full validation (identical to frontend) ──
  const result = validateInputs(
    String(rawRepo ?? ""),
    String(rawTeam ?? ""),
    String(rawLeader ?? ""),
  );

  if (!result.valid) {
    res.status(400).json({
      error: "Validation failed.",
      code: "VALIDATION_ERROR",
      details: result.errors.map((e) => ({
        field: e.field,
        code: e.code,
        message: e.message,
      })),
    });
    return;
  }

  // ── Replace body values with sanitised versions ──
  req.body.repoUrl = result.sanitised.repoUrl;
  req.body.teamName = result.sanitised.teamName;
  req.body.leaderName = result.sanitised.leaderName;

  next();
}
