import { motion } from 'framer-motion';
import { useDashboardStore } from '../store/dashboardStore';
import { formatTimestamp } from '../utils/format';

export const CiCdTimeline = () => {
  const { data, execution } = useDashboardStore();

  return (
    <section className="card p-6">
      <header className="mb-4">
        <h2 className="panel-title">CI/CD Timeline</h2>
        <p className="mt-1 text-sm text-slate-300/90">Chronological run attempts with retry diagnostics.</p>
      </header>

      {data.timeline.length === 0 ? (
        <div className="surface-muted rounded-xl px-4 py-6 text-center text-sm text-slate-400">
          {execution.status === 'running' ? 'Waiting for timeline events…' : 'No timeline events available.'}
        </div>
      ) : (
        <div className="relative pl-4">
          <div className="absolute left-[7px] top-1 h-[calc(100%-8px)] w-px bg-gradient-to-b from-cyan-400/70 to-violet-400/40" />
          <ul className="space-y-4">
            {data.timeline
              .slice()
              .sort((a, b) => a.iteration - b.iteration)
              .map((event, index) => (
                <motion.li
                  key={`${event.iteration}-${event.timestamp}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, delay: index * 0.06 }}
                  className="surface-muted relative ml-2 rounded-xl p-3"
                >
                  <span className="absolute -left-[15px] top-4 h-2.5 w-2.5 rounded-full bg-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.7)]" />
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-slate-200">Iteration #{event.iteration}</span>
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${
                          event.result === 'passed' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'
                        }`}
                      >
                        {event.result === 'passed' ? 'PASSED' : 'FAILED'}
                      </span>
                    </div>
                    <span className="font-mono text-xs text-slate-400">{formatTimestamp(event.timestamp)}</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">Retry {event.retryCount}/{event.retryLimit}</p>
                </motion.li>
              ))}
          </ul>
        </div>
      )}
    </section>
  );
};
