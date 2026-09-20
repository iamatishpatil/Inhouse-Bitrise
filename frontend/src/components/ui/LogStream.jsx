import { useEffect, useRef, useState, useMemo } from 'react';
import { Copy, ArrowDownToLine, Check } from 'lucide-react';
import { Button } from './Button';
import { cn } from '../../lib/cn';
import { copyToClipboard } from '../../lib/clipboard';
import { StatusDot } from './Badge';

// Minimal ANSI -> HTML span (handles common color codes)
const ansiToHtml = (str = '') => {
  const map = {
    30: '#5b6184', 31: '#ef4444', 32: '#22c55e', 33: '#f59e0b',
    34: '#38bdf8', 35: '#c084fc', 36: '#67e8f9', 37: '#e7e9f3',
    90: '#5b6184', 91: '#fca5a5', 92: '#86efac', 93: '#fcd34d',
    94: '#7dd3fc', 95: '#d8b4fe', 96: '#a5f3fc', 97: '#ffffff',
  };
  let html = String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // open spans for color codes
  html = html.replace(/\[([0-9;]*)m/g, (_, code) => {
    if (code === '' || code === '0') return '</span>';
    const parts = code.split(';');
    const color = parts.find((p) => map[p]);
    if (color) return `<span style="color:${map[color]}">`;
    return '';
  });
  return html;
};

export function LogStream({ logs = '', status, className }) {
  const containerRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);

  const lines = useMemo(() => (logs ? logs.split('\n') : []), [logs]);

  const progress = useMemo(() => {
    if (status === 'success') return 100;
    if (status === 'pending') return 0;
    return Math.min(95, 100 * (1 - Math.exp(-lines.length / 300)));
  }, [lines.length, status]);

  const progressColor =
    status === 'failed' ? 'bg-danger' : status === 'aborted' ? 'bg-surface-3' : 'bg-success';

  useEffect(() => {
    if (!autoScroll || !containerRef.current) return;
    containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }, [logs, autoScroll]);

  const onScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  };

  const copy = async () => {
    const success = await copyToClipboard(logs || '');
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const isLive = status === 'running' || status === 'pending';

  return (
    <div className={cn('relative rounded-[var(--radius-lg)] overflow-hidden border border-border bg-[#06080f]', className)}>
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-surface/80">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-text-faint font-semibold">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-danger/60" />
            <span className="w-2.5 h-2.5 rounded-full bg-warning/60" />
            <span className="w-2.5 h-2.5 rounded-full bg-success/60" />
          </div>
          <span className="ml-2">Build logs</span>
          {isLive && (
            <span className="flex items-center gap-1 text-info">
              <span className="w-1.5 h-1.5 rounded-full bg-info animate-pulse-dot" /> live
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <StatusDot status={status} />
          <div className="flex items-center gap-1">
            {!autoScroll && (
            <Button
              size="sm"
              variant="ghost"
              leftIcon={ArrowDownToLine}
              onClick={() => setAutoScroll(true)}
            >
              Jump to live
            </Button>
          )}
          <Button size="sm" variant="ghost" leftIcon={copied ? Check : Copy} onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </Button>
          </div>
        </div>
      </div>
      <div className="h-[2px] w-full bg-surface-2 overflow-hidden">
        <div 
          className={cn("h-full transition-all duration-500 ease-out", progressColor)}
          style={{ width: `${progress}%` }}
        />
      </div>
      <div
        ref={containerRef}
        onScroll={onScroll}
        className="font-mono text-[12.5px] leading-relaxed p-4 overflow-auto min-h-[400px] h-[calc(100vh-360px)] text-[#e7e9f3]"
      >
        {lines.length === 0 ? (
          <div className="text-[#5b6184] italic flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-info animate-pulse-dot" />
            Waiting for logs…
          </div>
        ) : (
          lines.map((line, i) => (
            <div key={i} className="flex gap-4 hover:bg-white/[0.02]">
              <span className="select-none text-[#5b6184]/60 w-10 text-right shrink-0">{i + 1}</span>
              <span
                className="whitespace-pre-wrap break-words flex-1"
                dangerouslySetInnerHTML={{ __html: ansiToHtml(line) || '&nbsp;' }}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default LogStream;
