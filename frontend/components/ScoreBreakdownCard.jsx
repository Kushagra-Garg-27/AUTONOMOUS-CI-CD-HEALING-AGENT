import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Sector } from 'recharts';
import { useDashboard } from '../context/DashboardContext';
import { motion } from 'framer-motion';
import { useCardTilt } from '../hooks/useCardTilt';
import { useEffect, useState } from 'react';

const renderActiveShape = (props) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  return (
    <Sector
      cx={cx}
      cy={cy}
      innerRadius={innerRadius}
      outerRadius={outerRadius + 8}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
    />
  );
};

export default function ScoreBreakdownCard() {
  const { executionTime, commitCount } = useDashboard();
  const { transformStyle, onMouseMove, onMouseLeave } = useCardTilt();
  const [displayedScore, setDisplayedScore] = useState(0);
  const [activeIndex, setActiveIndex] = useState(-1);

  const baseScore = 100;
  const speedBonus = executionTime < 300 ? 10 : 0;
  const efficiencyPenalty = commitCount > 20 ? -2 * (commitCount - 20) : 0;
  const finalScore = baseScore + speedBonus + efficiencyPenalty;
  const normalizedScore = Math.max(0, Math.min(120, finalScore));
  const ringProgress = normalizedScore / 120;

  useEffect(() => {
    let frame = 0;
    const totalFrames = 32;
    const timer = window.setInterval(() => {
      frame += 1;
      const progress = Math.min(1, frame / totalFrames);
      const eased = 1 - Math.pow(2, -10 * progress);
      setDisplayedScore(Math.round(finalScore * eased));
      if (frame >= totalFrames) {
        window.clearInterval(timer);
      }
    }, 18);

    return () => window.clearInterval(timer);
  }, [finalScore]);

  const chartData = [
    { name: 'Base Score', value: baseScore, color: '#76B900' },
    { name: 'Speed Bonus', value: speedBonus, color: '#A4D65E' },
    { name: 'Efficiency Penalty', value: Math.abs(efficiencyPenalty), color: '#E53E3E' },
  ];

  return (
    <motion.section
      className="dash-card score-card"
      style={{ transform: transformStyle }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      whileHover={{ y: -3, boxShadow: '0 24px 36px rgba(0, 0, 0, 0.42)' }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="score-headline">
        <h3 className="card-title score-mega">Final Stability Score: {displayedScore}</h3>
        <div className="score-ring-wrap" aria-hidden="true">
          <svg viewBox="0 0 100 100" className="score-ring-svg">
            <defs>
              <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#5D9400" />
                <stop offset="50%" stopColor="#76B900" />
                <stop offset="100%" stopColor="#B3E35B" />
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="42" className="score-ring-track" />
            <motion.circle
              cx="50"
              cy="50"
              r="42"
              className="score-ring-progress"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: ringProgress }}
              transition={{ duration: 0.72, ease: [0.16, 1, 0.3, 1] }}
            />
          </svg>
        </div>
      </div>

      <div className="score-body">
        <div className="score-lines">
          <div className="score-line">
            <span>Base Score =</span>
            <span className="score-value">{baseScore}</span>
          </div>
          <div className="score-line">
            <span>Speed Bonus =</span>
            <span className="score-value">{speedBonus}</span>
          </div>
          <div className="score-line">
            <span>Efficiency Penalty =</span>
            <span className="score-value">{efficiencyPenalty}</span>
          </div>
        </div>

        <motion.div
          className="chart-wrap chart-glow-ring"
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                innerRadius={38}
                outerRadius={80}
                animationDuration={700}
                label={false}
                activeIndex={activeIndex}
                activeShape={renderActiveShape}
                onMouseEnter={(_, index) => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(-1)}
              >
                {chartData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Legend formatter={(value) => value} />
            </PieChart>
          </ResponsiveContainer>
        </motion.div>
      </div>
    </motion.section>
  );
}
