import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { GitCommit, Cpu } from 'lucide-react';
import { api, API_URL } from '../../api/client';
import { isActiveBuild, formatDuration } from '../../lib/build';
import { StatusDot } from '../ui/Badge';
import { PipelineNodeMap } from './PipelineNodeMap';
import { TerminalConsole } from './TerminalConsole';

export function ActivePipelinePanel({ build }) {
  const active = build ? isActiveBuild(build) : false;
  const [logs, setLogs] = useState(build?.logs || '');
  const [, setTick] = useState(0);
  const socketRef = useRef(null);

  // Fetch initial logs (list endpoint excludes them to save bandwidth)
  useEffect(() => {
    if (!build) return;
    api.get(`/api/builds/${build.id}`).then((res) => {
      setLogs(res.data.build.logs || '');
    }).catch(() => {});
  }, [build?.id]);

  // Live log tail for a real, in-flight build.
  useEffect(() => {
    if (!build || !active) return;
    const socket = io(API_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.emit('join-build', build.id);
    socket.on('log', (line) => setLogs((p) => (p ? p + '\n' + line : line)));
    return () => socket.disconnect();
  }, [build?.id, active]);

  // Tick the elapsed clock while active.
  useEffect(() => {
    if (!active) return;
    const i = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(i);
  }, [active]);

  if (!build) {
    return (
      <section className="bg-surface/90 backdrop-blur-md border border-border shadow-sm rounded-xl p-8 flex flex-col items-center justify-center text-center gap-3 min-h-[260px]">
        <div className="w-12 h-12 rounded-full bg-surface-3 border border-border grid place-items-center">
          <Cpu className="w-5 h-5 text-text-muted" />
        </div>
        <div>
          <h3 className="text-text font-semibold">No active pipeline</h3>
          <p className="text-text-muted text-sm mt-1">Trigger a workflow to light up the command center.</p>
        </div>
      </section>
    );
  }

  const elapsed = formatDuration(build.started_at, build.finished_at);

  return (
    <section className="bg-surface/90 backdrop-blur-md border border-border shadow-sm rounded-xl p-6 flex flex-col relative overflow-hidden">
      <div className="absolute top-0 right-0 p-4 opacity-[0.07] pointer-events-none">
        <Cpu className="w-32 h-32 text-brand-400" />
      </div>

      <div className="flex justify-between items-start mb-6 z-10 gap-4 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-[20px] font-semibold text-text flex items-center gap-2 flex-wrap">
            <span className="truncate">{build.project_name}</span>
            <span className="text-text-faint font-normal">·</span>
            <span className="text-text-muted font-normal text-base truncate">{build.workflow_name}</span>
            <StatusDot status={build.status} />
          </h3>
          <p className="text-text-muted text-sm mt-1 font-mono flex items-center gap-1.5 truncate">
            <GitCommit className="w-3.5 h-3.5 shrink-0" />
            {build.commit_sha ? String(build.commit_sha).slice(0, 7) : `#${build.build_number}`}
            <span className="opacity-50">·</span> {build.branch || 'main'}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-brand-400 font-mono">{elapsed || '—'} elapsed</p>
          <p className="text-text-muted text-xs mt-1">
            {active ? 'live' : build.status === 'success' ? 'completed' : build.status}
          </p>
        </div>
      </div>

      <PipelineNodeMap build={build} className="z-10" />

      <TerminalConsole
        title={`Build Log · ${build.workflow_name || 'pipeline'}`}
        text={logs}
        running={active}
        className="mt-6 min-h-[220px] max-h-[280px] z-10"
      />
    </section>
  );
}

export default ActivePipelinePanel;
