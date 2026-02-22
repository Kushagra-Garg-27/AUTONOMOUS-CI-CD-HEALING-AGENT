import { type ReactNode } from "react";
import { motion, type Variants } from "framer-motion";

const fadeSlideUp: Variants = {
  hidden: { opacity: 0, y: 40, filter: "blur(8px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

const fadeSlideLeft: Variants = {
  hidden: { opacity: 0, x: -60, filter: "blur(6px)" },
  visible: {
    opacity: 1,
    x: 0,
    filter: "blur(0px)",
    transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.85 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.5, ease: [0.34, 1.56, 0.64, 1] },
  },
};

const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

export const VARIANTS = {
  fadeSlideUp,
  fadeSlideLeft,
  scaleIn,
  staggerContainer,
} as const;

interface RevealProps {
  children: ReactNode;
  variant?: keyof typeof VARIANTS;
  delay?: number;
  className?: string;
}

export const Reveal = ({
  children,
  variant = "fadeSlideUp",
  delay = 0,
  className = "",
}: RevealProps) => (
  <motion.div
    variants={VARIANTS[variant]}
    initial="hidden"
    whileInView="visible"
    viewport={{ once: true, margin: "-60px" }}
    transition={{ delay }}
    className={className}
  >
    {children}
  </motion.div>
);

interface StaggerProps {
  children: ReactNode;
  className?: string;
}

export const Stagger = ({ children, className = "" }: StaggerProps) => (
  <motion.div
    variants={staggerContainer}
    initial="hidden"
    whileInView="visible"
    viewport={{ once: true, margin: "-40px" }}
    className={className}
  >
    {children}
  </motion.div>
);
