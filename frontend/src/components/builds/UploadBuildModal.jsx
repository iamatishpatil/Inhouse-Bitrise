// src/components/builds/UploadBuildModal.jsx
// Drag-and-drop uploader for distributable build artifacts (.ipa / .apk / .aab).
// Stored as a finished build so it shows in the feed and gets an install/download link.
import { useEffect, useRef, useState } from 'react';
import {
  UploadCloud, Smartphone, Apple, Package, X, Check, Copy, Download, Link2, Loader2,
} from 'lucide-react';
import { api } from '../../api/client';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useToast } from '../ui/Toast';
import { copyToClipboard } from '../../lib/clipboard';
import { cn } from '../../lib/cn';

const ACCEPT = ['.ipa', '.apk', '.aab'];
const extOf = (name) => '.' + (name.split('.').pop() || '').toLowerCase();
const platformOf = (name) => (extOf(name) === '.ipa' ? 'ios' : 'android');

function formatBytes(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(n) / Math.log(1024));
  return `${(n / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${u[i]}`;
}

export function UploadBuildModal({ open, onClose, projectId, onUploaded }) {
  const toast = useToast();
  const inputRef = useRef(null);

  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(projectId || '');
  const [version, setVersion] = useState('');
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  // Reset everything when the modal is (re)opened.
  useEffect(() => {
    if (!open) return;
    setFile(null); setVersion(''); setProgress(0); setResult(null); setUploading(false);
    setSelectedProject(projectId || '');
    if (!projectId) {
      api.get('/api/projects')
        .then((res) => setProjects(res.data.projects || []))
        .catch(() => {});
    }
  }, [open, projectId]);

  const pickFile = (f) => {
    if (!f) return;
    if (!ACCEPT.includes(extOf(f.name))) {
      toast.error('Unsupported file', 'Upload an .ipa, .apk, or .aab');
      return;
    }
    setFile(f);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    pickFile(e.dataTransfer.files?.[0]);
  };

  const upload = async () => {
    if (!file) return;
    const pid = projectId || selectedProject;
    if (!pid) { toast.error('Pick a project'); return; }

    setUploading(true);
    setProgress(0);
    try {
      // Pass metadata via query params (not custom headers) so we only use
      // CORS-allowed request headers (Content-Type, Authorization).
      const qs = new URLSearchParams({ project_id: pid, filename: file.name });
      if (version.trim()) qs.set('version', version.trim());
      const res = await api.post(`/api/builds/upload?${qs.toString()}`, file, {
        headers: { 'Content-Type': 'application/octet-stream' },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        onUploadProgress: (e) => {
          if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
        },
      });
      setResult(res.data.build);
      toast.success('Build uploaded', `#${res.data.build.build_number}`);
      onUploaded?.(res.data.build);
    } catch (err) {
      toast.error('Upload failed', err.response?.data?.message || err.message);
    } finally {
      setUploading(false);
    }
  };

  const installUrl = result ? `${window.location.origin}/install/${result.id}` : '';
  const copyLink = async () => {
    if (await copyToClipboard(installUrl)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const PlatformIcon = file ? (platformOf(file.name) === 'ios' ? Apple : Smartphone) : Package;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Upload a build"
      description="Drag in an .ipa, .apk, or .aab to distribute it with an install link."
      size="lg"
      footer={
        result ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={uploading}>Cancel</Button>
            <Button leftIcon={UploadCloud} onClick={upload} loading={uploading} disabled={!file}>
              {uploading ? `Uploading ${progress}%` : 'Upload build'}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <SuccessView build={result} installUrl={installUrl} copied={copied} onCopy={copyLink} />
      ) : (
        <div className="flex flex-col gap-4">
          {/* Project picker (only when not already in a project) */}
          {!projectId && (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium uppercase tracking-wider text-text-muted">Project</span>
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="w-full h-10 rounded-[var(--radius-md)] bg-surface-2 border border-border text-text px-3 text-sm focus:border-brand-500 outline-none"
              >
                <option value="">Select a project…</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          )}

          {/* Dropzone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              'relative flex flex-col items-center justify-center gap-3 px-6 py-10 rounded-[var(--radius-lg)] border-2 border-dashed cursor-pointer transition-all',
              dragging
                ? 'border-brand-500 bg-brand-500/10'
                : 'border-border hover:border-brand-500/50 hover:bg-surface-2/40'
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT.join(',')}
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
            <div className={cn(
              'w-14 h-14 rounded-full flex items-center justify-center transition-colors',
              file ? 'bg-brand-500/15 text-brand-400' : 'bg-surface-2 border border-border text-text-muted'
            )}>
              <PlatformIcon className="w-6 h-6" />
            </div>
            {file ? (
              <div className="text-center">
                <div className="font-semibold text-text break-all">{file.name}</div>
                <div className="text-xs text-text-faint mt-0.5">
                  {formatBytes(file.size)} · {platformOf(file.name) === 'ios' ? 'iOS' : 'Android'}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setFile(null); }}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-text-muted hover:text-danger transition-colors"
                >
                  <X className="w-3 h-3" /> Remove
                </button>
              </div>
            ) : (
              <div className="text-center">
                <div className="font-semibold text-text">Drop your build here</div>
                <div className="text-xs text-text-faint mt-1">or click to browse · .ipa, .apk, .aab</div>
              </div>
            )}
          </div>

          <Input
            label="Version (optional)"
            placeholder="v1.2.3"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
          />

          {uploading && (
            <div>
              <div className="flex items-center justify-between text-[11px] text-text-faint mb-1">
                <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Uploading…</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
                <div className="h-full bg-brand-500 transition-all duration-200" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function SuccessView({ build, installUrl, copied, onCopy }) {
  return (
    <div className="flex flex-col items-center text-center gap-4 py-2">
      <div className="w-14 h-14 rounded-full bg-success/15 text-success flex items-center justify-center">
        <Check className="w-7 h-7" />
      </div>
      <div>
        <div className="font-semibold text-text">Build #{build.build_number} is live</div>
        <div className="text-sm text-text-muted mt-0.5">Share the install link or download it directly.</div>
      </div>
      <div className="w-full flex items-center gap-2 p-2.5 rounded-[var(--radius-md)] bg-surface-2 border border-border">
        <Link2 className="w-4 h-4 text-text-faint shrink-0" />
        <span className="flex-1 min-w-0 text-xs font-mono text-text-muted truncate text-left">{installUrl}</span>
        <Button variant="secondary" size="sm" leftIcon={copied ? Check : Copy} onClick={onCopy}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <Button
        variant="secondary"
        leftIcon={Download}
        onClick={() => window.open(installUrl, '_blank')}
        className="w-full"
      >
        Open install page
      </Button>
    </div>
  );
}

export default UploadBuildModal;
