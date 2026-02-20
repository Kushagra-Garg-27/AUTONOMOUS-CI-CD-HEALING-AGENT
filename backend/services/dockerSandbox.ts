import type { AnalysisSummary } from '../types/agent';

const buildMockAnalysisSummary = (repoUrl: string): AnalysisSummary => {
  const repoName = (() => {
    try {
      const pathname = new URL(repoUrl).pathname;
      const lastSegment = pathname.split('/').filter(Boolean).pop();
      return lastSegment || 'repo';
    } catch {
      return 'repo';
    }
  })();

  return {
    totalFiles: 120,
    dominantLanguage: 'TypeScript',
    samplePaths: [
      `repo/${repoName}/src/App.tsx`,
      `repo/${repoName}/src/components/Dashboard.tsx`,
      `repo/${repoName}/src/components/InputForm.tsx`,
      `repo/${repoName}/src/services/api.ts`,
      `repo/${repoName}/src/utils/validation.ts`,
    ],
  };
};

export const analyzeRepositoryInDocker = async (input: {
  runId: string;
  repoUrl: string;
  teamName: string;
  leaderName: string;
  generatedBranchName: string;
}): Promise<AnalysisSummary> => {
  const { runId, repoUrl, teamName, leaderName, generatedBranchName } = input;
  const githubToken = process.env.GITHUB_TOKEN?.trim();
  const isProduction = process.env.NODE_ENV === 'production';
  const allowLocalMock = process.env.SANDBOX_ALLOW_MOCK !== 'false';

  try {
    if (!githubToken) {
      if (!isProduction && allowLocalMock) {
        console.warn(
          'GITHUB_TOKEN is not set. Running sandbox analyzer in local mock mode. Set GITHUB_TOKEN to enable real GitHub dispatch.',
        );
        return buildMockAnalysisSummary(repoUrl);
      }
      throw new Error('Missing required environment variable: GITHUB_TOKEN');
    }

    const response = await fetch(
      'https://api.github.com/repos/Kushagra-Garg-27/AUTONOMOUS-CI-CD-HEALING-AGENT/dispatches',
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${githubToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event_type: 'run-sandbox',
          client_payload: {
            runId,
            repoUrl,
            teamName,
            leaderName,
            branchName: generatedBranchName,
          },
        }),
      },
    );

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(`GitHub dispatch failed with status ${response.status}. ${responseText}`);
    }

    return buildMockAnalysisSummary(repoUrl);
  } catch (error) {
    throw new Error(`Sandbox dispatch failed. ${error instanceof Error ? error.message : ''}`);
  }
};
