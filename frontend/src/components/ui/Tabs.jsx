import { motion } from 'framer-motion';
import { cn } from '../../lib/cn';

export function Tabs({ items, value, onChange, className }) {
  return (
    <div className={cn('inline-flex items-center gap-1 p-1 rounded-[var(--radius-md)] bg-surface-2 border border-border', className)}>
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            onClick={() => onChange?.(it.value)}
            className={cn(
              'relative px-3.5 h-8 rounded-[var(--radius-sm)] text-xs font-semibold uppercase tracking-wider transition-colors',
              active ? 'text-white' : 'text-text-muted hover:text-text'
            )}
          >
            {active && (
              <motion.span
                layoutId="tabActive"
                className="absolute inset-0 rounded-[var(--radius-sm)] bg-gradient-to-b from-brand-500 to-brand-600 shadow-[0_4px_14px_-4px_rgba(124,58,237,0.7)]"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            <span className="relative">{it.label}</span>
            {typeof it.count === 'number' && (
              <span className={cn(
                'relative ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold',
                active ? 'bg-white/20 text-white' : 'bg-surface-3 text-text-muted'
              )}>
                {it.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default Tabs;
