/**
 * remediationStrategies.ts — Category-Based Remediation Strategies.
 *
 * Each failure category maps to a specific, deterministic remediation
 * strategy. No patching occurs without a classified failure and
 * a matched strategy.
 *
 * Strategy execution is minimal and targeted:
 *   - DEPENDENCY_INSTALL_ERROR → add missing packages to manifest
 *   - PYTHON_IMPORT_ERROR     → add missing module to requirements.txt
 *   - PYTHON_SYNTAX_ERROR     → targeted syntax fix in fault files
 *   - TEST_ASSERTION_FAILURE  → defer to static patch engine (limited)
 *   - BUILD_ERROR             → defer to static patch engine (limited)
 *   - ENVIRONMENT_MISSING     → not remediable (report only)
 *   - PERMISSION_ERROR        → not remediable (report only)
 *   - UNKNOWN_FAILURE         → fallback to static patch engine
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FailureClassification, FailureCategory, RemediationStrategy } from './failureClassifier.js';

/* ── Strategy Result ── */

export interface StrategyResult {
  applied: boolean;
  strategy: RemediationStrategy;
  category: FailureCategory;
  filesModified: string[];
  description: string;
  /** Whether to proceed to static patching after this strategy */
  proceedToStaticPatch: boolean;
}

/* ── Python Dependency Helpers ── */

/** Well-known PyPI package name mappings (import name → pip name) */
const PYTHON_IMPORT_TO_PIP: Record<string, string> = {
  cv2: 'opencv-python',
  PIL: 'Pillow',
  sklearn: 'scikit-learn',
  yaml: 'PyYAML',
  bs4: 'beautifulsoup4',
  dotenv: 'python-dotenv',
  jwt: 'PyJWT',
  gi: 'PyGobject',
  serial: 'pyserial',
  usb: 'pyusb',
  attr: 'attrs',
  dateutil: 'python-dateutil',
  google: 'google-api-python-client',
  wx: 'wxPython',
  Crypto: 'pycryptodome',
  magic: 'python-magic',
  lxml: 'lxml',
  numpy: 'numpy',
  pandas: 'pandas',
  scipy: 'scipy',
  matplotlib: 'matplotlib',
  flask: 'Flask',
  django: 'Django',
  fastapi: 'fastapi',
  requests: 'requests',
  pytest: 'pytest',
  torch: 'torch',
  tensorflow: 'tensorflow',
  sqlalchemy: 'SQLAlchemy',
};

const resolvePipName = (importName: string): string => {
  // Strip sub-module paths (e.g. "foo.bar.baz" → "foo")
  const topLevel = importName.split('.')[0];
  return PYTHON_IMPORT_TO_PIP[topLevel] ?? topLevel;
};

/* ── Node.js Dependency Helpers ── */

const isNodeBuiltinModule = (name: string): boolean => {
  const builtins = new Set([
    'fs', 'path', 'os', 'http', 'https', 'url', 'crypto', 'stream',
    'buffer', 'events', 'util', 'child_process', 'net', 'tls', 'dns',
    'readline', 'zlib', 'worker_threads', 'cluster', 'assert', 'querystring',
    'string_decoder', 'timers', 'perf_hooks', 'v8', 'vm', 'wasi',
  ]);
  return builtins.has(name.replace(/^node:/, ''));
};

/* ── Strategy Implementations ── */

const addPythonDependency = async (
  clonePath: string,
  classification: FailureClassification,
): Promise<StrategyResult> => {
  const deps = classification.missingDependencies;
  if (deps.length === 0) {
    return {
      applied: false,
      strategy: 'ADD_DEPENDENCY',
      category: classification.category,
      filesModified: [],
      description: 'No missing dependencies identified from error output',
      proceedToStaticPatch: false,
    };
  }

  const pipNames = deps.map(resolvePipName);
  const reqPath = path.join(clonePath, 'requirements.txt');
  let content: string;
  try {
    content = await readFile(reqPath, 'utf8');
  } catch {
    // No requirements.txt — create one
    content = '';
  }

  const existingPkgs = new Set(
    content
      .split('\n')
      .map(line => line.trim().split(/[>=<!#]/)[0].trim().toLowerCase())
      .filter(Boolean),
  );

  const toAdd = pipNames.filter(pkg => !existingPkgs.has(pkg.toLowerCase()));

  if (toAdd.length === 0) {
    return {
      applied: false,
      strategy: 'ADD_DEPENDENCY',
      category: classification.category,
      filesModified: [],
      description: `Dependencies already present: ${pipNames.join(', ')}`,
      proceedToStaticPatch: false,
    };
  }

  // Append missing deps
  const newContent = content.trimEnd() + '\n' + toAdd.join('\n') + '\n';
  await writeFile(reqPath, newContent, 'utf8');

  return {
    applied: true,
    strategy: 'ADD_DEPENDENCY',
    category: classification.category,
    filesModified: ['requirements.txt'],
    description: `Added Python dependencies: ${toAdd.join(', ')}`,
    proceedToStaticPatch: false,
  };
};

const addNodeDependency = async (
  clonePath: string,
  classification: FailureClassification,
): Promise<StrategyResult> => {
  const deps = classification.missingDependencies.filter(d => !isNodeBuiltinModule(d));
  if (deps.length === 0) {
    return {
      applied: false,
      strategy: 'ADD_DEPENDENCY',
      category: classification.category,
      filesModified: [],
      description: 'No missing non-builtin Node modules identified',
      proceedToStaticPatch: false,
    };
  }

  const pkgJsonPath = path.join(clonePath, 'package.json');
  let pkgJson: Record<string, unknown>;
  try {
    pkgJson = JSON.parse(await readFile(pkgJsonPath, 'utf8'));
  } catch {
    return {
      applied: false,
      strategy: 'ADD_DEPENDENCY',
      category: classification.category,
      filesModified: [],
      description: 'No package.json found — cannot add Node dependencies',
      proceedToStaticPatch: false,
    };
  }

  const allDeps = {
    ...(pkgJson.dependencies as Record<string, string> ?? {}),
    ...(pkgJson.devDependencies as Record<string, string> ?? {}),
  };
  const toAdd = deps.filter(d => !allDeps[d]);

  if (toAdd.length === 0) {
    return {
      applied: false,
      strategy: 'ADD_DEPENDENCY',
      category: classification.category,
      filesModified: [],
      description: `Node dependencies already present: ${deps.join(', ')}`,
      proceedToStaticPatch: false,
    };
  }

  // Add to dependencies with "*" version (will resolve on install)
  const existingDeps = (pkgJson.dependencies ?? {}) as Record<string, string>;
  for (const dep of toAdd) {
    existingDeps[dep] = '*';
  }
  pkgJson.dependencies = existingDeps;
  await writeFile(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n', 'utf8');

  return {
    applied: true,
    strategy: 'ADD_DEPENDENCY',
    category: classification.category,
    filesModified: ['package.json'],
    description: `Added Node dependencies: ${toAdd.join(', ')}`,
    proceedToStaticPatch: false,
  };
};

const noOpStrategy = (
  category: FailureCategory,
  strategy: RemediationStrategy,
  reason: string,
): StrategyResult => ({
  applied: false,
  strategy,
  category,
  filesModified: [],
  description: reason,
  proceedToStaticPatch: false,
});

/* ── Public API: Execute strategy for a given classification ── */

/**
 * Execute the appropriate remediation strategy based on the failure classification.
 *
 * Returns a StrategyResult indicating whether changes were made and
 * whether the caller should proceed to the static patch engine.
 */
export const executeRemediationStrategy = async (
  clonePath: string,
  classification: FailureClassification,
  projectType: string,
): Promise<StrategyResult> => {
  console.log(
    `[remediation-strategy] Executing strategy=${classification.suggestedStrategy} ` +
    `for category=${classification.category}, project=${projectType}`,
  );

  switch (classification.suggestedStrategy) {
    case 'ADD_DEPENDENCY': {
      if (projectType === 'python') {
        return addPythonDependency(clonePath, classification);
      }
      if (projectType === 'node') {
        return addNodeDependency(clonePath, classification);
      }
      // For other project types, fall through to static patch
      return {
        applied: false,
        strategy: 'ADD_DEPENDENCY',
        category: classification.category,
        filesModified: [],
        description: `No automated dependency strategy for project type: ${projectType}`,
        proceedToStaticPatch: true,
      };
    }

    case 'FIX_IMPORT':
      // Import fixes in Python — handled by static patch engine
      return {
        applied: false,
        strategy: 'FIX_IMPORT',
        category: classification.category,
        filesModified: [],
        description: 'Import fix deferred to static patch engine',
        proceedToStaticPatch: true,
      };

    case 'FIX_SYNTAX':
      // Syntax errors need targeted file fixes
      return {
        applied: false,
        strategy: 'FIX_SYNTAX',
        category: classification.category,
        filesModified: [],
        description: 'Syntax fix deferred to static patch engine targeting fault files',
        proceedToStaticPatch: true,
      };

    case 'FIX_TEST':
      return {
        applied: false,
        strategy: 'FIX_TEST',
        category: classification.category,
        filesModified: [],
        description: 'Test failure remediation deferred to static patch engine',
        proceedToStaticPatch: true,
      };

    case 'FIX_BUILD_CONFIG':
      return {
        applied: false,
        strategy: 'FIX_BUILD_CONFIG',
        category: classification.category,
        filesModified: [],
        description: 'Build config fix deferred to static patch engine',
        proceedToStaticPatch: true,
      };

    case 'SETUP_ENVIRONMENT':
      return noOpStrategy(
        classification.category,
        'SETUP_ENVIRONMENT',
        'Environment/tool missing — cannot be fixed by code patches. Requires infrastructure change.',
      );

    case 'ESCALATE':
      return noOpStrategy(
        classification.category,
        'ESCALATE',
        'Permission/access issue — cannot be fixed by the agent. Escalate to repo owner.',
      );

    case 'SKIP':
      return noOpStrategy(
        classification.category,
        'SKIP',
        'No remediation needed (exit code 0 or no failure detected).',
      );

    case 'STATIC_PATCH':
    default:
      return {
        applied: false,
        strategy: 'STATIC_PATCH',
        category: classification.category,
        filesModified: [],
        description: 'Unknown failure — deferring to static regex patch engine',
        proceedToStaticPatch: true,
      };
  }
};
