import { motion } from 'framer-motion';
import { useState } from 'react';
import { useExecution } from '../hooks/useExecution';
import { useDashboardStore } from '../store/dashboardStore';

export const InputController = () => {
  const { errors, runExecution, setErrors } = useExecution();
  const { metadata, setMetadata, execution, inputLocked } = useDashboardStore();
  const [retryLimit, setRetryLimit] = useState<number>(5);

  const isRunning = execution.status === 'running';

  const handleChange = (field: 'repoUrl' | 'teamName' | 'leaderName', value: string) => {
    setMetadata({ [field]: value });
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  return (
    <section className="card p-6">
      <header className="mb-4">
        <h2 className="panel-title">Input Controller</h2>
        <p className="mt-1 text-sm text-slate-300/90">Configure repository and ownership before autonomous execution.</p>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <label className="space-y-2">
          <span className="label">GitHub URL</span>
          <input
            value={metadata.repoUrl}
            onChange={(event) => handleChange('repoUrl', event.target.value)}
            disabled={inputLocked}
            placeholder="https://github.com/org/repo"
            className="input-shell font-mono"
          />
          {errors.repoUrl && <span className="text-xs text-red-300">{errors.repoUrl}</span>}
        </label>

        <label className="space-y-2">
          <span className="label">Team Name</span>
          <input
            value={metadata.teamName}
            onChange={(event) => handleChange('teamName', event.target.value)}
            disabled={inputLocked}
            className="input-shell"
          />
          {errors.teamName && <span className="text-xs text-red-300">{errors.teamName}</span>}
        </label>

        <label className="space-y-2">
          <span className="label">Leader Name</span>
          <input
            value={metadata.leaderName}
            onChange={(event) => handleChange('leaderName', event.target.value)}
            disabled={inputLocked}
            className="input-shell"
          />
          {errors.leaderName && <span className="text-xs text-red-300">{errors.leaderName}</span>}
        </label>

        <label className="space-y-2">
          <span className="label">Retry Limit</span>
          <input
            value={retryLimit}
            type="number"
            min={1}
            max={20}
            disabled={inputLocked}
            onChange={(event) => {
              const next = Number(event.target.value);
              setRetryLimit(Number.isFinite(next) ? Math.min(20, Math.max(1, Math.floor(next))) : 5);
            }}
            className="input-shell font-mono"
          />
        </label>
      </div>

      <div className="divider-soft mt-5 flex items-center justify-between border-t pt-4">
        <p className="text-xs text-slate-500">Required fields lock once execution starts.</p>
        <button
          onClick={() => void runExecution(retryLimit)}
          disabled={isRunning || inputLocked}
          className="inline-flex min-w-40 items-center justify-center gap-2 rounded-xl border border-cyan-400/65 bg-gradient-to-r from-cyan-500/20 to-violet-500/20 px-4 py-2.5 text-sm font-semibold text-cyan-100 shadow-[0_8px_26px_rgba(6,182,212,0.2)] transition hover:from-cyan-400/30 hover:to-violet-500/30 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRunning && (
            <motion.span
              className="inline-block h-3 w-3 rounded-full border-2 border-cyan-100 border-t-transparent"
              animate={{ rotate: 360 }}
              transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
            />
          )}
          {isRunning ? 'Running Agent...' : 'Run Agent'}
        </button>
      </div>
    </section>
  );
};
