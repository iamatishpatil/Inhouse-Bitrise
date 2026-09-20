import { cn } from '../../lib/cn';

const tones = {
  neutral: 'bg-surface-3 text-text-muted border-border',
  success: 'bg-success/12 text-success border-success/30',
  warning: 'bg-warning/12 text-warning border-warning/30',
  danger: 'bg-danger/12 text-danger border-danger/30',
  info: 'bg-info/12 text-info border-info/30',
  brand: 'bg-brand-500/15 text-brand-400 border-brand-500/30',
};

export function Badge({ tone = 'neutral', dot, children, className }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-semibold uppercase tracking-wider',
        tones[tone],
        className
      )}
    >
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full bg-current', tone !== 'neutral' && 'animate-pulse-dot')} />}
      {children}
    </span>
  );
}

export function StatusDot({ status = 'pending', label }) {
  const map = {
    pending: { tone: 'neutral', text: 'Pending' },
    running: { tone: 'info', text: 'Running' },
    success: { tone: 'success', text: 'Success' },
    failed: { tone: 'danger', text: 'Failed' },
    aborted: { tone: 'neutral', text: 'Cancelled' },
    pending_deploy: { tone: 'warning', text: 'Queued for S3' },
    deploying: { tone: 'info', text: 'Uploading to S3' },
    pending_testflight: { tone: 'warning', text: 'Queued for TestFlight' },
    deploying_testflight: { tone: 'info', text: 'Uploading to TestFlight' },
  };
  const cfg = map[status] || map.pending;
  return <Badge tone={cfg.tone} dot>{label || cfg.text}</Badge>;
}

export default Badge;
