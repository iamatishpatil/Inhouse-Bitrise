import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const widths = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-xl', xl: 'max-w-3xl' };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 4 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28 }}
            className={cn(
              'relative w-full glass border border-border-strong rounded-[var(--radius-lg)]',
              'shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]',
              widths[size]
            )}
          >
            <div className="flex items-start justify-between gap-4 p-5 border-b border-border">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-text">{title}</h2>
                {description && <p className="mt-1 text-sm text-text-muted">{description}</p>}
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-md text-text-faint hover:text-text hover:bg-surface-2 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5">{children}</div>
            {footer && (
              <div className="flex items-center justify-end gap-2 p-4 border-t border-border bg-surface-2/40 rounded-b-[var(--radius-lg)]">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default Modal;
