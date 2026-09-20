// src/components/build/BuildBits.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Small presentational pieces for a build row, shared by the global Builds feed
// and the per-project builds tab: trigger source, commit line, live duration,
// and a progress bar for in-flight builds.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { Hand, GitBranch, Terminal, GitCommit, Clock, UploadCloud, User } from 'lucide-react';
import { formatDuration, isActiveBuild } from '../../lib/build';
import { cn } from '../../lib/cn';

const TRIGGER = {
  manual: { label: 'Manual', Icon: Hand },
  webhook: { label: 'Auto', Icon: GitBranch },
  api: { label: 'API', Icon: Terminal },
  upload: { label: 'Upload', Icon: UploadCloud },
};

export function TriggerBadge({ source, user }) {
  const t = TRIGGER[source] || TRIGGER.manual;
  const { Icon } = t;
  return (
    <span
      className="inline-flex items-center gap-1 text-xs text-text-faint bg-surface-2 px-1.5 py-0.5 rounded-md border border-border"
      title={`Triggered: ${t.label}${user ? ` by ${user}` : ''}`}
    >
      <Icon className="w-3 h-3" /> {t.label}
      {user && (
        <>
          <span className="text-border mx-0.5">·</span>
          <User className="w-3 h-3 text-brand-400" />
          <span className="font-medium text-text-muted">{user}</span>
        </>
      )}
    </span>
  );
}

export function CommitLine({ build, className }) {
  if (!build.commit_message && !build.commit_sha) return null;
  const firstLine = (build.commit_message || '').split('\n')[0];
  return (
    <div className={cn('flex items-center gap-1.5 min-w-0 text-xs text-text-muted', className)}>
      <GitCommit className="w-3 h-3 shrink-0 text-text-faint" />
      {build.commit_sha && (
        <span className="font-mono text-text-faint shrink-0">{String(build.commit_sha).slice(0, 7)}</span>
      )}
      {firstLine && <span className="truncate">{firstLine}</span>}
    </div>
  );
}

// Live-updating duration — re-renders each second while the build is active.
export function BuildDuration({ build }) {
  const active = isActiveBuild(build);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const i = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(i);
  }, [active]);

  const dur = formatDuration(build.started_at, build.finished_at);
  if (!dur) return null;
  return (
    <span className="flex items-center gap-1">
      <Clock className="w-3 h-3" /> {dur}
    </span>
  );
}

// Progress bar — only rendered for in-flight builds.
// Uses historical time-based estimation for a smooth, accurate progress bar,
// capped at 99% until the build actually finishes.
export function BuildProgressBar({ build, className }) {
  const active = isActiveBuild(build);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!active) return;
    const i = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(i);
  }, [active]);

  if (!active) return null;

  const estimated = build.estimated_duration || 300;
  let pct = null;
  let determinate = false;

  if (build.started_at) {
    determinate = true;
    const elapsed = (Date.now() - new Date(build.started_at).getTime()) / 1000;
    pct = Math.min(99, Math.max(0, (elapsed / estimated) * 100));
  } else if (build.total_steps > 0) {
    determinate = true;
    pct = Math.min(100, Math.round(((build.current_step || 0) / build.total_steps) * 100));
  }

  return (
    <div className={cn('mt-2 h-[2px] w-full bg-surface-2 overflow-hidden rounded-full', className)}>
      {determinate ? (
        <div
          className="h-full bg-success transition-all duration-1000 ease-linear"
          style={{ width: `${pct}%` }}
        />
      ) : (
        <div className="h-full w-1/4 bg-success rounded-full animate-progress-indeterminate" />
      )}
    </div>
  );
}
