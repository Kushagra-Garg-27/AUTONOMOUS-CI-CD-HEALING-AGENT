import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useExecution } from "../hooks/useExecution";
import { useDashboardStore } from "../store/dashboardStore";
import { useNavigate } from "react-router-dom";
import { GlowPulse } from "./motion/GlowPulse";
import { Magnetic } from "./motion/Magnetic";
import { Reveal } from "./motion/Reveal";

type Line = {
  kind: "prompt" | "input";
  text: string;
};

const PROMPTS = [
  "Enter Github Repository Link",
  "Enter Team Name",
  "Enter Team Leader Name",
];

export const TerminalInfoSection = () => {
  const { runExecution } = useExecution();
  const { execution, setMetadata } = useDashboardStore();
  const navigate = useNavigate();

  const [lines, setLines] = useState<Line[]>([]);
  const [activePrompt, setActivePrompt] = useState("");
  const [currentInput, setCurrentInput] = useState("");
  const [promptIndex, setPromptIndex] = useState(0);
  const [isTypingPrompt, setIsTypingPrompt] = useState(true);
  const [inputLocked, setInputLocked] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");
  const [teamName, setTeamName] = useState("");
  const [leaderName, setLeaderName] = useState("");

  const terminalRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const canRun = useMemo(
    () =>
      repoUrl.trim().length > 0 &&
      teamName.trim().length > 0 &&
      leaderName.trim().length > 0,
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
    setActivePrompt("");

    const prompt = PROMPTS[promptIndex];
    let index = 0;
    const timeoutIds: number[] = [];

    const typeNext = () => {
      index += 1;
      setActivePrompt(prompt.slice(0, index));

      if (index < prompt.length) {
        const nextTimeout = window.setTimeout(
          typeNext,
          28 + Math.floor(Math.random() * 22),
        );
        timeoutIds.push(nextTimeout);
        return;
      }

      const finalizeTimeout = window.setTimeout(() => {
        setLines((prev) => [...prev, { kind: "prompt", text: prompt }]);
        setActivePrompt("");
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
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [lines, activePrompt, currentInput]);

  const commitInputValue = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    setLines((prev) => [...prev, { kind: "input", text: trimmed }]);

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

    setCurrentInput("");
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (
      inputLocked ||
      isTypingPrompt ||
      promptIndex >= PROMPTS.length ||
      execution.status === "running"
    )
      return;

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
      event.preventDefault();
      void navigator.clipboard
        .readText()
        .then((text) => {
          const normalized = text.replace(/[\r\n]+/g, " ").trim();
          if (normalized.length > 0) {
            setCurrentInput((prev) => prev + normalized);
          }
        })
        .catch(() => {});
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      commitInputValue(currentInput);
      return;
    }

    if (event.key === "Backspace") {
      event.preventDefault();
      setCurrentInput((prev) => prev.slice(0, -1));
      return;
    }

    if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      setCurrentInput((prev) => prev + event.key);
    }
  };

  const onRun = async () => {
    if (!canRun || execution.status === "running") return;
    navigate("/dashboard");
    setInputLocked(true);
    await runExecution(5);
  };

  return (
    <Reveal variant="fadeSlideUp" className="flex flex-col items-center gap-8">
      {/* Hero text */}
      <div className="text-center max-w-3xl mx-auto">
        <motion.p
          className="label-cyber mb-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          Autonomous DevOps Control Center
        </motion.p>
        <motion.h1
          className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8 }}
        >
          <span className="heading-gradient">CI/CD Healing</span>
          <br />
          <span className="text-white/90">Agent Terminal</span>
        </motion.h1>
        <motion.p
          className="mt-4 text-sm sm:text-base text-white/50 max-w-xl mx-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          Initialize autonomous remediation by providing your repository. The
          agent will analyze, patch, and verify in real-time.
        </motion.p>
      </div>

      {/* Terminal */}
      <motion.section
        className="w-full max-w-[760px]"
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{
          delay: 0.5,
          duration: 0.7,
          ease: [0.25, 0.46, 0.45, 0.94],
        }}
      >
        <div
          ref={terminalRef}
          tabIndex={0}
          onClick={() => terminalRef.current?.focus()}
          onKeyDown={onKeyDown}
          className="group relative overflow-hidden rounded-2xl border border-cyber-border/60 bg-cyber-black/90 backdrop-blur-xl font-mono text-white shadow-[0_30px_80px_rgba(0,0,0,0.7)] outline-none"
        >
          {/* Neon edge glow */}
          <div
            className="absolute inset-0 rounded-2xl pointer-events-none"
            style={{
              background:
                "linear-gradient(135deg, rgba(0,255,127,0.08), transparent 40%, rgba(0,229,255,0.05))",
            }}
          />

          {/* Title bar */}
          <div className="relative flex items-center justify-between border-b border-cyber-border/50 px-5 py-3.5">
            <div className="flex items-center gap-2.5">
              <span className="h-3 w-3 rounded-full bg-[#ff5f56] shadow-[0_0_6px_rgba(255,95,86,0.4)]" />
              <span className="h-3 w-3 rounded-full bg-[#ffbd2e] shadow-[0_0_6px_rgba(255,189,46,0.4)]" />
              <span className="h-3 w-3 rounded-full bg-cyber-green shadow-[0_0_6px_rgba(0,255,127,0.4)]" />
            </div>

            <div className="flex items-center gap-2 text-[10px] text-white/30 uppercase tracking-widest">
              <GlowPulse size={5} />
              <span>agent-terminal</span>
            </div>

            <Magnetic strength={0.4}>
              <button
                disabled={!canRun || execution.status === "running"}
                onClick={() => void onRun()}
                className="cyber-button !py-2 !px-4 !text-xs !rounded-lg"
              >
                <span className="text-[10px]">▶</span>
                <span>
                  {execution.status === "running"
                    ? "Executing..."
                    : "Run Agent"}
                </span>
                {execution.status === "running" && (
                  <motion.span
                    className="inline-block h-3 w-3 rounded-full border-2 border-cyber-green border-t-transparent"
                    animate={{ rotate: 360 }}
                    transition={{
                      duration: 0.8,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                  />
                )}
              </button>
            </Magnetic>
          </div>

          {/* Terminal body */}
          <div
            ref={scrollRef}
            className="h-[380px] overflow-y-auto px-5 py-5 text-sm leading-relaxed sm:h-[440px] sm:text-[15px]"
          >
            <AnimatePresence mode="popLayout">
              {lines.map((line, idx) => (
                <motion.div
                  key={`${line.kind}-${idx}`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`mb-1.5 whitespace-pre-wrap break-words ${
                    line.kind === "prompt" ? "neon-text" : "text-white/90"
                  }`}
                >
                  {line.kind === "prompt" && (
                    <span className="text-cyber-green/50 mr-2">&#10095;</span>
                  )}
                  {line.kind === "input" && (
                    <span className="text-white/30 mr-2">$</span>
                  )}
                  {line.text}
                </motion.div>
              ))}
            </AnimatePresence>

            {isTypingPrompt && activePrompt && (
              <div className="mb-1.5 whitespace-pre-wrap break-words neon-text">
                <span className="text-cyber-green/50 mr-2">&#10095;</span>
                {activePrompt}
                <span className="terminal-caret ml-0.5" />
              </div>
            )}

            {!isTypingPrompt && promptIndex < PROMPTS.length && (
              <div className="mb-1.5 whitespace-pre-wrap break-words text-white/90">
                <span className="text-white/30 mr-2">$</span>
                {currentInput}
                <span className="terminal-caret ml-0.5" />
              </div>
            )}

            {!isTypingPrompt &&
              promptIndex >= PROMPTS.length &&
              !inputLocked && (
                <div className="mb-1.5 text-white/60">
                  <span className="text-white/30 mr-2">$</span>
                  <span className="terminal-caret" />
                </div>
              )}
          </div>

          {/* Bottom status bar */}
          <div className="relative flex items-center justify-between border-t border-cyber-border/30 px-5 py-2 text-[10px] text-white/25">
            <span>
              {promptIndex}/{PROMPTS.length} fields completed
            </span>
            <span className="flex items-center gap-1.5">
              {canRun ? (
                <>
                  <GlowPulse size={4} color="#00FF7F" />
                  <span className="text-cyber-green/60">Ready</span>
                </>
              ) : (
                <>
                  <GlowPulse size={4} color="#FFBD2E" />
                  <span>Awaiting input</span>
                </>
              )}
            </span>
          </div>
        </div>
      </motion.section>
    </Reveal>
  );
};
