import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Plus, Trash2, Smartphone, Apple, FileCode2, ListChecks, CheckCircle2,
  History, RotateCcw, ChevronDown, ChevronRight, Clock, User, MessageSquare,
} from 'lucide-react';
import { api } from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Input, Textarea } from '../components/ui/Input';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Tabs } from '../components/ui/Tabs';
import { Badge } from '../components/ui/Badge';
import { useToast } from '../components/ui/Toast';
import { cn } from '../lib/cn';

function relativeTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function AddWorkflow() {
  const { id: projectId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const editData = location.state?.workflow;
  const isEdit = !!editData;

  const [name, setName] = useState(editData?.name || '');
  const [platform, setPlatform] = useState(editData?.platform || 'android');
  const [mode, setMode] = useState(editData?.yml_config ? 'yaml' : 'steps');
  const [ymlConfig, setYmlConfig] = useState(editData?.yml_config || '');
  const [steps, setSteps] = useState(editData?.steps?.length ? editData.steps : [{ name: '', command: '' }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Version history state
  const [versions, setVersions] = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedVersion, setExpandedVersion] = useState(null);
  const [restoringVersion, setRestoringVersion] = useState(null);

  useEffect(() => {
    if (isEdit && editData?.id) {
      fetchVersions();
    }
  }, [isEdit, editData?.id]);

  const fetchVersions = async () => {
    setVersionsLoading(true);
    try {
      const res = await api.get(`/api/workflows/${editData.id}/versions`);
      setVersions(res.data.versions || []);
    } catch {
      // silently fail — versioning is non-critical
    } finally {
      setVersionsLoading(false);
    }
  };

  const restoreVersion = async (version) => {
    setRestoringVersion(version);
    try {
      const res = await api.post(`/api/workflows/${editData.id}/versions/${version}/restore`);
      toast.success('Version restored', `Workflow is now at v${res.data.workflow.version}`);
      navigate(`/projects/${projectId}`, { state: { tab: 'workflows' } });
    } catch (err) {
      toast.error('Restore failed', err.response?.data?.message);
    } finally {
      setRestoringVersion(null);
    }
  };

  const annotateVersion = async (versionNumber) => {
    const msg = window.prompt("Enter a short label or note for this version (e.g. 'Final YAML'):");
    if (msg === null) return;
    
    try {
      await api.put(`/api/workflows/${editData.id}/versions/${versionNumber}/message`, { commit_message: msg });
      toast.success('Version annotated');
      fetchVersions();
    } catch (err) {
      toast.error('Failed to annotate', err.response?.data?.message);
    }
  };

  const addStep = () => setSteps([...steps, { name: '', command: '' }]);
  const removeStep = (i) => setSteps(steps.filter((_, idx) => idx !== i));
  const updateStep = (i, field, val) => {
    const next = [...steps];
    next[i][field] = val;
    setSteps(next);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload = {
        project_id: projectId,
        name,
        platform,
        steps: mode === 'yaml' ? [] : steps.filter((s) => s.name && s.command),
        yml_config: mode === 'yaml' ? ymlConfig : null,
      };
      if (isEdit) await api.put(`/api/workflows/${editData.id}`, payload);
      else await api.post('/api/workflows', payload);
      toast.success(isEdit ? 'Workflow updated' : 'Workflow created', name);
      navigate(`/projects/${projectId}`, { state: { tab: 'workflows' } });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save workflow');
    } finally {
      setLoading(false);
    }
  };

  const platforms = [
    { value: 'android', label: 'Android', Icon: Smartphone },
    { value: 'ios', label: 'iOS', Icon: Apple },
    { value: 'generic', label: 'Generic', Icon: FileCode2 },
  ];

  return (
    <AppShell>
      <PageHeader
        title={isEdit ? 'Edit workflow' : 'New workflow'}
        subtitle="Define build steps or paste your ddeploy.yml"
        back={`/projects/${projectId}`}
      />

      <div className="px-6 md:px-10 pb-12 max-w-3xl w-full mx-auto flex flex-col gap-5">
        {/* ── Version History panel (edit mode only) ── */}
        {isEdit && (
          <Card>
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-text hover:bg-surface-2/60 rounded-t-[var(--radius-md)] transition-colors"
            >
              <span className="flex items-center gap-2">
                <History className="w-4 h-4 text-brand-400" />
                Version History
                {versions.length > 0 && (
                  <Badge tone="brand">{versions.length} saved</Badge>
                )}
                {/* Current version badge */}
                <Badge tone="neutral">current: v{editData.version}</Badge>
              </span>
              {showHistory ? (
                <ChevronDown className="w-4 h-4 text-text-muted" />
              ) : (
                <ChevronRight className="w-4 h-4 text-text-muted" />
              )}
            </button>

            <AnimatePresence>
              {showHistory && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-border">
                    {versionsLoading ? (
                      <div className="px-4 py-6 text-sm text-text-muted text-center">Loading history…</div>
                    ) : versions.length === 0 ? (
                      <div className="px-4 py-6 text-sm text-text-muted text-center">
                        No previous versions yet. History is saved each time you update this workflow.
                      </div>
                    ) : (
                      <div className="divide-y divide-border">
                        {versions.map((v) => (
                          <div key={v.id} className="px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <button
                                type="button"
                                  onClick={() => setExpandedVersion(expandedVersion === v.id ? null : v.id)}
                                className="flex items-center gap-3 flex-1 min-w-0 text-left group"
                              >
                                  <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-xs font-bold text-brand-400 shrink-0">
                                  v{v.version_number}
                                </div>
                                <div className="min-w-0 text-left">
                                  <div className="text-sm font-medium text-text truncate flex items-center gap-2">
                                    {v.name}
                                    {v.commit_message && (
                                      <Badge tone="brand" className="text-[10px] px-1.5 py-0">{v.commit_message}</Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 text-xs text-text-faint mt-0.5">
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      {relativeTime(v.created_at)}
                                    </span>
                                    {v.saved_by_name && (
                                      <span className="flex items-center gap-1">
                                        <User className="w-3 h-3" />
                                        {v.saved_by_name}
                                      </span>
                                    )}
                                    <Badge tone="neutral" className="text-[10px]">{v.platform || 'generic'}</Badge>
                                    {v.yml_config ? (
                                      <Badge tone="brand" className="text-[10px]">YAML</Badge>
                                    ) : (
                                      <Badge tone="neutral" className="text-[10px]">
                                        {Array.isArray(v.steps) ? v.steps.length : 0} steps
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                {expandedVersion === v.id ? (
                                  <ChevronDown className="w-4 h-4 text-text-faint shrink-0" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-text-faint shrink-0" />
                                )}
                              </button>

                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    annotateVersion(v.version_number);
                                  }}
                                  aria-label="Annotate version"
                                >
                                  <MessageSquare className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  leftIcon={RotateCcw}
                                  loading={restoringVersion === v.version_number}
                                  onClick={() => restoreVersion(v.version_number)}
                                >
                                  Restore
                                </Button>
                              </div>
                            </div>

                            {/* Expanded detail */}
                            <AnimatePresence>
                              {expandedVersion === v.id && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.15 }}
                                  className="overflow-hidden"
                                >
                                  <div className="mt-3 ml-11 p-3 rounded-[var(--radius-md)] bg-surface-2/60 border border-border">
                                    {v.yml_config ? (
                                      <pre className="text-xs font-mono text-text-muted whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                                        {v.yml_config}
                                      </pre>
                                    ) : (
                                      <div className="flex flex-col gap-1.5">
                                        {(Array.isArray(v.steps) ? v.steps : []).map((s, i) => (
                                          <div key={i} className="flex items-center gap-2 text-xs">
                                            <span className="w-5 h-5 rounded bg-surface-3 flex items-center justify-center text-text-faint font-mono font-bold shrink-0">
                                              {i + 1}
                                            </span>
                                            <span className="font-medium text-text truncate">{s.name}</span>
                                            <span className="text-text-faint">—</span>
                                            <code className="text-text-muted font-mono truncate">{s.command}</code>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        )}

        {/* ── Workflow form ── */}
        <form onSubmit={submit} className="flex flex-col gap-5">
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="px-4 py-3 rounded-[var(--radius-md)] bg-danger/10 border border-danger/30 text-sm text-danger"
            >
              {error}
            </motion.div>
          )}

          <Card>
            <CardBody className="flex flex-col gap-5">
              <Input
                label="Workflow name"
                placeholder="e.g. staging-android"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                hint="Must match the workflow name in your ddeploy.yml"
              />

              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium uppercase tracking-wider text-text-muted">Platform</span>
                <div className="grid grid-cols-3 gap-2">
                  {platforms.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setPlatform(p.value)}
                      className={cn(
                        'flex items-center justify-center gap-2 h-11 rounded-[var(--radius-md)] border text-sm font-medium transition-all',
                        platform === p.value
                          ? 'border-brand-500 bg-brand-500/10 text-brand-500'
                          : 'border-border bg-surface-2 text-text-muted hover:text-text hover:border-border-strong'
                      )}
                    >
                      <p.Icon className="w-4 h-4" /> {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </CardBody>
          </Card>

          <Tabs
            value={mode}
            onChange={setMode}
            items={[
              { value: 'steps', label: 'Manual steps' },
              { value: 'yaml', label: 'ddeploy.yml' },
            ]}
          />

          <AnimatePresence mode="wait">
            {mode === 'yaml' ? (
              <motion.div
                key="yaml"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
              >
                <Card>
                  <CardBody>
                    <Textarea
                      label="ddeploy.yml"
                      placeholder="format_version: '11'\nworkflows:\n  staging-android:\n    steps: …"
                      value={ymlConfig}
                      onChange={(e) => setYmlConfig(e.target.value)}
                      rows={18}
                    />
                  </CardBody>
                </Card>
              </motion.div>
            ) : (
              <motion.div
                key="steps"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
              >
                <Card>
                  <CardBody className="flex flex-col gap-3">
                    <div className="flex items-center gap-2 text-text-muted text-sm">
                      <ListChecks className="w-4 h-4" /> Build steps run in order. stdout/stderr stream to the build log.
                    </div>

                    <AnimatePresence initial={false}>
                      {steps.map((step, i) => (
                        <motion.div
                          key={i}
                          layout
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6, height: 0 }}
                          transition={{ duration: 0.18 }}
                          className="grid grid-cols-12 gap-2 items-end p-3 bg-surface-2/60 border border-border rounded-[var(--radius-md)]"
                        >
                          <div className="col-span-1 flex items-center justify-center h-10 rounded-md bg-surface-3 text-xs text-text-faint font-mono font-bold">
                            {i + 1}
                          </div>
                          <div className="col-span-4">
                            <Input
                              label="Name"
                              placeholder="Install"
                              value={step.name}
                              onChange={(e) => updateStep(i, 'name', e.target.value)}
                              required
                            />
                          </div>
                          <div className="col-span-6">
                            <Input
                              label="Command"
                              placeholder="npm install"
                              className="font-mono"
                              value={step.command}
                              onChange={(e) => updateStep(i, 'command', e.target.value)}
                              required
                            />
                          </div>
                          <div className="col-span-1 flex justify-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeStep(i)}
                              disabled={steps.length === 1}
                              aria-label="Remove step"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>

                    <Button type="button" variant="outline" leftIcon={Plus} onClick={addStep}>
                      Add step
                    </Button>
                  </CardBody>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => navigate(`/projects/${projectId}`, { state: { tab: 'workflows' } })}>
              Cancel
            </Button>
            <Button type="submit" loading={loading} leftIcon={CheckCircle2}>
              {isEdit ? 'Update workflow' : 'Save workflow'}
            </Button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
