# CI/CD AI Agent Dashboard — Frontend/Backend Execution Draft

## Scope
- First Page: Terminal Designed Input Section.
- Second Page: Dashboard with 5 panels/cards.
- Frontend must follow provided prompts exactly.
- Backend logic remains source of truth for execution, scoring inputs, results, timelines, and artifact generation.

## Non-Negotiable Rule
- No design assumptions are allowed beyond explicit prompts.
- Each new UI card/page is implemented only from provided prompt text.
- Existing backend execution behavior is preserved and only wired to frontend presentation.

## End-to-End Flow
1. User enters repository URL, team name, team leader name via terminal-style first page.
2. Frontend triggers backend run endpoint (`POST /api/agent/runs`) with validated payload.
3. Backend performs multi-agent run and returns normalized run result.
4. Backend writes `results.json` per run and mirrors latest to `public/results.json`.
5. Frontend transitions to dashboard and renders cards strictly by prompt-defined UI contracts.

## Data Ownership and Wiring
- Frontend uses centralized Zustand store for runtime UI state.
- Backend supplies runtime data fields used by all dashboard cards.
- Frontend cards are prop-driven where prompts require explicit prop contracts.
- Mapping layer in `src/App.tsx` converts backend/store fields into strict card prop shapes.

## Page Contracts

### First Page — Terminal Input Section
- Inputs captured in sequence: repository URL → team name → team leader name.
- Run action only enabled after all required values are non-empty.
- On run, frontend locks terminal input and calls backend run API.

### Second Page — Dashboard Panels
- Panels rendered in order according to provided prompt instructions.
- Current implemented prompt-driven panels:
  - `RunSummaryCard`
  - `ScoreBreakdownPanel`
  - `FixesAppliedTable`
- Remaining panels continue to follow prompt-first implementation when provided.

## Current Prompt-Driven Component Interfaces

### RunSummaryCard
```ts
{
  repositoryUrl: string,
  teamName: string,
  teamLeaderName: string,
  branchName: string,
  failures: string[],
  status: "PASSED" | "FAILED",
  totalTimeInSeconds: number
}
```

### ScoreBreakdownPanel
```ts
{
  executionTimeInSeconds: number,
  commitCount: number
}
```

### FixesAppliedTable
```ts
{
  fixes: Array<{
    file: string,
    bugType: string,
    lineNumber: number,
    commitMessage: string,
    status: "FIXED" | "FAILED"
  }>
}
```

## Backend Compatibility Requirements
- Do not break Docker sandbox execution.
- Do not break CI timeline generation.
- Do not break per-run artifact generation.
- Preserve existing `results.json` schema compatibility.

## Implementation Discipline for Next Prompts
- For each future card/page prompt:
  1. Implement exact text, labels, and interaction rules.
  2. Keep component props and behavior strictly aligned to prompt.
  3. Wire only to existing backend/store data without changing backend semantics unless explicitly requested.
  4. Validate with build/test before merge.

## Validation Checklist (Each Iteration)
- `npm run build` passes.
- Frontend interaction matches prompt language and sequence.
- Backend run endpoint still returns expected payload.
- Dashboard reflects real backend output, not disconnected mock behavior.
