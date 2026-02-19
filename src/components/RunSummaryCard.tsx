import { useMemo, useState } from 'react';

export interface RunSummaryCardProps {
  repositoryUrl: string;
  teamName: string;
  teamLeaderName: string;
  branchName: string;
  failures: string[];
  status: 'PASSED' | 'FAILED';
  totalTimeInSeconds: number;
}

export const formatRunTime = (totalTimeInSeconds: number): string => {
  const safe = Math.max(0, Math.floor(totalTimeInSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  if (hours < 1) {
    return `${minutes} mins ${seconds} secs`;
  }

  return `${hours} hrs ${minutes} mins ${seconds} secs`;
};

export const RunSummaryCard = ({
  repositoryUrl,
  teamName,
  teamLeaderName,
  branchName,
  failures,
  status,
  totalTimeInSeconds,
}: RunSummaryCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const formattedTime = useMemo(() => formatRunTime(totalTimeInSeconds), [totalTimeInSeconds]);

  return (
    <section className="relative w-full rounded-[18px] bg-[#0f0f0f] p-6 text-white shadow-[0_16px_40px_rgba(0,0,0,0.45)]">
      <h2 className="pr-28 text-lg font-semibold text-white">Summary Card</h2>

      <span
        className={`absolute right-6 top-6 rounded-md px-3 py-1 text-xs font-semibold tracking-wide text-white ${
          status === 'PASSED' ? 'bg-[#22c55e]' : 'bg-[#b91c1c]'
        }`}
      >
        {status}
      </span>

      <div className="mt-6 space-y-4 text-sm sm:text-base">
        <div className="border-b border-slate-800/80 pb-4">
          <p className="mb-1 text-slate-300">Repository URL</p>
          <a
            href={repositoryUrl}
            target="_blank"
            rel="noreferrer"
            className="break-all text-sky-300 transition hover:underline"
          >
            {repositoryUrl}
          </a>
        </div>

        <div className="border-b border-slate-800/80 pb-4">
          <p className="mb-1 text-slate-300">Team Name - Team Leader Name</p>
          <p className="text-white">{teamName} - {teamLeaderName}</p>
        </div>

        <div className="border-b border-slate-800/80 pb-4">
          <p className="mb-1 text-slate-300">Branch Name</p>
          <p className="inline-block rounded-md bg-slate-800/60 px-2 py-1 font-mono text-sm text-slate-200">{branchName}</p>
        </div>

        <div className="border-b border-slate-800/80 pb-4">
          <button
            onClick={() => setIsExpanded((prev) => !prev)}
            className="group flex w-full items-center justify-between text-left text-white transition"
          >
            <span>Total Failures Detected and Total Fixes Applied</span>
            <span
              className={`ml-3 text-slate-300 opacity-0 transition duration-200 group-hover:opacity-100 ${
                isExpanded ? 'rotate-180 opacity-100' : ''
              }`}
            >
              ▼
            </span>
          </button>

          <div
            className={`overflow-hidden transition-all duration-300 ease-out ${
              isExpanded ? 'mt-3 max-h-96 opacity-100' : 'max-h-0 opacity-0'
            }`}
          >
            <div className="rounded-md border-l border-[#22c55e] bg-slate-900/75 p-3">
              <div className="space-y-2 font-mono text-xs text-slate-200 sm:text-sm">
                {failures.length > 0 ? (
                  failures.map((failure, index) => <p key={`${failure}-${index}`}>{failure}</p>)
                ) : (
                  <p>No failures detected.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div>
          <p className="mb-1 text-slate-300">Total time taken (start to finish)</p>
          <p className="text-white">{formattedTime}</p>
        </div>
      </div>
    </section>
  );
};
