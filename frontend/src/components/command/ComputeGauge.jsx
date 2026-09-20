import { Gauge } from 'lucide-react';
import { cn } from '../../lib/cn';

const CIRC = 2 * Math.PI * 45; // r=45 → ~283

export function ComputeGauge({ load = 0, tiles = [] }) {
  const clamped = Math.max(0, Math.min(100, Math.round(load)));
  const offset = CIRC * (1 - clamped / 100);

  return (
    <section className="bg-surface/90 backdrop-blur-md border border-border shadow-sm rounded-xl p-5">
      <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-text-muted mb-4">
        <Gauge className="w-3.5 h-3.5" /> Compute Usage
      </h3>

      <div className="flex items-center justify-center py-3">
        <div className="relative w-32 h-32">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
            <circle
              cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="8"
              strokeDasharray={CIRC} strokeDashoffset={offset} strokeLinecap="round"
              className="text-brand-400 transition-all duration-700 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-text tabular-nums">
              {clamped}<span className="text-lg text-brand-400">%</span>
            </span>
            <span className="font-mono text-[10px] text-text-muted">LOAD</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-2">
        {tiles.map((t) => (
          <div key={t.label} className="bg-surface-3 p-3 rounded-lg border border-border">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">{t.label}</p>
            <p className={cn('font-mono text-lg', t.tone || 'text-text')}>
              {t.value}
              {t.sub && <span className="text-text-faint text-xs"> {t.sub}</span>}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default ComputeGauge;
