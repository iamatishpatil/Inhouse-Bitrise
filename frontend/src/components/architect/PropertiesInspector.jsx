import { Trash2, MousePointerClick } from 'lucide-react';
import { STEP_ICONS } from './WorkflowCanvas';
import { Box } from 'lucide-react';
import { cn } from '../../lib/cn';

function Toggle({ on, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={cn('w-9 h-5 rounded-full relative transition-colors shrink-0', on ? 'bg-brand-500' : 'bg-surface-3')}
      aria-pressed={on}
    >
      <span className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all', on ? 'right-0.5' : 'left-0.5')} />
    </button>
  );
}

export function PropertiesInspector({ step, onChange, onRemove }) {
  if (!step) {
    return (
      <aside className="w-72 shrink-0 bg-surface-2 border-l border-border flex flex-col">
        <div className="h-14 border-b border-border flex items-center px-5 shrink-0">
          <span className="text-sm font-semibold text-text">Properties</span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 p-6 text-text-muted">
          <MousePointerClick className="w-7 h-7 opacity-60" />
          <p className="text-sm">Select a step on the canvas to edit its properties.</p>
        </div>
      </aside>
    );
  }

  const Icon = STEP_ICONS[step.icon] || Box;
  const setInput = (i, value) => {
    const inputs = step.inputs.map((inp, idx) => (idx === i ? { ...inp, value } : inp));
    onChange({ inputs });
  };

  return (
    <aside className="w-72 shrink-0 bg-surface-2 border-l border-border flex flex-col">
      <div className="h-14 border-b border-border flex items-center px-5 shrink-0">
        <span className="text-sm font-semibold text-text">Properties</span>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-brand-500/20 border border-brand-500/30 flex items-center justify-center node-glow shrink-0">
              <Icon className="w-[18px] h-[18px] text-brand-500" />
            </div>
            <input
              value={step.title}
              onChange={(e) => onChange({ title: e.target.value })}
              className="flex-1 min-w-0 bg-transparent text-lg font-semibold text-text focus:outline-none border-b border-transparent focus:border-brand-500/40"
            />
          </div>
          <p className="text-sm text-text-muted">{step.summary}</p>
        </div>

        <div className="space-y-4">
          {step.inputs?.map((inp, i) => {
            const isBool = inp.value === 'true' || inp.value === 'false';
            return (
              <div key={inp.key}>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-faint mb-1.5">
                  {inp.key}
                </label>
                {isBool ? (
                  <div className="flex items-center justify-between bg-surface-3 border border-border rounded-[var(--radius-md)] px-3 py-2">
                    <span className="text-sm text-text">{inp.value === 'true' ? 'Enabled' : 'Disabled'}</span>
                    <Toggle on={inp.value === 'true'} onChange={(v) => setInput(i, String(v))} />
                  </div>
                ) : (
                  <input
                    value={inp.value}
                    onChange={(e) => setInput(i, e.target.value)}
                    className="w-full bg-surface-3 border border-border rounded-[var(--radius-md)] px-3 py-2 text-sm font-mono text-text focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/50 transition-all"
                  />
                )}
              </div>
            );
          })}
          {(!step.inputs || step.inputs.length === 0) && (
            <p className="text-sm text-text-muted">No configurable inputs.</p>
          )}
        </div>

        <div className="border-t border-border pt-4">
          <button
            onClick={() => onRemove(step.id)}
            className="w-full flex justify-center items-center gap-2 bg-transparent hover:bg-danger/10 border border-border hover:border-danger/50 text-danger rounded-[var(--radius-md)] py-2 text-sm font-semibold transition-colors"
          >
            <Trash2 className="w-4 h-4" /> Remove Step
          </button>
        </div>
      </div>
    </aside>
  );
}

export default PropertiesInspector;
