/**
 * containerSandbox.ts — Real execution isolation layer.
 *
 * Runs commands inside Docker containers when available, falling back to
 * host subprocess execution with timeouts when Docker is not present.
 * All untrusted code execution (tests, builds) MUST go through this module.
 */

import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/* ── Types ── */

export interface ContainerConfig {
  /** Docker image to use (e.g. "node:20-slim") */
  image: string;
  /** Absolute host path to mount into the container at /workspace */
  mountPath: string;
  /** Shell command string to execute inside the container */
  command: string;
  /** Hard timeout in milliseconds — process is killed after this */
  timeoutMs: number;
  /** Docker --memory flag (e.g. "1g") */
  memoryLimit: string;
  /** Docker --cpus flag (e.g. "2") */
  cpuLimit: string;
  /** Environment variables passed into the container / subprocess */
  env: Record<string, string>;
}

export interface ContainerResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

/* ── Constants ── */

/** Cap captured output to 10 KB per stream to avoid bloating state. */
const MAX_OUTPUT_BYTES = 10 * 1024;
const EXEC_MAX_BUFFER = 16 * 1024 * 1024; // 16 MB raw capture

/* ── Helpers ── */

const truncateOutput = (output: string): string => {
  if (output.length <= MAX_OUTPUT_BYTES) return output;
  return (
    `…[truncated ${output.length - MAX_OUTPUT_BYTES} bytes]…\n` +
    output.slice(output.length - MAX_OUTPUT_BYTES)
  );
};

/**
 * Normalise a host path for Docker volume mounts.
 * On Windows, Docker Desktop expects paths like /c/Users/... when using
 * Linux containers, but modern Docker Desktop also accepts C:\Users\...
 * We convert backslashes to forward slashes for safety.
 */
const toDockerMountPath = (hostPath: string): string => {
  // Convert Windows backslash paths to forward slashes
  let p = hostPath.replace(/\\/g, "/");
  // Convert drive letter  C:/  →  /c/
  p = p.replace(
    /^([A-Za-z]):\//,
    (_m, drive: string) => `/${drive.toLowerCase()}/`,
  );
  return p;
};

/* ── Docker availability check (cached for process lifetime) ── */

let _dockerAvailable: boolean | null = null;

export const isDockerAvailable = async (): Promise<boolean> => {
  if (_dockerAvailable !== null) return _dockerAvailable;
  try {
    await execFileAsync("docker", ["info"], {
      timeout: 15_000,
      windowsHide: true,
    });
    _dockerAvailable = true;
  } catch {
    _dockerAvailable = false;
  }
  console.log(`[container] Docker available: ${_dockerAvailable}`);
  return _dockerAvailable;
};

/* ── Run inside a Docker container ── */

export const runInContainer = async (
  config: ContainerConfig,
): Promise<ContainerResult> => {
  const startMs = Date.now();

  const mountSrc = toDockerMountPath(config.mountPath);

  const args: string[] = [
    "run",
    "--rm",
    "--memory",
    config.memoryLimit,
    "--cpus",
    config.cpuLimit,
    "--pids-limit",
    "512",
    // Drop all Linux capabilities — the test code should not need host access.
    "--cap-drop=ALL",
    // Mount the cloned repo into the container.
    "-v",
    `${mountSrc}:/workspace:rw`,
    "-w",
    "/workspace",
  ];

  // Inject environment variables
  for (const [key, value] of Object.entries(config.env)) {
    args.push("-e", `${key}=${value}`);
  }

  args.push(config.image, "sh", "-c", config.command);

  try {
    const { stdout, stderr } = await execFileAsync("docker", args, {
      timeout: config.timeoutMs,
      maxBuffer: EXEC_MAX_BUFFER,
      windowsHide: true,
    });
    return {
      exitCode: 0,
      stdout: truncateOutput(stdout),
      stderr: truncateOutput(stderr),
      durationMs: Date.now() - startMs,
      timedOut: false,
    };
  } catch (err: unknown) {
    const durationMs = Date.now() - startMs;
    const e = err as Record<string, unknown>;
    const timedOut =
      e?.killed === true || durationMs >= config.timeoutMs - 1000;
    return {
      exitCode: typeof e?.code === "number" ? e.code : 1,
      stdout: truncateOutput(String(e?.stdout ?? "")),
      stderr: truncateOutput(String(e?.stderr ?? "")),
      durationMs,
      timedOut,
    };
  }
};

/* ── Fallback: Run directly on the host as a subprocess ── */

export const runSubprocess = async (
  command: string,
  cwd: string,
  timeoutMs: number,
  env: Record<string, string> = {},
): Promise<ContainerResult> => {
  const startMs = Date.now();

  // Use platform-appropriate shell.
  const shell = process.platform === "win32" ? "cmd" : "sh";
  const shellFlag = process.platform === "win32" ? "/c" : "-c";

  try {
    const { stdout, stderr } = await execFileAsync(
      shell,
      [shellFlag, command],
      {
        cwd,
        timeout: timeoutMs,
        maxBuffer: EXEC_MAX_BUFFER,
        env: { ...process.env, ...env },
        windowsHide: true,
      },
    );
    return {
      exitCode: 0,
      stdout: truncateOutput(stdout),
      stderr: truncateOutput(stderr),
      durationMs: Date.now() - startMs,
      timedOut: false,
    };
  } catch (err: unknown) {
    const durationMs = Date.now() - startMs;
    const e = err as Record<string, unknown>;
    const timedOut = e?.killed === true || durationMs >= timeoutMs - 1000;
    return {
      exitCode: typeof e?.code === "number" ? e.code : 1,
      stdout: truncateOutput(String(e?.stdout ?? "")),
      stderr: truncateOutput(String(e?.stderr ?? "")),
      durationMs,
      timedOut,
    };
  }
};
