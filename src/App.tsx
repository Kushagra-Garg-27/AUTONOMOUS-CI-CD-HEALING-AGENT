import { CiCdTimeline } from './components/CiCdTimeline';
import { FixesAppliedTable } from './components/FixesAppliedTable';
import { RunSummaryCard } from './components/RunSummaryCard';
import { ScoreBreakdownPanel } from './components/ScoreBreakdownPanel';
import { TerminalInfoSection } from './components/TerminalInfoSection';
import { useDashboardStore } from './store/dashboardStore';
import { Navigate, Route, Routes } from 'react-router-dom';

function App() {
  const errorMessage = useDashboardStore((state) => state.errorMessage);
  const execution = useDashboardStore((state) => state.execution);
  const metadata = useDashboardStore((state) => state.metadata);
  const data = useDashboardStore((state) => state.data);
  const results = useDashboardStore((state) => state.results);

  const runStatus: 'PASSED' | 'FAILED' = execution.status === 'success' ? 'PASSED' : 'FAILED';
  const isDashboardPage = execution.status !== 'idle';
  const failureLines = data.fixesTable.map(
    (row) => `${row.bugType} error in ${row.filePath} line ${row.lineNumber} → Fix: ${row.commitMessage}`,
  );
  const tableRows = data.fixesTable.map((row) => ({
    file: row.filePath,
    bugType: row.bugType,
    lineNumber: row.lineNumber,
    commitMessage: row.commitMessage,
    status: (row.status === 'passed' ? 'FIXED' : 'FAILED') as 'FIXED' | 'FAILED',
  }));

  return (
    <div className="min-h-screen px-4 py-6 text-slate-100 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="card relative overflow-hidden p-6">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(56,189,248,0.12),transparent_48%,rgba(168,85,247,0.1))]" />
          <div className="relative">
            <p className="label">Autonomous DevOps Agent Dashboard</p>
            <h1 className="mt-2 bg-gradient-to-r from-slate-50 via-cyan-100 to-violet-200 bg-clip-text text-2xl font-bold text-transparent lg:text-3xl">
              CI/CD Healing Control Plane
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-300/90">
              Primary judging surface for autonomous repository remediation and pipeline convergence.
            </p>
          </div>
        </header>

        {errorMessage && (
          <div className="rounded-xl border border-red-500/45 bg-red-500/10 px-4 py-3 text-sm text-red-200">{errorMessage}</div>
        )}

        <Routes>
          <Route path="/" element={<TerminalInfoSection />} />
          <Route
            path="/dashboard"
            element={
              isDashboardPage ? (
                <section className="rounded-[18px] border border-slate-800/80 bg-[#0b0b0b]/60 p-4 shadow-[0_14px_35px_rgba(0,0,0,0.35)] sm:p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-200">Dashboard View</h2>
                    <span className="rounded-md border border-slate-700 bg-[#101010] px-2 py-1 text-xs text-slate-300">
                      Terminal Theme
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
                    <div className="xl:col-span-8">
                      <RunSummaryCard
                        repositoryUrl={metadata.repoUrl}
                        teamName={metadata.teamName}
                        teamLeaderName={metadata.leaderName}
                        branchName={metadata.generatedBranchName}
                        failures={
                          failureLines.length > 0
                            ? failureLines
                            : [`LINTING error in src/utils.py line 15 → Fix: remove the import statement`]
                        }
                        status={runStatus}
                        totalTimeInSeconds={execution.executionTime}
                      />
                    </div>

                    <div className="xl:col-span-4">
                      <ScoreBreakdownPanel executionTimeInSeconds={execution.executionTime} commitCount={results.commitCount} />
                    </div>

                    <div className="xl:col-span-12">
                      <FixesAppliedTable fixes={tableRows} />
                    </div>

                    <div className="xl:col-span-12">
                      <CiCdTimeline />
                    </div>
                  </div>
                </section>
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route path="*" element={<Navigate to={isDashboardPage ? '/dashboard' : '/'} replace />} />
        </Routes>
      </div>

      {execution.status === 'running' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 rounded-full border-2 border-white/70 border-t-transparent animate-spin" />
            <p className="text-xs text-white">Loading</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
