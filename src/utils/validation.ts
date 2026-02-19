export interface InputErrors {
  repoUrl?: string;
  teamName?: string;
  leaderName?: string;
}

export const isValidGithubUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol.startsWith('http') &&
      parsed.hostname.toLowerCase() === 'github.com' &&
      parsed.pathname.split('/').filter(Boolean).length >= 2
    );
  } catch {
    return false;
  }
};

export const validateInputs = (repoUrl: string, teamName: string, leaderName: string): InputErrors => {
  const errors: InputErrors = {};

  if (!repoUrl.trim()) {
    errors.repoUrl = 'GitHub URL is required.';
  } else if (!isValidGithubUrl(repoUrl)) {
    errors.repoUrl = 'Provide a valid GitHub repository URL.';
  }

  if (!teamName.trim()) {
    errors.teamName = 'Team name is required.';
  }

  if (!leaderName.trim()) {
    errors.leaderName = 'Leader name is required.';
  }

  return errors;
};
