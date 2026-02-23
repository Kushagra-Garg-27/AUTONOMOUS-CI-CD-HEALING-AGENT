/**
 * db.ts — PostgreSQL connection pool.
 *
 * Single pooled connection via `pg.Pool`, configured from DATABASE_URL.
 * Provides query helpers and clean shutdown for graceful process termination.
 */

import pg from "pg";

const { Pool } = pg;

/* ── Pool singleton ── */

let pool: pg.Pool | null = null;
let poolReady = false;

/**
 * Parse DATABASE_URL and log redacted connection parameters for diagnostics.
 */
const logConnectionParams = (connectionString: string): void => {
  try {
    const url = new URL(connectionString);
    const redactedPassword = url.password
      ? `${url.password.slice(0, 3)}***${url.password.slice(-2)}`
      : "(empty)";
    console.log("[db] Connection parameters:");
    console.log(`  host     : ${url.hostname}`);
    console.log(`  port     : ${url.port || "(default)"}`);
    console.log(`  database : ${url.pathname.replace("/", "")}`);
    console.log(`  user     : ${url.username}`);
    console.log(
      `  password : ${redactedPassword} (length=${url.password.length})`,
    );
    console.log(`  params   : ${url.searchParams.toString() || "(none)"}`);

    // Warn about common Supabase pooler issues
    const port = parseInt(url.port, 10);
    if (port === 5432) {
      console.warn(
        "[db] WARNING: Port 5432 is the direct connection port. " +
          "Supabase connection pooler typically uses port 6543. " +
          "If you see IPv6/ENETUNREACH errors, switch to the pooler URL.",
      );
    }
    if (url.password.endsWith(" ") || url.password.startsWith(" ")) {
      console.error(
        "[db] ERROR: DATABASE_URL password has leading/trailing whitespace!",
      );
    }
    if (connectionString.endsWith(" ") || connectionString.endsWith("\n")) {
      console.error(
        "[db] ERROR: DATABASE_URL has trailing whitespace or newline!",
      );
    }
  } catch (e) {
    console.error(
      "[db] Failed to parse DATABASE_URL:",
      e instanceof Error ? e.message : e,
    );
  }
};

/**
 * Categorise a connection error for actionable diagnostics.
 */
const categoriseError = (err: unknown): string => {
  if (!(err instanceof Error)) return "unknown";
  const msg = err.message.toLowerCase();
  const code = (err as NodeJS.ErrnoException).code?.toLowerCase() ?? "";

  if (code === "enetunreach" || msg.includes("enetunreach"))
    return "NETWORK_UNREACHABLE (IPv6 blocked — use Supabase pooler URL on port 6543)";
  if (code === "enotfound" || msg.includes("enotfound"))
    return "DNS_RESOLUTION_FAILED (hostname cannot be resolved)";
  if (code === "econnrefused" || msg.includes("econnrefused"))
    return "CONNECTION_REFUSED (host reachable but port closed)";
  if (code === "econnreset" || msg.includes("econnreset"))
    return "CONNECTION_RESET (connection dropped — possible SSL/firewall issue)";
  if (msg.includes("timeout"))
    return "TIMEOUT (connection attempt exceeded deadline — check host/port/firewall)";
  if (msg.includes("ssl") || msg.includes("tls") || msg.includes("certificate"))
    return "SSL_HANDSHAKE (SSL/TLS negotiation failed)";
  if (
    msg.includes("password") ||
    msg.includes("authentication") ||
    msg.includes("28p01")
  )
    return "AUTH_FAILURE (invalid credentials)";
  if (msg.includes("no pg_hba.conf"))
    return "AUTH_FAILURE (IP not allowed in pg_hba.conf)";
  if (msg.includes("remaining connection slots"))
    return "POOL_EXHAUSTED (too many connections)";

  return `UNCATEGORISED (code=${code})`;
};

/**
 * Return (or create) the shared connection pool.
 * Uses DATABASE_URL from the environment.  Supabase provides this natively.
 */
export const getPool = (): pg.Pool => {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. " +
        "Provide a PostgreSQL connection string (e.g. from Supabase) in your .env file.",
    );
  }

  logConnectionParams(connectionString);

  const sslConfig =
    process.env.DB_SSL === "false" ? false : { rejectUnauthorized: false };

  console.log(
    `[db] SSL mode: ${process.env.DB_SSL === "false" ? "disabled (DB_SSL=false)" : "enabled (rejectUnauthorized=false)"}`,
  );

  pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000, // 15 s — generous for cold starts
    ssl: sslConfig,
  });

  pool.on("error", (err) => {
    console.error("[db] Unexpected pool error:", err.message);
    console.error("[db] Error category:", categoriseError(err));
  });

  console.log("[db] Connection pool created");
  return pool;
};

/**
 * Perform an immediate connection test.
 * Must be called after getPool(). Throws on failure.
 */
export const initPool = async (): Promise<void> => {
  const p = getPool();
  console.log("[db] Testing database connection…");
  const start = Date.now();
  let client: pg.PoolClient | undefined;
  try {
    client = await p.connect();
    const result = await client.query("SELECT 1 AS connection_test");
    const elapsed = Date.now() - start;
    if (result.rows[0]?.connection_test === 1) {
      console.log(`[db] ✓ Connection verified successfully (${elapsed}ms)`);
      poolReady = true;
    } else {
      throw new Error(
        "SELECT 1 returned unexpected result: " + JSON.stringify(result.rows),
      );
    }
  } catch (err) {
    const elapsed = Date.now() - start;
    const category = categoriseError(err);
    console.error(`[db] ✗ Connection FAILED after ${elapsed}ms`);
    console.error(`[db] Error category: ${category}`);
    if (err instanceof Error) {
      console.error(`[db] Message: ${err.message}`);
      console.error(
        `[db] Code: ${(err as NodeJS.ErrnoException).code ?? "N/A"}`,
      );
      console.error(
        `[db] Errno: ${(err as NodeJS.ErrnoException).errno ?? "N/A"}`,
      );
      console.error(`[db] Stack:\n${err.stack}`);
    } else {
      console.error("[db] Error object:", err);
    }
    throw err;
  } finally {
    if (client) client.release();
  }
};

/**
 * Whether the pool has passed the startup connection test.
 */
export const isPoolReady = (): boolean => poolReady;

/* ── Query helpers ── */

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number | null;
}

/**
 * Execute a parameterised query against the pool.
 * Always use $1, $2, … placeholders — never interpolate user input.
 */
export const query = async <T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> => {
  const client = getPool();
  const result = await client.query(text, params);
  return { rows: result.rows as T[], rowCount: result.rowCount };
};

/**
 * Run a callback inside a database transaction.
 * The transaction is committed on success, rolled back on error.
 */
export const withTransaction = async <T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> => {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

/* ── Lifecycle ── */

/**
 * Gracefully close the pool.  Call this on SIGTERM / SIGINT.
 */
export const closePool = async (): Promise<void> => {
  if (!pool) return;
  console.log("[db] Draining connection pool…");
  await pool.end();
  pool = null;
  console.log("[db] Pool closed");
};
