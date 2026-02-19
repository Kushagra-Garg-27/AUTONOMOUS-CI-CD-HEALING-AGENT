export interface FixesAppliedTableRow {
  file: string;
  bugType: string;
  lineNumber: number;
  commitMessage: string;
  status: 'FIXED' | 'FAILED';
}

export interface FixesAppliedTableProps {
  fixes: FixesAppliedTableRow[];
}

export const FixesAppliedTable = ({ fixes }: FixesAppliedTableProps) => {
  return (
    <section className="w-full rounded-[18px] bg-[#0f0f0f] p-6 text-white shadow-[0_16px_40px_rgba(0,0,0,0.45)]">
      <header className="mb-4">
        <h2 className="text-lg font-semibold text-white">Fixes Applied Table</h2>
      </header>

      {fixes.length === 0 ? (
        <div className="rounded-md border border-slate-800 bg-[#141414] px-4 py-6 text-center text-sm text-slate-400">
          No fixes detected for this run.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[780px] w-full text-left text-sm">
            <thead className="bg-[#151515] text-xs uppercase tracking-wide text-slate-300">
              <tr>
                <th className="px-4 py-3 font-semibold">FILE</th>
                <th className="px-4 py-3 font-semibold">BUG TYPE</th>
                <th className="px-4 py-3 text-center font-semibold">LINE NUMBER</th>
                <th className="px-4 py-3 font-semibold">COMMIT MESSAGE</th>
                <th className="px-4 py-3 font-semibold">STATUS</th>
              </tr>
            </thead>
            <tbody>
              {fixes.map((fix, index) => {
                const commitWithPrefix = fix.commitMessage.startsWith('[AI-AGENT]')
                  ? fix.commitMessage
                  : `[AI-AGENT] ${fix.commitMessage}`;

                return (
                  <tr
                    key={`${fix.file}-${fix.lineNumber}-${index}`}
                    className="border-t border-slate-800 bg-[#101010] even:bg-[#0f0f0f] transition-colors hover:bg-[#1a1a1a]"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-slate-300">{fix.file}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded bg-[#1a1a1a] px-2 py-1 text-xs uppercase tracking-wide text-slate-200">
                        {fix.bugType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-sm text-white">{fix.lineNumber}</td>
                    <td className="px-4 py-3 text-sm text-slate-100">{commitWithPrefix}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-md px-2.5 py-1 text-xs font-semibold text-white ${
                          fix.status === 'FIXED' ? 'bg-[#22c55e]' : 'bg-[#b91c1c]'
                        }`}
                      >
                        {fix.status === 'FIXED' ? '✓ Fixed' : '✗ Failed'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
