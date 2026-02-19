import { useEffect, useMemo, useRef, useState } from 'react';
import { useExecution } from '../hooks/useExecution';
import { useDashboardStore } from '../store/dashboardStore';
import { useNavigate } from 'react-router-dom';

type Line = {
  kind: 'prompt' | 'input';
  text: string;
};

const PROMPTS = ['Enter Github Repository Link', 'Enter Team Name', 'Enter Team Leader Name'];

export const TerminalInfoSection = () => {
  const { runExecution } = useExecution();
  const { execution, setMetadata } = useDashboardStore();
  const navigate = useNavigate();

  const [lines, setLines] = useState<Line[]>([]);
  const [activePrompt, setActivePrompt] = useState('');
  const [currentInput, setCurrentInput] = useState('');
  const [promptIndex, setPromptIndex] = useState(0);
  const [isTypingPrompt, setIsTypingPrompt] = useState(true);
  const [inputLocked, setInputLocked] = useState(false);
  const [repoUrl, setRepoUrl] = useState('');
  const [teamName, setTeamName] = useState('');
  const [leaderName, setLeaderName] = useState('');

  const terminalRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const canRun = useMemo(
    () => repoUrl.trim().length > 0 && teamName.trim().length > 0 && leaderName.trim().length > 0,
    [repoUrl, teamName, leaderName],
  );

  useEffect(() => {
    terminalRef.current?.focus();
  }, []);

  useEffect(() => {
    if (promptIndex >= PROMPTS.length) {
      setIsTypingPrompt(false);
      return;
    }

    setIsTypingPrompt(true);
    setActivePrompt('');

    const prompt = PROMPTS[promptIndex];
    let index = 0;
    const timeoutIds: number[] = [];

    const typeNext = () => {
      index += 1;
      setActivePrompt(prompt.slice(0, index));

      if (index < prompt.length) {
        const nextTimeout = window.setTimeout(typeNext, 28 + Math.floor(Math.random() * 22));
        timeoutIds.push(nextTimeout);
        return;
      }

      const finalizeTimeout = window.setTimeout(() => {
        setLines((prev) => [...prev, { kind: 'prompt', text: prompt }]);
        setActivePrompt('');
        setIsTypingPrompt(false);
      }, 140);
      timeoutIds.push(finalizeTimeout);
    };

    const startTimeout = window.setTimeout(typeNext, 120);
    timeoutIds.push(startTimeout);

    return () => {
      timeoutIds.forEach((id) => window.clearTimeout(id));
    };
  }, [promptIndex]);

  useEffect(() => {
    if (!scrollRef.current) {
      return;
    }
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [lines, activePrompt, currentInput]);

  const commitInputValue = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }

    setLines((prev) => [...prev, { kind: 'input', text: trimmed }]);

    if (promptIndex === 0) {
      setRepoUrl(trimmed);
      setMetadata({ repoUrl: trimmed });
      setPromptIndex(1);
    } else if (promptIndex === 1) {
      setTeamName(trimmed);
      setMetadata({ teamName: trimmed });
      setPromptIndex(2);
    } else if (promptIndex === 2) {
      setLeaderName(trimmed);
      setMetadata({ leaderName: trimmed });
      setPromptIndex(3);
    }

    setCurrentInput('');
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (inputLocked || isTypingPrompt || promptIndex >= PROMPTS.length || execution.status === 'running') {
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
      event.preventDefault();
      void navigator.clipboard
        .readText()
        .then((text) => {
          const normalized = text.replace(/[\r\n]+/g, ' ').trim();
          if (normalized.length > 0) {
            setCurrentInput((prev) => prev + normalized);
          }
        })
        .catch(() => {
          // Clipboard API may be blocked by browser permissions; in that case keep current input unchanged.
        });
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      commitInputValue(currentInput);
      return;
    }

    if (event.key === 'Backspace') {
      event.preventDefault();
      setCurrentInput((prev) => prev.slice(0, -1));
      return;
    }

    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      setCurrentInput((prev) => prev + event.key);
    }
  };

  const onRun = async () => {
    if (!canRun || execution.status === 'running') {
      return;
    }
    navigate('/dashboard');
    setInputLocked(true);
    await runExecution(5);
  };

  return (
    <>
      <section className="mx-auto w-[95%] max-w-[700px]">
        <div
          ref={terminalRef}
          tabIndex={0}
          onClick={() => terminalRef.current?.focus()}
          onKeyDown={onKeyDown}
          className="overflow-hidden rounded-[20px] border border-slate-700/70 bg-black font-mono text-white shadow-[0_20px_50px_rgba(0,0,0,0.65)] outline-none"
        >
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2">
              <span className="h-[11px] w-[11px] rounded-full bg-[#ff5f56]" />
              <span className="h-[11px] w-[11px] rounded-full bg-[#ffbd2e]" />
              <span className="h-[11px] w-[11px] rounded-full bg-[#27c93f]" />
            </div>

            <button
              disabled={!canRun || execution.status === 'running'}
              onClick={() => void onRun()}
              className="inline-flex items-center gap-2 rounded-full border border-slate-600 bg-[#171717] px-3 py-1.5 text-xs text-white transition enabled:cursor-pointer enabled:hover:border-[#27c93f] enabled:hover:shadow-[0_0_18px_rgba(39,201,63,0.35)] enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
            >
              <span className="text-[10px] sm:text-xs">▶</span>
              <span>Run Agent</span>
            </button>
          </div>

          <div
            ref={scrollRef}
            className="h-[370px] overflow-y-auto px-4 py-4 text-sm leading-relaxed sm:h-[420px] sm:px-5 sm:text-[15px]"
          >
            {lines.map((line, idx) => (
              <div
                key={`${line.kind}-${idx}`}
                className={`mb-1 whitespace-pre-wrap break-words ${line.kind === 'prompt' ? 'text-[#27c93f]' : 'text-white'}`}
              >
                {line.text}
              </div>
            ))}

            {isTypingPrompt && activePrompt && (
              <div className="mb-1 whitespace-pre-wrap break-words text-[#27c93f]">
                {activePrompt}
                <span className="terminal-caret ml-0.5" />
              </div>
            )}

            {!isTypingPrompt && promptIndex < PROMPTS.length && (
              <div className="mb-1 whitespace-pre-wrap break-words text-white">
                {currentInput}
                <span className="terminal-caret ml-0.5" />
              </div>
            )}

            {!isTypingPrompt && promptIndex >= PROMPTS.length && !inputLocked && (
              <div className="mb-1 text-white">
                <span className="terminal-caret" />
              </div>
            )}
          </div>
        </div>
      </section>

    </>
  );
};
