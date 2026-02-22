import { useRef, type MouseEvent, type ReactNode } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

interface TiltCardProps {
  children: ReactNode;
  className?: string;
  glowColor?: string;
  intensity?: number;
}

export const TiltCard = ({
  children,
  className = "",
  glowColor = "rgba(0, 255, 127, 0.12)",
  intensity = 10,
}: TiltCardProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const glowX = useMotionValue(50);
  const glowY = useMotionValue(50);

  const springX = useSpring(rotateX, { stiffness: 260, damping: 22 });
  const springY = useSpring(rotateY, { stiffness: 260, damping: 22 });

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    rotateX.set((y - 0.5) * -intensity);
    rotateY.set((x - 0.5) * intensity);
    glowX.set(x * 100);
    glowY.set(y * 100);
  };

  const handleMouseLeave = () => {
    rotateX.set(0);
    rotateY.set(0);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        rotateX: springX,
        rotateY: springY,
        transformStyle: "preserve-3d",
        perspective: 1000,
      }}
      className={`glass-card relative overflow-hidden ${className}`}
    >
      {/* Reactive glow layer */}
      <motion.div
        className="pointer-events-none absolute inset-0 z-10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `radial-gradient(400px circle at ${glowX.get()}% ${glowY.get()}%, ${glowColor}, transparent 50%)`,
        }}
      />
      <div className="relative z-20" style={{ transform: "translateZ(30px)" }}>
        {children}
      </div>
    </motion.div>
  );
};
