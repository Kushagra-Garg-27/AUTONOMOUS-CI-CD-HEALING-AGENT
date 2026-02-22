import { motion } from "framer-motion";
import { GlowPulse } from "./motion/GlowPulse";
import { Reveal, VARIANTS } from "./motion/Reveal";

export interface FixesAppliedTableRow {
  file: string;
  bugType: string;
  lineNumber: number;
  commitMessage: string;
  status: "FIXED" | "FAILED";
}

export interface FixesAppliedTableProps {
  fixes: FixesAppliedTableRow[];
}

const BugTypeBadge = ({ type }: { type: string }) => (
  <span className="inline-flex items-center rounded-md border border-cyber-border/50 bg-cyber-black/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-cyber-cyan font-mono">
    {type}
  </span>
);

export const FixesAppliedTable = ({ fixes }: FixesAppliedTableProps) => {
  return (
    <Reveal variant="fadeSlideUp">
      <div className="glass-card p-6">
        <header className="flex items-center justify-between mb-5">
          <div>
            <p className="label-cyber mb-1">Applied Patches</p>
            <h2 className="text-lg font-bold text-white">Fixes Applied</h2>
          </div>
          <span className="text-xs text-white/30 font-mono">
            {fixes.length} entries
          </span>
        </header>

        {fixes.length === 0 ? (
          <div className="rounded-xl border border-cyber-border/30 bg-cyber-black/40 px-6 py-10 text-center">
            <p className="text-sm text-white/30">
              No fixes detected for this run.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead>
                <tr className="border-b border-cyber-border/40">
                  {["File", "Bug Type", "Line", "Commit Message", "Status"].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-3 label-cyber text-left whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {fixes.map((fix, index) => {
                  const commitWithPrefix = fix.commitMessage.startsWith(
                    "[AI-AGENT]",
                  )
                    ? fix.commitMessage
                    : `[AI-AGENT] ${fix.commitMessage}`;
                  const isFixed = fix.status === "FIXED";

                  return (
                    <motion.tr
                      key={`${fix.file}-${fix.lineNumber}-${index}`}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.04, duration: 0.3 }}
                      className="border-b border-cyber-border/20 transition-colors hover:bg-cyber-green/[0.03] group"
                    >
                      <td className="px-4 py-3.5 font-mono text-xs text-white/60 group-hover:text-white/80 transition-colors">
                        {fix.file}
                      </td>
                      <td className="px-4 py-3.5">
                        <BugTypeBadge type={fix.bugType} />
                      </td>
                      <td className="px-4 py-3.5 font-mono text-sm text-center text-cyber-green/70">
                        {fix.lineNumber}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-white/70 max-w-xs truncate">
                        {commitWithPrefix}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                            isFixed
                              ? "border-cyber-green/30 bg-cyber-green/10 text-cyber-green"
                              : "border-red-500/30 bg-red-500/10 text-red-400"
                          }`}
                        >
                          <GlowPulse
                            size={4}
                            color={isFixed ? "#00FF7F" : "#FF4757"}
                          />
                          {isFixed ? "Fixed" : "Failed"}
                        </span>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Reveal>
  );
};
