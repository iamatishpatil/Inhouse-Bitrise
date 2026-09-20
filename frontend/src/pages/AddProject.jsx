import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FolderGit2, GitBranch, KeyRound, CheckCircle2 } from 'lucide-react';
import { api } from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Input, Textarea } from '../components/ui/Input';
import { Card, CardBody } from '../components/ui/Card';
import { useToast } from '../components/ui/Toast';

export default function AddProject() {
  const navigate = useNavigate();
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [githubPat, setGithubPat] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/api/projects', {
        name,
        description,
        repo_url: repoUrl,
        github_pat: githubPat,
      });
      toast.success('Project created', name);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to validate repository. Please check the URL and PAT.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="New project"
        subtitle="Connect a GitHub repository to start running builds"
        back="/dashboard"
      />

      <div className="px-6 md:px-10 pb-12 max-w-2xl w-full mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <Card>
            <CardBody>
              <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="px-4 py-3 rounded-[var(--radius-md)] bg-danger/10 border border-danger/30 text-sm text-danger"
                  >
                    <div className="font-semibold mb-0.5">Validation failed</div>
                    {error}
                  </motion.div>
                )}

                <Input
                  label="Project name"
                  placeholder="e.g. Mobile App — Production"
                  leftIcon={FolderGit2}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />

                <Textarea
                  label="Description"
                  placeholder="Optional — what does this project build?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                />

                <Input
                  label="Repository URL"
                  placeholder="https://github.com/org/repo"
                  type="url"
                  leftIcon={GitBranch}
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  required
                  hint="Public or private. For private repos, supply a PAT below."
                />

                <Input
                  label="Personal Access Token"
                  placeholder="ghp_•••••••••••••••••"
                  type="password"
                  leftIcon={KeyRound}
                  value={githubPat}
                  onChange={(e) => setGithubPat(e.target.value)}
                  hint="Required for private repos. Needs the repo scope."
                />

                <div className="pt-4 border-t border-border flex items-center justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => navigate('/dashboard')}>
                    Cancel
                  </Button>
                  <Button type="submit" loading={loading} leftIcon={CheckCircle2}>
                    {loading ? 'Validating' : 'Validate & create'}
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>
        </motion.div>
      </div>
    </AppShell>
  );
}
