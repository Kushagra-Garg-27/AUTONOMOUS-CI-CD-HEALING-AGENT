import { useMemo } from "react";
import { motion } from "framer-motion";
import { Pie, PieChart, ResponsiveContainer, Cell } from "recharts";
import { TiltCard } from "./motion/TiltCard";

export interface ScoreBreakdownPanelProps {
  executionTimeInSeconds: number;
  commitCount: number;
}

const AnimatedNumber = ({
  value,
  suffix = "",
}: {
  value: number;
  suffix?: string;
}) => (
  <motion.span
    key={value}
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4, ease: "easeOut" }}
    className="font-mono"
  >
    {value}
    {suffix}
  </motion.span>
);

export const ScoreBreakdownPanel = ({
  executionTimeInSeconds,
  commitCount,
}: ScoreBreakdownPanelProps) => {
  const baseScore = 100;
  const speedBonus = executionTimeInSeconds < 300 ? 10 : 0;
  const efficiencyPenalty = commitCount > 20 ? -2 * (commitCount - 20) : 0;
  const finalScore = baseScore + speedBonus + efficiencyPenalty;

  const chartData = useMemo(
    () => [
      { name: "Base", value: baseScore, color: "#00FF7F" },
      { name: "Speed", value: speedBonus, color: "#00E5FF" },
      {
        name: "Penalty",
        value: Math.abs(efficiencyPenalty) || 1,
        color: "#FF4757",
      },
    ],
    [speedBonus, efficiencyPenalty],
  );

  const rows = [
    { label: "Base Score", value: baseScore, color: "#00FF7F" },
    { label: "Speed Bonus", value: speedBonus, color: "#00E5FF" },
    { label: "Efficiency Penalty", value: efficiencyPenalty, color: "#FF4757" },
  ];

  return (
    <TiltCard
      className="p-6 h-full"
      intensity={8}
      glowColor="rgba(0, 229, 255, 0.12)"
    >
      {/* Score headline */}
      <div className="text-center mb-6">
        <p className="label-cyber mb-2">Final Score</p>
        <motion.div
          className="text-5xl font-bold neon-text"
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{
            type: "spring",
            stiffness: 200,
            damping: 15,
            delay: 0.2,
          }}
        >
          {finalScore}
        </motion.div>
        <div className="mt-2 h-0.5 w-16 mx-auto bg-gradient-to-r from-transparent via-cyber-green/50 to-transparent" />
      </div>

      {/* Pie chart */}
      <div className="h-[180px] w-full mb-4">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={45}
              outerRadius={70}
              animationDuration={1000}
              animationEasing="ease-out"
              stroke="none"
            >
              {chartData.map((entry) => (
                <Cell key={entry.name} fill={entry.color} fillOpacity={0.8} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Score breakdown rows */}
      <div className="space-y-3">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between text-sm"
          >
            <div className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  background: row.color,
                  boxShadow: `0 0 8px ${row.color}60`,
                }}
              />
              <span className="text-white/50 text-xs">{row.label}</span>
            </div>
            <span
              className="font-mono text-sm font-semibold"
              style={{ color: row.color }}
            >
              <AnimatedNumber value={row.value} />
            </span>
          </div>
        ))}
      </div>
    </TiltCard>
  );
};
