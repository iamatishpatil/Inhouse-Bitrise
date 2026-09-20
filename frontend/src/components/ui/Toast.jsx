import { createContext, useCallback, useContext, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { cn } from '../../lib/cn';

const ToastCtx = createContext(null);

const icons = {
  success: { Icon: CheckCircle2, color: 'text-success' },
  error:   { Icon: XCircle,      color: 'text-danger' },
  warning: { Icon: AlertTriangle, color: 'text-warning' },
  info:    { Icon: Info,         color: 'text-info' },
};

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  const dismiss = useCallback((id) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((tone, title, description, opts = {}) => {
    const id = Math.random().toString(36).slice(2);
    setItems((prev) => [...prev, { id, tone, title, description }]);
    const ttl = opts.ttl ?? 4200;
    if (ttl > 0) setTimeout(() => dismiss(id), ttl);
    return id;
  }, [dismiss]);

  const value = {
    success: (t, d, o) => push('success', t, d, o),
    error:   (t, d, o) => push('error',   t, d, o),
    warning: (t, d, o) => push('warning', t, d, o),
    info:    (t, d, o) => push('info',    t, d, o),
  };

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="fixed top-5 right-5 z-[100] flex flex-col gap-2 w-[min(380px,calc(100vw-2.5rem))] pointer-events-none">
        <AnimatePresence initial={false}>
          {items.map((t) => {
            const { Icon, color } = icons[t.tone];
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: -12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 30, transition: { duration: 0.15 } }}
                transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                className={cn(
                  'pointer-events-auto glass border border-border-strong rounded-[var(--radius-md)] p-3.5 pr-2',
                  'flex items-start gap-3 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.7)]'
                )}
              >
                <Icon className={cn('w-5 h-5 mt-0.5 shrink-0', color)} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-text">{t.title}</div>
                  {t.description && (
                    <div className="text-xs text-text-muted mt-0.5">{t.description}</div>
                  )}
                </div>
                <button
                  onClick={() => dismiss(t.id)}
                  className="p-1 rounded-md text-text-faint hover:text-text hover:bg-surface-2 transition-colors"
                  aria-label="Dismiss"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
