/**
 * useValidationFeedback — real-time validation hook with motion state.
 *
 * Drives the animated validation indicator inside the terminal.
 * Runs single-field validation on every keystroke (synchronous) and fires
 * the async GitHub repo existence check (debounced) when the repo URL
 * field passes structural validation.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  validateField,
  normaliseGitHubUrl,
  sanitise,
  type FieldError,
} from "../utils/validation";
import {
  createDebouncedRepoChecker,
  type RepoCheckResult,
  type RepoCheckStatus,
} from "../services/githubChecker";

/* ═══════════════════════════ Types ═══════════════════════════════════════ */

export type FeedbackState =
  | "idle"
  | "typing"
  | "valid"
  | "invalid"
  | "checking"
  | "repo-found"
  | "repo-not-found"
  | "repo-error";

export interface FieldFeedback {
  state: FeedbackState;
  message: string;
  /** 0-1 shake intensity for motion (invalid state). */
  shakeIntensity: number;
  /** Color token for the glow indicator. */
  glowColor: string;
}

const STATE_COLORS: Record<FeedbackState, string> = {
  idle: "rgba(148,163,184,0.4)",
  typing: "rgba(0,229,255,0.5)",
  valid: "#00FF7F",
  invalid: "#FF4757",
  checking: "#FFBD2E",
  "repo-found": "#00FF7F",
  "repo-not-found": "#FF4757",
  "repo-error": "#FFBD2E",
};

/* ═══════════════════════════ Hook ════════════════════════════════════════ */

export function useValidationFeedback() {
  const [feedback, setFeedback] = useState<FieldFeedback>({
    state: "idle",
    message: "",
    shakeIntensity: 0,
    glowColor: STATE_COLORS.idle,
  });

  const [repoCheck, setRepoCheck] = useState<RepoCheckResult>({
    status: "idle",
    message: "",
  });

  // Debounced GitHub checker — stable across renders
  const checker = useMemo(() => createDebouncedRepoChecker(700), []);
  const lastFieldRef = useRef<"repoUrl" | "teamName" | "leaderName">("repoUrl");
  const lastValueRef = useRef("");

  // Cleanup on unmount
  useEffect(() => () => checker.cancel(), [checker]);

  /**
   * Call this on every keystroke / input change.
   */
  const onFieldChange = useCallback(
    (
      field: "repoUrl" | "teamName" | "leaderName",
      value: string,
    ) => {
      lastFieldRef.current = field;
      lastValueRef.current = value;

      // Empty → idle
      if (!value.trim()) {
        setFeedback({
          state: "idle",
          message: "",
          shakeIntensity: 0,
          glowColor: STATE_COLORS.idle,
        });
        checker.cancel();
        setRepoCheck({ status: "idle", message: "" });
        return;
      }

      // Synchronous structural validation
      const error = validateField(field, value);
      if (error) {
        setFeedback({
          state: "invalid",
          message: error.message,
          shakeIntensity: error.code === "REQUIRED" ? 0.3 : 0.7,
          glowColor: STATE_COLORS.invalid,
        });
        checker.cancel();
        setRepoCheck({ status: "idle", message: "" });
        return;
      }

      // Field is structurally valid
      setFeedback({
        state: "valid",
        message: "",
        shakeIntensity: 0,
        glowColor: STATE_COLORS.valid,
      });

      // For repo URL — also fire the async existence check
      if (field === "repoUrl") {
        const parsed = normaliseGitHubUrl(sanitise(value));
        if (parsed.valid) {
          checker.check(value, (result) => {
            setRepoCheck(result);
            const mapped = mapRepoStatus(result.status);
            setFeedback({
              state: mapped,
              message: result.message,
              shakeIntensity: mapped === "repo-not-found" ? 0.6 : 0,
              glowColor: STATE_COLORS[mapped],
            });
          });
        }
      }
    },
    [checker],
  );

  /**
   * Validate on commit (Enter press). Returns error message or null.
   */
  const onFieldCommit = useCallback(
    (
      field: "repoUrl" | "teamName" | "leaderName",
      value: string,
    ): FieldError | null => {
      const error = validateField(field, value);
      if (error) {
        setFeedback({
          state: "invalid",
          message: error.message,
          shakeIntensity: 1,
          glowColor: STATE_COLORS.invalid,
        });
        return error;
      }

      // For repo URL, also check the async result
      if (field === "repoUrl" && repoCheck.status === "not-found") {
        const notFoundErr: FieldError = {
          field: "repoUrl",
          code: "REPO_NOT_FOUND",
          message: "Repository not found on GitHub.",
        };
        setFeedback({
          state: "repo-not-found",
          message: notFoundErr.message,
          shakeIntensity: 0.8,
          glowColor: STATE_COLORS["repo-not-found"],
        });
        return notFoundErr;
      }

      setFeedback({
        state: "valid",
        message: "",
        shakeIntensity: 0,
        glowColor: STATE_COLORS.valid,
      });
      return null;
    },
    [repoCheck],
  );

  /** Reset to idle (e.g. when advancing to next prompt). */
  const reset = useCallback(() => {
    setFeedback({
      state: "idle",
      message: "",
      shakeIntensity: 0,
      glowColor: STATE_COLORS.idle,
    });
    setRepoCheck({ status: "idle", message: "" });
    checker.cancel();
  }, [checker]);

  return { feedback, repoCheck, onFieldChange, onFieldCommit, reset };
}

/* ═══════════════════════════ Helpers ════════════════════════════════════ */

function mapRepoStatus(status: RepoCheckStatus): FeedbackState {
  switch (status) {
    case "checking":
      return "checking";
    case "exists":
      return "repo-found";
    case "not-found":
      return "repo-not-found";
    case "error":
      return "repo-error";
    default:
      return "valid";
  }
}
