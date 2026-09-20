import { cn } from '../../lib/cn';

export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center py-14 px-6', className)}>
      {Icon && (
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-brand-500/15 blur-xl" />
          <div className="relative w-14 h-14 rounded-full bg-surface-2 border border-border flex items-center justify-center text-brand-400">
            <Icon className="w-6 h-6" />
          </div>
        </div>
      )}
      <h3 className="mt-4 text-base font-semibold text-text">{title}</h3>
      {description && <p className="mt-1.5 text-sm text-text-muted max-w-sm">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }) {
  return <div className={cn('skeleton rounded-[var(--radius-md)]', className)} />;
}

export default EmptyState;
