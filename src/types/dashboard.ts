export type ExecutionStatus = 'idle' | 'running' | 'success' | 'failed';
export type CiStatus = 'pending' | 'running' | 'passed' | 'failed';

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

export interface DashboardApiResult {
  executionTime?: number;
  ciStatus?: CiStatus;
  failuresCount?: number;
  fixesCount?: number;
  commitCount?: number;
  fixesTable?: unknown[];
  timeline?: unknown[];
  baseScore?: number;
  speedBonus?: number;
  efficiencyPenalty?: number;
}
