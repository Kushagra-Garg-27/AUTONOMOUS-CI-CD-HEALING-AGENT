/**
 * failureClassifier.ts — Structured Failure Intelligence Layer.
 *
 * Categorises CI/CD failures into deterministic categories by analysing:
 *   - stderr pattern matching
 *   - exit codes
 *   - known pip / pytest / node error patterns
 *   - module-not-found detection
 *   - stack trace heuristics
 *
 * Remediation logic MUST branch based on the category returned here.
 * No patching is allowed until a failure category is identified.
 */

/* ── Failure Categories ── */

export const FAILURE_CATEGORIES = [
  'DEPENDENCY_INSTALL_ERROR',
  'PYTHON_IMPORT_ERROR',
  'PYTHON_SYNTAX_ERROR',
  'TEST_ASSERTION_FAILURE',
  'BUILD_ERROR',
  'ENVIRONMENT_MISSING',
  'PERMISSION_ERROR',
  'UNKNOWN_FAILURE',
] as const;

export type FailureCategory = (typeof FAILURE_CATEGORIES)[number];

/* ── Classification Result ── */

export interface FailureClassification {
  /** Primary failure category */
  category: FailureCategory;
  /** Human-readable summary of the root cause */
  summary: string;
  /** Confidence score 0.0 – 1.0 */
  confidence: number;
  /** Raw stderr that was analysed */
  rawStderr: string;
  /** Specific patterns that matched */
  matchedPatterns: string[];
  /** Extracted module / package names if applicable */
  missingDependencies: string[];
  /** Extracted file paths from stack traces */
  faultFiles: string[];
  /** Whether remediation is feasible for this category */
  remediable: boolean;
  /** Suggested remediation strategy identifier */
  suggestedStrategy: RemediationStrategy;
}

export type RemediationStrategy =
  | 'ADD_DEPENDENCY'
  | 'FIX_IMPORT'
  | 'FIX_SYNTAX'
  | 'FIX_TEST'
  | 'FIX_BUILD_CONFIG'
  | 'SETUP_ENVIRONMENT'
  | 'ESCALATE'    // Permission / infra — cannot fix in code
  | 'STATIC_PATCH' // Fallback to existing regex-based patching
  | 'SKIP';        // Nothing to do

/* ── Pattern Definitions ── */

interface PatternRule {
  category: FailureCategory;
  /** Regex applied to combined stderr + stdout */
  pattern: RegExp;
  /** Weight for tie-breaking when multiple patterns match */
  weight: number;
  strategy: RemediationStrategy;
  /** Optional extractor to pull specific details from the match */
  extract?: (match: RegExpMatchArray, combined: string) => Partial<FailureClassification>;
}

const extractPythonModule = (match: RegExpMatchArray): Partial<FailureClassification> => ({
  missingDependencies: match[1] ? [match[1].trim()] : [],
});

const extractNodeModule = (match: RegExpMatchArray): Partial<FailureClassification> => ({
  missingDependencies: match[1] ? [match[1].trim().replace(/['"]/g, '')] : [],
});

const extractPipPackages = (_match: RegExpMatchArray, combined: string): Partial<FailureClassification> => {
  const pkgs: string[] = [];
  // Extract "No matching distribution found for <pkg>"
  const noMatch = combined.match(/No matching distribution found for (\S+)/g);
  if (noMatch) {
    for (const m of noMatch) {
      const pkg = m.replace('No matching distribution found for ', '').trim();
      if (pkg) pkgs.push(pkg);
    }
  }
  // Extract "Could not find a version that satisfies the requirement <pkg>"
  const noVersion = combined.match(/Could not find a version that satisfies the requirement (\S+)/g);
  if (noVersion) {
    for (const m of noVersion) {
      const pkg = m.replace(/Could not find a version that satisfies the requirement /, '').trim();
      if (pkg) pkgs.push(pkg.split(/[>=<!]/)[0]);
    }
  }
  // Extract "ERROR: Failed building wheel for <pkg>"  
  const wheelFail = combined.match(/Failed building wheel for (\S+)/g);
  if (wheelFail) {
    for (const m of wheelFail) {
      const pkg = m.replace('Failed building wheel for ', '').trim();
      if (pkg) pkgs.push(pkg);
    }
  }
  return { missingDependencies: [...new Set(pkgs)] };
};

const extractFaultFilesFromTraceback = (_match: RegExpMatchArray, combined: string): Partial<FailureClassification> => {
  const files: string[] = [];
  const fileRefs = combined.match(/File "([^"]+)", line \d+/g);
  if (fileRefs) {
    for (const ref of fileRefs) {
      const m = ref.match(/File "([^"]+)"/);
      if (m?.[1] && !m[1].includes('site-packages') && !m[1].includes('/usr/lib')) {
        files.push(m[1]);
      }
    }
  }
  return { faultFiles: [...new Set(files)] };
};

/* ── Ordered list of pattern rules (checked top-to-bottom, weighted) ── */

const PATTERN_RULES: PatternRule[] = [
  // ═══════ DEPENDENCY INSTALL ERRORS ═══════
  {
    category: 'DEPENDENCY_INSTALL_ERROR',
    pattern: /pip install.*(?:error|failed|could not)/i,
    weight: 90,
    strategy: 'ADD_DEPENDENCY',
    extract: extractPipPackages,
  },
  {
    category: 'DEPENDENCY_INSTALL_ERROR',
    pattern: /No matching distribution found for (\S+)/i,
    weight: 95,
    strategy: 'ADD_DEPENDENCY',
    extract: extractPipPackages,
  },
  {
    category: 'DEPENDENCY_INSTALL_ERROR',
    pattern: /Could not find a version that satisfies the requirement/i,
    weight: 95,
    strategy: 'ADD_DEPENDENCY',
    extract: extractPipPackages,
  },
  {
    category: 'DEPENDENCY_INSTALL_ERROR',
    pattern: /Failed building wheel for (\S+)/i,
    weight: 85,
    strategy: 'ADD_DEPENDENCY',
    extract: extractPipPackages,
  },
  {
    category: 'DEPENDENCY_INSTALL_ERROR',
    pattern: /npm ERR! code E(?:404|RESOLVE|PEER)/i,
    weight: 90,
    strategy: 'ADD_DEPENDENCY',
  },
  {
    category: 'DEPENDENCY_INSTALL_ERROR',
    pattern: /npm ERR! (?:missing|not found|ERESOLVE)/i,
    weight: 88,
    strategy: 'ADD_DEPENDENCY',
  },
  {
    category: 'DEPENDENCY_INSTALL_ERROR',
    pattern: /Cannot find module '([^']+)'/,
    weight: 80,
    strategy: 'ADD_DEPENDENCY',
    extract: extractNodeModule,
  },
  {
    category: 'DEPENDENCY_INSTALL_ERROR',
    pattern: /Module not found:\s*(?:Error:\s*)?Can't resolve '([^']+)'/,
    weight: 85,
    strategy: 'ADD_DEPENDENCY',
    extract: extractNodeModule,
  },
  {
    category: 'DEPENDENCY_INSTALL_ERROR',
    pattern: /go: module .+ not found/i,
    weight: 85,
    strategy: 'ADD_DEPENDENCY',
  },
  {
    category: 'DEPENDENCY_INSTALL_ERROR',
    pattern: /cargo.+could not find/i,
    weight: 85,
    strategy: 'ADD_DEPENDENCY',
  },

  // ═══════ PYTHON IMPORT ERRORS ═══════
  {
    category: 'PYTHON_IMPORT_ERROR',
    pattern: /ModuleNotFoundError:\s*No module named ['\"]?(\S+?)['\"]?$/m,
    weight: 95,
    strategy: 'ADD_DEPENDENCY',
    extract: extractPythonModule,
  },
  {
    category: 'PYTHON_IMPORT_ERROR',
    pattern: /ImportError:\s*cannot import name ['\"]?(\S+?)['\"]?/i,
    weight: 90,
    strategy: 'FIX_IMPORT',
    extract: (match) => ({ missingDependencies: match[1] ? [match[1]] : [] }),
  },
  {
    category: 'PYTHON_IMPORT_ERROR',
    pattern: /ImportError:\s*No module named ['\"]?(\S+?)['\"]?/i,
    weight: 92,
    strategy: 'ADD_DEPENDENCY',
    extract: extractPythonModule,
  },

  // ═══════ PYTHON SYNTAX ERRORS ═══════
  {
    category: 'PYTHON_SYNTAX_ERROR',
    pattern: /SyntaxError:\s*.+/,
    weight: 90,
    strategy: 'FIX_SYNTAX',
    extract: extractFaultFilesFromTraceback,
  },
  {
    category: 'PYTHON_SYNTAX_ERROR',
    pattern: /IndentationError:\s*.+/,
    weight: 88,
    strategy: 'FIX_SYNTAX',
    extract: extractFaultFilesFromTraceback,
  },
  {
    category: 'PYTHON_SYNTAX_ERROR',
    pattern: /TabError:\s*.+/,
    weight: 85,
    strategy: 'FIX_SYNTAX',
    extract: extractFaultFilesFromTraceback,
  },

  // ═══════ TEST ASSERTION FAILURES ═══════
  {
    category: 'TEST_ASSERTION_FAILURE',
    pattern: /FAILED\s+\S+.*::\S+/,
    weight: 85,
    strategy: 'FIX_TEST',
  },
  {
    category: 'TEST_ASSERTION_FAILURE',
    pattern: /AssertionError/,
    weight: 80,
    strategy: 'FIX_TEST',
    extract: extractFaultFilesFromTraceback,
  },
  {
    category: 'TEST_ASSERTION_FAILURE',
    pattern: /pytest.*\d+ failed/i,
    weight: 82,
    strategy: 'FIX_TEST',
  },
  {
    category: 'TEST_ASSERTION_FAILURE',
    pattern: /FAIL\s+\S+.*\(.*\)/,
    weight: 75,
    strategy: 'FIX_TEST',
  },
  {
    category: 'TEST_ASSERTION_FAILURE',
    pattern: /Tests:\s+\d+ failed/,
    weight: 78,
    strategy: 'FIX_TEST',
  },
  {
    category: 'TEST_ASSERTION_FAILURE',
    pattern: /--- FAIL: (\S+)/,
    weight: 80,
    strategy: 'FIX_TEST',
  },
  {
    category: 'TEST_ASSERTION_FAILURE',
    pattern: /test result: FAILED/i,
    weight: 78,
    strategy: 'FIX_TEST',
  },

  // ═══════ BUILD ERRORS ═══════
  {
    category: 'BUILD_ERROR',
    pattern: /error TS\d+:/,
    weight: 85,
    strategy: 'FIX_BUILD_CONFIG',
  },
  {
    category: 'BUILD_ERROR',
    pattern: /Build failed/i,
    weight: 80,
    strategy: 'FIX_BUILD_CONFIG',
  },
  {
    category: 'BUILD_ERROR',
    pattern: /compilation failed|compile error/i,
    weight: 82,
    strategy: 'FIX_BUILD_CONFIG',
  },
  {
    category: 'BUILD_ERROR',
    pattern: /error\[E\d+\]/,  // Rust compiler errors
    weight: 85,
    strategy: 'FIX_BUILD_CONFIG',
  },
  {
    category: 'BUILD_ERROR',
    pattern: /COMPILATION ERROR/i,  // Maven
    weight: 85,
    strategy: 'FIX_BUILD_CONFIG',
  },
  {
    category: 'BUILD_ERROR',
    pattern: /BUILD FAILURE/i,  // Maven / Gradle
    weight: 83,
    strategy: 'FIX_BUILD_CONFIG',
  },

  // ═══════ ENVIRONMENT MISSING ═══════
  {
    category: 'ENVIRONMENT_MISSING',
    pattern: /command not found|not recognized as.*command/i,
    weight: 88,
    strategy: 'SETUP_ENVIRONMENT',
  },
  {
    category: 'ENVIRONMENT_MISSING',
    pattern: /python[23]?:\s*not found/i,
    weight: 92,
    strategy: 'SETUP_ENVIRONMENT',
  },
  {
    category: 'ENVIRONMENT_MISSING',
    pattern: /node:\s*not found|npm:\s*not found/i,
    weight: 90,
    strategy: 'SETUP_ENVIRONMENT',
  },
  {
    category: 'ENVIRONMENT_MISSING',
    pattern: /java:\s*not found|javac:\s*not found/i,
    weight: 90,
    strategy: 'SETUP_ENVIRONMENT',
  },
  {
    category: 'ENVIRONMENT_MISSING',
    pattern: /No such file or directory/i,
    weight: 50,
    strategy: 'SETUP_ENVIRONMENT',
  },

  // ═══════ PERMISSION ERRORS ═══════
  {
    category: 'PERMISSION_ERROR',
    pattern: /Permission denied/i,
    weight: 90,
    strategy: 'ESCALATE',
  },
  {
    category: 'PERMISSION_ERROR',
    pattern: /EACCES|EPERM/i,
    weight: 88,
    strategy: 'ESCALATE',
  },
  {
    category: 'PERMISSION_ERROR',
    pattern: /403 Forbidden/i,
    weight: 92,
    strategy: 'ESCALATE',
  },
  {
    category: 'PERMISSION_ERROR',
    pattern: /Authentication failed|auth.*denied/i,
    weight: 85,
    strategy: 'ESCALATE',
  },
];

/* ── Classification Engine ── */

/**
 * Classify a CI/CD failure based on stderr, stdout, and exit code.
 *
 * This function MUST be called before any remediation logic runs.
 * The returned category drives the entire remediation strategy.
 */
export const classifyFailure = (input: {
  stderr: string;
  stdout: string;
  exitCode: number;
  projectType?: string;
}): FailureClassification => {
  const { stderr, stdout, exitCode, projectType } = input;
  const combined = `${stdout}\n${stderr}`;

  // If exit code 0, there's no failure to classify
  if (exitCode === 0) {
    return {
      category: 'UNKNOWN_FAILURE',
      summary: 'Exit code 0 — no failure detected',
      confidence: 1.0,
      rawStderr: stderr,
      matchedPatterns: [],
      missingDependencies: [],
      faultFiles: [],
      remediable: false,
      suggestedStrategy: 'SKIP',
    };
  }

  // Accumulate all matches with their weights
  const matches: Array<{
    rule: PatternRule;
    match: RegExpMatchArray;
    extracted: Partial<FailureClassification>;
  }> = [];

  for (const rule of PATTERN_RULES) {
    const match = combined.match(rule.pattern);
    if (match) {
      const extracted = rule.extract?.(match, combined) ?? {};
      matches.push({ rule, match, extracted });
    }
  }

  if (matches.length === 0) {
    return buildUnknownClassification(stderr, exitCode, combined);
  }

  // Sort by weight descending, pick the highest
  matches.sort((a, b) => b.rule.weight - a.rule.weight);
  const best = matches[0];

  // Merge all extracted data from same-category matches
  const sameCategoryMatches = matches.filter(m => m.rule.category === best.rule.category);
  const allDeps = new Set<string>();
  const allFiles = new Set<string>();
  const allPatterns: string[] = [];

  for (const m of sameCategoryMatches) {
    if (m.extracted.missingDependencies) {
      for (const dep of m.extracted.missingDependencies) allDeps.add(dep);
    }
    if (m.extracted.faultFiles) {
      for (const f of m.extracted.faultFiles) allFiles.add(f);
    }
    allPatterns.push(m.rule.pattern.source);
  }

  const confidence = Math.min(1.0, best.rule.weight / 100);
  const summary = buildSummary(best.rule.category, [...allDeps], best.match, combined, projectType);

  return {
    category: best.rule.category,
    summary,
    confidence,
    rawStderr: stderr.slice(0, 5000),
    matchedPatterns: allPatterns.slice(0, 10),
    missingDependencies: [...allDeps],
    faultFiles: [...allFiles].slice(0, 20),
    remediable: isRemediable(best.rule.category),
    suggestedStrategy: best.rule.strategy,
  };
};

/* ── Helpers ── */

const buildUnknownClassification = (
  stderr: string,
  exitCode: number,
  combined: string,
): FailureClassification => {
  // Try to extract any useful information from exit code heuristics
  let summary = `Process exited with code ${exitCode}`;
  if (exitCode === 1) summary += ' — generic failure';
  else if (exitCode === 2) summary += ' — misuse of shell command';
  else if (exitCode === 126) summary += ' — command not executable';
  else if (exitCode === 127) summary += ' — command not found';
  else if (exitCode === 128) summary += ' — invalid exit argument';
  else if (exitCode > 128 && exitCode <= 192) summary += ` — killed by signal ${exitCode - 128}`;
  else if (exitCode === 137) summary += ' — killed by SIGKILL (OOM likely)';

  // Extract fault files from generic tracebacks
  const faultFiles: string[] = [];
  const fileRefs = combined.match(/(?:at |File "|in )([^\s"():]+\.\w+)(?:[":)]|\s+line)/g);
  if (fileRefs) {
    for (const ref of fileRefs.slice(0, 10)) {
      const clean = ref.replace(/^(?:at |File "|in )/, '').replace(/[":)].*/,'');
      if (clean && !clean.includes('node_modules') && !clean.includes('site-packages')) {
        faultFiles.push(clean);
      }
    }
  }

  return {
    category: 'UNKNOWN_FAILURE',
    summary,
    confidence: 0.2,
    rawStderr: stderr.slice(0, 5000),
    matchedPatterns: [],
    missingDependencies: [],
    faultFiles: [...new Set(faultFiles)],
    remediable: false,
    suggestedStrategy: 'STATIC_PATCH',
  };
};

const buildSummary = (
  category: FailureCategory,
  deps: string[],
  match: RegExpMatchArray,
  _combined: string,
  projectType?: string,
): string => {
  switch (category) {
    case 'DEPENDENCY_INSTALL_ERROR':
      return deps.length > 0
        ? `Dependency installation failed — missing: ${deps.join(', ')}`
        : 'Dependency installation failed during setup';
    case 'PYTHON_IMPORT_ERROR':
      return deps.length > 0
        ? `Python import error — module not found: ${deps.join(', ')}`
        : `Python import error: ${match[0]?.slice(0, 200) ?? 'unknown module'}`;
    case 'PYTHON_SYNTAX_ERROR':
      return `Python syntax/indentation error detected: ${match[0]?.slice(0, 200) ?? 'unknown'}`;
    case 'TEST_ASSERTION_FAILURE':
      return `Test assertion failure(s) detected in ${projectType ?? 'unknown'} project`;
    case 'BUILD_ERROR':
      return `Build/compilation error in ${projectType ?? 'unknown'} project: ${match[0]?.slice(0, 200) ?? 'unknown'}`;
    case 'ENVIRONMENT_MISSING':
      return `Required tool/runtime missing from environment: ${match[0]?.slice(0, 200) ?? 'unknown'}`;
    case 'PERMISSION_ERROR':
      return `Permission denied — ${match[0]?.slice(0, 200) ?? 'unknown access issue'}`;
    default:
      return 'Unclassified failure';
  }
};

const isRemediable = (category: FailureCategory): boolean => {
  switch (category) {
    case 'DEPENDENCY_INSTALL_ERROR':
    case 'PYTHON_IMPORT_ERROR':
    case 'PYTHON_SYNTAX_ERROR':
    case 'TEST_ASSERTION_FAILURE':
    case 'BUILD_ERROR':
      return true;
    case 'ENVIRONMENT_MISSING':
    case 'PERMISSION_ERROR':
    case 'UNKNOWN_FAILURE':
      return false;
    default:
      return false;
  }
};

/**
 * Determine severity ranking for comparison (lower = more severe).
 * Used to check if remediation improved or worsened the situation.
 */
export const severityRank = (category: FailureCategory): number => {
  switch (category) {
    case 'PERMISSION_ERROR':        return 10;  // infra — can't fix
    case 'ENVIRONMENT_MISSING':     return 20;  // infra — can't fix
    case 'DEPENDENCY_INSTALL_ERROR': return 30;  // fixable but blocks everything
    case 'PYTHON_IMPORT_ERROR':     return 40;
    case 'PYTHON_SYNTAX_ERROR':     return 50;
    case 'BUILD_ERROR':             return 60;
    case 'TEST_ASSERTION_FAILURE':  return 70;  // least severe — code runs, test logic wrong
    case 'UNKNOWN_FAILURE':         return 100; // unknown
    default:                        return 100;
  }
};
