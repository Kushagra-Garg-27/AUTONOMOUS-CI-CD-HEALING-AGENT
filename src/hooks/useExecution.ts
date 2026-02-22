import { useState } from 'react';
import { triggerAgentRun } from '../services/dashboardApi';
import { useDashboardStore } from '../store/dashboardStore';
import { generateBranchName } from '../utils/branch';
import { validateInputs, type InputErrors } from '../utils/validation';

export const useExecution = () => {
  const {
    metadata,
    setMetadata,
    setExecution,
    setResults,
    setData,
    setScoring,
    lockInputs,
    setErrorMessage,
    resetRunData,
  } = useDashboardStore();

  const [errors, setErrors] = useState<InputErrors>({});

  const runExecution = async (retryLimit: number) => {
    const result = validateInputs(metadata.repoUrl, metadata.teamName, metadata.leaderName);
    const validationErrors: InputErrors = {};
    for (const e of result.errors) {
      validationErrors[e.field] = e.message;
    }
    setErrors(validationErrors);

    if (!result.valid) {
      return;
    }

    // Use sanitised + normalised values for the API call
    const { repoUrl, teamName, leaderName } = result.sanitised;
    const branchName = generateBranchName(teamName, leaderName);
    setMetadata({ generatedBranchName: branchName, repoUrl, teamName, leaderName });

    // UX decision: lock all inputs immediately to prevent accidental edits while run state is active.
    lockInputs(true);
    setErrorMessage(null);
    resetRunData();
    setExecution({ status: 'running', ciStatus: 'running' });

    const startedAt = performance.now();

    try {
      const response = await triggerAgentRun({
        repoUrl,
        teamName,
        leaderName,
        retryLimit,
      });
      const elapsedSeconds = Math.max(response.executionTime, Math.round((performance.now() - startedAt) / 1000));
      const finalScore = Math.max(0, response.baseScore + response.speedBonus - response.efficiencyPenalty);
      const success = response.ciStatus === 'passed' && response.failuresCount === 0;

      setExecution({
        status: success ? 'success' : 'failed',
        ciStatus: response.ciStatus,
        executionTime: elapsedSeconds,
      });
      setResults({
        failuresCount: response.failuresCount,
        fixesCount: response.fixesCount,
        commitCount: response.commitCount,
      });
      setData({
        fixesTable: response.fixesTable,
        timeline: response.timeline,
      });
      setScoring({
        baseScore: response.baseScore,
        speedBonus: response.speedBonus,
        efficiencyPenalty: response.efficiencyPenalty,
        finalScore,
      });
    } catch (error) {
      setExecution({ status: 'failed', ciStatus: 'failed' });
      setErrorMessage(error instanceof Error ? error.message : 'Unknown API failure');
    } finally {
      lockInputs(false);
    }
  };

  return { errors, runExecution, setErrors };
};
