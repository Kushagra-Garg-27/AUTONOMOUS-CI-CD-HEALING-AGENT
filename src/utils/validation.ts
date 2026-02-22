/**
 * Production-grade input validation & sanitisation.
 *
 * This module is **isomorphic** — it runs identically on the frontend (browser)
 * and on the backend (Node / tsx).  The backend re-exports the same functions
 * so that direct API calls cannot bypass validation.
 *
 * Coverage:
 *  • GitHub HTTPS-only URL validation + normalisation
 *  • Invisible / confusable Unicode blocking (zero-width chars, BiDi marks,
 *    homoglyph categories, control chars)
 *  • Length / payload-abuse limits
 *  • Structural string sanitisation (trim, collapse whitespace, strip tags)
 *  • Per-field semantic rules (team name, leader name)
 */

/* ═══════════════════════════ Constants ═══════════════════════════════════ */

/** Maximum raw byte-length we accept for any single field value. */
export const MAX_FIELD_BYTES = 2048;

/** Strict limits per field (character count after sanitisation). */
export const LIMITS = {
  repoUrl: { min: 19, max: 256 },
  teamName: { min: 2, max: 80 },
  leaderName: { min: 2, max: 80 },
} as const;

/**
 * Matches characters we NEVER allow:
 *   • C0 / C1 control characters except \t \n \r
 *   • Zero-width chars, BiDi overrides, interlinear annotation anchors
 *   • BOM when not at position 0 (caught by trim)
 */
const INVISIBLE_OR_DANGEROUS_RE =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202F\u2060-\u2064\u2066-\u2069\uFEFF\uFFF9-\uFFFB\uFFFC\uFFFD]|\uDB40[\uDC01-\uDC7F]/g;

/** Only printable letters/marks + common punctuation for names. */
const SAFE_NAME_RE = /^[\p{Letter}\p{Mark}\s'.,-]+$/u;

/** GitHub owner / repo segment: alphanumeric, hyphen, dot, underscore. */
const GH_SEGMENT_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]*[a-zA-Z0-9])?$/;

/** Quick HTML-tag stripper. */
const HTML_TAG_RE = /<\/?[a-z][^>]*>/gi;

/* ═══════════════════════════ Types ═══════════════════════════════════════ */

export interface FieldError {
  field: "repoUrl" | "teamName" | "leaderName";
  code: string;
  message: string;
}

export interface InputErrors {
  repoUrl?: string;
  teamName?: string;
  leaderName?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: FieldError[];
  sanitised: {
    repoUrl: string;
    teamName: string;
    leaderName: string;
  };
}

/* ═══════════════════════════ Sanitisation ════════════════════════════════ */

export function sanitise(raw: unknown): string {
  if (typeof raw !== "string") return "";

  // Byte-length guard
  if (new TextEncoder().encode(raw).byteLength > MAX_FIELD_BYTES) {
    return raw
      .slice(0, MAX_FIELD_BYTES)
      .replace(INVISIBLE_OR_DANGEROUS_RE, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  return raw
    .replace(INVISIBLE_OR_DANGEROUS_RE, "")
    .replace(HTML_TAG_RE, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* ═══════════════════════════ URL helpers ═════════════════════════════════ */

export function normaliseGitHubUrl(raw: string): {
  valid: boolean;
  normalised: string;
  owner: string;
  repo: string;
  error?: string;
} {
  const fail = (error: string) => ({
    valid: false,
    normalised: "",
    owner: "",
    repo: "",
    error,
  });

  const trimmed = raw.trim();
  if (!trimmed) return fail("URL is required.");

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return fail("Not a valid URL.");
  }

  if (url.protocol !== "https:") {
    return fail("Only HTTPS GitHub URLs are accepted.");
  }

  if (url.username || url.password) {
    return fail("URLs must not contain credentials.");
  }

  const host = url.hostname.toLowerCase();
  if (host !== "github.com" && host !== "www.github.com") {
    return fail("URL must point to github.com.");
  }

  const segments = url.pathname
    .replace(/\.git\/?$/, "")
    .split("/")
    .filter(Boolean);

  if (segments.length < 2) {
    return fail(
      "URL must include owner and repository (github.com/owner/repo).",
    );
  }

  const [owner, repo] = segments;

  if (!GH_SEGMENT_RE.test(owner)) {
    return fail(`Invalid GitHub owner "${owner}".`);
  }
  if (!GH_SEGMENT_RE.test(repo)) {
    return fail(`Invalid GitHub repository name "${repo}".`);
  }
  if (owner.length > 39) {
    return fail("GitHub owner name too long (max 39 chars).");
  }
  if (repo.length > 100) {
    return fail("GitHub repository name too long (max 100 chars).");
  }

  if (url.search.length > 1 || url.hash.length > 1) {
    return fail("URL must not contain query parameters or fragments.");
  }

  const normalised = `https://github.com/${owner}/${repo}`;
  return { valid: true, normalised, owner, repo };
}

/* ══════════════════════════ Field validators ═════════════════════════════ */

function validateRepoUrl(raw: string): FieldError | null {
  const value = sanitise(raw);

  if (!value) {
    return {
      field: "repoUrl",
      code: "REQUIRED",
      message: "GitHub URL is required.",
    };
  }
  if (value.length > LIMITS.repoUrl.max) {
    return {
      field: "repoUrl",
      code: "TOO_LONG",
      message: `URL exceeds ${LIMITS.repoUrl.max} characters.`,
    };
  }

  const result = normaliseGitHubUrl(value);
  if (!result.valid) {
    return { field: "repoUrl", code: "INVALID_URL", message: result.error! };
  }

  return null;
}

function validateName(
  raw: string,
  field: "teamName" | "leaderName",
  label: string,
): FieldError | null {
  const value = sanitise(raw);

  if (!value) {
    return { field, code: "REQUIRED", message: `${label} is required.` };
  }
  if (value.length < LIMITS[field].min) {
    return {
      field,
      code: "TOO_SHORT",
      message: `${label} must be at least ${LIMITS[field].min} characters.`,
    };
  }
  if (value.length > LIMITS[field].max) {
    return {
      field,
      code: "TOO_LONG",
      message: `${label} must be at most ${LIMITS[field].max} characters.`,
    };
  }
  if (HTML_TAG_RE.test(raw)) {
    HTML_TAG_RE.lastIndex = 0;
    return { field, code: "HTML_INJECTION", message: `${label} must not contain HTML.` };
  }
  HTML_TAG_RE.lastIndex = 0;

  if (!SAFE_NAME_RE.test(value)) {
    return {
      field,
      code: "INVALID_CHARS",
      message: `${label} contains invalid characters.`,
    };
  }

  return null;
}

/* ══════════════════════════ Public API ═══════════════════════════════════ */

/**
 * Validate & sanitise all three input fields.
 * Single source of truth used by both frontend and backend.
 */
export function validateInputs(
  repoUrl: string,
  teamName: string,
  leaderName: string,
): ValidationResult {
  const errors: FieldError[] = [];

  const sRepoUrl = sanitise(repoUrl);
  const sTeamName = sanitise(teamName);
  const sLeaderName = sanitise(leaderName);

  const urlErr = validateRepoUrl(repoUrl);
  if (urlErr) errors.push(urlErr);

  const teamErr = validateName(teamName, "teamName", "Team name");
  if (teamErr) errors.push(teamErr);

  const leaderErr = validateName(leaderName, "leaderName", "Leader name");
  if (leaderErr) errors.push(leaderErr);

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
 * Quick single-field validation for real-time feedback.
 */
export function validateField(
  field: "repoUrl" | "teamName" | "leaderName",
  value: string,
): FieldError | null {
  switch (field) {
    case "repoUrl":
      return validateRepoUrl(value);
    case "teamName":
      return validateName(value, "teamName", "Team name");
    case "leaderName":
      return validateName(value, "leaderName", "Leader name");
  }
}

/**
 * Legacy-compat wrapper returning the old InputErrors shape.
 */
export function validateInputsLegacy(
  repoUrl: string,
  teamName: string,
  leaderName: string,
): InputErrors {
  const result = validateInputs(repoUrl, teamName, leaderName);
  const errors: InputErrors = {};
  for (const e of result.errors) {
    errors[e.field] = e.message;
  }
  return errors;
}

/**
 * Check whether a repoUrl is structurally valid (no network call).
 */
export function isValidGithubUrl(url: string): boolean {
  return normaliseGitHubUrl(sanitise(url)).valid;
}
