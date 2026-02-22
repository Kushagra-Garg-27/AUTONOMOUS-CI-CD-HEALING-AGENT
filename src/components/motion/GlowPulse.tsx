import { motion } from "framer-motion";

interface GlowPulseProps {
  color?: string;
  size?: number;
  className?: string;
}

export const GlowPulse = ({
  color = "#00FF7F",
  size = 8,
  className = "",
}: GlowPulseProps) => (
  <span className={`relative inline-flex ${className}`}>
    <motion.span
      className="absolute inline-flex rounded-full opacity-60"
      style={{
        width: size + 6,
        height: size + 6,
        top: -3,
        left: -3,
        background: color,
        filter: `blur(4px)`,
      }}
      animate={{
        scale: [1, 1.8, 1],
        opacity: [0.5, 0.15, 0.5],
      }}
      transition={{
        duration: 2,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
    <span
      className="relative inline-block rounded-full"
      style={{
        width: size,
        height: size,
        background: color,
        boxShadow: `0 0 8px ${color}`,
      }}
    />
  </span>
);
