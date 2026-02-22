import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TiltCard } from "./motion/TiltCard";
import { GlowPulse } from "./motion/GlowPulse";
import { VARIANTS } from "./motion/Reveal";

export interface RunSummaryCardProps {
  repositoryUrl: string;
  teamName: string;
  teamLeaderName: string;
  branchName: string;
  failures: string[];
  status: "PASSED" | "FAILED";
  totalTimeInSeconds: number;
}

export const formatRunTime = (totalTimeInSeconds: number): string => {
  const safe = Math.max(0, Math.floor(totalTimeInSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  if (hours < 1) return `${minutes}m ${seconds}s`;
  return `${hours}h ${minutes}m ${seconds}s`;
};

const InfoRow = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div className="border-b border-cyber-border/30 pb-4">
    <p className="label-cyber mb-1.5">{label}</p>
    <div className="text-sm text-white/90">{children}</div>
  </div>
);

export const RunSummaryCard = ({
  repositoryUrl,
  teamName,
  teamLeaderName,
  branchName,
  failures,
  status,
  totalTimeInSeconds,
}: RunSummaryCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const formattedTime = useMemo(
    () => formatRunTime(totalTimeInSeconds),
    [totalTimeInSeconds],
  );

  const isPassed = status === "PASSED";

  return (
    <TiltCard className="p-6" intensity={6}>
      <motion.div variants={VARIANTS.fadeSlideUp}>
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="label-cyber mb-1">Run Summary</p>
            <h2 className="text-lg font-bold text-white">Execution Report</h2>
          </div>
          <motion.span
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-bold uppercase tracking-wider ${
              isPassed
                ? "border-cyber-green/40 bg-cyber-green/10 text-cyber-green shadow-neon-green"
                : "border-red-500/40 bg-red-500/10 text-red-400 shadow-[0_0_20px_rgba(255,71,87,0.2)]"
            }`}
          >
            <GlowPulse size={6} color={isPassed ? "#00FF7F" : "#FF4757"} />
            {status}
          </motion.span>
        </div>

        {/* Info rows */}
        <div className="space-y-4">
          <InfoRow label="Repository">
            <a
              href={repositoryUrl}
              target="_blank"
              rel="noreferrer"
              className="break-all text-cyber-cyan hover:text-cyber-green transition-colors font-mono text-xs"
            >
              {repositoryUrl}
            </a>
          </InfoRow>

          <InfoRow label="Team">
            <span className="text-white">{teamName}</span>
            <span className="text-white/30 mx-2">/</span>
            <span className="text-white/70">{teamLeaderName}</span>
          </InfoRow>

          <InfoRow label="Branch">
            <span className="inline-block rounded-md border border-cyber-border/50 bg-cyber-black/60 px-2.5 py-1 font-mono text-xs text-cyber-green/80">
              {branchName}
            </span>
          </InfoRow>

          {/* Collapsible failures */}
          <div className="border-b border-cyber-border/30 pb-4">
            <button
              onClick={() => setIsExpanded((p) => !p)}
              className="group flex w-full items-center justify-between text-left"
            >
              <span className="label-cyber">
                Failures Detected ({failures.length})
              </span>
              <motion.span
                animate={{ rotate: isExpanded ? 180 : 0 }}
                transition={{ duration: 0.3 }}
                className="text-cyber-green/50 text-xs"
              >
                ▼
              </motion.span>
            </button>

            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 rounded-lg border border-cyber-green/20 bg-cyber-black/50 p-3 space-y-1.5">
                    {failures.length > 0 ? (
                      failures.map((f, i) => (
                        <motion.p
                          key={i}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.04 }}
                          className="font-mono text-xs text-white/60 leading-relaxed"
                        >
                          <span className="text-cyber-green/50 mr-2">
                            {">"}
                          </span>
                          {f}
                        </motion.p>
                      ))
                    ) : (
                      <p className="text-xs text-white/40">
                        No failures detected.
                      </p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Execution time */}
          <div className="flex items-center justify-between">
            <span className="label-cyber">Execution Time</span>
            <span className="font-mono text-sm text-cyber-green font-semibold">
              {formattedTime}
            </span>
          </div>
        </div>
      </motion.div>
    </TiltCard>
  );
};
