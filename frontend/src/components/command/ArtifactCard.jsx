import { QRCodeCanvas } from 'qrcode.react';
import { Download } from 'lucide-react';

export function ArtifactCard({ build }) {
  const href = `${window.location.origin}/install/${build.id}`;
  const title = build.workflow_name
    ? `${build.project_name} · ${build.workflow_name}`
    : build.project_name;
  const plat = (build.platform || 'build').toUpperCase();
  const meta = `#${build.build_number || build.id.slice(0, 8)} • ${plat}`;

  return (
    <div className="bg-surface-3 border border-border rounded-lg p-3 flex items-center gap-4 hover:bg-surface-2 transition-colors group">
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="w-12 h-12 bg-white flex items-center justify-center rounded p-1 shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
        aria-label="Open install page to view larger QR"
      >
        <QRCodeCanvas value={href} size={40} bgColor="#ffffff" fgColor="#000000" level="M" />
      </a>
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-semibold text-text group-hover:text-brand-400 transition-colors truncate">
          {title}
        </h4>
        <p className="font-mono text-[11px] text-text-muted truncate">{meta}</p>
      </div>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="text-text-muted hover:text-brand-400 p-2 shrink-0"
        aria-label="Open install page"
      >
        <Download className="w-4 h-4" />
      </a>
    </div>
  );
}

export default ArtifactCard;
