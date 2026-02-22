import { lazy, Suspense } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { CiCdTimeline } from "./components/CiCdTimeline";
import { FixesAppliedTable } from "./components/FixesAppliedTable";
import { RunSummaryCard } from "./components/RunSummaryCard";
import { ScoreBreakdownPanel } from "./components/ScoreBreakdownPanel";
import { TerminalInfoSection } from "./components/TerminalInfoSection";
import { NeuralLoader } from "./components/NeuralLoader";
import { CursorHalo } from "./components/motion/CursorHalo";
import { GlowPulse } from "./components/motion/GlowPulse";
import { Reveal, Stagger } from "./components/motion/Reveal";

import { useDashboardStore } from "./store/dashboardStore";
import { useMousePosition } from "./hooks/useMousePosition";
import { useSmoothScroll } from "./hooks/useSmoothScroll";

// Lazy-load heavy Three.js background
const ParticleBackground = lazy(() =>
  import("./components/background/ParticleBackground").then((m) => ({
    default: m.ParticleBackground,
  })),
);

function App() {
  const errorMessage = useDashboardStore((state) => state.errorMessage);
  const execution = useDashboardStore((state) => state.execution);
  const metadata = useDashboardStore((state) => state.metadata);
  const data = useDashboardStore((state) => state.data);
  const results = useDashboardStore((state) => state.results);
  const location = useLocation();

  // Activate smooth scroll + mouse tracking
  useSmoothScroll();
  useMousePosition();

  const runStatus: "PASSED" | "FAILED" =
    execution.status === "success" ? "PASSED" : "FAILED";
  const isDashboardPage = execution.status !== "idle";
  const failureLines = data.fixesTable.map(
    (row) =>
      `${row.bugType} error in ${row.filePath} line ${row.lineNumber} → Fix: ${row.commitMessage}`,
  );
  const tableRows = data.fixesTable.map((row) => ({
    file: row.filePath,
    bugType: row.bugType,
    lineNumber: row.lineNumber,
    commitMessage: row.commitMessage,
    status: (row.status === "passed" ? "FIXED" : "FAILED") as
      | "FIXED"
      | "FAILED",
  }));

  return (
    <div className="relative min-h-screen text-white scan-line-overlay">
      {/* 3D particle background — lazy loaded */}
      <Suspense fallback={null}>
        <ParticleBackground />
      </Suspense>

      {/* Cursor halo effect */}
      <CursorHalo />

      {/* Main content */}
      <div className="relative z-10 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          {/* Header */}
          <Reveal variant="fadeSlideUp">
            <header className="glass-card relative overflow-hidden p-6 sm:p-8">
              {/* Animated gradient stripe */}
              <motion.div
                className="absolute top-0 left-0 right-0 h-[2px]"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, #00FF7F, #00E5FF, transparent)",
                  backgroundSize: "200% 100%",
                }}
                animate={{ backgroundPosition: ["0% 50%", "200% 50%"] }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
              />

              <div className="relative flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <GlowPulse size={6} />
                    <span className="label-cyber">System Online</span>
                  </div>
                  <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold">
                    <span className="heading-gradient">Autonomous CI/CD</span>
                    <br />
                    <span className="text-white/80 text-xl sm:text-2xl lg:text-3xl">
                      Healing Agent
                    </span>
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm text-white/40 leading-relaxed">
                    Real-time autonomous remediation engine — analyzes, patches,
                    and verifies pipeline failures.
                  </p>
                </div>

                {/* Status indicator */}
                <div className="hidden sm:flex flex-col items-end gap-2">
                  <div className="flex items-center gap-2 text-[10px] text-white/25 uppercase tracking-widest">
                    <span>Agent Status</span>
                    <GlowPulse
                      size={5}
                      color={
                        execution.status === "running"
                          ? "#FFBD2E"
                          : execution.status === "success"
                            ? "#00FF7F"
                            : execution.status === "failed"
                              ? "#FF4757"
                              : "#94A3B8"
                      }
                    />
                  </div>
                  <span className="font-mono text-[11px] text-white/20">
                    v2.0.0 &middot; neural-engine
                  </span>
                </div>
              </div>
            </header>
          </Reveal>

          {/* Error banner */}
          <AnimatePresence>
            {errorMessage && (
              <motion.div
                initial={{ opacity: 0, y: -10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, y: -10, height: 0 }}
                className="rounded-xl border border-red-500/30 bg-red-500/10 backdrop-blur-sm px-5 py-3 text-sm text-red-300"
                style={{ boxShadow: "0 0 30px rgba(255, 71, 87, 0.1)" }}
              >
                <span className="text-red-400 mr-2 font-mono text-xs">
                  [ERROR]
                </span>
                {errorMessage}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Routes */}
          <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname}>
              <Route
                path="/"
                element={
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.4 }}
                  >
                    <TerminalInfoSection />
                  </motion.div>
                }
              />
              <Route
                path="/dashboard"
                element={
                  isDashboardPage ? (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.5 }}
                    >
                      <DashboardView
                        runStatus={runStatus}
                        metadata={metadata}
                        execution={execution}
                        failureLines={failureLines}
                        tableRows={tableRows}
                        results={results}
                      />
                    </motion.div>
                  ) : (
                    <Navigate to="/" replace />
                  )
                }
              />
              <Route
                path="*"
                element={
                  <Navigate to={isDashboardPage ? "/dashboard" : "/"} replace />
                }
              />
            </Routes>
          </AnimatePresence>
        </div>
      </div>

      {/* Loading overlay */}
      <AnimatePresence>
        {execution.status === "running" && <NeuralLoader />}
      </AnimatePresence>
    </div>
  );
}

// Dashboard sub-view
interface DashboardViewProps {
  runStatus: "PASSED" | "FAILED";
  metadata: {
    repoUrl: string;
    teamName: string;
    leaderName: string;
    generatedBranchName: string;
  };
  execution: { status: string; executionTime: number };
  failureLines: string[];
  tableRows: {
    file: string;
    bugType: string;
    lineNumber: number;
    commitMessage: string;
    status: "FIXED" | "FAILED";
  }[];
  results: { commitCount: number };
}

const DashboardView = ({
  runStatus,
  metadata,
  execution,
  failureLines,
  tableRows,
  results,
}: DashboardViewProps) => (
  <Stagger className="space-y-6">
    {/* Top row */}
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 },
      }}
    >
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <RunSummaryCard
            repositoryUrl={metadata.repoUrl}
            teamName={metadata.teamName}
            teamLeaderName={metadata.leaderName}
            branchName={metadata.generatedBranchName}
            failures={
              failureLines.length > 0
                ? failureLines
                : [
                    `LINTING error in src/utils.py line 15 → Fix: remove the import statement`,
                  ]
            }
            status={runStatus}
            totalTimeInSeconds={execution.executionTime}
          />
        </div>
        <div className="xl:col-span-4">
          <ScoreBreakdownPanel
            executionTimeInSeconds={execution.executionTime}
            commitCount={results.commitCount}
          />
        </div>
      </div>
    </motion.div>

    {/* Fixes table */}
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 },
      }}
    >
      <FixesAppliedTable fixes={tableRows} />
    </motion.div>

    {/* Timeline */}
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 },
      }}
    >
      <CiCdTimeline />
    </motion.div>
  </Stagger>
);

export default App;
