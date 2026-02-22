export const ALLOWED_BUG_TYPES = [
  "LINTING",
  "SYNTAX",
  "LOGIC",
  "TYPE_ERROR",
  "IMPORT",
  "INDENTATION",
] as const;

export type BugType = (typeof ALLOWED_BUG_TYPES)[number];

/* ── Real execution types (added to close the test-execution gap) ── */

export interface ProjectConfig {
  type:
    | 'node'
    | 'python'
    | 'go'
    | 'java-maven'
    | 'java-gradle'
    | 'rust'
    | 'dotnet'
    | 'unknown';
  dockerImage: string;
  installCmd: string;
  testCmd: string;
  buildCmd: string;
  hasTests: boolean;
}

export interface TestExecutionResult {
  passed: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  failedTests: string[];
  errorSummary: string;
  executionMethod: 'docker' | 'subprocess' | 'skipped';
}

export interface FixRow {
  filePath: string;
  bugType: BugType;
  lineNumber: number;
  commitMessage: string;
  status: "passed" | "failed";
}

export interface TimelineEntry {
  iteration: number;
  result: "passed" | "failed";
  timestamp: string;
  retryCount: number;
  retryLimit: number;
}

export interface DetectedIssue {
  filePath: string;
  bugType: BugType;
  lineNumber: number;
  fixSuggestion: string;
}

export interface AnalysisSummary {
  totalFiles: number;
  dominantLanguage: string;
  samplePaths: string[];
  detectedIssues: DetectedIssue[];
}

export interface RunResult {
  executionTime: number;
  ciStatus: "pending" | "running" | "passed" | "failed";
  failuresCount: number;
  fixesCount: number;
  commitCount: number;
  fixesTable: FixRow[];
  timeline: TimelineEntry[];
  baseScore: number;
  speedBonus: number;
  efficiencyPenalty: number;
  repoUrl: string;
  generatedBranchName: string;
  analysisSummary: AnalysisSummary;
  /** Real test/build execution results — added to close the execution gap. */
  testResults: TestExecutionResult;
  /** Auto-detected project type (node, python, go, etc.) */
  projectType: string;
}

export type RunStatus = "queued" | "running" | "completed" | "failed";

export interface RunRecord {
  id: string;
  repoUrl: string;
  teamName: string;
  leaderName: string;
  retryLimit: number;
  status: RunStatus;
  startedAt: string;
  finishedAt?: string;
  error?: string;
  result?: RunResult;
}

export interface AgentGraphState {
  runId: string;
  repoUrl: string;
  teamName: string;
  leaderName: string;
  retryLimit: number;
  generatedBranchName: string;
  startedAtMs: number;
  analysisSummary: AnalysisSummary;
  fixesTable: FixRow[];
  timeline: TimelineEntry[];
  failuresCount: number;
  fixesCount: number;
  commitCount: number;
  ciStatus: "pending" | "running" | "passed" | "failed";
  baseScore: number;
  speedBonus: number;
  efficiencyPenalty: number;
  executionTime: number;
  clonePath: string;
  currentIteration: number;
  /** Auto-detected project configuration for real test execution. */
  projectConfig: ProjectConfig;
  /** Latest results from running the actual test suite / build. */
  testResults: TestExecutionResult;
}
