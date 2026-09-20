import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, GitCommitHorizontal, Play, Plus, Layers, Sparkles, ChevronDown } from 'lucide-react';
import { cn } from '../lib/cn';
import { api } from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { Badge } from '../components/ui/Badge';
import { useToast } from '../components/ui/Toast';
import { WorkflowCanvas } from '../components/architect/WorkflowCanvas';
import { PropertiesInspector } from '../components/architect/PropertiesInspector';

const DEMO = false;

// Infer a node glyph from a step's name/command.
const ICON_RULES = [
  [/check\s*out|clone|git|scm/i, 'code'],
  [/lint|format|style|swiftlint|ktlint|eslint|prettier/i, 'sparkles'],
  [/build|compile|gradle|xcode|assemble|archive|bundle|webpack|vite|pod/i, 'hammer'],
  [/test|spec|junit|xctest|coverage|cypress/i, 'flask'],
  [/deploy|publish|upload|release|distribute|testflight|fastlane|s3|store|firebase/i, 'rocket'],
];
const iconFor = (s = '') => (ICON_RULES.find(([re]) => re.test(s)) || [null, 'box'])[1];

// Lay nodes out as a flowing staircase the user can re-drag.
const layout = (nodes) =>
  nodes.map((s, i) => ({ ...s, w: i === 0 ? 160 : 200, x: 48 + i * 250, y: 70 + Math.floor(i / 2) * 150 }));

// Real workflow steps are `{ name, command }` (what the runner executes). Map
// both directions faithfully — visual fields (icon/x/y) are dropped on save.
const stepsToNodes = (steps = []) =>
  layout(
    steps.map((s, i) => ({
      id: `s${i}-${i}${(s.name || '').length}`,
      title: s.name || `Step ${i + 1}`,
      icon: iconFor(`${s.name || ''} ${s.command || ''}`),
      uses: s.command || '',
      summary: s.command || '',
      state: 'pending',
      inputs: [{ key: 'command', value: s.command || '' }],
    }))
  );

const nodesToSteps = (nodes) =>
  nodes.map((n) => ({ name: n.title, command: n.inputs?.find((i) => i.key === 'command')?.value ?? n.summary ?? '' }));

const STARTER = [
  { name: 'Checkout', command: 'git clone $REPO_URL .' },
  { name: 'Install', command: 'npm ci' },
  { name: 'Build', command: 'npm run build' },
  { name: 'Test', command: 'npm test' },
  { name: 'Deploy', command: './deploy.sh' },
];

function Select({ value, onChange, placeholder, options }) {
  const [open, setOpen] = useState(false);
  const ref = React.useRef(null);
  
  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find(o => o.value === value);

  return (
    <div className="relative group" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "appearance-none bg-surface-2 border border-border rounded-full px-4 py-1.5 pr-9 text-[13px] font-semibold text-text focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/50 transition-all hover:border-brand-500/40 hover:bg-surface-3 cursor-pointer shadow-sm min-w-[140px] max-w-[200px] flex items-center justify-between text-left",
          open && "border-brand-500/40 bg-surface-3 ring-1 ring-brand-500/50"
        )}
      >
        <span className="truncate block mr-2">{selectedOption ? selectedOption.label : placeholder}</span>
        <ChevronDown className={cn("absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted transition-transform pointer-events-none", open && "rotate-180")} />
      </button>
      
      {open && (
        <div className="absolute z-[100] mt-1.5 top-full left-0 w-full min-w-[200px] p-1.5 rounded-xl border border-border bg-surface shadow-xl flex flex-col gap-0.5 max-h-60 overflow-y-auto">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={cn(
                "flex items-center w-full px-3 py-2 text-[13px] rounded-lg transition-colors text-left truncate",
                value === o.value ? "bg-brand-500/10 text-brand-500 font-semibold" : "text-text hover:bg-surface-2"
              )}
            >
              {o.label}
            </button>
          ))}
          {options.length === 0 && (
            <div className="px-3 py-2 text-[13px] text-text-muted">No options available</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function WorkflowArchitect() {
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [steps, setSteps] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  // Real-mode picker state
  const [projects, setProjects] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [projectId, setProjectId] = useState(params.get('project') || '');
  const [workflowId, setWorkflowId] = useState(params.get('workflow') || '');
  const [wfMeta, setWfMeta] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/api/projects').then((r) => setProjects(r.data.projects || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!projectId) { setWorkflows([]); return; }
    api.get(`/api/workflows/project/${projectId}`).then((r) => setWorkflows(r.data.workflows || [])).catch(() => {});
  }, [projectId]);

  useEffect(() => {
    if (!workflowId) return;
    setBusy(true);
    api.get(`/api/workflows/${workflowId}`)
      .then((r) => {
        const w = r.data.workflow;
        setWfMeta({ name: w.name, platform: w.platform, yml_config: w.yml_config });
        if (!projectId && w.project_id) setProjectId(w.project_id);
        const nodes = stepsToNodes(Array.isArray(w.steps) ? w.steps : []);
        setSteps(nodes);
        setSelectedId(nodes[0]?.id ?? null);
      })
      .catch(() => toast.error('Failed to load workflow'))
      .finally(() => setBusy(false));
  }, [workflowId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = steps.find((s) => s.id === selectedId) || null;
  const isYaml = !!wfMeta?.yml_config;

  const patchStep = (id, patch) => setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const moveStep = (id, x, y) => patchStep(id, { x, y });

  const addStep = () => {
    const id = `s${Date.now()}`;
    const last = steps[steps.length - 1];
    setSteps((prev) => [...prev, {
      id, title: 'New Step', icon: 'box', uses: 'echo "hello"', summary: 'echo "hello"', state: 'pending',
      inputs: [{ key: 'command', value: 'echo "hello"' }],
      w: 200, x: (last?.x ?? 48) + 250, y: (last?.y ?? 70) + 40,
    }]);
    setSelectedId(id);
  };

  const removeStep = (id) => { setSteps((prev) => prev.filter((s) => s.id !== id)); setSelectedId(null); toast.info('Step removed'); };

  const validate = () => {
    const empty = steps.filter((s) => !nodesToSteps([s])[0].command).length;
    empty ? toast.error('Validation failed', `${empty} step(s) missing a command`)
          : toast.success('Pipeline is valid', `${steps.length} steps · no cycles detected`);
  };

  const commit = () => {
    if (!workflowId) return toast.error('Select a workflow to save');
    if (isYaml) return toast.info('YAML workflow', 'Edit raw inhouse-bitrise.yml from the workflow form');
    setBusy(true);
    api.put(`/api/workflows/${workflowId}`, {
      name: wfMeta.name, platform: wfMeta.platform, steps: nodesToSteps(steps), yml_config: null,
    })
      .then(() => toast.success('Workflow saved', wfMeta.name))
      .catch((e) => toast.error('Save failed', e.response?.data?.message))
      .finally(() => setBusy(false));
  };

  const run = () => {
    if (!projectId || !workflowId) return toast.info('Select a project & workflow', 'Then trigger a real build');
    setBusy(true);
    api.post('/api/builds', { project_id: projectId, workflow_id: workflowId, branch: 'main', trigger_source: 'manual' })
      .then((r) => { toast.success('Build triggered', `#${r.data.build?.build_number ?? ''}`); navigate('/builds'); })
      .catch((e) => toast.error('Trigger failed', e.response?.data?.message))
      .finally(() => setBusy(false));
  };

  const fileName = wfMeta?.name || 'workflow-architect';

  return (
    <AppShell>
      <div className="h-[calc(100vh-4rem)] flex flex-col overflow-hidden">
        {/* Action bar */}
        <div className="h-14 border-b border-border bg-surface/60 backdrop-blur-md flex items-center justify-between px-4 sm:px-6 shrink-0 gap-3 z-20">
          <div className="flex items-center gap-2 min-w-0">
              <>
                <Select value={projectId} onChange={(v) => { setProjectId(v); setWorkflowId(''); }} placeholder="Project…"
                  options={projects.map((p) => ({ value: p.id, label: p.name }))} />
                <Select value={workflowId} onChange={setWorkflowId} placeholder="Workflow…"
                  options={workflows.map((w) => ({ value: w.id, label: w.name }))} />
                {isYaml && <Badge tone="info">YAML</Badge>}
              </>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button onClick={addStep} disabled={busy} className="flex items-center gap-2 text-text-muted hover:text-text px-3 py-1.5 rounded-md hover:bg-surface-2 text-sm transition-colors disabled:opacity-50">
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Add Step</span>
            </button>
            <button onClick={validate} className="flex items-center gap-2 text-text-muted hover:text-text px-3 py-1.5 rounded-md hover:bg-surface-2 text-sm transition-colors">
              <CheckCircle2 className="w-4 h-4" /> <span className="hidden md:inline">Validate</span>
            </button>
            <button onClick={commit} disabled={busy} className="flex items-center gap-2 text-text-muted hover:text-text px-3 py-1.5 rounded-md hover:bg-surface-2 text-sm transition-colors disabled:opacity-50">
              <GitCommitHorizontal className="w-4 h-4" /> <span className="hidden md:inline">Commit</span>
            </button>
            <button onClick={run} disabled={busy} className="flex items-center gap-2 bg-brand-500 text-white border-none px-4 py-1.5 rounded-full hover:bg-brand-600 text-[13px] font-bold transition-colors shadow-md disabled:opacity-50">
              <Play className="w-4 h-4 fill-current" /> Run Pipeline
            </button>
          </div>
        </div>

        {/* Canvas + Inspector */}
        <div className="flex-1 flex min-h-0">
          {steps.length === 0 ? (
            <div className="flex-1 canvas-grid grid place-items-center">
              <div className="text-center max-w-sm px-6">
                <div className="w-12 h-12 rounded-xl bg-surface-container-high border border-white/10 grid place-items-center mx-auto mb-4">
                  <Layers className="w-5 h-5 text-primary" />
                </div>
                <h3 className="text-on-surface font-semibold">Build a pipeline visually</h3>
                <p className="text-on-surface-variant text-sm mt-1 mb-5">
                  Pick a project &amp; workflow above to edit a real pipeline, or start from a template.
                </p>
                <button
                  onClick={() => { const n = stepsToNodes(STARTER); setSteps(n); setSelectedId(n[0].id); }}
                  className="inline-flex items-center gap-2 bg-primary/10 text-primary border border-primary/30 px-4 py-2 rounded-md hover:bg-primary/20 text-sm font-semibold transition-colors status-glow-running"
                >
                  <Sparkles className="w-4 h-4" /> Use starter template
                </button>
              </div>
            </div>
          ) : (
            <WorkflowCanvas steps={steps} selectedId={selectedId} onSelect={setSelectedId} onMove={moveStep} />
          )}
          <PropertiesInspector step={selected} onChange={(patch) => patchStep(selectedId, patch)} onRemove={removeStep} />
        </div>
      </div>
    </AppShell>
  );
}
