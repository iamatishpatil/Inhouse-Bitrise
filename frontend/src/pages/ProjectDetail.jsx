import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { DateRange } from "react-date-range";
import "react-date-range/dist/styles.css";
import "react-date-range/dist/theme/default.css";
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Plus, Play, Trash2, Pencil, Smartphone, Apple, FileCode2, GitBranch,
  KeyRound, Cloud, Download, OctagonX, FolderGit2, Copy, Check,
  Settings, ArrowUp, ArrowDown, UploadCloud, Filter, ChevronDown, RefreshCw
} from 'lucide-react';
import { api, API_URL } from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { BranchSelect } from '../components/ui/BranchSelect';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Badge, StatusDot } from '../components/ui/Badge';
import { Tabs } from '../components/ui/Tabs';
import { EmptyState, Skeleton } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import { cn } from '../lib/cn';
import { copyToClipboard } from '../lib/clipboard';
import {
  platformIcon, relativeTime, groupBuildsByDate, mergeHead, isActiveBuild, isCancellable,
} from '../lib/build';
import {
  TriggerBadge, CommitLine, BuildDuration, BuildProgressBar,
} from '../components/builds/BuildBits';
import { UploadBuildModal } from '../components/builds/UploadBuildModal';

const BUILDS_PAGE = 25;

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const [project, setProject] = useState(null);
  const [workflows, setWorkflows] = useState([]);
  const [builds, setBuilds] = useState([]);
  const [buildsTotal, setBuildsTotal] = useState(0);
  const [buildsHasMore, setBuildsHasMore] = useState(false);
  const [loadingMoreBuilds, setLoadingMoreBuilds] = useState(false);
  // Mirror the loaded-builds count into a ref so the polling effect can stay
  // off the `builds` dependency (avoids tearing down the interval each change).
  const buildsCountRef = useRef(0);
  const [fromDate, setFromDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [triggerFilter, setTriggerFilter] = useState("all");
  const [artifactFilter, setArtifactFilter] = useState("all");

  const [showTriggerDropdown, setShowTriggerDropdown] = useState(false);
  const [showArtifactDropdown, setShowArtifactDropdown] = useState(false);
  const [stagedTrigger, setStagedTrigger] = useState("all");
  const [stagedArtifact, setStagedArtifact] = useState("all");

  const triggerRef = useRef(null);
  const artifactRef = useRef(null);
  const branchRef = useRef(null);
  const workflowRef = useRef(null);
  const statusRef = useRef(null);

  const [branchFilter, setBranchFilter] = useState("all");
  const [workflowFilter, setWorkflowFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [showBranchDropdown, setShowBranchDropdown] = useState(false);
  const [showWorkflowDropdown, setShowWorkflowDropdown] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);

  const [stagedBranch, setStagedBranch] = useState("all");
  const [stagedWorkflow, setStagedWorkflow] = useState("all");
  const [stagedStatus, setStagedStatus] = useState("all");

const [range, setRange] = useState([
  {
    startDate: new Date(),
    endDate: new Date(),
    key: "selection",
  },
]);
  const [toDate, setToDate] = useState('');
  const [secrets, setSecrets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(location.state?.tab || 'builds');
  const [runnerUp, setRunnerUp] = useState(false);

  const [branches, setBranches] = useState({});
  const [branchList, setBranchList] = useState(null); // null = still loading
  const [defaultBranch, setDefaultBranch] = useState('main');
  const [addingSecret, setAddingSecret] = useState(false);
  const [newSecret, setNewSecret] = useState({ key: '', value: '' });
  const [deleteState, setDeleteState] = useState(null); // { type, id, name }
  const [deploying, setDeploying] = useState({});
  const [copied, setCopied] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showRunDropdown, setShowRunDropdown] = useState(false);
  const [runWorkflowModal, setRunWorkflowModal] = useState(null);

  // Keep the loaded-builds count fresh for the polling effect (see below).
  buildsCountRef.current = builds.length;

  const fetchAll = async () => {
    try {
      const [pRes, wRes, bRes, sRes, rRes] = await Promise.all([
        api.get(`/api/projects/${id}`),
        api.get(`/api/workflows/project/${id}`),
        api.get(`/api/builds/project/${id}?limit=${BUILDS_PAGE}&offset=0`),
        api.get(`/api/secrets/project/${id}`),
        api.get('/api/runner/status'),
      ]);
      setProject(pRes.data.project);
      setWorkflows(wRes.data.workflows);
      setBuilds(bRes.data.builds);
      setBuildsTotal(bRes.data.total || 0);
      setBuildsHasMore(bRes.data.hasMore || false);
      setSecrets(sRes.data.secrets);
      setRunnerUp(rRes.data.up);
    } catch (err) {
      toast.error('Failed to load project', err.response?.data?.message);
    } finally {
      setLoading(false);
    }
  };

  const loadMoreBuilds = async () => {
    setLoadingMoreBuilds(true);
    try {
      const res = await api.get(
        `/api/builds/project/${id}?limit=${BUILDS_PAGE}&offset=${buildsCountRef.current}`
      );
      setBuilds((prev) => [...prev, ...(res.data.builds || [])]);
      setBuildsTotal(res.data.total || 0);
      setBuildsHasMore(res.data.hasMore || false);
    } catch (err) {
      toast.error('Failed to load more builds', err.response?.data?.message);
    } finally {
      setLoadingMoreBuilds(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [id]);

  // Load the repo's branches once so each workflow row gets a branch dropdown
  // (still free-text — type a branch that isn't listed yet). setState happens
  // only inside the async callbacks. The default branch is applied per row at
  // render via a fallback, so no state seeding is needed.
  useEffect(() => {
    let active = true;
    api.get(`/api/projects/${id}/branches`)
      .then((res) => {
        if (!active) return;
        setBranchList(res.data.branches || []);
        setDefaultBranch(res.data.defaultBranch || 'main');
      })
      .catch(() => { if (active) setBranchList([]); });
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (triggerRef.current && !triggerRef.current.contains(event.target)) {
        setShowTriggerDropdown(false);
      }
      if (artifactRef.current && !artifactRef.current.contains(event.target)) {
        setShowArtifactDropdown(false);
      }
      if (branchRef.current && !branchRef.current.contains(event.target)) setShowBranchDropdown(false);
      if (workflowRef.current && !workflowRef.current.contains(event.target)) setShowWorkflowDropdown(false);
      if (statusRef.current && !statusRef.current.contains(event.target)) setShowStatusDropdown(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Poll runner status every 10s (independent of builds — stable interval).
  useEffect(() => {
    const runnerInterval = setInterval(() => {
      api.get('/api/runner/status')
        .then(res => setRunnerUp(res.data.up))
        .catch(err => console.error('Failed to poll runner status', err));
    }, 10000);
    return () => clearInterval(runnerInterval);
  }, []);

  // Poll only while a build is active. Refetches the HEAD page (not the whole
  // history) and merges status updates in place, so polling stays cheap.
  const hasActiveBuild = useMemo(() => builds.some(isActiveBuild), [builds]);
  useEffect(() => {
    if (!hasActiveBuild) return;
    const buildInterval = setInterval(() => {
      Promise.all([
        api.get(`/api/builds/project/${id}?limit=${BUILDS_PAGE}&offset=0`),
        api.get(`/api/workflows/project/${id}`),
      ]).then(([bRes, wRes]) => {
        setBuilds(prev => mergeHead(prev, bRes.data.builds || []));
        setBuildsTotal(bRes.data.total || 0);
        setWorkflows(wRes.data.workflows);
      }).catch(err => console.error('Polling failed', err));
    }, 5000);
    return () => clearInterval(buildInterval);
  }, [id, hasActiveBuild]);

  const runBuild = async (workflowId) => {
    try {
      const branch = branches[workflowId] || defaultBranch || 'main';
      const res = await api.post('/api/builds', { project_id: id, workflow_id: workflowId, branch });
      navigate(`/builds/${res.data.build.id}`);
    } catch (err) {
      toast.error('Failed to trigger build', err.response?.data?.message);
    }
  };

  const abortBuild = async (buildId) => {
    try {
      await api.post(`/api/builds/${buildId}/abort`);
      fetchAll();
      toast.info('Build cancelled');
    } catch (err) {
      toast.error('Failed to cancel', err.response?.data?.message);
    }
  };

  const rebuildBuild = async (b) => {
    if (!b.workflow_id) return;
    try {
      const res = await api.post('/api/builds', {
        project_id: b.project_id,
        workflow_id: b.workflow_id,
        branch: b.branch || 'main'
      });
      navigate(`/builds/${res.data.build.id}`);
      toast.success('Rebuild triggered');
    } catch (err) {
      toast.error('Failed to trigger rebuild', err.response?.data?.message);
    }
  };

  const deployS3 = async (buildId) => {
    setDeploying((p) => ({ ...p, [buildId]: true }));
    toast.info('Initiating S3 upload...', 'Your build is being uploaded in the background.');
    try {
      const res = await api.post(`/api/builds/${buildId}/deploy-s3`);
      toast.success('Uploaded to S3', res.data.message);
      fetchAll();
    } catch (err) {
      toast.error('Upload failed', err.response?.data?.message);
    } finally {
      setDeploying((p) => ({ ...p, [buildId]: false }));
    }
  };

  const deployTestFlight = async (buildId) => {
    setDeploying((p) => ({ ...p, [buildId]: true }));
    toast.info('Initiating TestFlight upload...', 'This may take a few minutes to process.');
    try {
      const res = await api.post(`/api/builds/${buildId}/deploy-testflight`);
      toast.success('Uploaded to TestFlight', res.data.message);
      fetchAll();
    } catch (err) {
      toast.error('Upload failed', err.response?.data?.message);
    } finally {
      setDeploying((p) => ({ ...p, [buildId]: false }));
    }
  };

  const addSecret = async () => {
    try {
      await api.post(`/api/secrets/project/${id}`, newSecret);
      setNewSecret({ key: '', value: '' });
      setAddingSecret(false);
      const sRes = await api.get(`/api/secrets/project/${id}`);
      setSecrets(sRes.data.secrets);
      toast.success('Secret added');
    } catch (err) {
      toast.error('Failed to add secret', err.response?.data?.message);
    }
  };

  const confirmDelete = async () => {
    if (!deleteState) return;
    try {
      if (deleteState.type === 'workflow') {
        await api.delete(`/api/workflows/${deleteState.id}`);
        const wRes = await api.get(`/api/workflows/project/${id}`);
        setWorkflows(wRes.data.workflows);
        toast.success('Workflow deleted');
      } else if (deleteState.type === 'secret') {
        await api.delete(`/api/secrets/${deleteState.id}`);
        setSecrets((s) => s.filter((x) => x.id !== deleteState.id));
        toast.success('Secret deleted');
      }
    } catch (err) {
      toast.error('Delete failed', err.response?.data?.message);
    } finally {
      setDeleteState(null);
    }
  };

  const copyRepo = async () => {
    const success = await copyToClipboard(project?.repo_url || '');
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const uniqueBranches = useMemo(() => {
    const set = new Set();
    if (branchList) branchList.forEach(b => set.add(b.name || b));
    builds.forEach(b => { if (b.branch) set.add(b.branch); });
    return Array.from(set).filter(Boolean).sort();
  }, [builds, branchList]);

  if (loading) {
    return (
      <AppShell>
        <PageHeader title="Loading…" />
        <div className="px-6 md:px-10 pb-12 grid gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-48" />
        </div>
      </AppShell>
    );
  }
  if (!project) return <AppShell><PageHeader title="Project not found" back="/dashboard" /></AppShell>;

  const latestVersion = builds.find(b => b.version)?.version || null;
const filteredBuilds = builds.filter((build) => {
  
  let matchesDate = true;
  if (fromDate || toDate) {
    const d = new Date(build.created_at);
    const buildDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    
    if (fromDate && !toDate) {
      matchesDate = buildDate === fromDate;
    } else if (!fromDate && toDate) {
      matchesDate = buildDate === toDate;
    } else {
      matchesDate = buildDate >= fromDate && buildDate <= toDate;
    }
  }

  
  let matchesTrigger = true;
  if (triggerFilter !== 'all') {
    const branch = (build.branch || '').toLowerCase();
    
    
    const isTag = branch.startsWith('refs/tags/') || 
                  branch.startsWith('tags/') || 
                  branch.startsWith('tag/') ||
                  /^v?\d+\.\d+(\.\d+)?(-.+)?$/.test(branch);

    
    const isPR = branch.startsWith('refs/pull/') || 
                 branch.includes('pull/') || 
                 branch.startsWith('pr-') || 
                 branch.includes('/pr/') ||
                 branch === 'pr';

    if (triggerFilter === 'tags') {
      matchesTrigger = isTag;
    } else if (triggerFilter === 'pull_requests') {
      matchesTrigger = isPR;
    } else if (triggerFilter === 'pushes') {
      matchesTrigger = !isTag && !isPR;
    }
  }

  
  let matchesArtifact = true;
  if (artifactFilter !== 'all') {
    if (artifactFilter === 'ios') {
      matchesArtifact = build.platform === 'ios' && !!build.artifact_path;
    } else if (artifactFilter === 'android') {
      matchesArtifact = build.platform === 'android' && !!build.artifact_path;
    }
  }

  let matchesBranch = true;
  if (branchFilter !== 'all') {
    matchesBranch = build.branch === branchFilter;
  }

  let matchesWorkflow = true;
  if (workflowFilter !== 'all') {
    matchesWorkflow = build.workflow_id === workflowFilter || build.workflow_name === workflowFilter || (build.workflow && build.workflow.name === workflowFilter);
  }

  let matchesStatus = true;
  if (statusFilter !== 'all') {
    matchesStatus = build.status === statusFilter;
  }

  return matchesDate && matchesTrigger && matchesArtifact && matchesBranch && matchesWorkflow && matchesStatus;
});

  // Bucket the filtered builds into day groups in a single pass (was previously
  // an O(n²) re-filter inside the render loop).
  const groupedBuilds = groupBuildsByDate(filteredBuilds);

  return (
    <AppShell>
      <PageHeader
        title={
          <div className="flex items-center gap-3">
            <span>{project.name}</span>
          </div>
        }
        subtitle={
          <div className="flex items-center gap-2.5 mt-1.5 text-[13px]">
            <span className="text-text-muted">{project.description || 'Build & workflow management'}</span>
            <span className="text-text-faint/30">•</span>
            <a href={project.repo_url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 font-mono text-text-faint hover:text-text transition-colors group">
              <FolderGit2 className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 transition-opacity" />
              {project.repo_url.replace(/^https?:\/\//, '')}
            </a>
            <button onClick={copyRepo} className="hover:text-text text-text-faint transition-colors flex items-center justify-center p-1 rounded hover:bg-surface-2" title="Copy URL">
              {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        }
        back="/dashboard"
        breadcrumbs={['Projects', project.name]}
        actions={
          <div className="flex gap-2.5 items-center">
            {/* Status Indicator */}
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] font-bold uppercase tracking-wider transition-colors shadow-sm",
              runnerUp 
                ? "bg-green-500/10 border-green-500/20 text-green-500" 
                : "bg-red-500/10 border-red-500/20 text-red-500"
            )}>
              <span className="relative flex h-2 w-2">
                {runnerUp && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>}
                <span className={cn("relative inline-flex rounded-full h-2 w-2", runnerUp ? "bg-green-500" : "bg-red-500")}></span>
              </span>
              {runnerUp ? "Runner Active" : "Runner Offline"}
            </div>
            
            <div className="w-px h-5 bg-border mx-1" />

            <Button
              variant="secondary"
              leftIcon={UploadCloud}
              onClick={() => setShowUpload(true)}
              className="rounded-full shadow-sm"
            >
              Upload
            </Button>

            <div className="relative">
              <Button
                variant="primary"
                leftIcon={Play}
                rightIcon={ChevronDown}
                onClick={() => setShowRunDropdown(!showRunDropdown)}
                className="rounded-full shadow-md bg-brand-500 hover:bg-brand-600 border-none px-4"
              >
                Run Workflow
              </Button>
              {showRunDropdown && (
                <>
                  <div className="fixed inset-0 z-[50]" onClick={() => setShowRunDropdown(false)} />
                  <div className="absolute z-[60] right-0 mt-2 w-72 p-2 rounded-xl border border-border bg-surface shadow-xl flex flex-col gap-1">
                    <div className="text-[11px] font-bold text-text-muted mb-1 px-2 pt-1 uppercase tracking-wider">Select Workflow</div>
                    <div className="flex flex-col gap-1 max-h-[60vh] overflow-y-auto pr-1">
                      {workflows.length === 0 ? (
                        <div className="px-2 py-4 text-sm text-text-muted text-center flex flex-col items-center gap-2">
                          <FileCode2 className="w-6 h-6 opacity-40" />
                          No workflows configured
                        </div>
                      ) : (
                        workflows.map(wf => {
                          const PIcon = platformIcon(wf.platform);
                          return (
                            <button
                              key={wf.id}
                              className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-2 transition-colors text-left group"
                              onClick={() => {
                                setRunWorkflowModal(wf);
                                setShowRunDropdown(false);
                              }}
                            >
                              <div className="w-8 h-8 rounded bg-surface-3 border border-border flex items-center justify-center text-text-muted group-hover:text-brand-400 group-hover:border-brand-500/30 transition-colors shrink-0">
                                <PIcon className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-[13px] font-semibold text-text truncate group-hover:text-brand-400 transition-colors">{wf.name}</div>
                                <div className="text-[11px] text-text-faint truncate mt-0.5">
                                  {wf.platform || 'generic'} • {wf.yml_config ? 'YAML Configured' : `${wf.steps?.length || 0} step${(wf.steps?.length || 0) === 1 ? '' : 's'}`}
                                </div>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                    <div className="mt-1 pt-2 border-t border-border px-1">
                       <button onClick={() => { setShowRunDropdown(false); navigate(`/projects/${id}/add-workflow`); }} className="text-[13px] font-medium text-brand-400 hover:text-brand-300 transition-colors flex items-center gap-1.5 w-full justify-center py-2 rounded-md hover:bg-brand-500/10">
                         <Plus className="w-3.5 h-3.5" /> Add New Workflow
                       </button>
                    </div>
                  </div>
                </>
              )}
            </div>

          </div>
        }
      />

      <UploadBuildModal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        projectId={id}
        onUploaded={() => fetchAll()}
      />


      <div className="px-6 md:px-10 pb-12 flex flex-col gap-8">
        {/* Horizontal Stats Row */}
        <div className="grid grid-cols-2 md:flex md:flex-row gap-3 md:gap-4 mb-2">
          <StatCard label="Builds" value={buildsTotal} />
          <StatCard label="Workflows" value={workflows.length} />
          <StatCard label="Secrets" value={secrets.length} />
          <StatCard
            label="Last build"
            value={builds[0] ? relativeTime(builds[0].created_at) : '—'}
          />
        </div>

        <div className="flex flex-col gap-6 min-w-0">
          <div className="flex items-center justify-between">
            <Tabs
              value={tab}
              onChange={setTab}
              items={[
                { value: 'builds', label: 'Builds', count: buildsTotal },
                { value: 'workflows', label: 'Workflows', count: workflows.length },
                { value: 'secrets', label: 'Secrets', count: secrets.length },
              ]}
            />
            <Button
              variant="ghost"
              size="sm"
              leftIcon={Settings}
              onClick={() => navigate(`/projects/${id}/settings`)}
              className="text-text-muted hover:text-text hover:bg-surface-2"
            >
              Settings
            </Button>
          </div>
          <AnimatePresence mode="wait">
            {tab === 'builds' ? (
              <motion.div
                key="builds"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
              >
                
                <div className="mb-4 relative z-30">
        <div className="flex items-center flex-wrap gap-1.5 w-full">
          <div className="flex items-center gap-1.5 px-3 py-1.5 text-text-muted font-bold text-[11px] uppercase tracking-wider mr-2 select-none">
            <Filter className="w-3.5 h-3.5" />
            <span>Filter</span>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => { setShowCalendar(!showCalendar); setShowTriggerDropdown(false); setShowArtifactDropdown(false); setShowBranchDropdown(false); setShowWorkflowDropdown(false); setShowStatusDropdown(false); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-transparent hover:bg-surface text-[13px] font-medium text-text-muted hover:text-text transition-all"
            >
              {fromDate || toDate ? "Custom Date" : "All dates"}
              <ChevronDown className="w-3.5 h-3.5 opacity-50" />
            </button>
            {showCalendar && (
              <div className="absolute z-50 mt-1.5 top-full left-0 rounded-xl border border-border bg-surface shadow-xl p-2">
                <DateRange
                  editableDateInputs={true}
                  moveRangeOnFirstSelection={false}
                  ranges={range}
                  rangeColors={["#7c3aed"]}
                  onChange={(item) => {
                    setRange([item.selection]);
                    setFromDate(item.selection.startDate.toISOString().split("T")[0]);
                    setToDate(item.selection.endDate.toISOString().split("T")[0]);
                  }}
                />
              </div>
            )}
          </div>

          {/* Branches */}
          <div className="relative" ref={branchRef}>
            <button
              type="button"
              onClick={() => {
                setStagedBranch(branchFilter);
                setShowBranchDropdown(!showBranchDropdown);
                setShowWorkflowDropdown(false);
                setShowStatusDropdown(false);
                setShowTriggerDropdown(false);
                setShowArtifactDropdown(false);
                setShowCalendar(false);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-transparent hover:bg-surface text-[13px] font-medium text-text-muted hover:text-text transition-all"
            >
              <span className="max-w-[120px] truncate">{branchFilter === 'all' ? 'All branches' : branchFilter}</span>
              <ChevronDown className="w-3.5 h-3.5 opacity-50 shrink-0" />
            </button>
            {showBranchDropdown && (
              <>
                <div className="fixed inset-0 z-[50]" onClick={() => setShowBranchDropdown(false)} />
                <div className="absolute z-[60] mt-1.5 top-full left-0 w-[240px] p-3 rounded-xl border border-border bg-surface shadow-xl">
                  <div className="text-xs font-bold text-text-muted mb-2 px-1 uppercase tracking-wider">Branch</div>
                  <div className="flex flex-col gap-1 max-h-60 overflow-y-auto pr-1">
                    {[{ value: 'all', label: 'All branches' }, ...uniqueBranches.map(b => ({ value: b, label: b }))].map(opt => {
                      const isSelected = stagedBranch === opt.value;
                      return (
                        <div key={opt.value} className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-surface-2 transition-colors select-none" onClick={() => setStagedBranch(opt.value)}>
                          <div className={cn("w-3.5 h-3.5 shrink-0 rounded-full border flex items-center justify-center transition-all", isSelected ? "border-brand-500" : "border-border-strong")}>
                            {isSelected && <div className="w-2 h-2 rounded-full bg-brand-500" />}
                          </div>
                          <span className={cn("text-[13px] truncate transition-colors", isSelected ? "text-text font-medium" : "text-text-muted")}>{opt.label}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-border">
                    <button type="button" onClick={() => setShowBranchDropdown(false)} className="px-3 py-1.5 rounded-md text-xs font-medium text-text-muted hover:text-text hover:bg-surface-2 transition-colors">Cancel</button>
                    <button type="button" onClick={() => { setBranchFilter(stagedBranch); setShowBranchDropdown(false); }} className="px-3 py-1.5 rounded-md text-xs font-medium bg-brand-500 text-white hover:bg-brand-600 transition-colors">Apply</button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Workflows */}
          <div className="relative" ref={workflowRef}>
            <button
              type="button"
              onClick={() => {
                setStagedWorkflow(workflowFilter);
                setShowWorkflowDropdown(!showWorkflowDropdown);
                setShowBranchDropdown(false);
                setShowStatusDropdown(false);
                setShowTriggerDropdown(false);
                setShowArtifactDropdown(false);
                setShowCalendar(false);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-transparent hover:bg-surface text-[13px] font-medium text-text-muted hover:text-text transition-all"
            >
              <span className="max-w-[120px] truncate">{workflowFilter === 'all' ? 'All workflows' : (workflows.find(w => w.id === workflowFilter)?.name || workflowFilter)}</span>
              <ChevronDown className="w-3.5 h-3.5 opacity-50 shrink-0" />
            </button>
            {showWorkflowDropdown && (
              <>
                <div className="fixed inset-0 z-[50]" onClick={() => setShowWorkflowDropdown(false)} />
                <div className="absolute z-[60] mt-1.5 top-full left-0 w-[240px] p-3 rounded-xl border border-border bg-surface shadow-xl">
                  <div className="text-xs font-bold text-text-muted mb-2 px-1 uppercase tracking-wider">Workflow</div>
                  <div className="flex flex-col gap-1 max-h-60 overflow-y-auto pr-1">
                    {[{ value: 'all', label: 'All workflows' }, ...workflows.map(w => ({ value: w.id, label: w.name }))].map(opt => {
                      const isSelected = stagedWorkflow === opt.value;
                      return (
                        <div key={opt.value} className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-surface-2 transition-colors select-none" onClick={() => setStagedWorkflow(opt.value)}>
                          <div className={cn("w-3.5 h-3.5 shrink-0 rounded-full border flex items-center justify-center transition-all", isSelected ? "border-brand-500" : "border-border-strong")}>
                            {isSelected && <div className="w-2 h-2 rounded-full bg-brand-500" />}
                          </div>
                          <span className={cn("text-[13px] truncate transition-colors", isSelected ? "text-text font-medium" : "text-text-muted")}>{opt.label}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-border">
                    <button type="button" onClick={() => setShowWorkflowDropdown(false)} className="px-3 py-1.5 rounded-md text-xs font-medium text-text-muted hover:text-text hover:bg-surface-2 transition-colors">Cancel</button>
                    <button type="button" onClick={() => { setWorkflowFilter(stagedWorkflow); setShowWorkflowDropdown(false); }} className="px-3 py-1.5 rounded-md text-xs font-medium bg-brand-500 text-white hover:bg-brand-600 transition-colors">Apply</button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Statuses */}
          <div className="relative" ref={statusRef}>
            <button
              type="button"
              onClick={() => {
                setStagedStatus(statusFilter);
                setShowStatusDropdown(!showStatusDropdown);
                setShowWorkflowDropdown(false);
                setShowBranchDropdown(false);
                setShowTriggerDropdown(false);
                setShowArtifactDropdown(false);
                setShowCalendar(false);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-transparent hover:bg-surface text-[13px] font-medium text-text-muted hover:text-text transition-all"
            >
              {statusFilter === 'all' ? 'All statuses' : statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}
              <ChevronDown className="w-3.5 h-3.5 opacity-50 shrink-0" />
            </button>
            {showStatusDropdown && (
              <>
                <div className="fixed inset-0 z-[50]" onClick={() => setShowStatusDropdown(false)} />
                <div className="absolute z-[60] mt-1.5 top-full left-0 w-[240px] p-3 rounded-xl border border-border bg-surface shadow-xl">
                  <div className="text-xs font-bold text-text-muted mb-2 px-1 uppercase tracking-wider">Status</div>
                  <div className="flex flex-col gap-1 max-h-60 overflow-y-auto pr-1">
                    {[
                      { value: 'all', label: 'All statuses' },
                      { value: 'success', label: 'Success' },
                      { value: 'failed', label: 'Failed' },
                      { value: 'running', label: 'Running' },
                      { value: 'queued', label: 'Queued' },
                      { value: 'canceled', label: 'Canceled' }
                    ].map(opt => {
                      const isSelected = stagedStatus === opt.value;
                      return (
                        <div key={opt.value} className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-surface-2 transition-colors select-none" onClick={() => setStagedStatus(opt.value)}>
                          <div className={cn("w-3.5 h-3.5 shrink-0 rounded-full border flex items-center justify-center transition-all", isSelected ? "border-brand-500" : "border-border-strong")}>
                            {isSelected && <div className="w-2 h-2 rounded-full bg-brand-500" />}
                          </div>
                          <span className={cn("text-[13px] truncate transition-colors", isSelected ? "text-text font-medium" : "text-text-muted")}>{opt.label}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-border">
                    <button type="button" onClick={() => setShowStatusDropdown(false)} className="px-3 py-1.5 rounded-md text-xs font-medium text-text-muted hover:text-text hover:bg-surface-2 transition-colors">Cancel</button>
                    <button type="button" onClick={() => { setStatusFilter(stagedStatus); setShowStatusDropdown(false); }} className="px-3 py-1.5 rounded-md text-xs font-medium bg-brand-500 text-white hover:bg-brand-600 transition-colors">Apply</button>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="relative" ref={triggerRef}>
            <button
              type="button"
              onClick={() => {
                setStagedTrigger(triggerFilter);
                setShowTriggerDropdown(!showTriggerDropdown); setShowArtifactDropdown(false); setShowCalendar(false); setShowBranchDropdown(false); setShowWorkflowDropdown(false); setShowStatusDropdown(false);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-transparent hover:bg-surface text-[13px] font-medium text-text-muted hover:text-text transition-all"
            >
              {triggerFilter === 'pushes' ? 'Pushes' : triggerFilter === 'pull_requests' ? 'Pull Requests' : triggerFilter === 'tags' ? 'Tags' : 'All triggers'}
              <ChevronDown className="w-3.5 h-3.5 opacity-50" />
            </button>

            {showTriggerDropdown && (
              <>
                <div className="fixed inset-0 z-[50]" onClick={() => setShowTriggerDropdown(false)} />
                <div className="absolute z-[60] mt-1.5 top-full left-0 w-[240px] p-3 rounded-xl border border-border bg-surface shadow-xl">
                  <div className="text-xs font-bold text-text-muted mb-2 px-1 uppercase tracking-wider">Trigger Source</div>
                  <div className="flex flex-col gap-1">
                    {[
                      { value: 'all', label: 'All triggers' },
                      { value: 'pushes', label: 'Pushes' },
                      { value: 'pull_requests', label: 'Pull Requests' },
                      { value: 'tags', label: 'Tags' },
                    ].map(opt => {
                      const isSelected = stagedTrigger === opt.value;
                      return (
                        <div
                          key={opt.value}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-surface-2 transition-colors select-none"
                          onClick={() => setStagedTrigger(opt.value)}
                        >
                          <div className={cn("w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-all", isSelected ? "border-brand-500" : "border-border-strong")}>
                            {isSelected && <div className="w-2 h-2 rounded-full bg-brand-500" />}
                          </div>
                          <span className={cn("text-[13px] transition-colors", isSelected ? "text-text font-medium" : "text-text-muted")}>
                            {opt.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-border">
                    <button type="button" onClick={() => setShowTriggerDropdown(false)} className="px-3 py-1.5 rounded-md text-xs font-medium text-text-muted hover:text-text hover:bg-surface-2 transition-colors">Cancel</button>
                    <button type="button" onClick={() => { setTriggerFilter(stagedTrigger); setShowTriggerDropdown(false); }} className="px-3 py-1.5 rounded-md text-xs font-medium bg-brand-500 text-white hover:bg-brand-600 transition-colors">Apply</button>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="relative" ref={artifactRef}>
            <button
              type="button"
              onClick={() => {
                setStagedArtifact(artifactFilter);
                setShowArtifactDropdown(!showArtifactDropdown); setShowTriggerDropdown(false); setShowCalendar(false); setShowBranchDropdown(false); setShowWorkflowDropdown(false); setShowStatusDropdown(false);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-transparent hover:bg-surface text-[13px] font-medium text-text-muted hover:text-text transition-all"
            >
              {artifactFilter === 'ios' ? 'iOS IPA' : artifactFilter === 'android' ? 'Android APK/AAB' : 'All artifacts'}
              <ChevronDown className="w-3.5 h-3.5 opacity-50" />
            </button>

            {showArtifactDropdown && (
              <>
                <div className="fixed inset-0 z-[50]" onClick={() => setShowArtifactDropdown(false)} />
                <div className="absolute z-[60] mt-1.5 top-full left-0 w-[240px] p-3 rounded-xl border border-border bg-surface shadow-xl">
                  <div className="text-xs font-bold text-text-muted mb-2 px-1 uppercase tracking-wider">Platform Artifacts</div>
                  <div className="flex flex-col gap-1">
                    {[
                      { value: 'all', label: 'All artifacts' },
                      { value: 'ios', label: 'iOS IPA' },
                      { value: 'android', label: 'Android APK/AAB' },
                    ].map(opt => {
                      const isSelected = stagedArtifact === opt.value;
                      return (
                        <div
                          key={opt.value}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-surface-2 transition-colors select-none"
                          onClick={() => setStagedArtifact(opt.value)}
                        >
                          <div className={cn("w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-all", isSelected ? "border-brand-500" : "border-border-strong")}>
                            {isSelected && <div className="w-2 h-2 rounded-full bg-brand-500" />}
                          </div>
                          <span className={cn("text-[13px] transition-colors", isSelected ? "text-text font-medium" : "text-text-muted")}>
                            {opt.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-border">
                    <button type="button" onClick={() => setShowArtifactDropdown(false)} className="px-3 py-1.5 rounded-md text-xs font-medium text-text-muted hover:text-text hover:bg-surface-2 transition-colors">Cancel</button>
                    <button type="button" onClick={() => { setArtifactFilter(stagedArtifact); setShowArtifactDropdown(false); }} className="px-3 py-1.5 rounded-md text-xs font-medium bg-brand-500 text-white hover:bg-brand-600 transition-colors">Apply</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

                <Card>
                  <CardBody className="p-0">
                    {builds.length === 0 ? (
                      <EmptyState
                        icon={Play}
                        title="No builds yet"
                        description="Trigger a workflow to see build history here."
                      />
                    ) : filteredBuilds.length === 0 ? (
                      <EmptyState
                        icon={Play}
                        title="No builds match these filters"
                        description="Try clearing the date, trigger, or artifact filters."
                      />
                    ) : (
                      <>
                        {groupedBuilds.map((group) => (
                          <div key={group.label}>
                            <div className="px-4 py-3 bg-surface-2 border-b border-border">
                              <div className="font-semibold text-text">
                                {group.label}{' '}
                                <span className="text-text-faint font-normal">({group.builds.length})</span>
                              </div>
                            </div>
                            <div className="divide-y divide-border">
                              {group.builds.map((b) => {
                                const PIcon = platformIcon(b.platform);
                                const isS3 = b.artifact_path && b.artifact_path.startsWith('http');
                                return (
                            <div
                              key={b.id}
                              className="group relative p-4 cursor-pointer transition-colors hover:bg-surface-2/40"
                              onClick={() => navigate(`/builds/${b.id}`)}
                            >
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-[var(--radius-md)] bg-surface-3 border border-border flex items-center justify-center text-brand-400 shrink-0">
                                  <PIcon className="w-4 h-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-text">
                                      #{b.build_number || b.id.slice(0, 8)}
                                    </span>
                                    <span className="text-text-faint">·</span>
                                    <span className="text-sm text-text-muted truncate">{b.workflow_name || 'Manual upload'}</span>
                                  </div>
                                  <div className="flex items-center gap-3 mt-1 text-xs text-text-faint flex-wrap">
                                    <span className="flex items-center gap-1 font-mono">
                                      <GitBranch className="w-3 h-3" />
                                      {b.branch || 'main'}
                                    </span>
                                    <span>{relativeTime(b.created_at)}</span>
                                    <BuildDuration build={b} />
                                    <TriggerBadge source={b.trigger_source} user={b.trigger_user_name} />
                                  </div>
                                  <CommitLine build={b} className="mt-1" />
                                  <BuildProgressBar build={b} />
                                </div>
                                <div className="w-[100px] flex justify-end shrink-0">
                                  <StatusDot status={b.status} />
                                </div>
                                <div className="absolute right-[120px] top-1/2 -translate-y-1/2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-surface-2/80 backdrop-blur-sm px-2 py-1 rounded-md z-10">
                                  {isCancellable(b) && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      leftIcon={OctagonX}
                                      onClick={(e) => { e.stopPropagation(); abortBuild(b.id); }}
                                    >
                                      Cancel
                                    </Button>
                                  )}
                                  {(!isCancellable(b) && b.workflow_id) && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      leftIcon={RefreshCw}
                                      onClick={(e) => { e.stopPropagation(); rebuildBuild(b); }}
                                    >
                                      Rebuild
                                    </Button>
                                  )}
                                  {b.status === 'success' && b.artifact_path && (
                                    <>
                                      {b.platform === 'ios' && !b.testflight_uploaded && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          leftIcon={Cloud}
                                          loading={deploying[b.id]}
                                          onClick={(e) => { e.stopPropagation(); deployTestFlight(b.id); }}
                                        >
                                          To TestFlight
                                        </Button>
                                      )}
                                      {!isS3 && b.platform !== 'ios' && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          leftIcon={Cloud}
                                          loading={deploying[b.id]}
                                          onClick={(e) => { e.stopPropagation(); deployS3(b.id); }}
                                        >
                                          To S3
                                        </Button>
                                      )}
                                      <Button
                                        variant="secondary"
                                        size="sm"
                                        leftIcon={Download}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          window.open(
                                            `${window.location.origin}/install/${b.id}`,
                                            '_blank'
                                          );
                                        }}
                                      >
                                        Download
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}

                        {buildsHasMore && (
                          <div className="flex justify-center p-4 border-t border-border">
                            <Button
                              variant="secondary"
                              loading={loadingMoreBuilds}
                              onClick={loadMoreBuilds}
                            >
                              Load more ({builds.length} of {buildsTotal})
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </CardBody>
                </Card>
              </motion.div>
            ) : tab === 'secrets' ? (
              <motion.div
                key="secrets"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
              >
                <Card>
                  <CardHeader
                    title="Secrets vault"
                    subtitle="Project-scoped environment variables"
                    actions={
                      <Button size="sm" leftIcon={Plus} onClick={() => setAddingSecret(true)}>
                        Add secret
                      </Button>
                    }
                  />
                  <CardBody className="flex flex-col gap-2 p-3">
                    <AnimatePresence>
                      {addingSecret && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="p-4 rounded-[var(--radius-md)] bg-surface-2/60 border border-border">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <Input
                                label="Key"
                                placeholder="AWS_ACCESS_KEY_ID"
                                value={newSecret.key}
                                onChange={(e) => setNewSecret({ ...newSecret, key: e.target.value })}
                              />
                              <Input
                                label="Value"
                                type="password"
                                placeholder="••••••••"
                                value={newSecret.value}
                                onChange={(e) => setNewSecret({ ...newSecret, value: e.target.value })}
                              />
                            </div>
                            <div className="flex justify-end gap-2 mt-3">
                              <Button variant="ghost" onClick={() => setAddingSecret(false)}>Cancel</Button>
                              <Button leftIcon={KeyRound} onClick={addSecret}>Save secret</Button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {secrets.length === 0 && !addingSecret ? (
                      <EmptyState
                        icon={KeyRound}
                        title="No secrets stored"
                        description="Add credentials and env vars used by your builds."
                      />
                    ) : (
                      secrets.map((s) => (
                        <motion.div
                          key={s.id}
                          layout
                          className="flex items-center gap-3 p-3 rounded-[var(--radius-md)] bg-surface-2/60 border border-border hover:border-border-strong transition-colors"
                        >
                          <div className="w-9 h-9 rounded-[var(--radius-md)] bg-surface-3 border border-border flex items-center justify-center text-brand-400">
                            <KeyRound className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-mono font-semibold text-sm text-text truncate">{s.key}</div>
                            <div className="text-xs text-text-faint flex items-center gap-1.5">
                              <span>Added {relativeTime(s.created_at)}</span>
                              {s.added_by_name && (
                                <>
                                  <span className="opacity-40">•</span>
                                  <span>by <span className="font-medium text-text-muted">{s.added_by_name}</span></span>
                                </>
                              )}
                            </div>
                          </div>
                          <Badge tone="success" dot>active</Badge>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteState({ type: 'secret', id: s.id, name: s.key })} aria-label="Delete secret">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </motion.div>
                      ))
                    )}
                  </CardBody>
                </Card>
              </motion.div>
            ) : tab === 'workflows' ? (
              <motion.div
                key="workflows"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
              >
                <Card>
                  <CardHeader
                    title="Workflows"
                    subtitle="Automation pipelines for your project"
                    actions={
                      <Button size="sm" leftIcon={Plus} onClick={() => navigate(`/projects/${id}/add-workflow`)}>
                        Add workflow
                      </Button>
                    }
                  />
                  <CardBody className="flex flex-col gap-2 p-3">
                    {workflows.length === 0 ? (
                      <EmptyState
                        icon={FileCode2}
                        title="No workflows configured"
                        description="Create a workflow to start automating your builds."
                      />
                    ) : (
                      workflows.map((wf) => {
                        const PIcon = platformIcon(wf.platform);
                        return (
                          <motion.div
                            key={wf.id}
                            layout
                            className="group flex items-center gap-3 p-3 rounded-[var(--radius-md)] bg-surface-2/60 border border-border hover:border-border-strong transition-colors"
                          >
                            <div className="w-9 h-9 rounded-[var(--radius-md)] bg-surface-3 border border-border flex items-center justify-center text-brand-400">
                              <PIcon className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-sm text-text truncate group-hover:text-brand-400 transition-colors">{wf.name}</div>
                              <div className="text-[11px] text-text-faint truncate mt-0.5 flex items-center gap-1.5">
                                <span>{wf.platform || 'generic'}</span>
                                <span className="opacity-40">•</span>
                                <span>{wf.yml_config ? 'YAML Configured' : `${wf.steps?.length || 0} step${(wf.steps?.length || 0) === 1 ? '' : 's'}`}</span>
                                {wf.last_changed_by && (
                                  <>
                                    <span className="opacity-40">•</span>
                                    <span>Last changed by <span className="font-medium text-text-muted">{wf.last_changed_by}</span></span>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                variant="ghost"
                                size="sm"
                                leftIcon={Play}
                                onClick={() => setRunWorkflowModal(wf)}
                              >
                                Run
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                leftIcon={Pencil}
                                onClick={() => navigate(`/projects/${id}/add-workflow`, { state: { workflow: wf } })}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                leftIcon={Trash2}
                                onClick={() => setDeleteState({ type: 'workflow', id: wf.id, name: wf.name })}
                                className="text-danger hover:text-danger hover:bg-danger/10"
                              >
                                Delete
                              </Button>
                            </div>
                          </motion.div>
                        );
                      })
                    )}
                  </CardBody>
                </Card>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      {/* Run Workflow Modal */}
      {runWorkflowModal && (() => {
        const wf = runWorkflowModal;
        const PIcon = platformIcon(wf.platform);
        return (
          <Modal
            open={true}
            onClose={() => setRunWorkflowModal(null)}
            title="Run Workflow"
            footer={
              <>
                <Button variant="ghost" onClick={() => setRunWorkflowModal(null)}>Cancel</Button>
                <Button leftIcon={Play} onClick={() => { setRunWorkflowModal(null); runBuild(wf.id); }}>Run Build</Button>
              </>
            }
          >
            <div className="flex flex-col gap-4 py-2">
              <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-surface-2/40">
                <div className="w-10 h-10 rounded-md bg-surface-3 border border-border flex items-center justify-center text-brand-400">
                  <PIcon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-semibold text-text truncate">{wf.name}</div>
                  <div className="text-xs text-text-faint truncate mt-0.5">
                    {wf.platform || 'generic'} • {wf.yml_config ? 'YAML Configured' : `${wf.steps?.length || 0} step${(wf.steps?.length || 0) === 1 ? '' : 's'}`}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-text">Select Branch</label>
                <BranchSelect
                  placeholder="Select a branch..."
                  value={branches[wf.id] ?? defaultBranch}
                  onChange={(v) => setBranches((p) => ({ ...p, [wf.id]: v }))}
                  options={branchList || []}
                  loading={branchList === null}
                  className="w-full"
                />
              </div>
            </div>
          </Modal>
        );
      })()}

      <Modal
        open={!!deleteState}
        onClose={() => setDeleteState(null)}
        title={
          deleteState?.type === 'workflow' ? 'Delete workflow?' : 'Delete secret?'
        }
        description={
          deleteState
            ? `“${deleteState.name}” will be permanently removed.`
            : ''
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteState(null)}>Cancel</Button>
            <Button variant="danger" leftIcon={Trash2} onClick={confirmDelete}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-text-muted">This action cannot be undone.</p>
      </Modal>
    </AppShell>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="relative overflow-hidden py-2 px-4 rounded-[var(--radius-md)] flex items-center gap-3 bg-surface/50 border border-border shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_4px_12px_-8px_rgba(0,0,0,0.5)] min-w-[140px] hover:border-brand-500/40 transition-colors group cursor-default">
      <div className="absolute inset-0 bg-gradient-to-tr from-brand-500/10 via-transparent to-info/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      <div className="relative z-10 text-[11px] font-semibold tracking-wider uppercase text-text-muted flex-1 transition-colors group-hover:text-text-faint">{label}</div>
      <div className="relative z-10 text-[15px] font-bold tracking-tight text-text drop-shadow-sm">{value}</div>
    </div>
  );
}
