import { useEffect, useMemo, useRef, useState } from 'react';
import { useDashboard } from '../context/DashboardContext';
import { motion } from 'framer-motion';

const PROMPTS = ['Enter Github Repository Link', 'Enter Team Name', 'Enter Team Leader Name'];

export default function InputSection({ onRunResult }) {
  const {
    repoUrl,
    setRepoUrl,
    teamName,
    setTeamName,
    teamLeaderName,
    setTeamLeaderName,
    loading,
    runAgent,
  } = useDashboard();

  const terminalRef = useRef(null);
  const bodyRef = useRef(null);

  const [lines, setLines] = useState([]);
  const [promptIndex, setPromptIndex] = useState(0);
  const [activePromptText, setActivePromptText] = useState('');
  const [isTypingPrompt, setIsTypingPrompt] = useState(true);
  const [activeInput, setActiveInput] = useState('');
  const [inputFrozen, setInputFrozen] = useState(false);
  const [magnetOffset, setMagnetOffset] = useState({ x: 0, y: 0 });

  const canRun = useMemo(() => repoUrl.trim() && teamName.trim() && teamLeaderName.trim(), [repoUrl, teamName, teamLeaderName]);

  useEffect(() => {
    terminalRef.current?.focus();
  }, []);

  useEffect(() => {
    if (promptIndex >= PROMPTS.length) {
      setIsTypingPrompt(false);
      return;
    }

    const prompt = PROMPTS[promptIndex];
    let idx = 0;
    const ids = [];

    setIsTypingPrompt(true);
    setActivePromptText('');

    const typeChar = () => {
      idx += 1;
      setActivePromptText(prompt.slice(0, idx));

      if (idx < prompt.length) {
        ids.push(window.setTimeout(typeChar, 30 + Math.floor(Math.random() * 20)));
      } else {
        ids.push(
          window.setTimeout(() => {
            setLines((prev) => [...prev, { type: 'prompt', text: prompt }]);
            setActivePromptText('');
            setIsTypingPrompt(false);
          }, 130),
        );
      }
    };

    ids.push(window.setTimeout(typeChar, 150));

    return () => ids.forEach((id) => window.clearTimeout(id));
  }, [promptIndex]);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [lines, activePromptText, activeInput]);

  const commitInput = (value) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }

    setLines((prev) => [...prev, { type: 'input', text: trimmed }]);

    if (promptIndex === 0) {
      setRepoUrl(trimmed);
      setPromptIndex(1);
    } else if (promptIndex === 1) {
      setTeamName(trimmed);
      setPromptIndex(2);
    } else if (promptIndex === 2) {
      setTeamLeaderName(trimmed);
      setPromptIndex(3);
    }

    setActiveInput('');
  };

  const onKeyDown = (event) => {
    if (loading || inputFrozen || isTypingPrompt || promptIndex >= PROMPTS.length) {
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
      event.preventDefault();
      void navigator.clipboard
        .readText()
        .then((text) => {
          const normalized = text.replace(/[\r\n]+/g, ' ').trim();
          if (normalized) {
            setActiveInput((prev) => prev + normalized);
          }
        })
        .catch(() => {});
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      commitInput(activeInput);
      return;
    }

    if (event.key === 'Backspace') {
      event.preventDefault();
      setActiveInput((prev) => prev.slice(0, -1));
      return;
    }

    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      setActiveInput((prev) => prev + event.key);
    }
  };

  const onRunAgent = async () => {
    if (!canRun || loading) {
      return;
    }
    setInputFrozen(true);
    await runAgent(onRunResult);
  };

  const onMagnetMove = (event) => {
    if (!canRun || loading) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 10;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 8;
    setMagnetOffset({ x, y });
  };

  const onMagnetLeave = () => {
    setMagnetOffset({ x: 0, y: 0 });
  };

  return (
    <section className="input-shell-wrap">
      <motion.div
        ref={terminalRef}
        className="terminal-card"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onClick={() => terminalRef.current?.focus()}
        initial={{ opacity: 0, y: 26, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="terminal-reflection" aria-hidden="true" />
        <div className="terminal-inner-glow" aria-hidden="true" />
        <div className="terminal-header">
          <div className="dots-wrap">
            <span className="dot red" />
            <span className="dot yellow" />
            <span className="dot green" />
          </div>

          <motion.button
            className={`run-btn ${canRun ? 'ready' : ''}`}
            disabled={!canRun || loading}
            onClick={() => void onRunAgent()}
            onMouseMove={onMagnetMove}
            onMouseLeave={onMagnetLeave}
            style={{ transform: `translate3d(${magnetOffset.x}px, ${magnetOffset.y}px, 0)` }}
            whileHover={{ y: -2, scale: 1.01 }}
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="run-icon">▶</span>
            <span>Run Agent</span>
          </motion.button>
        </div>

        <div className="terminal-body" ref={bodyRef}>
          {lines.map((line, index) => (
            <div
              key={`${line.type}-${index}`}
              className={`${line.type === 'prompt' ? 'prompt-line' : 'input-line'} typed-fade`}
            >
              {line.text}
            </div>
          ))}

          {isTypingPrompt && activePromptText && (
            <div className="prompt-line">
              {activePromptText}
              <span className="terminal-caret" />
            </div>
          )}

          {!isTypingPrompt && promptIndex < PROMPTS.length && (
            <div className="input-line">
              {activeInput}
              <span className="terminal-caret" />
            </div>
          )}

          {!isTypingPrompt && promptIndex >= PROMPTS.length && !loading && <span className="terminal-caret" />}
        </div>
      </motion.div>
    </section>
  );
}
