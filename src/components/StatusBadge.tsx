import { motion } from "framer-motion";
import { GlowPulse } from "./motion/GlowPulse";

interface StatusBadgeProps {
  status: "idle" | "running" | "success" | "failed";
}

const config: Record<
  StatusBadgeProps["status"],
  { label: string; color: string; glow: string }
> = {
  idle: {
    label: "STANDBY",
    color: "rgba(148,163,184,0.8)",
    glow: "rgba(148,163,184,0.15)",
  },
  running: {
    label: "EXECUTING",
    color: "#FFBD2E",
    glow: "rgba(255,189,46,0.2)",
  },
  success: { label: "PASSED", color: "#00FF7F", glow: "rgba(0,255,127,0.2)" },
  failed: { label: "FAILED", color: "#FF4757", glow: "rgba(255,71,87,0.2)" },
};

export const StatusBadge = ({ status }: StatusBadgeProps) => {
  const { label, color, glow } = config[status];

  return (
    <motion.span
      key={status}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
      className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.15em]"
      style={{
        borderColor: `${color}40`,
        background: glow,
        color,
        boxShadow: `0 0 20px ${glow}, inset 0 0 12px ${glow}`,
      }}
    >
      <GlowPulse size={6} color={color} />
      {label}
    </motion.span>
  );
};
