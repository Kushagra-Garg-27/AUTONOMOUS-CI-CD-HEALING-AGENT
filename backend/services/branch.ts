const normalize = (value: string): string =>
  value
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_]/g, '')
    .toUpperCase();

export const generateBranchName = (teamName: string, leaderName: string): string => {
  const team = normalize(teamName);
  const leader = normalize(leaderName);
  return `${team}_${leader}_AI_Fix`;
};
