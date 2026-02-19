export const sharpEase = [0.16, 1, 0.3, 1];

export const staggerContainer = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.02,
    },
  },
};

export const cardReveal = {
  hidden: {
    opacity: 0,
    y: 22,
    scale: 0.95,
  },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.36,
      ease: sharpEase,
    },
  },
};
