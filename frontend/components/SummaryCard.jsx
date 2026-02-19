import { useMemo, useState } from 'react';
import { useDashboard } from '../context/DashboardContext';
import { motion } from 'framer-motion';
import { useCardTilt } from '../hooks/useCardTilt';

const formatTime = (secondsValue) => {
  const seconds = Math.max(0, Math.floor(Number(secondsValue) || 0));
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours < 1) {
    return `${mins} mins ${secs} secs`;
  }

  return `${hours} hrs ${mins} mins ${secs} secs`;
};

export default function SummaryCard() {
  const { repoUrl, teamName, teamLeaderName, branchName, failures, status, executionTime } = useDashboard();
  const [expanded, setExpanded] = useState(false);
  const time = useMemo(() => formatTime(executionTime), [executionTime]);
  const { transformStyle, onMouseMove, onMouseLeave } = useCardTilt();

  return (
    <motion.section
      className="dash-card summary-card"
      style={{ transform: transformStyle }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      whileHover={{ y: -3, boxShadow: '0 24px 36px rgba(0, 0, 0, 0.42)' }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
    >
      <h3 className="card-title">Repository Metadata</h3>

      <motion.span
        className={`status-badge ${status === 'PASSED' ? 'passed' : 'failed'}`}
        animate={
          status === 'PASSED'
            ? { boxShadow: ['0 0 0 rgba(34,197,94,0.0)', '0 0 20px rgba(34,197,94,0.45)', '0 0 0 rgba(34,197,94,0.0)'] }
            : { x: [0, -2, 2, -1, 1, 0], boxShadow: ['0 0 0 rgba(185,28,28,0.0)', '0 0 16px rgba(185,28,28,0.45)', '0 0 0 rgba(185,28,28,0.0)'] }
        }
        transition={{ duration: status === 'PASSED' ? 3 : 0.6, repeat: status === 'PASSED' ? Infinity : 0 }}
      >
        {status}
      </motion.span>

      <div className="card-content">
        <div className="row-block">
          <p className="row-label">Repository URL</p>
          <a href={repoUrl} target="_blank" rel="noreferrer" className="repo-link">
            {repoUrl}
          </a>
        </div>

        <div className="row-block">
          <p className="row-label">Team Name - Team Leader Name</p>
          <p>{teamName} - {teamLeaderName}</p>
        </div>

        <div className="row-block">
          <p className="row-label">Branch Name</p>
          <p className="branch-name">{branchName}</p>
        </div>

        <div className="row-block">
          <button className="dropdown-toggle" onClick={() => setExpanded((prev) => !prev)}>
            <span>Remediation Summary</span>
            <span className={`chevron ${expanded ? 'open' : ''}`}>▼</span>
          </button>

          <div className={`dropdown-body ${expanded ? 'show' : ''}`}>
            {failures.length > 0 ? (
              failures.map((item, idx) => (
                <p key={`${item}-${idx}`} className="failure-line">
                  {item}
                </p>
              ))
            ) : (
              <p className="failure-line">No failures detected.</p>
            )}
          </div>
        </div>

        <div className="row-block no-divider">
          <p className="row-label">Total time taken (start to finish)</p>
          <p>{time}</p>
        </div>
      </div>
    </motion.section>
  );
}
