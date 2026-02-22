import { motion } from "framer-motion";
import { useDashboardStore } from "../store/dashboardStore";
import { formatTimestamp } from "../utils/format";
import { GlowPulse } from "./motion/GlowPulse";
import { Reveal } from "./motion/Reveal";

export const CiCdTimeline = () => {
  const { data, execution } = useDashboardStore();

  const sorted = data.timeline
    .slice()
    .sort((a, b) => a.iteration - b.iteration);
  const total = sorted.length;

  return (
    <Reveal variant="fadeSlideUp">
      <div className="glass-card p-6">
        <header className="flex items-center justify-between mb-6">
          <div>
            <p className="label-cyber mb-1">Iteration Log</p>
            <h2 className="text-lg font-bold text-white">CI/CD Timeline</h2>
          </div>
          <span className="text-xs text-white/30 font-mono">
            {total} events
          </span>
        </header>

        {total === 0 ? (
          <div className="rounded-xl border border-cyber-border/30 bg-cyber-black/40 px-6 py-10 text-center">
            <p className="text-sm text-white/30">
              {execution.status === "running" ? (
                <span className="flex items-center justify-center gap-2">
                  <GlowPulse size={5} color="#FFBD2E" />
                  Waiting for timeline events...
                </span>
              ) : (
                "No timeline events available."
              )}
            </p>
          </div>
        ) : (
          <div className="relative pl-6">
            {/* Animated beam line */}
            <div className="absolute left-[9px] top-2 bottom-2 w-px">
              <div className="h-full w-full bg-gradient-to-b from-cyber-green/60 via-cyber-cyan/40 to-cyber-green/20" />
              <motion.div
                className="absolute top-0 left-0 w-full h-12"
                style={{
                  background:
                    "linear-gradient(to bottom, transparent, #00FF7F, transparent)",
                  opacity: 0.6,
                }}
                animate={{ top: ["0%", "100%", "0%"] }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
              />
            </div>

            <div className="space-y-3">
              {sorted.map((event, index) => {
                const isPassed = event.result === "passed";
                return (
                  <motion.div
                    key={`${event.iteration}-${event.timestamp}`}
                    initial={{ opacity: 0, x: -20, filter: "blur(4px)" }}
                    animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                    transition={{ duration: 0.4, delay: index * 0.08 }}
                    className="relative ml-4 group"
                  >
                    {/* Dot on the line */}
                    <span
                      className="absolute -left-[23px] top-4 h-[10px] w-[10px] rounded-full border-2"
                      style={{
                        borderColor: isPassed ? "#00FF7F" : "#FF4757",
                        background: isPassed
                          ? "rgba(0,255,127,0.3)"
                          : "rgba(255,71,87,0.3)",
                        boxShadow: `0 0 12px ${isPassed ? "rgba(0,255,127,0.5)" : "rgba(255,71,87,0.4)"}`,
                      }}
                    />

                    {/* Event card */}
                    <div className="rounded-xl border border-cyber-border/40 bg-cyber-surface/60 p-4 transition-all duration-300 hover:border-cyber-green/30 hover:bg-cyber-surface/80">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-sm text-white/80">
                            Iteration{" "}
                            <span className="text-cyber-green font-bold">
                              #{event.iteration}
                            </span>
                          </span>

                          <motion.span
                            initial={{ scale: 0.8 }}
                            animate={{ scale: 1 }}
                            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              isPassed
                                ? "border-cyber-green/30 bg-cyber-green/10 text-cyber-green"
                                : "border-red-500/30 bg-red-500/10 text-red-400"
                            }`}
                          >
                            <GlowPulse
                              size={4}
                              color={isPassed ? "#00FF7F" : "#FF4757"}
                            />
                            {isPassed ? "PASSED" : "FAILED"}
                          </motion.span>
                        </div>

                        <span className="font-mono text-[11px] text-white/30">
                          {formatTimestamp(event.timestamp)}
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div className="mt-3 flex items-center gap-3">
                        <div className="flex-1 h-1 rounded-full bg-cyber-border/30 overflow-hidden">
                          <motion.div
                            className="h-full rounded-full"
                            style={{
                              background: isPassed
                                ? "linear-gradient(90deg, #00FF7F, #00E5FF)"
                                : "linear-gradient(90deg, #FF4757, #FF6B7A)",
                            }}
                            initial={{ width: 0 }}
                            animate={{
                              width: `${(event.retryCount / event.retryLimit) * 100}%`,
                            }}
                            transition={{
                              duration: 0.8,
                              delay: index * 0.08 + 0.3,
                            }}
                          />
                        </div>
                        <span className="font-mono text-[10px] text-white/30 whitespace-nowrap">
                          {event.retryCount}/{event.retryLimit}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Reveal>
  );
};
