import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';

const RETRY_LIMIT = 5;

const moduleVariants = {
  hidden: { opacity: 0, y: 14 },
  show: (index) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.26,
      delay: index * 0.06,
      ease: [0.16, 1, 0.3, 1],
    },
  }),
};

export default function CICDStatusTimeline({ timeline, fixes, status }) {
  const [expandedIteration, setExpandedIteration] = useState(null);

  const iterations = useMemo(() => {
    const timelineEntries = Array.isArray(timeline) ? timeline : [];
    const fixList = Array.isArray(fixes) ? fixes : [];

    if (timelineEntries.length === 0) {
      return [
        {
          id: 1,
          result: status === 'PASSED' ? 'passed' : 'failed',
          retryUsage: `1/${RETRY_LIMIT}`,
          timestamp: new Date().toISOString(),
          isLatest: true,
          details: ['LINTING error in src/utils.py line 1 → Fix: apply the required fix'],
        },
      ];
    }

    const latestIterationId = Math.max(...timelineEntries.map((item) => Number(item.iteration || 0)));
    const normalizedFixLines = fixList.map((fix) => {
      if (fix.logLine) {
        return String(fix.logLine);
      }
      const lineNumber = Math.max(1, Number(fix.lineNumber || 0));
      return `${String(fix.bugType || 'LINTING').toUpperCase()} error in ${String(fix.file || 'src/utils.py')} line ${lineNumber} → Fix: ${String(fix.commitMessage || 'apply the required fix')}`;
    });
    const fixesPerIteration = Math.max(1, Math.ceil(normalizedFixLines.length / timelineEntries.length));

    return timelineEntries.map((entry, index) => {
      const iterationId = Number(entry.iteration || 0) || 1;
      const retryCount = Number(entry.retryCount || iterationId);
      const retryLimit = Number(entry.retryLimit || RETRY_LIMIT);
      const result = String(entry.result || '').toLowerCase() === 'passed' ? 'passed' : 'failed';
      const detailsForIteration = normalizedFixLines.slice(index * fixesPerIteration, (index + 1) * fixesPerIteration);

      return {
        id: iterationId,
        result,
        retryUsage: `${retryCount}/${retryLimit}`,
        timestamp: String(entry.timestamp || ''),
        isLatest: iterationId === latestIterationId,
        details:
          detailsForIteration.length > 0
            ? detailsForIteration
            : ['LINTING error in src/utils.py line 1 → Fix: apply the required fix'],
      };
    });
  }, [timeline, fixes, status]);

  return (
    <section className="dash-card timeline-shell">
      <div className="timeline-header-row">
        <h3 className="card-title">CI/CD Status Timeline</h3>
        <span className="timeline-subtext">CI/CD Execution Timeline</span>
      </div>

      <div className="timeline-track-wrap">
        <motion.div
          className="timeline-track-line"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        />
        <motion.div
          className="timeline-sweep"
          initial={{ x: '-120%' }}
          animate={{ x: '140%' }}
          transition={{ duration: 2.2, repeat: Infinity, ease: [0.16, 1, 0.3, 1], repeatDelay: 0.8 }}
        />

        <div className="timeline-modules-row">
          {iterations.map((item, index) => {
            const expanded = expandedIteration === item.id;

            return (
              <motion.article
                key={item.id}
                className={`timeline-module ${item.result}`}
                custom={index}
                variants={moduleVariants}
                initial="hidden"
                animate="show"
              >
                <div className="iteration-top-row">
                  <span className="iteration-title">Iteration {item.id}</span>
                  <span className={`iteration-badge ${item.result}`}>{item.result === 'passed' ? 'PASSED' : 'FAILED'}</span>
                </div>

                <div className="iteration-meta-row">
                  <span className="iteration-retry">{item.retryUsage}</span>
                  <span className="iteration-time">{item.timestamp}</span>
                </div>

                {item.isLatest && <span className="latest-pulse-dot" aria-hidden="true" />}

                <button
                  type="button"
                  className="iteration-expand-btn"
                  onClick={() => setExpandedIteration((prev) => (prev === item.id ? null : item.id))}
                >
                  {expanded ? 'Hide Details' : 'Show Details'}
                </button>

                <motion.div
                  className={`iteration-details ${expanded ? 'open' : ''}`}
                  initial={false}
                  animate={{ height: expanded ? 'auto' : 0, opacity: expanded ? 1 : 0 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div className="iteration-details-inner">
                    {item.details.map((detail, detailIndex) => (
                      <p key={`${item.id}-${detailIndex}`} className="iteration-detail-line">
                        {detail}
                      </p>
                    ))}
                  </div>
                </motion.div>
              </motion.article>
            );
          })}
        </div>
      </div>
    </section>
  );
}