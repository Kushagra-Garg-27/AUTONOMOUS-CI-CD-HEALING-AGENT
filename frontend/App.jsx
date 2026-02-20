import InputSection from './components/InputSection';
import SummaryCard from './components/SummaryCard';
import ScoreBreakdownCard from './components/ScoreBreakdownCard';
import FixesAppliedTable from './components/FixesAppliedTable';
import CICDStatusTimeline from './components/CICDStatusTimeline';
import { useDashboard } from './context/DashboardContext';
import { motion } from 'framer-motion';
import { cardReveal, staggerContainer } from './motion';
import { useEffect, useState } from 'react';

export default function App() {
  const { loading, showDashboard, errorMessage, status, fixes } = useDashboard();
  const [parallax, setParallax] = useState({ x: 0, y: 0 });
  const [runTimeline, setRunTimeline] = useState([]);

  useEffect(() => {
    const onMove = (event) => {
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      const x = (event.clientX - centerX) / centerX;
      const y = (event.clientY - centerY) / centerY;
      setParallax({ x: x * 22, y: y * 18 });
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  const handleRunResult = (result) => {
    const normalizedTimeline = Array.isArray(result?.timeline)
      ? result.timeline.map((item) => ({
          iteration: Number(item.iteration || 0),
          result: String(item.result || ''),
          timestamp: String(item.timestamp || ''),
          retryCount: Number(item.retryCount || 0),
          retryLimit: Number(item.retryLimit || 0),
        }))
      : [];

    setRunTimeline(normalizedTimeline);
  };

  return (
    <div className="page-root">
      <div className="bg-grain" />
      <div
        className="bg-animated-lights"
        style={{ transform: `translate3d(${parallax.x * -0.45}px, ${parallax.y * -0.45}px, 0)` }}
      />
      <div className="floating-particles" aria-hidden="true" />

      <motion.header
        className="performance-header"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="perf-title-wrap">
          <span className="perf-kicker">AI-driven repository remediation and pipeline convergence engine</span>
          <h2 className="perf-title">Autonomous CI/CD Healing Agent</h2>
        </div>
      </motion.header>

      <div className="container spatial-stage">
        <motion.section
          className="center-orbit"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.46, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="hero-shell">
            <p className="hero-kicker">System Overview</p>
            <h1 className="hero-title">Autonomous CI/CD Healing Agent</h1>
          </div>

          <motion.div variants={cardReveal} initial="hidden" animate="show">
            <InputSection onRunResult={handleRunResult} />
          </motion.div>

          {showDashboard && (
            <motion.div className="hero-score-panel" variants={cardReveal} initial="hidden" animate="show">
              <ScoreBreakdownCard />
            </motion.div>
          )}
        </motion.section>

        {showDashboard && (
          <motion.section className="fix-grid-section" variants={staggerContainer} initial="hidden" animate="show">
            <motion.div variants={cardReveal}>
              <CICDStatusTimeline timeline={runTimeline} fixes={fixes} status={status} />
            </motion.div>
            <motion.div variants={cardReveal}>
              <SummaryCard />
            </motion.div>
            <motion.div variants={cardReveal}>
              <FixesAppliedTable />
            </motion.div>
          </motion.section>
        )}

        {errorMessage && <div className="error-banner">{errorMessage}</div>}
      </div>

      {loading && (
        <div className="loading-overlay">
          <div className="loading-wrap">
            <div className="luminous-loader">
              <span className="loader-ring" />
              <span className="loader-core" />
            </div>
            <p>Deploying Autonomous Agent…</p>
          </div>
        </div>
      )}
    </div>
  );
}
