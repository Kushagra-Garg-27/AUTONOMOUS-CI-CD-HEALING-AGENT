/**
 * Persistence layer barrel export.
 *
 * All database access goes through these abstractions — no direct SQL
 * calls should appear in orchestration or agent logic.
 */

export {
  getPool,
  query,
  withTransaction,
  closePool,
  initPool,
  isPoolReady,
} from "./db.js";
export { RunRepository } from "./RunRepository.js";
export { TestResultRepository } from "./TestResultRepository.js";
export { PatchRepository } from "./PatchRepository.js";
export { DiagnosticsRepository } from "./DiagnosticsRepository.js";
