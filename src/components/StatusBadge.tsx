import { motion } from 'framer-motion';

interface StatusBadgeProps {
  status: 'idle' | 'running' | 'success' | 'failed';
}

const styles: Record<StatusBadgeProps['status'], string> = {
  idle: 'bg-slate-700/45 text-slate-200 border-slate-500/70 shadow-[0_0_0_1px_rgba(148,163,184,0.15)]',
  running: 'bg-amber-500/15 text-amber-200 border-amber-400/60 shadow-[0_0_22px_rgba(245,158,11,0.25)]',
  success: 'bg-emerald-500/15 text-emerald-200 border-emerald-400/60 shadow-[0_0_22px_rgba(52,211,153,0.2)]',
  failed: 'bg-red-500/15 text-red-200 border-red-400/60 shadow-[0_0_22px_rgba(248,113,113,0.22)]',
};

export const StatusBadge = ({ status }: StatusBadgeProps) => (
  <motion.span
    key={status}
    initial={{ opacity: 0.5, scale: 0.96 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ duration: 0.2 }}
    className={`inline-flex rounded-lg border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${styles[status]}`}
  >
    {status === 'success' ? 'PASSED' : status === 'failed' ? 'FAILED' : status.toUpperCase()}
  </motion.span>
);
