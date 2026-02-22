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

  pool = new Pool({
    connectionString,
    max: 10, // max concurrent connections
    idleTimeoutMillis: 30_000, // close idle clients after 30 s
    connectionTimeoutMillis: 10_000,
    // Supabase requires SSL; allow override via env for local dev.
    ssl: process.env.DB_SSL === "false" ? false : { rejectUnauthorized: false },
  });

  pool.on("error", (err) => {
    console.error("[db] Unexpected pool error:", err.message);
  });

  console.log("[db] Connection pool created");
  return pool;
};

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
