import { forwardRef, useId } from 'react';
import { cn } from '../../lib/cn';

export const Input = forwardRef(function Input(
  { label, hint, error, leftIcon: LeftIcon, rightSlot, className, id, ...rest },
  ref
) {
  const autoId = useId();
  const fieldId = id || autoId;
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={fieldId}
          className="text-xs font-medium uppercase tracking-wider text-text-muted"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {LeftIcon && (
          <LeftIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint pointer-events-none" />
        )}
        <input
          ref={ref}
          id={fieldId}
          className={cn(
            'w-full h-10 rounded-[var(--radius-md)] bg-surface-2 border border-border text-text placeholder:text-text-faint',
            'px-3.5 text-sm focus-ring transition-colors duration-150',
            'hover:border-border-strong focus:border-brand-500',
            LeftIcon && 'pl-9',
            rightSlot && 'pr-10',
            error && 'border-danger/60 focus:border-danger',
            className
          )}
          {...rest}
        />
        {rightSlot && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">{rightSlot}</div>
        )}
      </div>
      {(hint || error) && (
        <p className={cn('text-xs', error ? 'text-danger' : 'text-text-faint')}>
          {error || hint}
        </p>
      )}
    </div>
  );
});

export const Textarea = forwardRef(function Textarea(
  { label, hint, error, className, id, rows = 4, ...rest },
  ref
) {
  const autoId = useId();
  const fieldId = id || autoId;
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={fieldId} className="text-xs font-medium uppercase tracking-wider text-text-muted">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={fieldId}
        rows={rows}
        className={cn(
          'w-full rounded-[var(--radius-md)] bg-surface-2 border border-border text-text placeholder:text-text-faint',
          'p-3 text-sm font-mono focus-ring transition-colors duration-150',
          'hover:border-border-strong focus:border-brand-500 resize-y',
          error && 'border-danger/60 focus:border-danger',
          className
        )}
        {...rest}
      />
      {(hint || error) && (
        <p className={cn('text-xs', error ? 'text-danger' : 'text-text-faint')}>
          {error || hint}
        </p>
      )}
    </div>
  );
});

export default Input;
