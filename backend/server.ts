import cors from 'cors';
import express from 'express';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { AGENT_PIPELINE, runAgentGraph } from './agents/graphAgents';
import { generateBranchName } from './services/branch';
import type { RunRecord, RunResult } from './types/agent';

const app = express();
const port = Number(process.env.PORT ?? 8080);
const DEFAULT_RETRY_LIMIT = Number(process.env.AGENT_RETRY_LIMIT ?? 5);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '..');
const runsRoot = path.join(workspaceRoot, 'runs');
const publicResultsPath = path.join(workspaceRoot, 'public', 'results.json');

const runStore = new Map<string, RunRecord>();

app.use(cors());
app.use(express.json());

const clampRetryLimit = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_RETRY_LIMIT;
  }
  return Math.min(20, Math.max(1, Math.floor(parsed)));
};

const persistRunResult = async (runId: string, result: unknown) => {
  const runDir = path.join(runsRoot, runId);
  await mkdir(runDir, { recursive: true });
  await writeFile(path.join(runDir, 'results.json'), JSON.stringify(result, null, 2), 'utf8');
  await writeFile(publicResultsPath, JSON.stringify(result, null, 2), 'utf8');
};

app.get('/api/agent/health', (_req, res) => {
  res.json({
    ok: true,
    defaultRetryLimit: DEFAULT_RETRY_LIMIT,
    activeRuns: runStore.size,
    orchestration: {
      framework: 'langgraph',
      mode: 'multi-agent',
      agents: [...AGENT_PIPELINE],
    },
  });
});

app.post('/api/agent/runs', async (req, res) => {
  const repoUrl = String(req.body?.repoUrl ?? '').trim();
  const teamName = String(req.body?.teamName ?? '').trim();
  const leaderName = String(req.body?.leaderName ?? '').trim();
  const retryLimit = clampRetryLimit(req.body?.retryLimit);

  if (!repoUrl || !teamName || !leaderName) {
    res.status(400).json({ error: 'repoUrl, teamName, and leaderName are required.' });
    return;
  }

  const runId = randomUUID();
  const runRecord: RunRecord = {
    id: runId,
    repoUrl,
    teamName,
    leaderName,
    retryLimit,
    status: 'running',
    startedAt: new Date().toISOString(),
  };

  runStore.set(runId, runRecord);

  try {
    const result = await runAgentGraph({ runId, repoUrl, teamName, leaderName, retryLimit });

    const completedRecord: RunRecord = {
      ...runRecord,
      status: 'completed',
      finishedAt: new Date().toISOString(),
      result,
    };

    runStore.set(runId, completedRecord);
    await persistRunResult(runId, result);

    res.status(201).json({ runId, status: 'completed', result });
  } catch (error) {
    const fallbackResult: RunResult = {
      executionTime: 0,
      ciStatus: 'failed',
      failuresCount: 1,
      fixesCount: 0,
      commitCount: 0,
      fixesTable: [],
      timeline: [
        {
          iteration: 1,
          result: 'failed',
          timestamp: new Date().toISOString(),
          retryCount: 1,
          retryLimit,
        },
      ],
      baseScore: 100,
      speedBonus: 0,
      efficiencyPenalty: 0,
      repoUrl,
      generatedBranchName: generateBranchName(teamName, leaderName),
      analysisSummary: {
        totalFiles: 0,
        dominantLanguage: 'Unknown',
        samplePaths: [],
      },
    };

    const failedRecord: RunRecord = {
      ...runRecord,
      status: 'failed',
      finishedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown run error',
      result: fallbackResult,
    };
    runStore.set(runId, failedRecord);
    await persistRunResult(runId, fallbackResult);
    res.status(500).json({ runId, status: 'failed', error: failedRecord.error });
  }
});

app.get('/api/agent/runs/:runId', (req, res) => {
  const run = runStore.get(req.params.runId);
  if (!run) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }
  res.json(run);
});

app.get('/api/agent/runs/:runId/results', (req, res) => {
  const run = runStore.get(req.params.runId);
  if (!run?.result) {
    res.status(404).json({ error: 'Run result not found' });
    return;
  }
  res.json(run.result);
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Agent API listening on http://localhost:${port}`);
});
app.post('/api/sandbox/callback', (req, res) => {
  const { runId, status } = req.body;

  console.log('Sandbox callback received:', req.body);

  const run = runStore.get(runId);

  if (!run) {
    return res.status(404).json({ error: 'Run not found' });
  }

  run.status = status ?? 'completed';
  run.finishedAt = new Date().toISOString();

  runStore.set(runId, run);

  res.json({ ok: true });
});
