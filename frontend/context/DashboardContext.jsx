import { createContext, useContext, useMemo, useState } from 'react';

const DashboardContext = createContext(null);

const API_TIMEOUT_MS = 180000;

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
      const response = await fetch('/api/agent/runs', {
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

      setFixes(normalizedFixes);

      const failureLines = normalizedFixes.map(
        (item) => `${item.bugType} error in ${item.file} line ${item.lineNumber} → Fix: ${item.commitMessage}`,
      );

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
