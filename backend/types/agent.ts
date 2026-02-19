export const ALLOWED_BUG_TYPES = [
  'LINTING',
  'SYNTAX',
  'LOGIC',
  'TYPE_ERROR',
  'IMPORT',
  'INDENTATION',
] as const;

export type BugType = (typeof ALLOWED_BUG_TYPES)[number];

export interface FixRow {
  filePath: string;
  bugType: BugType;
  lineNumber: number;
  commitMessage: string;
  status: 'passed' | 'failed';
}

export interface TimelineEntry {
  iteration: number;
  result: 'passed' | 'failed';
  timestamp: string;
  retryCount: number;
  retryLimit: number;
}

export interface AnalysisSummary {
  totalFiles: number;
  dominantLanguage: string;
  samplePaths: string[];
}

export interface RunResult {
  executionTime: number;
  ciStatus: 'pending' | 'running' | 'passed' | 'failed';
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
}

export type RunStatus = 'queued' | 'running' | 'completed' | 'failed';

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
  ciStatus: 'pending' | 'running' | 'passed' | 'failed';
  baseScore: number;
  speedBonus: number;
  efficiencyPenalty: number;
  executionTime: number;
}
