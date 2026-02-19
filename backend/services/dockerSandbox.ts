import type { AnalysisSummary } from '../types/agent';

export const analyzeRepositoryInDocker = async (input: {
  runId: string;
  repoUrl: string;
  teamName: string;
  leaderName: string;
}): Promise<AnalysisSummary> => {
  const { runId, repoUrl, teamName, leaderName } = input;

  try {
    if (!process.env.GITHUB_TOKEN) {
      throw new Error('Missing required environment variable: GITHUB_TOKEN');
    }

    const response = await fetch(
      'https://api.github.com/repos/Kushagra-Garg-27/AUTONOMOUS-CI-CD-HEALING-AGENT/dispatches',
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event_type: 'run-sandbox',
          client_payload: {
            runId,
            repoUrl,
            teamName,
            leaderName,
          },
        }),
      },
    );

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(`GitHub dispatch failed with status ${response.status}. ${responseText}`);
    }

    return {
      totalFiles: 0,
      dominantLanguage: 'Unknown',
      samplePaths: [],
    };
  } catch (error) {
    throw new Error(`Sandbox dispatch failed. ${error instanceof Error ? error.message : ''}`);
  }
};
