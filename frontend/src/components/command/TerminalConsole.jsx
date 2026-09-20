import { useEffect, useRef } from 'react';
import { Terminal } from 'lucide-react';
import { cn } from '../../lib/cn';

const LEVELS = {
  INFO: 'text-green-400',
  OK: 'text-green-400',
  SUCCESS: 'text-green-400',
  EXEC: 'text-[#c084fc]',
  RUN: 'text-[#c084fc]',
  WARN: 'text-yellow-400',
  WARNING: 'text-yellow-400',
  ERROR: 'text-red-400',
  FAIL: 'text-red-400',
  FATAL: 'text-red-400',
  DEBUG: 'text-[#5b6184]',
  OUT: 'text-[#e7e9f3]',
};

const LINE_RE = /^\s*(\[[^\]]+\])?\s*(INFO|OK|SUCCESS|EXEC|RUN|WARN|WARNING|ERROR|FAIL|FATAL|DEBUG|OUT)?\s*(.*)$/;

function Line({ raw }) {
  const m = raw.match(LINE_RE) || [];
  const [, ts, lvl, rest] = m;
  return (
    <div className="mb-1">
      {ts && <span className="text-[#5b6184]">{ts}</span>}{' '}
      {lvl && <span className={cn('font-semibold', LEVELS[lvl] || 'text-[#e7e9f3]')}>{lvl}</span>}{' '}
      <span className={lvl ? "text-[#a5b4cb]" : "text-[#e7e9f3]"}>{lvl ? rest : raw.replace(ts || '', '')}</span>
    </div>
  );
}

export function TerminalConsole({ title = 'Build Log', text = '', running = false, className }) {
  const scrollRef = useRef(null);
  const lines = String(text).split('\n').filter((l, i, a) => l.length || i < a.length - 1);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text]);

  return (
    <section className={cn('rounded-xl border border-border overflow-hidden flex flex-col shadow-2xl bg-[#06080f]', className)}>
      <div className="bg-surface/80 px-4 py-2 flex items-center justify-between border-b border-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Terminal className="w-3.5 h-3.5 text-text-muted shrink-0" />
          <span className="font-mono text-[13px] text-text-muted truncate">{title}</span>
        </div>
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-danger/60" />
          <span className="w-2.5 h-2.5 rounded-full bg-warning/60" />
          <span className="w-2.5 h-2.5 rounded-full bg-success/60" />
        </div>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 p-4 overflow-y-auto font-mono text-[12px] leading-relaxed relative min-h-0 text-[#e7e9f3]"
      >
        <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-brand-500" />
        <div className="relative z-10">
          {lines.length === 0 ? (
            <div className="text-[#5b6184] italic flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-info animate-pulse-dot" />
              — waiting for log output —
            </div>
          ) : (
            lines.map((l, i) => <Line key={i} raw={l} />)
          )}
          {running && (
            <div className="animate-pulse">
              <span className="text-brand-400">EXEC</span>{' '}
              <span className="text-text-muted">streaming…</span>
              <span className="inline-block w-2 h-4 bg-brand-400 ml-1 align-middle animate-ping" />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default TerminalConsole;
