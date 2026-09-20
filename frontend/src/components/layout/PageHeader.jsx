import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { cn } from '../../lib/cn';

export function PageHeader({ title, subtitle, back, breadcrumbs, actions, className }) {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className={cn('px-6 md:px-10 pt-8 pb-6', className)}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          {(back || breadcrumbs) && (
            <div className="flex items-center gap-2.5 mb-2">
              {back && (
                <button
                  onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}
                  className="inline-flex items-center justify-center w-10 h-10 rounded-lg hover:bg-surface-2 text-text-muted hover:text-text transition-colors -ml-2"
                  title="Go back"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
              )}
              {breadcrumbs && (
                <div className="flex items-center gap-1.5 text-[13px] text-text-faint">
                  {breadcrumbs.map((b, i) => (
                    <span key={i} className="flex items-center gap-1.5">
                      {i > 0 && <span className="text-border">/</span>}
                      <span className={i === breadcrumbs.length - 1 ? 'text-text-muted font-medium' : ''}>{b}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          <h1 className="text-2xl md:text-[28px] font-bold text-text tracking-tight truncate">
            {title}
          </h1>
          {subtitle && <div className="mt-1 text-sm text-text-muted">{subtitle}</div>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </motion.div>
  );
}

export default PageHeader;
