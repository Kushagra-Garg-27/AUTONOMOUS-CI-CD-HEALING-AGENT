/**
 * testRunner.ts — Real test / build execution.
 *
 * Auto-detects the project type from manifest files, then executes the
 * actual test suite (and/or build) inside an isolated container or subprocess.
 * Returns structured results including exit code, captured output, and
 * parsed failure details.
 *
 * This replaces the previous regex-only "failure detection" with genuine
 * CI-grade validation.
 */

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import type { ProjectConfig, TestExecutionResult } from "../types/agent";
import {
  isDockerAvailable,
  runInContainer,
  runSubprocess,
} from "./containerSandbox";

/* ── Constants ── */

/** Maximum wall-clock time for a single test/build execution. */
const TEST_TIMEOUT_MS = 300_000; // 5 minutes
const DOCKER_MEMORY = "1g";
const DOCKER_CPUS = "2";

/* ── Filesystem helpers ── */

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const readJsonSafe = async (
  filePath: string,
): Promise<Record<string, unknown> | null> => {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/* ── Project type detection ── */

/**
 * Inspects the cloned repository root to determine the project type,
 * appropriate Docker image, install command, and test/build commands.
 */
export const detectProjectType = async (
  cloneDir: string,
): Promise<ProjectConfig> => {
  /* ── Node.js / TypeScript ── */
  const pkgJson = await readJsonSafe(path.join(cloneDir, "package.json"));
  if (pkgJson) {
    const scripts = (pkgJson.scripts ?? {}) as Record<string, string>;
    const testScript = scripts.test ?? "";
    const buildScript = scripts.build ?? "";
    const hasRealTest =
      !!testScript && !testScript.includes("no test specified");
    const hasBuild = !!buildScript;

    let testCmd = "";
    if (hasRealTest && hasBuild) {
      testCmd = "npm run build 2>&1 && npm test 2>&1";
    } else if (hasRealTest) {
      testCmd = "npm test 2>&1";
    } else if (hasBuild) {
      testCmd = "npm run build 2>&1";
    }

    const hasLockFile = await fileExists(
      path.join(cloneDir, "package-lock.json"),
    );

    return {
      type: "node",
      dockerImage: "node:20-slim",
      installCmd: hasLockFile ? "npm ci" : "npm install",
      testCmd,
      buildCmd: hasBuild ? "npm run build 2>&1" : "",
      hasTests: hasRealTest,
    };
  }

  /* ── Python ── */
  const hasRequirements = await fileExists(
    path.join(cloneDir, "requirements.txt"),
  );
  const hasPyproject = await fileExists(path.join(cloneDir, "pyproject.toml"));
  const hasSetupPy = await fileExists(path.join(cloneDir, "setup.py"));

  if (hasPyproject || hasRequirements || hasSetupPy) {
    let installCmd: string;
    if (hasRequirements) {
      installCmd = "pip install --no-cache-dir -r requirements.txt";
    } else {
      installCmd = "pip install --no-cache-dir -e .";
    }
    return {
      type: "python",
      dockerImage: "python:3.12-slim",
      installCmd,
      testCmd:
        "python -m pytest --tb=short -q 2>&1 || python -m unittest discover -s tests 2>&1",
      buildCmd: "",
      hasTests: true,
    };
  }

  /* ── Go ── */
  if (await fileExists(path.join(cloneDir, "go.mod"))) {
    return {
      type: "go",
      dockerImage: "golang:1.22-bookworm",
      installCmd: "go mod download",
      testCmd: "go test ./... -count=1 -timeout 120s 2>&1",
      buildCmd: "go build ./... 2>&1",
      hasTests: true,
    };
  }

  /* ── Java — Maven ── */
  if (await fileExists(path.join(cloneDir, "pom.xml"))) {
    return {
      type: "java-maven",
      dockerImage: "maven:3.9-eclipse-temurin-21",
      installCmd: "",
      testCmd: "mvn test -B -q 2>&1",
      buildCmd: "mvn compile -B -q 2>&1",
      hasTests: true,
    };
  }

  /* ── Java — Gradle ── */
  if (
    (await fileExists(path.join(cloneDir, "build.gradle"))) ||
    (await fileExists(path.join(cloneDir, "build.gradle.kts")))
  ) {
    return {
      type: "java-gradle",
      dockerImage: "gradle:8-jdk21",
      installCmd: "",
      testCmd: "gradle test --no-daemon -q 2>&1",
      buildCmd: "gradle build --no-daemon -q 2>&1",
      hasTests: true,
    };
  }

  /* ── Rust ── */
  if (await fileExists(path.join(cloneDir, "Cargo.toml"))) {
    return {
      type: "rust",
      dockerImage: "rust:1.77-slim",
      installCmd: "",
      testCmd: "cargo test --quiet 2>&1",
      buildCmd: "cargo build --quiet 2>&1",
      hasTests: true,
    };
  }

  /* ── .NET ── */
  if (await fileExists(path.join(cloneDir, "Directory.Build.props"))) {
    return {
      type: "dotnet",
      dockerImage: "mcr.microsoft.com/dotnet/sdk:8.0",
      installCmd: "dotnet restore",
      testCmd: "dotnet test --no-restore --verbosity minimal 2>&1",
      buildCmd: "dotnet build --no-restore --verbosity minimal 2>&1",
      hasTests: true,
    };
  }

  /* ── Unknown project ── */
  return {
    type: "unknown",
    dockerImage: "",
    installCmd: "",
    testCmd: "",
    buildCmd: "",
    hasTests: false,
  };
};

/* ── Test output parsing ── */

/**
 * Extract individual failure descriptions from raw test output.
 * Returns up to 30 entries to keep state manageable.
 */
const parseTestFailures = (
  stdout: string,
  stderr: string,
  projectType: string,
): string[] => {
  const combined = `${stdout}\n${stderr}`;
  const failures: string[] = [];

  switch (projectType) {
    case "node": {
      // Jest
      const jestFails = combined.match(/FAIL\s+\S+/g);
      if (jestFails) failures.push(...jestFails);
      // Vitest / Mocha
      const vitestFails = combined.match(/[×✗]\s+.+/g);
      if (vitestFails) failures.push(...vitestFails.slice(0, 20));
      // TypeScript compilation errors
      const tsErrors = combined.match(/error TS\d+:.+$/gm);
      if (tsErrors) failures.push(...tsErrors.slice(0, 20));
      // Generic Error: lines
      if (failures.length === 0) {
        const genericErrs = combined.match(/Error:\s.+$/gm);
        if (genericErrs) failures.push(...genericErrs.slice(0, 10));
      }
      break;
    }
    case "python": {
      const pytestFails = combined.match(/FAILED\s+\S+/g);
      if (pytestFails) failures.push(...pytestFails);
      const assertionErrors = combined.match(/^E\s+.+$/gm);
      if (assertionErrors) failures.push(...assertionErrors.slice(0, 10));
      break;
    }
    case "go": {
      const goFails = combined.match(/--- FAIL:\s+\S+/g);
      if (goFails) failures.push(...goFails);
      break;
    }
    case "java-maven":
    case "java-gradle": {
      const javaFails = combined.match(/Tests run:.*Failures:\s*[1-9].*/g);
      if (javaFails) failures.push(...javaFails);
      break;
    }
    case "rust": {
      const rustFails = combined.match(/test\s+\S+\s+\.\.\.\s+FAILED/g);
      if (rustFails) failures.push(...rustFails);
      break;
    }
    case "dotnet": {
      const dotnetFails = combined.match(/Failed\s+\S+/g);
      if (dotnetFails) failures.push(...dotnetFails);
      break;
    }
  }

  return failures.slice(0, 30);
};

/**
 * Build a human-readable error summary from test output.
 */
const buildErrorSummary = (
  stdout: string,
  stderr: string,
  exitCode: number,
  timedOut: boolean,
): string => {
  if (timedOut) return "Test execution timed out (exceeded 5-minute limit)";
  if (exitCode === 0) return "All tests passed";

  // Take the tail of the output — usually the most relevant part.
  const combined = (stderr || stdout).trim();
  if (!combined)
    return `Tests exited with code ${exitCode} (no output captured)`;
  if (combined.length <= 600) return combined;
  return "…" + combined.slice(combined.length - 600);
};

/* ── Public API: Execute the real test suite ── */

/**
 * Run the project's actual test suite (and/or build) inside a Docker
 * container when available, falling back to a sandboxed subprocess.
 *
 * This is the function that closes the core gap: real failure detection
 * and real patch validation, driven by actual process exit codes.
 */
export const executeTests = async (
  cloneDir: string,
  config: ProjectConfig,
): Promise<TestExecutionResult> => {
  // If we cannot determine project type or no commands exist, report honestly.
  if (!config.testCmd && !config.buildCmd) {
    console.warn(
      `[test-runner] No test or build command for project type "${config.type}" — skipping execution`,
    );
    return {
      passed: false,
      exitCode: -1,
      stdout: "",
      stderr:
        "No test or build command detected for this project type. " +
        "The repository may lack a recognized build manifest (package.json, requirements.txt, go.mod, pom.xml, etc.).",
      durationMs: 0,
      failedTests: [],
      errorSummary:
        "Cannot execute tests — project type unrecognised or no test/build commands configured",
      executionMethod: "skipped",
    };
  }

  // Build the full command: install deps then run tests.
  const command = config.installCmd
    ? `${config.installCmd} 2>&1 && (${config.testCmd || config.buildCmd})`
    : config.testCmd || config.buildCmd;

  const env: Record<string, string> = {
    CI: "true",
    NODE_ENV: "test",
    FORCE_COLOR: "0",
    // Prevent interactive prompts in any tool.
    DEBIAN_FRONTEND: "noninteractive",
  };

  const useDocker = await isDockerAvailable();
  let raw;

  if (useDocker && config.dockerImage) {
    console.log(
      `[test-runner] Docker execution — image: ${config.dockerImage}, cmd: ${command}`,
    );
    raw = await runInContainer({
      image: config.dockerImage,
      mountPath: cloneDir,
      command,
      timeoutMs: TEST_TIMEOUT_MS,
      memoryLimit: DOCKER_MEMORY,
      cpuLimit: DOCKER_CPUS,
      env,
    });
  } else {
    console.log(`[test-runner] Subprocess execution — cmd: ${command}`);
    raw = await runSubprocess(command, cloneDir, TEST_TIMEOUT_MS, env);
  }

  const failedTests = parseTestFailures(raw.stdout, raw.stderr, config.type);
  const errorSummary = buildErrorSummary(
    raw.stdout,
    raw.stderr,
    raw.exitCode,
    raw.timedOut,
  );

  const result: TestExecutionResult = {
    passed: raw.exitCode === 0,
    exitCode: raw.exitCode,
    stdout: raw.stdout,
    stderr: raw.stderr,
    durationMs: raw.durationMs,
    failedTests,
    errorSummary,
    executionMethod: useDocker ? "docker" : "subprocess",
  };

  console.log(
    `[test-runner] Result — passed: ${result.passed}, exit: ${result.exitCode}, ` +
      `failures: ${failedTests.length}, duration: ${raw.durationMs}ms, ` +
      `method: ${result.executionMethod}`,
  );

  return result;
};
