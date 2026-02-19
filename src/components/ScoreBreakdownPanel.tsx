import { Pie, PieChart, ResponsiveContainer, Tooltip, Cell, Legend } from 'recharts';

export interface ScoreBreakdownPanelProps {
  executionTimeInSeconds: number;
  commitCount: number;
}

export const ScoreBreakdownPanel = ({ executionTimeInSeconds, commitCount }: ScoreBreakdownPanelProps) => {
  const baseScore = 100;
  const speedBonus = executionTimeInSeconds < 300 ? 10 : 0;
  const efficiencyPenalty = commitCount > 20 ? -2 * (commitCount - 20) : 0;
  const finalScore = baseScore + speedBonus + efficiencyPenalty;

  const chartData = [
    { name: 'Base Score', value: baseScore, color: '#3b82f6' },
    { name: 'Speed Bonus', value: speedBonus, color: '#facc15' },
    { name: 'Efficiency Penalty', value: Math.abs(efficiencyPenalty), color: '#ef4444' },
  ];

  return (
    <section className="w-full rounded-[18px] bg-[#0f0f0f] p-6 text-white shadow-[0_16px_40px_rgba(0,0,0,0.45)]">
      <header className="border-b border-slate-800 pb-4">
        <h2 className="text-xl font-bold text-white">FINAL SCORE: {finalScore}</h2>
      </header>

      <div className="mt-5 grid grid-cols-1 gap-6">
        <div className="space-y-4 text-sm sm:text-base">
          <div className="flex items-center justify-between">
            <span className="text-slate-300">Base Score = 100</span>
            <span className="font-mono text-white">{baseScore}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-300">Speed Bonus =</span>
            <span className="font-mono text-white">{speedBonus}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-300">Efficiency Penalty =</span>
            <span className="font-mono text-white">{efficiencyPenalty}</span>
          </div>
        </div>

        <div className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                animationDuration={700}
              >
                {chartData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: '#111', border: '1px solid #334155', borderRadius: 8, color: '#fff' }}
                itemStyle={{ color: '#fff' }}
              />
              <Legend wrapperStyle={{ color: '#fff', fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
};
