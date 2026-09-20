import { useRef } from 'react';
import { Code, Sparkles, Hammer, FlaskConical, Rocket, Box } from 'lucide-react';
import { cn } from '../../lib/cn';

export const STEP_ICONS = { code: Code, sparkles: Sparkles, hammer: Hammer, flask: FlaskConical, rocket: Rocket };
export const NODE_H = 78;

const DOT = {
  success: 'bg-success node-glow-success',
  running: 'bg-brand-500 node-glow animate-pulse',
  pending: 'bg-border-strong',
  failed: 'bg-danger status-glow-danger',
};

function StepNode({ step, selected, onPointerDown, onSelect }) {
  const Icon = STEP_ICONS[step.icon] || Box;
  const running = step.state === 'running';
  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={(e) => onPointerDown(e, step)}
      onClick={(e) => { e.stopPropagation(); onSelect(step.id); }}
      style={{ left: step.x, top: step.y, width: step.w || 200 }}
      className={cn(
        'absolute glass border border-border rounded-lg p-3 cursor-grab active:cursor-grabbing select-none transition-colors z-10 touch-none',
        selected ? 'border-brand-500/60 node-glow' : 'hover:border-border-strong',
        running && !selected && 'border-brand-500/40 node-glow'
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className={cn('w-6 h-6 rounded-full flex items-center justify-center shrink-0',
          running ? 'bg-brand-500/20' : 'bg-surface-3')}>
          <Icon className={cn('w-3.5 h-3.5', running ? 'text-brand-500' : 'text-text')} />
        </div>
        <span className={cn('text-sm font-semibold truncate', running ? 'text-brand-500' : 'text-text')}>
          {step.title}
        </span>
        {!running && (
          <span className={cn('ml-auto w-2 h-2 rounded-full shrink-0', DOT[step.state] || DOT.pending)} />
        )}
      </div>

      {running ? (
        <>
          <div className="text-[11px] text-text-muted mb-2 truncate">{step.summary}</div>
          <div className="w-full bg-surface-3 rounded-full h-1 overflow-hidden">
            <div className="bg-brand-500 h-1 rounded-full transition-all" style={{ width: `${step.progress ?? 40}%` }} />
          </div>
        </>
      ) : (
        <span className="text-[10px] font-mono text-text-muted truncate block">{step.uses}</span>
      )}
    </div>
  );
}

function edgePath(a, b) {
  const ax = a.x + (a.w || 200);
  const ay = a.y + NODE_H / 2;
  const bx = b.x;
  const by = b.y + NODE_H / 2;
  const dx = Math.max(40, Math.abs(bx - ax) / 2);
  return `M ${ax} ${ay} C ${ax + dx} ${ay}, ${bx - dx} ${by}, ${bx} ${by}`;
}

export function WorkflowCanvas({ steps, selectedId, onSelect, onMove }) {
  const contentRef = useRef(null);
  const drag = useRef(null);

  const W = Math.max(1200, ...steps.map((s) => s.x + (s.w || 200) + 120));
  const H = Math.max(680, ...steps.map((s) => s.y + 200));

  const onPointerDown = (e, step) => {
    const rect = contentRef.current.getBoundingClientRect();
    drag.current = { id: step.id, dx: e.clientX - rect.left - step.x, dy: e.clientY - rect.top - step.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!drag.current) return;
    const rect = contentRef.current.getBoundingClientRect();
    const x = Math.max(8, e.clientX - rect.left - drag.current.dx);
    const y = Math.max(8, e.clientY - rect.top - drag.current.dy);
    onMove(drag.current.id, x, y);
  };

  const endDrag = () => { drag.current = null; };

  return (
    <div className="flex-1 relative overflow-auto">
      <div
        ref={contentRef}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onClick={() => onSelect(null)}
        style={{ width: W, height: H }}
        className="relative canvas-grid"
      >
        <svg className="absolute inset-0 pointer-events-none" width={W} height={H} style={{ zIndex: 1 }}>
          <defs>
            <linearGradient id="edgeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="var(--color-border-strong)" />
              <stop offset="100%" stopColor="var(--color-brand-500)" />
            </linearGradient>
          </defs>
          {steps.slice(0, -1).map((s, i) => {
            const next = steps[i + 1];
            const live = s.state === 'running' || next.state === 'running';
            return (
              <path
                key={s.id}
                d={edgePath(s, next)}
                fill="none"
                strokeWidth="2"
                stroke={live ? 'url(#edgeGrad)' : 'var(--color-border-strong)'}
                className={live ? 'energy-line' : ''}
              />
            );
          })}
        </svg>

        {steps.map((s) => (
          <StepNode key={s.id} step={s} selected={s.id === selectedId} onPointerDown={onPointerDown} onSelect={onSelect} />
        ))}

        <div className="absolute bottom-4 left-4 z-10 font-mono text-[11px] text-text-faint pointer-events-none">
          drag nodes · click to inspect
        </div>
      </div>
    </div>
  );
}

export default WorkflowCanvas;
