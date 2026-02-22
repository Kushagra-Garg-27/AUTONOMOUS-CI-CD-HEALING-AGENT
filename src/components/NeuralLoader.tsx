import { motion } from "framer-motion";

export const NeuralLoader = () => (
  <motion.div
    className="fixed inset-0 z-50 flex items-center justify-center"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    style={{
      background:
        "radial-gradient(ellipse at center, rgba(11,15,18,0.95) 0%, rgba(11,15,18,0.99) 100%)",
      backdropFilter: "blur(8px)",
    }}
  >
    <div className="flex flex-col items-center gap-6">
      {/* Pulse rings */}
      <div className="relative w-20 h-20">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute inset-0 rounded-full border border-cyber-green/30"
            animate={{
              scale: [1, 2.2],
              opacity: [0.6, 0],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              delay: i * 0.5,
              ease: "easeOut",
            }}
          />
        ))}
        {/* Core spinner */}
        <motion.div
          className="absolute inset-2 rounded-full border-2 border-cyber-green/20 border-t-cyber-green"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
        {/* Inner dot */}
        <motion.div
          className="absolute inset-0 m-auto h-3 w-3 rounded-full bg-cyber-green"
          animate={{ scale: [1, 1.3, 1], opacity: [0.8, 1, 0.8] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          style={{ boxShadow: "0 0 20px rgba(0, 255, 127, 0.6)" }}
        />
      </div>

      {/* Text */}
      <div className="text-center">
        <motion.p
          className="text-sm font-mono text-cyber-green/80"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          Executing Agent Pipeline
        </motion.p>
        <p className="mt-1 text-[10px] text-white/25 uppercase tracking-widest">
          Analyzing &middot; Patching &middot; Verifying
        </p>
      </div>

      {/* Energy bar */}
      <div className="w-48 h-0.5 rounded-full bg-cyber-border/30 overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{
            background:
              "linear-gradient(90deg, transparent, #00FF7F, #00E5FF, transparent)",
            backgroundSize: "200% 100%",
          }}
          animate={{ backgroundPosition: ["0% 50%", "200% 50%"] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
        />
      </div>
    </div>
  </motion.div>
);
