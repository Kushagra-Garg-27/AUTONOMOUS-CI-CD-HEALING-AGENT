const normalizeSegment = (value: string): string =>
  value
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_]/g, '')
    .toUpperCase();

export const generateBranchName = (teamName: string, leaderName: string): string => {
  const teamSegment = normalizeSegment(teamName);
  const leaderSegment = normalizeSegment(leaderName);
  return `${teamSegment}_${leaderSegment}_AI_Fix`;
};
