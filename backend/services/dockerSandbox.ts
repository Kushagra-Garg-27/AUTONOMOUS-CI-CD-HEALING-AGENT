import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { AnalysisSummary, BugType, DetectedIssue } from "../types/agent";

const execFileAsync = promisify(execFile);

const EXCLUDED_DIRS = new Set([
  ".git",
  ".github",
  "node_modules",
  "vendor",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".turbo",
  ".cache",
  ".vscode",
]);

const ACTIONABLE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".py",
  ".java",
  ".go",
  ".cpp",
  ".c",
  ".cs",
]);
const MAX_FILE_BYTES = 256 * 1024;
const MAX_FILES = 1500;
const MAX_ISSUES = 180;

const extensionOf = (filePath: string): string =>
  path.extname(filePath).toLowerCase();

const languageFromPath = (filePath: string): string => {
  if (filePath.endsWith(".ts") || filePath.endsWith(".tsx"))
    return "TypeScript";
  if (filePath.endsWith(".js") || filePath.endsWith(".jsx"))
    return "JavaScript";
  if (filePath.endsWith(".py")) return "Python";
  if (filePath.endsWith(".go")) return "Go";
  if (filePath.endsWith(".java")) return "Java";
  if (filePath.endsWith(".cpp") || filePath.endsWith(".c")) return "C/C++";
  if (filePath.endsWith(".cs")) return "C#";
  return "Other";
};

const toPosix = (filePath: string): string =>
  filePath.split(path.sep).join("/");

const walkFiles = async (rootDir: string): Promise<string[]> => {
  const stack = [rootDir];
  const files: string[] = [];

  while (stack.length > 0 && files.length < MAX_FILES) {
    const currentDir = stack.pop();
    if (!currentDir) {
      continue;
    }

    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".env") {
        if (entry.name !== ".github" && entry.isDirectory()) {
          continue;
        }
      }

      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry.name)) {
          stack.push(absolutePath);
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const ext = extensionOf(entry.name);
      if (!ACTIONABLE_EXTENSIONS.has(ext)) {
        continue;
      }

      files.push(absolutePath);
      if (files.length >= MAX_FILES) {
        break;
      }
    }
  }

  return files;
};

const detectIssuesInFile = async (
  absolutePath: string,
  repoRoot: string,
): Promise<DetectedIssue[]> => {
  const content = await readFile(absolutePath, "utf8");
  if (content.length > MAX_FILE_BYTES) {
    return [];
  }

  const lines = content.split(/\r?\n/);
  const issues: DetectedIssue[] = [];
  const relativePath = `repo/${toPosix(path.relative(repoRoot, absolutePath))}`;

  const pushIssue = (
    bugType: BugType,
    lineNumber: number,
    fixSuggestion: string,
  ) => {
    if (issues.length >= 3) {
      return;
    }
    issues.push({
      filePath: relativePath,
      bugType,
      lineNumber,
      fixSuggestion,
    });
  };

  let seenLinting = false;
  let seenImport = false;
  let seenType = false;
  let seenIndent = false;
  let seenLogic = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const lineNumber = index + 1;

    if (!seenLinting && /\s+$/.test(line)) {
      pushIssue("LINTING", lineNumber, "remove trailing whitespace");
      seenLinting = true;
      continue;
    }

    if (
      !seenImport &&
      (/^\s*from\s+.+\s+import\s+\*/.test(line) ||
        /^\s*import\s+\*\s+as\s+/.test(line))
    ) {
      pushIssue("IMPORT", lineNumber, "remove the import statement");
      seenImport = true;
      continue;
    }

    if (!seenType && (/:\s*any\b/.test(line) || /\bas\s+any\b/.test(line))) {
      pushIssue("TYPE_ERROR", lineNumber, "replace any with a concrete type");
      seenType = true;
      continue;
    }

    if (!seenIndent && /^\t+/.test(line)) {
      pushIssue(
        "INDENTATION",
        lineNumber,
        "replace tab indentation with spaces",
      );
      seenIndent = true;
      continue;
    }

    if (
      !seenLogic &&
      (/TODO|FIXME/.test(line) || /console\.log\(/.test(line))
    ) {
      pushIssue(
        "LOGIC",
        lineNumber,
        "remove debug statement and finalize implementation",
      );
      seenLogic = true;
    }

    if (issues.length >= 3) {
      break;
    }
  }

  return issues;
};

/* ── Clone a repository into an ephemeral temp directory ── */

export const cloneRepository = async (repoUrl: string): Promise<string> => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "healing-agent-"));
  const cloneDir = path.join(tempRoot, "repo");

  try {
    await execFileAsync(
      "git",
      ["-c", "core.longpaths=true", "clone", "--depth", "1", repoUrl, cloneDir],
      {
        timeout: 120_000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    return cloneDir;
  } catch (error) {
    await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
    throw new Error(
      `Repository clone failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
};

/* ── Scan an already-cloned repository for actionable issues ── */

export const scanForIssues = async (
  cloneDir: string,
): Promise<AnalysisSummary> => {
  const files = await walkFiles(cloneDir);
  const languageBuckets = new Map<string, number>();
  const detectedIssues: DetectedIssue[] = [];

  for (const absolutePath of files) {
    const language = languageFromPath(absolutePath);
    languageBuckets.set(language, (languageBuckets.get(language) ?? 0) + 1);

    const issuesForFile = await detectIssuesInFile(absolutePath, cloneDir);
    for (const issue of issuesForFile) {
      detectedIssues.push(issue);
      if (detectedIssues.length >= MAX_ISSUES) {
        break;
      }
    }

    if (detectedIssues.length >= MAX_ISSUES) {
      break;
    }
  }

  const dominantLanguage =
    [...languageBuckets.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
    "Unknown";
  const samplePaths = files
    .slice(0, 48)
    .map((p) => `repo/${toPosix(path.relative(cloneDir, p))}`);

  return {
    totalFiles: files.length,
    dominantLanguage,
    samplePaths,
    detectedIssues,
  };
};

/* ── Remove the temporary workspace after the run completes ── */

export const cleanupWorkspace = async (cloneDir: string): Promise<void> => {
  const tempRoot = path.dirname(cloneDir);
  await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
};
