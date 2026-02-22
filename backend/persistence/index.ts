/**
 * Persistence layer barrel export.
 *
 * All database access goes through these abstractions — no direct SQL
 * calls should appear in orchestration or agent logic.
 */

export { getPool, query, withTransaction, closePool } from "./db";
export { RunRepository } from "./RunRepository";
export { TestResultRepository } from "./TestResultRepository";
export { PatchRepository } from "./PatchRepository";
