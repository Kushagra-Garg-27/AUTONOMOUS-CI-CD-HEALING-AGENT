import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BugType, DetectedIssue } from "../types/agent";

export interface PatchResult {
  filePath: string;
  bugType: BugType;
  lineNumber: number;
  applied: boolean;
  description: string;
}

/* ── Determine the concrete line-level fix for a given bug type ── */

interface LineFix {
  /** The replacement text for the line. `null` means delete the entire line. */
  replacement: string | null;
  description: string;
}

const computeLineFix = (line: string, bugType: BugType): LineFix | null => {
  switch (bugType) {
    case "LINTING": {
      const trimmed = line.trimEnd();
      if (trimmed !== line) {
        return {
          replacement: trimmed,
          description: "Removed trailing whitespace",
        };
      }
      return null;
    }

    case "INDENTATION": {
      if (/^\t/.test(line)) {
        return {
          replacement: line.replace(/\t/g, "  "),
          description: "Replaced tabs with spaces",
        };
      }
      return null;
    }

    case "TYPE_ERROR": {
      let fixed = line;
      let changed = false;
      if (/:\s*any\b/.test(fixed)) {
        fixed = fixed.replace(/:\s*any\b/g, ": unknown");
        changed = true;
      }
      if (/\bas\s+any\b/.test(fixed)) {
        fixed = fixed.replace(/\bas\s+any\b/g, "as unknown");
        changed = true;
      }
      return changed
        ? { replacement: fixed, description: "Replaced `any` with `unknown`" }
        : null;
    }

    case "IMPORT": {
      if (
        /^\s*from\s+.+\s+import\s+\*/.test(line) ||
        /^\s*import\s+\*\s+as\s+/.test(line)
      ) {
        return {
          replacement: null,
          description: "Removed wildcard import statement",
        };
      }
      return null;
    }

    case "LOGIC": {
      if (/console\.log\(/.test(line)) {
        return {
          replacement: null,
          description: "Removed console.log debug statement",
        };
      }
      if (/\/\/\s*(TODO|FIXME)/.test(line)) {
        const cleaned = line.replace(/\s*\/\/\s*(TODO|FIXME).*$/, "");
        if (cleaned.trim() === "") {
          return {
            replacement: null,
            description: "Removed TODO/FIXME comment line",
          };
        }
        return {
          replacement: cleaned,
          description: "Removed inline TODO/FIXME comment",
        };
      }
      if (/TODO|FIXME/.test(line)) {
        return { replacement: null, description: "Removed TODO/FIXME line" };
      }
      return null;
    }

    default:
      return null;
  }
};

/* ── Patch all issues in a single file (processes bottom-up to preserve line indices) ── */

const patchSingleFile = async (
  filePath: string,
  issues: DetectedIssue[],
  clonePath: string,
): Promise<PatchResult[]> => {
  const relPath = filePath.replace(/^repo\//, "");
  const absolutePath = path.join(clonePath, relPath);
  const results: PatchResult[] = [];

  let content: string;
  try {
    content = await readFile(absolutePath, "utf8");
  } catch (err) {
    return issues.map((issue) => ({
      filePath: issue.filePath,
      bugType: issue.bugType,
      lineNumber: issue.lineNumber,
      applied: false,
      description: `Cannot read file: ${err instanceof Error ? err.message : "unknown error"}`,
    }));
  }

  const lineEnding = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content.split(lineEnding);
  let modified = false;

  // Sort descending by line number — processing from bottom-up prevents index shifts
  // when lines are removed via splice.
  const sorted = [...issues].sort((a, b) => b.lineNumber - a.lineNumber);

  for (const issue of sorted) {
    const idx = issue.lineNumber - 1;

    if (idx < 0 || idx >= lines.length) {
      results.push({
        filePath: issue.filePath,
        bugType: issue.bugType,
        lineNumber: issue.lineNumber,
        applied: false,
        description: `Line ${issue.lineNumber} out of range (file has ${lines.length} lines)`,
      });
      continue;
    }

    const fix = computeLineFix(lines[idx], issue.bugType);

    if (!fix) {
      results.push({
        filePath: issue.filePath,
        bugType: issue.bugType,
        lineNumber: issue.lineNumber,
        applied: false,
        description: `Pattern no longer matches at line ${issue.lineNumber}`,
      });
      continue;
    }

    if (fix.replacement === null) {
      lines.splice(idx, 1);
    } else {
      lines[idx] = fix.replacement;
    }

    modified = true;
    results.push({
      filePath: issue.filePath,
      bugType: issue.bugType,
      lineNumber: issue.lineNumber,
      applied: true,
      description: fix.description,
    });
  }

  if (modified) {
    await writeFile(absolutePath, lines.join(lineEnding), "utf8");
  }

  return results;
};

/* ── Public API: apply patches across all affected files ── */

export const applyAllPatches = async (
  issues: DetectedIssue[],
  clonePath: string,
): Promise<PatchResult[]> => {
  // Group issues by file so each file is read/written only once.
  const byFile = new Map<string, DetectedIssue[]>();
  for (const issue of issues) {
    const existing = byFile.get(issue.filePath) ?? [];
    existing.push(issue);
    byFile.set(issue.filePath, existing);
  }

  const allResults: PatchResult[] = [];

  for (const [filePath, fileIssues] of byFile) {
    const fileResults = await patchSingleFile(filePath, fileIssues, clonePath);
    allResults.push(...fileResults);
  }

  return allResults;
};
