import { createContext, useContext, useMemo, useState } from 'react';

const DashboardContext = createContext(null);

const API_TIMEOUT_MS = 180000;
const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const FIX_ACTION_BY_TYPE = {
  LINTING: 'remove the import statement',
  SYNTAX: 'correct the syntax',
  LOGIC: 'correct the logic flow',
  TYPE_ERROR: 'fix the type mismatch',
  IMPORT: 'remove the import statement',
  INDENTATION: 'fix the indentation',
};

const normalizeFixActionText = (commitMessage, bugType) => {
  const cleaned = String(commitMessage || '')
    .replace(/\[AI-AGENT\]\s*/gi, '')
    .replace(/fix\(agent\):\s*/gi, '')
    .replace(/\(batch\s*\d+\)/gi, '')
    .replace(/\(fallback\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned || /^remediate\b/i.test(cleaned) || /automated fixes for run/i.test(cleaned)) {
    return FIX_ACTION_BY_TYPE[bugType] || 'apply the required fix';
  }

  return cleaned.replace(/[.]+$/, '');
};

const toLogLine = (item) => {
  const lineNumber = Math.max(1, Number(item.lineNumber || 0));
  const bugType = String(item.bugType || 'LINTING').toUpperCase();
  const file = String(item.file || 'src/utils.py');
  const action = normalizeFixActionText(item.commitMessage, bugType);
  return `${bugType} error in ${file} line ${lineNumber} → Fix: ${action}`;
};

export const DashboardProvider = ({ children }) => {
  const [repoUrl, setRepoUrl] = useState('');
  const [teamName, setTeamName] = useState('');
  const [teamLeaderName, setTeamLeaderName] = useState('');

  const [executionTime, setExecutionTime] = useState(0);
  const [commitCount, setCommitCount] = useState(0);
  const [failures, setFailures] = useState([]);
  const [fixes, setFixes] = useState([]);
  const [status, setStatus] = useState('FAILED');
  const [branchName, setBranchName] = useState('');

  const [loading, setLoading] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const runAgent = async (onRunResult) => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    setLoading(true);
    setErrorMessage('');

    try {
      const response = await fetch(`${BASE_URL}/api/agent/runs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          repoUrl,
          teamName,
          leaderName: teamLeaderName,
          retryLimit: 5,
        }),
      });

      const body = await response.json();

      if (!response.ok) {
        throw new Error(body?.error || 'Failed to run agent');
      }

      const result = body.result ?? {};
      const ciStatus = String(result.ciStatus || '').toLowerCase();

      if (typeof onRunResult === 'function') {
        onRunResult(result);
      }

      setExecutionTime(Number(result.executionTime || 0));
      setCommitCount(Number(result.commitCount || 0));
      setBranchName(String(result.generatedBranchName || ''));
      setStatus(ciStatus === 'passed' ? 'PASSED' : 'FAILED');

      const normalizedFixes = Array.isArray(result.fixesTable)
        ? result.fixesTable.map((item) => ({
            file: String(item.filePath || ''),
            bugType: String(item.bugType || '').toUpperCase(),
            lineNumber: Number(item.lineNumber || 0),
            commitMessage: String(item.commitMessage || ''),
            status: String(item.status || '').toLowerCase() === 'passed' ? 'FIXED' : 'FAILED',
          }))
        : [];

      const formattedFixes = normalizedFixes.map((item) => ({
        ...item,
        logLine: toLogLine(item),
      }));

      setFixes(formattedFixes);

      const failureLines = formattedFixes.map((item) => item.logLine);

      setFailures(failureLines);
      setShowDashboard(true);
    } catch (error) {
      setStatus('FAILED');
      setShowDashboard(true);
      setFailures([]);
      setFixes([]);
      setErrorMessage(error instanceof Error ? error.message : 'Unexpected run error');
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  };

  const value = useMemo(
    () => ({
      repoUrl,
      setRepoUrl,
      teamName,
      setTeamName,
      teamLeaderName,
      setTeamLeaderName,
      executionTime,
      commitCount,
      failures,
      fixes,
      status,
      branchName,
      loading,
      showDashboard,
      errorMessage,
      runAgent,
    }),
    [
      repoUrl,
      teamName,
      teamLeaderName,
      executionTime,
      commitCount,
      failures,
      fixes,
      status,
      branchName,
      loading,
      showDashboard,
      errorMessage,
    ],
  );

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
};

export const useDashboard = () => {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error('useDashboard must be used within DashboardProvider');
  }
  return context;
};
