import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AnalysisSummary } from '../types/agent';

const execFileAsync = promisify(execFile);

const EXCLUDED_DIRS = new Set([
  '.git',
  '.github',
  'node_modules',
  'vendor',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.turbo',
  '.cache',
  '.vscode',
]);

const PRIORITY_DIRS = ['src', 'app', 'lib', 'services', 'packages', 'tests', '__tests__'];

const ACTIONABLE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.go', '.cpp', '.c', '.cs']);

const isExcludedByPattern = (filePath: string): boolean => {
  const lower = filePath.toLowerCase();
  return (
    lower.endsWith('.lock') ||
    lower.endsWith('.log') ||
    lower.endsWith('.tmp') ||
    lower.endsWith('.cache') ||
    lower.endsWith('.min.js') ||
    lower.endsWith('.map')
  );
};

const hasExcludedDirectorySegment = (filePath: string): boolean => {
  const segments = filePath.split('/');
  return segments.some((segment) => EXCLUDED_DIRS.has(segment));
};

const extensionOf = (filePath: string): string => {
  const dot = filePath.lastIndexOf('.');
  if (dot < 0) {
    return '';
  }
  return filePath.slice(dot).toLowerCase();
};

const isInPriorityDirectory = (filePath: string): boolean => {
  return PRIORITY_DIRS.some((dir) => filePath === `repo/${dir}` || filePath.startsWith(`repo/${dir}/`) || filePath.includes(`/${dir}/`));
};

const isActionableSourceFile = (filePath: string): boolean => {
  if (!filePath || hasExcludedDirectorySegment(filePath) || isExcludedByPattern(filePath)) {
    return false;
  }
  const ext = extensionOf(filePath);
  return ACTIONABLE_EXTENSIONS.has(ext) || isInPriorityDirectory(filePath);
};

const priorityRank = (filePath: string): number => {
  const index = PRIORITY_DIRS.findIndex(
    (dir) => filePath === `repo/${dir}` || filePath.startsWith(`repo/${dir}/`) || filePath.includes(`/${dir}/`),
  );
  return index >= 0 ? index : PRIORITY_DIRS.length;
};

const languageFromPath = (path: string): string => {
  if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'TypeScript';
  if (path.endsWith('.js') || path.endsWith('.jsx')) return 'JavaScript';
  if (path.endsWith('.py')) return 'Python';
  if (path.endsWith('.go')) return 'Go';
  if (path.endsWith('.java')) return 'Java';
  if (path.endsWith('.cpp') || path.endsWith('.c')) return 'C/C++';
  if (path.endsWith('.cs')) return 'C#';
  if (path.endsWith('.rs')) return 'Rust';
  return 'Other';
};

export const analyzeRepositoryInDocker = async (repoUrl: string): Promise<AnalysisSummary> => {
  const script = [
    'set -e',
    'apk add --no-cache git >/dev/null',
    `git clone --depth 1 ${JSON.stringify(repoUrl)} repo >/dev/null 2>&1`,
    "find repo -type f" +
      " ! -path '*/.git/*'" +
      " ! -path '*/.github/*'" +
      " ! -path '*/node_modules/*'" +
      " ! -path '*/vendor/*'" +
      " ! -path '*/dist/*'" +
      " ! -path '*/build/*'" +
      " ! -path '*/out/*'" +
      " ! -path '*/coverage/*'" +
      " ! -path '*/.next/*'" +
      " ! -path '*/.turbo/*'" +
      " ! -path '*/.cache/*'" +
      " ! -path '*/.vscode/*'" +
      " ! -name '*.lock'" +
      " ! -name '*.log'" +
      " ! -name '*.tmp'" +
      " ! -name '*.cache'" +
      " ! -name '*.min.js'" +
      " ! -name '*.map'" +
      " -print | sort | head -n 2000",
  ].join(' && ');

  try {
    const { stdout } = await execFileAsync('docker', ['run', '--rm', 'alpine:3.20', 'sh', '-lc', script], {
      timeout: 120000,
      maxBuffer: 2 * 1024 * 1024,
    });

    const discoveredFiles = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const files = discoveredFiles
      .filter(isActionableSourceFile)
      .sort((left, right) => {
        const rankDelta = priorityRank(left) - priorityRank(right);
        if (rankDelta !== 0) {
          return rankDelta;
        }
        return left.localeCompare(right);
      });

    // eslint-disable-next-line no-console
    console.info(
      `[analysis] discovered=${discoveredFiles.length} actionable=${files.length} excluded=${Math.max(0, discoveredFiles.length - files.length)}`,
    );

    if (files.length === 0) {
      return {
        totalFiles: 0,
        dominantLanguage: 'Unknown',
        samplePaths: [],
      };
    }

    const buckets = new Map<string, number>();
    files.forEach((filePath) => {
      const language = languageFromPath(filePath);
      buckets.set(language, (buckets.get(language) ?? 0) + 1);
    });

    const dominantLanguage = [...buckets.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Unknown';

    return {
      totalFiles: files.length,
      dominantLanguage,
      samplePaths: files.slice(0, 48),
    };
  } catch (error) {
    throw new Error(
      `Sandbox execution failed. Ensure Docker is installed and running. ${error instanceof Error ? error.message : ''}`,
    );
  }
};
