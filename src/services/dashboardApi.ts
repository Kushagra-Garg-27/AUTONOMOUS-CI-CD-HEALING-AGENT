import { ALLOWED_BUG_TYPES, type DashboardApiResult, type FixRow, type TimelineEntry } from '../types/dashboard';

const REQUEST_TIMEOUT_MS = 180000;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const toFixRow = (row: unknown): FixRow | null => {
  if (!isObject(row)) {
    return null;
  }

  const bugTypeRaw = typeof row.bugType === 'string' ? row.bugType.toUpperCase() : '';
  const isAllowed = (ALLOWED_BUG_TYPES as readonly string[]).includes(bugTypeRaw);

  if (!isAllowed) {
    return null;
  }

  return {
    filePath: typeof row.filePath === 'string' ? row.filePath : 'unknown',
    bugType: bugTypeRaw as FixRow['bugType'],
    lineNumber: toNumber(row.lineNumber),
    commitMessage: typeof row.commitMessage === 'string' ? row.commitMessage : 'No commit message',
    status: row.status === 'failed' ? 'failed' : 'passed',
  };
};

const toTimelineEntry = (entry: unknown): TimelineEntry | null => {
  if (!isObject(entry)) {
    return null;
  }

  const iteration = toNumber(entry.iteration, 0);
  if (iteration <= 0) {
    return null;
  }

  return {
    iteration,
    result: entry.result === 'failed' ? 'failed' : 'passed',
    timestamp: typeof entry.timestamp === 'string' ? entry.timestamp : new Date().toISOString(),
    retryCount: toNumber(entry.retryCount),
    retryLimit: toNumber(entry.retryLimit, 5),
  };
};

export interface NormalizedApiResult {
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
}

interface TriggerRunPayload {
  repoUrl: string;
  teamName: string;
  leaderName: string;
  retryLimit: number;
}

const normalizePayload = (payload: DashboardApiResult): NormalizedApiResult => {
  const fixesTable = Array.isArray(payload.fixesTable)
    ? payload.fixesTable.map(toFixRow).filter((value): value is FixRow => value !== null)
    : [];

  const timeline = Array.isArray(payload.timeline)
    ? payload.timeline.map(toTimelineEntry).filter((value): value is TimelineEntry => value !== null)
    : [];

  return {
    executionTime: toNumber(payload.executionTime),
    ciStatus:
      payload.ciStatus === 'pending' ||
      payload.ciStatus === 'running' ||
      payload.ciStatus === 'passed' ||
      payload.ciStatus === 'failed'
        ? payload.ciStatus
        : 'pending',
    failuresCount: toNumber(payload.failuresCount),
    fixesCount: toNumber(payload.fixesCount),
    commitCount: toNumber(payload.commitCount),
    fixesTable,
    timeline,
    baseScore: toNumber(payload.baseScore, 0),
    speedBonus: toNumber(payload.speedBonus, 0),
    efficiencyPenalty: toNumber(payload.efficiencyPenalty, 0),
  };
};

export const triggerAgentRun = async (payload: TriggerRunPayload): Promise<NormalizedApiResult> => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch('/api/agent/runs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(errorBody.error ?? `API error: ${response.status}`);
    }

    const body = (await response.json()) as { result?: DashboardApiResult } & DashboardApiResult;
    const result = body.result ?? body;

    return normalizePayload(result);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Request timed out while waiting for agent execution.');
    }

    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
};
