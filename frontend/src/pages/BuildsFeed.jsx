import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Boxes, GitBranch, Download, FolderGit2, RefreshCw, UploadCloud, OctagonX, Package,
} from 'lucide-react';
import { api } from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Badge, StatusDot } from '../components/ui/Badge';
import { EmptyState, Skeleton } from '../components/ui/EmptyState';
import { useToast } from '../components/ui/Toast';
import {
  platformIcon, relativeTime, groupBuildsByDate, mergeHead, isActiveBuild, isCancellable,
} from '../lib/build';
import {
  TriggerBadge, CommitLine, BuildDuration, BuildProgressBar,
} from '../components/builds/BuildBits';
import { UploadBuildModal } from '../components/builds/UploadBuildModal';
import { ActivePipelinePanel } from '../components/command/ActivePipelinePanel';
import { ComputeGauge } from '../components/command/ComputeGauge';
import { ArtifactCard } from '../components/command/ArtifactCard';

const PAGE = 25;

export default function BuildsFeed() {
  const navigate = useNavigate();
  const toast = useToast();

  const [showUpload, setShowUpload] = useState(false);
  const [builds, setBuilds] = useState([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [capacity, setCapacity] = useState(4);
  const loadedCountRef = useRef(0);
  loadedCountRef.current = builds.length;

  const loadMore = useCallback(async (reset = false) => {
    reset ? setLoading(true) : setLoadingMore(true);
    try {
      const offset = reset ? 0 : loadedCountRef.current;
      const res = await api.get(`/api/builds/recent?limit=${PAGE}&offset=${offset}`);
      const page = res.data.builds || [];
      setBuilds((prev) => (reset ? page : [...prev, ...page]));
      setTotal(res.data.total || 0);
      setHasMore(res.data.hasMore || false);
    } catch (err) {
      toast.error('Failed to load builds', err.response?.data?.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [toast]);

  useEffect(() => { 
    loadMore(true); 
    api.get('/api/runner/status').then(res => setCapacity(res.data.capacity || 4)).catch(() => {});
  }, [loadMore]);

  const abortBuild = useCallback(async (buildId) => {
    try {
      await api.post(`/api/builds/${buildId}/abort`);
      setBuilds((prev) => prev.map((b) => (b.id === buildId ? { ...b, status: 'aborted' } : b)));
      toast.info('Build cancelled');
      loadMore(true);
    } catch (err) {
      toast.error('Failed to cancel', err.response?.data?.message);
    }
  }, [toast, loadMore]);

  const hasActive = useMemo(() => builds.some(isActiveBuild), [builds]);
  useEffect(() => {
    if (!hasActive) return;
    const interval = setInterval(async () => {
      try {
        const res = await api.get(`/api/builds/recent?limit=${PAGE}&offset=0`);
        setBuilds((prev) => mergeHead(prev, res.data.builds || []));
        setTotal(res.data.total || 0);
      } catch { /* transient; next tick retries */ }
    }, 5000);
    return () => clearInterval(interval);
  }, [hasActive]);

  // ── Derived command-center state ──────────────────────────────────────────
  const filtered = builds;
  const groups = useMemo(() => groupBuildsByDate(filtered), [filtered]);
  const panelBuild = useMemo(() => {
    return builds.find(b => ['running', 'deploying', 'deploying_testflight'].includes(b.status)) ||
           builds.find(isActiveBuild) ||
           builds[0] ||
           null;
  }, [builds]);

  const stats = useMemo(() => {
    const activeCount = builds.filter(isActiveBuild).length;
    const finished = builds.filter((b) => ['success', 'failed', 'aborted'].includes(b.status));
    const successCount = builds.filter((b) => b.status === 'success').length;
    const successRate = finished.length ? Math.round((successCount / finished.length) * 100) : null;
    const load = Math.min(100, Math.round((activeCount / capacity) * 100));
    return { activeCount, successRate, load };
  }, [builds, capacity]);

  const artifacts = useMemo(
    () => builds.filter((b) => b.status === 'success' && b.artifact_path).slice(0, 4),
    [builds]
  );

  return (
    <AppShell>
      <PageHeader
        title="Builds"
        subtitle={total ? `${total} build${total === 1 ? '' : 's'} · live pipeline activity` : 'Live pipeline & deploy activity'}
        actions={
          <>
            <Button variant="secondary" leftIcon={RefreshCw} onClick={() => loadMore(true)}>Refresh</Button>
            <Button leftIcon={UploadCloud} onClick={() => setShowUpload(true)}>Upload build</Button>
          </>
        }
      />

      <UploadBuildModal open={showUpload} onClose={() => setShowUpload(false)} onUploaded={() => loadMore(true)} />

      <div className="px-6 md:px-10 pb-12 flex-1">
        {loading ? (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 flex flex-col gap-6">
              <Skeleton className="h-[420px] rounded-xl" />
              <Skeleton className="h-40 rounded-xl" />
            </div>
            <div className="flex flex-col gap-6">
              <Skeleton className="h-72 rounded-xl" />
              <Skeleton className="h-56 rounded-xl" />
            </div>
          </div>
        ) : builds.length === 0 ? (
          <div className="glass-panel rounded-xl">
            <EmptyState
              icon={Boxes}
              title="No builds yet"
              description="Trigger a workflow from any project to light up the command center."
            />
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="grid grid-cols-1 xl:grid-cols-3 gap-6"
          >
            {/* Main column */}
            <div className="xl:col-span-2 flex flex-col gap-6 min-w-0">
              <ActivePipelinePanel build={panelBuild} demo={false} />

              <div className="bg-surface/90 backdrop-blur-md border border-border shadow-sm rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-text-muted">
                    <Boxes className="w-3.5 h-3.5" /> Build Feed
                  </h3>
                </div>

                {groups.length === 0 ? (
                  <div className="p-10 text-center text-text-muted text-sm">No builds match the current filters.</div>
                ) : (
                  groups.map((group) => (
                    <div key={group.label}>
                      <div className="px-5 py-2.5 bg-surface-2/60 border-y border-border backdrop-blur-sm">
                        <div className="font-semibold text-text text-xs uppercase tracking-wider">
                          {group.label} <span className="text-text-muted font-normal normal-case">({group.builds.length})</span>
                        </div>
                      </div>
                      <div className="divide-y divide-border">
                        {group.builds.map((b) => (
                          <BuildRow key={b.id} build={b} onOpen={() => navigate(`/builds/${b.id}`)} onAbort={abortBuild} />
                        ))}
                      </div>
                    </div>
                  ))
                )}

                {hasMore && (
                  <div className="flex justify-center p-4 border-t border-border">
                    <Button variant="secondary" loading={loadingMore} onClick={() => loadMore(false)}>
                      Load more ({builds.length} of {total})
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Right rail */}
            <div className="flex flex-col gap-6">
              <ComputeGauge
                load={stats.load}
                tiles={[
                  { label: 'Active', value: `${stats.activeCount}`, sub: `/ ${capacity}`, tone: stats.activeCount ? 'text-brand-400' : 'text-text' },
                  { label: 'Success', value: stats.successRate == null ? '—' : `${stats.successRate}%`, tone: 'text-success' },
                ]}
              />

              <section className="bg-surface/90 backdrop-blur-md border border-border shadow-sm rounded-xl p-5 flex flex-col">
                <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-text-muted mb-4">
                  <Package className="w-3.5 h-3.5" /> Recent Builds
                </h3>
                {artifacts.length === 0 ? (
                  <div className="text-text-muted text-sm py-6 text-center">
                    No installable artifacts yet.
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {artifacts.map((b) => <ArtifactCard key={b.id} build={b} />)}
                  </div>
                )}
              </section>
            </div>
          </motion.div>
        )}
      </div>
    </AppShell>
  );
}

function BuildRow({ build: b, onOpen, onAbort }) {
  const PIcon = platformIcon(b.platform);
  return (
    <div className="px-5 py-4 cursor-pointer transition-colors hover:bg-surface-2/40 group" onClick={onOpen}>
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-surface-3 border border-border flex items-center justify-center text-brand-400 shrink-0">
          <PIcon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-text">#{b.build_number || b.id.slice(0, 8)}</span>
            <span className="text-text-faint">·</span>
            <span className="text-sm text-text-muted truncate flex items-center gap-1">
              <FolderGit2 className="w-3 h-3 shrink-0" /> {b.project_name}
            </span>
            <span className="text-text-faint">/</span>
            <span className="text-sm text-text-muted truncate">{b.workflow_name || 'Manual upload'}</span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-text-faint flex-wrap">
            <span className="flex items-center gap-1 font-mono"><GitBranch className="w-3 h-3" /> {b.branch || 'main'}</span>
            <span>{relativeTime(b.created_at)}</span>
            <BuildDuration build={b} />
            <TriggerBadge source={b.trigger_source} />
          </div>
          <CommitLine build={b} className="mt-1" />
          <BuildProgressBar build={b} />
        </div>
        <StatusDot status={b.status} />
        {isCancellable(b) && onAbort && (
          <Button variant="ghost" size="sm" leftIcon={OctagonX} onClick={(e) => { e.stopPropagation(); onAbort(b.id); }}>
            Cancel
          </Button>
        )}
        {b.status === 'success' && b.artifact_path && (
          <Button
            variant="secondary" size="sm" leftIcon={Download}
            onClick={(e) => { e.stopPropagation(); window.open(`${window.location.origin}/install/${b.id}`, '_blank'); }}
          >
            Download
          </Button>
        )}
      </div>
    </div>
  );
}
