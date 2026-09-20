import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';

const variants = {
  primary:
    'bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_8px_24px_-8px_rgba(124,58,237,0.6)] hover:from-brand-400 hover:to-brand-500',
  secondary:
    'bg-surface-2 text-text border border-border hover:bg-surface-3 hover:border-border-strong',
  ghost:
    'bg-transparent text-text-muted hover:text-text hover:bg-surface-2',
  danger:
    'bg-danger/90 text-white hover:bg-danger shadow-[0_8px_24px_-8px_rgba(239,68,68,0.5)]',
  outline:
    'bg-transparent text-text border border-border hover:border-brand-500/60 hover:text-brand-500',
};

const sizes = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2.5',
  icon: 'h-9 w-9 p-0',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  leftIcon: LeftIcon,
  rightIcon: RightIcon,
  className,
  children,
  ...rest
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 500, damping: 28 }}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-[var(--radius-md)] font-semibold whitespace-nowrap select-none',
        'transition-colors duration-150 focus-ring',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        className
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        LeftIcon && <LeftIcon className="w-4 h-4" />
      )}
      {children}
      {!loading && RightIcon && <RightIcon className="w-4 h-4" />}
    </motion.button>
  );
}

export default Button;
