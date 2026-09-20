import { Fragment } from 'react';
import { Check, X, GitBranch, Hammer, FlaskConical, Rocket, Hourglass } from 'lucide-react';
import { cn } from '../../lib/cn';

const PHASES = [
  { key: 'queue', label: 'Queue', Icon: Hourglass },
  { key: 'checkout', label: 'Checkout', Icon: GitBranch },
  { key: 'build', label: 'Build', Icon: Hammer },
  { key: 'test', label: 'Test', Icon: FlaskConical },
  { key: 'deploy', label: 'Deploy', Icon: Rocket },
];

// Map a build's coarse status onto the 5 high-level pipeline phases.
export function pipelinePhases(build) {
  const s = build?.status;
  const total = build?.total_steps || 0;
  const cur = build?.current_step || 0;
  const buildOrTest = total > 0 ? Math.min(3, 1 + Math.round((cur / total) * 2)) : 2;

  let activeIdx = 0;
  let mode = 'running'; // running | failed | stopped
  switch (s) {
    case 'pending': activeIdx = 0; break;
    case 'running': activeIdx = buildOrTest; break;
    case 'pending_deploy':
    case 'pending_testflight':
    case 'deploying':
    case 'deploying_testflight': activeIdx = 4; break;
    case 'success': activeIdx = PHASES.length; break; // everything done
    case 'failed': activeIdx = buildOrTest; mode = 'failed'; break;
    case 'aborted': activeIdx = Math.max(1, buildOrTest - 1); mode = 'stopped'; break;
    default: activeIdx = 0;
  }

  return PHASES.map((p, i) => {
    let state;
    if (s === 'success' || i < activeIdx) state = 'done';
    else if (i === activeIdx) state = mode;
    else state = 'pending';
    return { ...p, state };
  });
}

const NODE = {
  done: { ring: 'border-success', bg: 'bg-surface', text: 'text-success', glow: 'status-glow-success', Glyph: Check },
  running: { ring: 'border-2 border-brand-500', bg: 'bg-brand-500/20', text: 'text-brand-400', glow: 'status-glow-running animate-pulse', spin: true },
  failed: { ring: 'border-danger', bg: 'bg-surface', text: 'text-danger', glow: 'status-glow-danger', Glyph: X },
  stopped: { ring: 'border-border/50', bg: 'bg-surface-3', text: 'text-text-faint', glow: '' },
  pending: { ring: 'border-border-muted/40', bg: 'bg-surface-3', text: 'text-text-faint', glow: 'opacity-50' },
};

function Node({ phase }) {
  const cfg = NODE[phase.state] || NODE.pending;
  const Glyph = cfg.Glyph || phase.Icon;
  const running = phase.state === 'running';
  return (
    <div className="flex flex-col items-center gap-2 relative shrink-0">
      <div
        className={cn(
          'rounded-full flex items-center justify-center border z-10 relative',
          running ? 'w-12 h-12' : 'w-10 h-10',
          cfg.bg, cfg.ring, cfg.glow
        )}
      >
        <Glyph
          className={cn('w-4 h-4', cfg.text, cfg.spin && 'animate-spin')}
          style={cfg.spin ? { animationDuration: '3s' } : undefined}
        />
      </div>
      <span
        className={cn(
          'absolute -bottom-6 whitespace-nowrap text-[10px] uppercase tracking-wider font-semibold',
          running ? 'text-brand-400' : 'text-text-muted',
          phase.state === 'pending' && 'opacity-50'
        )}
      >
        {phase.label}
      </span>
    </div>
  );
}

function Connector({ done }) {
  return (
    <div
      className={cn(
        'flex-1 h-[2px] mx-2 rounded-full transition-colors relative z-0',
        done
          ? 'bg-success/80 shadow-[0_0_8px_rgba(34,197,94,0.5)]'
          : 'bg-transparent'
      )}
    />
  );
}

export function PipelineNodeMap({ build, className }) {
  const phases = pipelinePhases(build);
  return (
    <div className={cn('flex items-center justify-between w-full relative py-8', className)}>
      <div className="absolute w-full border-t-2 border-dashed border-border/50 top-1/2 -translate-y-[1px] left-0 -z-10" />
      {phases.map((p, i) => (
        <Fragment key={p.key}>
          <Node phase={p} />
          {i < phases.length - 1 && <Connector done={p.state === 'done'} />}
        </Fragment>
      ))}
    </div>
  );
}

export default PipelineNodeMap;
