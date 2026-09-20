import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { io } from 'socket.io-client';
import { Share2, Link2, GitBranch, Clock, Package, Download, OctagonX, RefreshCw } from 'lucide-react';
import { api, API_URL } from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { StatusDot } from '../components/ui/Badge';
import { LogStream } from '../components/ui/LogStream';
import { Skeleton } from '../components/ui/EmptyState';
import { useToast } from '../components/ui/Toast';
import { copyToClipboard } from '../lib/clipboard';
import { isCancellable } from '../lib/build';

const formatDuration = (start, end) => {
  if (!start) return '—';
  const s = new Date(start);
  const e = end ? new Date(end) : new Date();
  const sec = Math.max(0, Math.round((e - s) / 1000));
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
};

export default function BuildDetail() {
  const { id: buildId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [build, setBuild] = useState(null);
  const [logs, setLogs] = useState('');
  const [status, setStatus] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    api.get(`/api/builds/${buildId}`)
      .then((res) => {
        if (!mounted) return;
        setBuild(res.data.build);
        setStatus(res.data.build.status);
        setLogs(res.data.build.logs || '');
      })
      .catch(() => toast.error('Failed to fetch build'))
      .finally(() => mounted && setLoading(false));

    const socket = io(API_URL);
    socketRef.current = socket;
    socket.emit('join-build', buildId);
    socket.on('log', (line) => setLogs((prev) => (prev ? prev + '\n' + line : line)));
    socket.on('status-change', (data) => {
      if (data.buildId === buildId) setStatus(data.status);
    });

    return () => {
      mounted = false;
      socket.disconnect();
    };
  }, [buildId]);

  const shareToTeams = async () => {
    setSharing(true);
    try {
      const res = await api.post(`/api/builds/${buildId}/share-teams`);
      toast.success('Shared to Teams', res.data.message);
    } catch (err) {
      toast.error('Failed to share', err.response?.data?.message);
    } finally {
      setSharing(false);
    }
  };

  const cancelBuild = async () => {
    setCancelling(true);
    try {
      await api.post(`/api/builds/${buildId}/abort`);
      setStatus('aborted');
      toast.info('Build cancelled');
    } catch (err) {
      toast.error('Failed to cancel', err.response?.data?.message);
    } finally {
      setCancelling(false);
    }
  };

  const rebuildBuild = async () => {
    if (!build.workflow_id) return;
    try {
      const res = await api.post('/api/builds', {
        project_id: build.project_id,
        workflow_id: build.workflow_id,
        branch: build.branch || 'main'
      });
      navigate(`/builds/${res.data.build.id}`);
      toast.success('Rebuild triggered');
    } catch (err) {
      toast.error('Failed to trigger rebuild', err.response?.data?.message);
    }
  };

  const copyInstallLink = async () => {
    const url = `${window.location.origin}/install/${buildId}`;
    const success = await copyToClipboard(url);
    if (success) {
      toast.success('Install link copied', url);
    } else {
      toast.error('Failed to copy install link');
    }
  };

  if (loading) {
    return (
      <AppShell>
        <PageHeader title="Loading build…" />
        <div className="px-6 md:px-10 pb-12 flex flex-col gap-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-[480px]" />
        </div>
      </AppShell>
    );
  }

  if (!build) {
    return (
      <AppShell>
        <PageHeader title="Build not found" back="/dashboard" />
      </AppShell>
    );
  }

  const isDone = status === 'success' || status === 'failed' || status === 'aborted';

  return (
    <AppShell>
      <PageHeader
        title={`Build #${build.build_number || buildId.slice(0, 8)}`}
        subtitle={`${build.project_name} · ${build.workflow_name}`}
        back={true}
        actions={
          <div className="flex items-center gap-2">
            {isCancellable({ status }) && (
              <Button variant="ghost" leftIcon={OctagonX} loading={cancelling} onClick={cancelBuild}>
                Cancel
              </Button>
            )}
            {(!isCancellable({ status }) && build.workflow_id) && (
              <Button variant="ghost" leftIcon={RefreshCw} onClick={rebuildBuild}>
                Rebuild
              </Button>
            )}
            {isDone && (
              <Button variant="secondary" leftIcon={Share2} loading={sharing} onClick={shareToTeams}>
                Share to Teams
              </Button>
            )}
            {isDone && build.artifact_path && (
              <Button variant="secondary" leftIcon={Link2} onClick={copyInstallLink}>
                Copy install link
              </Button>
            )}
          </div>
        }
      />

      <div className="px-6 md:px-10 pb-12 flex flex-col gap-4 flex-1">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        >
          <Card>
            <CardBody className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Stat icon={GitBranch} label="Branch" value={build.branch || 'main'} mono />
              <Stat icon={Clock} label="Duration" value={formatDuration(build.started_at, build.finished_at)} />
              <Stat
                icon={Download}
                label="Artifact"
                value={build.artifact_path ? 'Available' : 'None'}
                muted={!build.artifact_path}
              />
            </CardBody>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
        >
          <LogStream logs={logs} status={status} />
        </motion.div>
      </div>
    </AppShell>
  );
}

function Stat({ icon: Icon, label, value, mono, muted }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-[var(--radius-md)] bg-surface-2 border border-border flex items-center justify-center text-brand-400">
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wider text-text-faint font-semibold">{label}</div>
        <div className={`text-sm font-semibold truncate ${mono ? 'font-mono' : ''} ${muted ? 'text-text-faint' : 'text-text'}`}>
          {value}
        </div>
      </div>
    </div>
  );
}
