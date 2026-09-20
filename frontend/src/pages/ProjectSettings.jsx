import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { copyToClipboard } from '../lib/clipboard';
import { cn } from '../lib/cn';
import {
  Zap, GitBranch, Save, Check, Copy, Eye, EyeOff,
  Users, UserPlus, UserMinus, Crown, Shield, BookOpen, Mail, Lock, User, Trash2
} from 'lucide-react';
import { Skeleton } from '../components/ui/EmptyState';

export default function ProjectSettings() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user: currentUser } = useAuth();

  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);

  // Auto-trigger state
  const [autoTrigger, setAutoTrigger] = useState({ enabled: false, branch: '', webhookUrl: '', webhookSecret: null });
  const [autoTriggerBranch, setAutoTriggerBranch] = useState('');
  const [autoTriggerEnabled, setAutoTriggerEnabled] = useState(false);
  const [availableWorkflows, setAvailableWorkflows] = useState([]);
  const [selectedWorkflowIds, setSelectedWorkflowIds] = useState([]);
  const [autoTriggerSaving, setAutoTriggerSaving] = useState(false);
  const [webhookCopied, setWebhookCopied] = useState(false);
  const [secretCopied, setSecretCopied] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  // Team members state
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', email: '', password: '', role: 'admin' });
  const [showAddPassword, setShowAddPassword] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [isOwner, setIsOwner] = useState(false);

  // Danger Zone
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const [pRes, atRes] = await Promise.all([
          api.get(`/api/projects/${id}`),
          api.get(`/api/projects/${id}/auto-trigger`),
        ]);
        const proj = pRes.data.project;
        setProject(proj);
        setIsOwner(proj.my_role === 'owner' || proj.user_id === currentUser?.id);

        const at = atRes.data.autoTrigger;
        setAutoTrigger(at);
        setAutoTriggerEnabled(at.enabled);
        setAutoTriggerBranch(at.branch || '');
        setAvailableWorkflows(at.availableWorkflows || []);
        setSelectedWorkflowIds(at.workflowIds || []);
      } catch (err) {
        toast.error('Failed to load settings', err.response?.data?.message);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, [id, toast, currentUser]);

  // Fetch members separately
  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const res = await api.get(`/api/projects/${id}/members`);
        setMembers(res.data.members || []);
      } catch (err) {
        toast.error('Failed to load members', err.response?.data?.message);
      } finally {
        setMembersLoading(false);
      }
    };
    fetchMembers();
  }, [id, toast]);

  // ─── Auto-trigger handlers ────────────────────────────────────────────────
  const saveAutoTrigger = async () => {
    setAutoTriggerSaving(true);
    try {
      const res = await api.put(`/api/projects/${id}/auto-trigger`, {
        enabled: autoTriggerEnabled,
        branch: autoTriggerBranch,
        workflowIds: selectedWorkflowIds,
      });
      const at = res.data.autoTrigger;
      setAutoTrigger(at);
      setAutoTriggerEnabled(at.enabled);
      setAutoTriggerBranch(at.branch || '');
      if (at.workflowIds) setSelectedWorkflowIds(at.workflowIds);
      toast.success(
        autoTriggerEnabled ? 'Auto-trigger enabled' : 'Auto-trigger disabled',
        res.data.message
      );
    } catch (err) {
      toast.error('Failed to save', err.response?.data?.message);
    } finally {
      setAutoTriggerSaving(false);
    }
  };

  const copyWebhookUrl = async () => {
    const success = await copyToClipboard(autoTrigger.webhookUrl || '');
    if (success) {
      setWebhookCopied(true);
      setTimeout(() => setWebhookCopied(false), 1500);
    }
  };

  const copyWebhookSecret = async () => {
    const success = await copyToClipboard(autoTrigger.webhookSecret || '');
    if (success) {
      setSecretCopied(true);
      setTimeout(() => setSecretCopied(false), 1500);
    }
  };

  // ─── Team member handlers ─────────────────────────────────────────────────
  const handleAddMember = async (e) => {
    e.preventDefault();
    setAddLoading(true);
    try {
      const res = await api.post(`/api/projects/${id}/members`, addForm);
      toast.success('Member added!', res.data.message);
      setShowAddModal(false);
      setAddForm({ name: '', email: '', password: '', role: 'admin' });
      // Refresh member list
      const membersRes = await api.get(`/api/projects/${id}/members`);
      setMembers(membersRes.data.members || []);
    } catch (err) {
      toast.error('Failed to add member', err.response?.data?.message || 'Something went wrong');
    } finally {
      setAddLoading(false);
    }
  };

  const handleRemoveMember = async (memberId, memberName) => {
    setRemovingId(memberId);
    try {
      await api.delete(`/api/projects/${id}/members/${memberId}`);
      toast.success('Member removed', `${memberName} has been removed from this project.`);
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    } catch (err) {
      toast.error('Failed to remove member', err.response?.data?.message);
    } finally {
      setRemovingId(null);
    }
  };

  // ─── Role helpers ─────────────────────────────────────────────────────────
  const roleConfig = {
    owner: { label: 'Owner', tone: 'brand', icon: Crown },
    admin: { label: 'Admin', tone: 'warning', icon: Shield },
    viewer: { label: 'Viewer', tone: 'neutral', icon: BookOpen },
  };

  // ─── Loading / Not Found ──────────────────────────────────────────────────
  const handleDeleteProject = async () => {
    if (deleteInput !== project?.name) return;
    setIsDeleting(true);
    try {
      await api.delete(`/api/projects/${id}`);
      toast.success('Project deleted');
      navigate('/dashboard');
    } catch (err) {
      toast.error('Failed to delete project', err.response?.data?.message);
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <AppShell>
        <PageHeader title="Loading settings…" back={`/projects/${id}`} />
        <div className="px-6 md:px-10 pb-12">
          <Skeleton className="h-64 max-w-2xl" />
        </div>
      </AppShell>
    );
  }

  if (!project) {
    return (
      <AppShell>
        <PageHeader title="Project not found" back="/dashboard" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="Project Settings"
        subtitle={`Configure settings for ${project.name}`}
        back={`/projects/${id}`}
        breadcrumbs={['Projects', project.name, 'Settings']}
      />

      <div className="px-6 md:px-10 pb-12">
        <div className="max-w-2xl flex flex-col gap-6">

          {/* ── Auto Trigger Settings ─────────────────────────────────── */}
          <Card>
            <CardHeader
              title={
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-amber-400" />
                  Auto Trigger
                </div>
              }
              subtitle="Automatically trigger builds when code is pushed to a specific branch."
            />
            <CardBody className="flex flex-col gap-6">
              {/* Toggle */}
              <div className="flex items-center justify-between bg-surface-2/30 p-4 rounded-[var(--radius-md)] border border-border">
                <div className="flex flex-col">
                  <span className="font-semibold text-text">Enable auto-trigger</span>
                  <span className="text-sm text-text-muted">Listen for GitHub webhooks on this project</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoTriggerEnabled}
                  onClick={() => setAutoTriggerEnabled(!autoTriggerEnabled)}
                  disabled={!isOwner}
                  className={cn(
                    'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400/40',
                    autoTriggerEnabled ? 'bg-brand-500' : 'bg-surface-3 border border-border',
                    !isOwner && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <span
                    className={cn(
                      'inline-block h-4 w-4 rounded-full bg-white transition-transform shadow-sm',
                      autoTriggerEnabled ? 'translate-x-6' : 'translate-x-1'
                    )}
                  />
                </button>
              </div>

              {/* Branch input */}
              <div>
                <Input
                  label="Watch branch"
                  placeholder="e.g. main, release_v1.0"
                  leftIcon={GitBranch}
                  value={autoTriggerBranch}
                  onChange={(e) => setAutoTriggerBranch(e.target.value)}
                  disabled={!autoTriggerEnabled || !isOwner}
                />
                <p className="text-xs text-text-faint mt-2">Only pushes to this exact branch will trigger a new build.</p>
              </div>

              {/* Workflow selection — which workflows auto-build on a push */}
              <div>
                <div className="text-sm font-medium text-text mb-1">Workflows to build</div>
                <p className="text-xs text-text-faint mb-3">
                  Select which workflows run on each qualifying push. Leave all unselected to
                  use the default (every <span className="font-mono">staging-*</span> workflow).
                </p>
                {availableWorkflows.length === 0 ? (
                  <div className="text-sm text-text-muted bg-surface-2/30 border border-border rounded-[var(--radius-md)] p-3">
                    No workflows defined for this project yet.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {availableWorkflows.map((wf) => {
                      const checked = selectedWorkflowIds.includes(wf.id);
                      return (
                        <label
                          key={wf.id}
                          className={cn(
                            'flex items-center gap-3 p-3 rounded-[var(--radius-md)] border cursor-pointer transition-all',
                            checked
                              ? 'border-brand-500 bg-brand-500/10'
                              : 'border-border bg-surface-2/30 hover:border-border-strong',
                            (!autoTriggerEnabled || !isOwner) && 'opacity-50 cursor-not-allowed'
                          )}
                        >
                          <input
                            type="checkbox"
                            className="accent-brand-500 w-4 h-4"
                            checked={checked}
                            disabled={!autoTriggerEnabled || !isOwner}
                            onChange={() =>
                              setSelectedWorkflowIds((prev) =>
                                prev.includes(wf.id)
                                  ? prev.filter((x) => x !== wf.id)
                                  : [...prev, wf.id]
                              )
                            }
                          />
                          <span className="flex-1 text-sm font-medium text-text">{wf.name}</span>
                          {wf.platform && (
                            <Badge tone="neutral" className="shrink-0">{wf.platform}</Badge>
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Save button and status */}
              {isOwner && (
                <div className="flex items-center justify-between pt-4 border-t border-border">
                  <div className="flex items-center gap-3">
                    <Badge tone={autoTrigger.enabled ? 'success' : 'neutral'} dot>
                      {autoTrigger.enabled ? 'Active' : 'Inactive'}
                    </Badge>
                    {autoTrigger.enabled && autoTrigger.branch && (
                      <span className="text-sm text-text-faint font-mono px-2 py-0.5 bg-surface-2 rounded-md border border-border">
                        Watching: {autoTrigger.branch}
                      </span>
                    )}
                  </div>
                  <Button leftIcon={Save} onClick={saveAutoTrigger} loading={autoTriggerSaving}>
                    Save Changes
                  </Button>
                </div>
              )}

              {/* Webhook URL & Secret */}
              {autoTrigger.webhookSecret && (
                <div className="flex flex-col gap-4 mt-2 p-4 rounded-[var(--radius-md)] bg-brand-500/5 border border-brand-500/20">
                  <h4 className="text-sm font-semibold text-brand-300">GitHub Webhook Configuration</h4>
                  <p className="text-xs text-text-muted leading-relaxed">
                    Add this URL as a webhook in your GitHub repository settings. Set the content type to <span className="font-mono text-brand-200">application/json</span>, select "Just the push event", and paste the secret below.
                  </p>

                  <div className="flex flex-col gap-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-text-faint font-semibold mb-1.5">Webhook URL</div>
                      <div className="flex items-center gap-2">
                        <div className="text-sm text-text font-mono break-all flex-1 bg-surface-2 rounded-[var(--radius-md)] px-3 py-2 border border-border">
                          {autoTrigger.webhookUrl}
                        </div>
                        <Button variant="secondary" onClick={copyWebhookUrl} className="shrink-0 w-24">
                          {webhookCopied ? <Check className="w-4 h-4 mr-2 text-emerald-400" /> : <Copy className="w-4 h-4 mr-2" />}
                          {webhookCopied ? 'Copied' : 'Copy'}
                        </Button>
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-text-faint font-semibold mb-1.5">Webhook Secret</div>
                      <div className="flex items-center gap-2">
                        <div className="text-sm text-text font-mono break-all flex-1 bg-surface-2 rounded-[var(--radius-md)] px-3 py-2 border border-border">
                          {showSecret ? autoTrigger.webhookSecret : '••••••••••••••••••••••••••••••••••••'}
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => setShowSecret(!showSecret)} aria-label="Toggle secret visibility">
                          {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </Button>
                        <Button variant="secondary" onClick={copyWebhookSecret} className="shrink-0 w-24">
                          {secretCopied ? <Check className="w-4 h-4 mr-2 text-emerald-400" /> : <Copy className="w-4 h-4 mr-2" />}
                          {secretCopied ? 'Copied' : 'Copy'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>

          {/* ── Team Members ──────────────────────────────────────────── */}
          <Card>
            <CardHeader
              title={
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-brand-400" />
                  Team Members
                </div>
              }
              subtitle="Manage who has access to this project."
              actions={
                isOwner && (
                  <Button
                    leftIcon={UserPlus}
                    size="sm"
                    onClick={() => setShowAddModal(true)}
                    id="add-member-btn"
                  >
                    Add Member
                  </Button>
                )
              }
            />
            <CardBody>
              {membersLoading ? (
                <div className="flex flex-col gap-2">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-14 rounded-[var(--radius-md)] bg-surface-2/40 animate-pulse" />
                  ))}
                </div>
              ) : members.length === 0 ? (
                <div className="text-center py-6 text-text-muted text-sm">
                  No members yet. Add a teammate to collaborate.
                </div>
              ) : (
                <div className="flex flex-col divide-y divide-border">
                  {members.map((member) => {
                    const cfg = roleConfig[member.role] || roleConfig.viewer;
                    const RoleIcon = cfg.icon;
                    const isRemoving = removingId === member.id;

                    return (
                      <div
                        key={member.id}
                        className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        {/* Avatar */}
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-400/30 to-brand-600/30 border border-brand-500/30 flex items-center justify-center shrink-0">
                          <span className="text-sm font-semibold text-brand-300">
                            {member.name?.charAt(0)?.toUpperCase() || '?'}
                          </span>
                        </div>

                        {/* Name + email */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-text truncate">
                              {member.name}
                            </span>
                            {member.isYou && (
                              <span className="text-[10px] text-text-faint bg-surface-2 px-1.5 py-0.5 rounded border border-border">
                                you
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-text-faint truncate">{member.email}</p>
                        </div>

                        {/* Role badge */}
                        <Badge tone={cfg.tone} className="shrink-0 flex items-center gap-1">
                          <RoleIcon className="w-3 h-3" />
                          {cfg.label}
                        </Badge>

                        {/* Remove button — only owner can remove, and not themselves */}
                        {isOwner && member.role !== 'owner' ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove ${member.name}`}
                            loading={isRemoving}
                            onClick={() => handleRemoveMember(member.id, member.name)}
                            className="shrink-0 text-text-faint hover:text-danger hover:bg-danger/10"
                          >
                            {!isRemoving && <UserMinus className="w-4 h-4" />}
                          </Button>
                        ) : (
                          <div className="w-9 shrink-0" /> /* spacer to keep alignment */
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardBody>
          </Card>

          {/* ── Danger Zone ──────────────────────────────────────────────── */}
          <Card className="border-danger/20">
            <CardHeader
              title={<span className="text-danger">Danger Zone</span>}
              subtitle="Irreversible and destructive actions."
            />
            <CardBody className="p-4 bg-danger/5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h4 className="text-sm font-semibold text-text mb-1">Delete Project</h4>
                  <p className="text-xs text-text-muted">
                    Permanently delete this project and all its workflows, builds, and secrets.
                    This action cannot be undone.
                  </p>
                </div>
                <Button
                  variant="danger"
                  leftIcon={Trash2}
                  onClick={() => setShowDeleteModal(true)}
                  className="shrink-0"
                >
                  Delete project
                </Button>
              </div>
            </CardBody>
          </Card>

        </div>
      </div>

      {/* ── Add Member Modal ──────────────────────────────────────────── */}
      <Modal
        open={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setAddForm({ name: '', email: '', password: '', role: 'admin' });
          setShowAddPassword(false);
        }}
        title="Add Team Member"
        description="Create an account for your teammate and add them to this project."
        size="md"
      >
        <form onSubmit={handleAddMember} className="flex flex-col gap-4">
          <Input
            label="Full Name"
            placeholder="e.g. John Doe"
            leftIcon={User}
            value={addForm.name}
            onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
            required
            id="member-name-input"
          />

          <Input
            label="Email Address"
            type="email"
            placeholder="john@company.com"
            leftIcon={Mail}
            value={addForm.email}
            onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
            required
            id="member-email-input"
          />

          <div className="relative">
            <Input
              label="Temporary Password"
              type={showAddPassword ? 'text' : 'password'}
              placeholder="Min. 6 characters"
              leftIcon={Lock}
              value={addForm.password}
              onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))}
              minLength={6}
              required
              id="member-password-input"
            />
            <button
              type="button"
              onClick={() => setShowAddPassword((v) => !v)}
              className="absolute right-3 top-[34px] text-text-faint hover:text-text transition-colors"
              aria-label="Toggle password visibility"
            >
              {showAddPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* Security note */}
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-[var(--radius-md)] bg-amber-500/8 border border-amber-500/20">
            <Shield className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300/80 leading-relaxed">
              Share these credentials securely with your teammate via a private channel (Slack DM, WhatsApp, etc.).
            </p>
          </div>

          {/* Role selector */}
          <div>
            <div className="text-sm font-medium text-text mb-2">Role</div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'admin', label: 'Admin', desc: 'Can trigger builds & manage workflows', icon: Shield },
                { value: 'viewer', label: 'Viewer', desc: 'Read-only — view builds and logs', icon: BookOpen },
              ].map(({ value, label, desc, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAddForm((f) => ({ ...f, role: value }))}
                  className={cn(
                    'flex flex-col items-start gap-1 p-3 rounded-[var(--radius-md)] border text-left transition-all',
                    addForm.role === value
                      ? 'border-brand-500 bg-brand-500/10 text-text'
                      : 'border-border bg-surface-2/30 text-text-muted hover:border-border-strong'
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <Icon className={cn('w-3.5 h-3.5', addForm.role === value ? 'text-brand-400' : 'text-text-faint')} />
                    <span className="text-sm font-semibold">{label}</span>
                  </div>
                  <span className="text-[11px] text-text-faint leading-tight">{desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                setShowAddModal(false);
                setAddForm({ name: '', email: '', password: '', role: 'admin' });
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              leftIcon={UserPlus}
              loading={addLoading}
              id="confirm-add-member-btn"
            >
              Create & Add
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── Delete Project Modal ────────────────────────────────────────── */}
      <Modal
        open={showDeleteModal}
        onClose={() => {
          if (!isDeleting) {
            setShowDeleteModal(false);
            setDeleteInput('');
          }
        }}
        title="Delete project?"
        description={project ? `“${project.name}” and all its workflows, builds, and secrets will be permanently removed.` : ''}
        footer={
          <>
            <Button variant="ghost" onClick={() => { setShowDeleteModal(false); setDeleteInput(''); }} disabled={isDeleting}>Cancel</Button>
            <Button variant="danger" leftIcon={Trash2} onClick={handleDeleteProject} loading={isDeleting} disabled={deleteInput !== project?.name}>
              Delete project
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 mt-1">
          <p className="text-sm text-text-muted">
            Please type <span className="font-semibold text-text">{project?.name}</span> to confirm.
          </p>
          <Input
            placeholder={project?.name}
            value={deleteInput}
            onChange={(e) => setDeleteInput(e.target.value)}
            autoFocus
          />
        </div>
      </Modal>
    </AppShell>
  );
}
