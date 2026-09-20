import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, FolderGit2, Trash2, ExternalLink } from 'lucide-react';
import { api } from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { EmptyState, Skeleton } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';

export default function Dashboard() {
  const navigate = useNavigate();
  const toast = useToast();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleteInput, setDeleteInput] = useState('');

  useEffect(() => {
    let mounted = true;
    api.get('/api/projects')
      .then((res) => mounted && setProjects(res.data.projects || []))
      .catch(() => toast.error('Failed to load projects'))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  const handleDelete = async () => {
    if (!confirmDelete || deleteInput !== confirmDelete.name) return;
    try {
      await api.delete(`/api/projects/${confirmDelete.id}`);
      setProjects((prev) => prev.filter((p) => p.id !== confirmDelete.id));
      toast.success('Project deleted', confirmDelete.name);
    } catch (err) {
      toast.error('Delete failed', err.response?.data?.message);
    } finally {
      setConfirmDelete(null);
      setDeleteInput('');
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="Projects"
        subtitle={projects.length ? `${projects.length} repositor${projects.length === 1 ? 'y' : 'ies'} connected` : 'Connect a repository to get started'}
        actions={
          <Button leftIcon={Plus} onClick={() => navigate('/add-project')}>
            New project
          </Button>
        }
      />

      <div className="px-6 md:px-10 pb-12 flex-1">
        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-44" />)}
          </div>
        ) : projects.length === 0 ? (
          <Card>
            <EmptyState
              icon={FolderGit2}
              title="No projects yet"
              description="Connect a GitHub repository, define a workflow, and start running builds."
              action={
                <Button leftIcon={Plus} onClick={() => navigate('/add-project')}>
                  Add your first project
                </Button>
              }
            />
          </Card>
        ) : (
          <motion.div
            initial="hidden"
            animate="show"
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
            }}
            className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
          >
            {projects.map((project) => (
              <motion.div
                key={project.id}
                variants={{
                  hidden: { opacity: 0, y: 12 },
                  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 280, damping: 24 } },
                }}
              >
                <Card
                  interactive
                  onClick={() => navigate(`/projects/${project.id}`)}
                  className="group relative p-5 h-full flex flex-col"
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(project); }}
                    aria-label="Delete project"
                    className="absolute top-3 right-3 p-1.5 rounded-md text-text-faint opacity-0 group-hover:opacity-100 hover:text-danger hover:bg-danger/10 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <div className="flex items-center gap-2 mb-4">
                    <Badge tone="brand">
                      <FolderGit2 className="w-3 h-3" /> GitHub
                    </Badge>
                    <span className="text-[11px] text-text-faint">
                      {new Date(project.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                  </div>

                  <h3 className="text-lg font-semibold text-text mb-1 truncate pr-7">
                    {project.name}
                  </h3>
                  <p className="text-xs text-text-muted truncate flex items-center gap-1 mb-4">
                    <ExternalLink className="w-3 h-3 shrink-0" />
                    {project.repo_url.replace(/^https?:\/\//, '')}
                  </p>

                  <div className="mt-auto pt-4 border-t border-border flex items-center justify-between text-xs text-text-faint">
                    <span>Open project</span>
                    <span className="text-brand-400 group-hover:translate-x-0.5 transition-transform">→</span>
                  </div>
                </Card>
              </motion.div>
            ))}

            <motion.div
              variants={{
                hidden: { opacity: 0, y: 12 },
                show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 280, damping: 24 } },
              }}
            >
              <button
                onClick={() => navigate('/add-project')}
                className="w-full h-full min-h-[180px] rounded-[var(--radius-lg)] border-2 border-dashed border-border hover:border-brand-500/50 hover:bg-brand-500/5 text-text-muted hover:text-text transition-all flex flex-col items-center justify-center gap-2 group"
              >
                <div className="w-10 h-10 rounded-full bg-surface-2 border border-border group-hover:border-brand-500/40 flex items-center justify-center transition-colors">
                  <Plus className="w-4 h-4" />
                </div>
                <span className="text-sm font-medium">Add another project</span>
              </button>
            </motion.div>
          </motion.div>
        )}
      </div>

      <Modal
        open={!!confirmDelete}
        onClose={() => { setConfirmDelete(null); setDeleteInput(''); }}
        title="Delete project?"
        description={confirmDelete ? `“${confirmDelete.name}” and all its builds will be permanently removed.` : ''}
        footer={
          <>
            <Button variant="ghost" onClick={() => { setConfirmDelete(null); setDeleteInput(''); }}>Cancel</Button>
            <Button variant="danger" leftIcon={Trash2} onClick={handleDelete} disabled={deleteInput !== confirmDelete?.name}>
              Delete project
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 mt-1">
          <p className="text-sm text-text-muted">
            Please type <span className="font-semibold text-text">{confirmDelete?.name}</span> to confirm. This action cannot be undone.
          </p>
          <Input
            placeholder={confirmDelete?.name}
            value={deleteInput}
            onChange={(e) => setDeleteInput(e.target.value)}
            autoFocus
          />
        </div>
      </Modal>
    </AppShell>
  );
}
