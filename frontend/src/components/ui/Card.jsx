import { motion } from 'framer-motion';
import { cn } from '../../lib/cn';

export function Card({ as: Tag = 'div', interactive, className, children, ...rest }) {
  const Comp = interactive ? motion.div : Tag;
  const interactiveProps = interactive
    ? {
        whileHover: { y: -2, transition: { type: 'spring', stiffness: 300, damping: 20 } },
        whileTap: { scale: 0.995 },
      }
    : {};
  return (
    <Comp
      {...interactiveProps}
      className={cn(
        'rounded-[var(--radius-lg)] bg-surface/90 backdrop-blur-md border border-border',
        'shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_8px_24px_-12px_rgba(0,0,0,0.6)]',
        interactive && 'cursor-pointer hover:border-border-strong hover:bg-surface transition-colors',
        className
      )}
      {...rest}
    >
      {children}
    </Comp>
  );
}

export function CardHeader({ title, subtitle, actions, className }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 p-5 border-b border-border', className)}>
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-text truncate">{title}</h3>
        {subtitle && <p className="mt-0.5 text-sm text-text-muted truncate">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, children }) {
  return <div className={cn('p-5', className)}>{children}</div>;
}

export default Card;
