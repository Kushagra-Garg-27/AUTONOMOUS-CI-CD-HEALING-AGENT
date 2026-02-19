import { useDashboard } from '../context/DashboardContext';
import { motion } from 'framer-motion';
import { useCardTilt } from '../hooks/useCardTilt';

export default function FixesAppliedTable() {
  const { fixes } = useDashboard();
  const { transformStyle, onMouseMove, onMouseLeave } = useCardTilt();

  return (
    <motion.section
      className="dash-card table-card"
      style={{ transform: transformStyle }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      whileHover={{ y: -3, boxShadow: '0 24px 36px rgba(0, 0, 0, 0.42)' }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
    >
      <h3 className="card-title">Fixes Applied</h3>

      <div className="fix-surface-grid">
        {fixes.length > 0 ? (
          fixes.map((fix, index) => {
            const commitMessage = fix.commitMessage.startsWith('[AI-AGENT]')
              ? fix.commitMessage
              : `[AI-AGENT] ${fix.commitMessage}`;

            return (
              <motion.article
                key={`${fix.file}-${fix.lineNumber}-${index}`}
                className="fix-surface-card"
                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1], delay: index * 0.025 }}
                whileHover={{ y: -3, scale: 1.005 }}
              >
                <div className="fix-surface-head tactical-columns">
                  <div className="surface-field">
                    <span className="surface-label">FILE</span>
                    <span className="surface-pill mono muted">{fix.file}</span>
                  </div>
                  <div className="surface-field">
                    <span className="surface-label">STATUS</span>
                    <span className={`status-pill ${fix.status === 'FIXED' ? 'ok' : 'bad'}`}>
                      {fix.status === 'FIXED' ? '✓ Fixed' : '✗ Failed'}
                    </span>
                  </div>
                </div>

                <div className="fix-surface-meta tactical-columns">
                  <div className="surface-field">
                    <span className="surface-label">BUG TYPE</span>
                    <span className="surface-metric">{fix.bugType}</span>
                  </div>
                  <div className="surface-field">
                    <span className="surface-label">LINE NUMBER</span>
                    <span className="surface-metric">{fix.lineNumber}</span>
                  </div>
                </div>

                <div className="surface-field">
                  <span className="surface-label">COMMIT MESSAGE</span>
                  <p className="surface-commit">{commitMessage}</p>
                </div>
              </motion.article>
            );
          })
        ) : (
          <div className="empty-row">No fixes available.</div>
        )}
      </div>
    </motion.section>
  );
}
