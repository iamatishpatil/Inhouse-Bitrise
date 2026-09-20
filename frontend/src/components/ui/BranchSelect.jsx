import { useEffect, useMemo, useRef, useState } from 'react';
import { GitBranch, ChevronDown, Check } from 'lucide-react';
import { cn } from '../../lib/cn';

/**
 * Branch picker — a filterable dropdown of the repo's branches that still
 * accepts free text (type a branch that isn't listed yet), matching Inhouse-Bitrise.
 *
 * Props:
 *   value     current branch string
 *   onChange  (next: string) => void
 *   options   string[] of branch names
 *   loading   show a "loading branches" hint
 *   placeholder, className
 */
export function BranchSelect({
  value,
  onChange,
  options = [],
  loading = false,
  placeholder = 'branch',
  className,
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const filtered = useMemo(() => {
    const q = (value || '').toLowerCase();
    // When the field exactly matches a branch, show the full list (so the
    // dropdown still lets you switch) rather than just the single match.
    const exact = options.some((o) => o.toLowerCase() === q);
    const list = q && !exact ? options.filter((o) => o.toLowerCase().includes(q)) : options;
    return list.slice(0, 100);
  }, [options, value]);

  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      <GitBranch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint pointer-events-none" />
      <input
        value={value || ''}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
        className={cn(
          'w-full h-9 rounded-[var(--radius-md)] bg-surface-2 border border-border text-text placeholder:text-text-faint',
          'pl-9 pr-8 text-sm focus-ring transition-colors duration-150',
          'hover:border-border-strong focus:border-brand-500'
        )}
      />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Toggle branch list"
        className="absolute right-2 top-1/2 -translate-y-1/2 text-text-faint hover:text-text"
      >
        <ChevronDown className={cn('w-4 h-4 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 min-w-full w-max max-w-[320px] max-h-60 overflow-auto rounded-[var(--radius-md)] border border-border bg-surface shadow-2xl py-1">
          {loading ? (
            <div className="px-3 py-2 text-xs text-text-faint">Loading branches…</div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-text-faint">
              {options.length === 0 ? 'No branches loaded' : 'No match — typed value is used as-is'}
            </div>
          ) : (
            filtered.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => {
                  onChange(b);
                  setOpen(false);
                }}
                className={cn(
                  'flex items-center justify-between gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-surface-3',
                  b === value ? 'text-brand-400' : 'text-text'
                )}
              >
                <span className="truncate">{b}</span>
                {b === value && <Check className="w-3.5 h-3.5 shrink-0" />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default BranchSelect;
