// src/lib/build.js
// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers for rendering build lists (used by the global Builds feed and
// the per-project builds tab). Keeping these in one place avoids the duplicated
// relativeTime / date-grouping logic that previously lived inline in each page.
// ─────────────────────────────────────────────────────────────────────────────
import { Apple, Smartphone, FileCode2 } from 'lucide-react';

// Statuses that mean a build is still in-flight (worth polling for updates).
export const ACTIVE_STATUSES = [
  'pending', 'running',
  'pending_deploy', 'deploying',
  'pending_testflight', 'deploying_testflight',
];

export const isActiveBuild = (b) => ACTIVE_STATUSES.includes(b.status);

// A build can be cancelled while it is still in-flight (queued, running, or
// deploying) — mirrors the backend abort WHERE clause.
export const isCancellable = (b) => ACTIVE_STATUSES.includes(b?.status);

export const platformIcon = (p) =>
  p === 'ios' ? Apple : p === 'android' ? Smartphone : FileCode2;

export function relativeTime(dt) {
  if (!dt) return '—';
  const d = new Date(dt);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Human duration between two timestamps. For an unfinished build, pass no
// `finishedAt` and it measures up to now (call site re-renders for "live" ticking).
export function formatDuration(startedAt, finishedAt) {
  if (!startedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  let secs = Math.max(0, Math.round((end - start) / 1000));
  const h = Math.floor(secs / 3600);
  secs -= h * 3600;
  const m = Math.floor(secs / 60);
  secs -= m * 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${secs}s`;
  return `${secs}s`;
}

export function dateLabel(dt) {
  return new Date(dt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Group builds (already sorted DESC by created_at) into day buckets in a single
// pass: [{ label, builds: [...] }]. Replaces the old O(n²) per-row re-filter.
export function groupBuildsByDate(builds) {
  const groups = [];
  let current = null;
  for (const b of builds) {
    const label = dateLabel(b.created_at);
    if (!current || current.label !== label) {
      current = { label, builds: [] };
      groups.push(current);
    }
    current.builds.push(b);
  }
  return groups;
}

// Merge a freshly-fetched head page into an existing list: update statuses of
// builds we already have, and prepend any brand-new builds. Used while polling
// so active builds update in place without discarding already-loaded pages.
export function mergeHead(prev, head) {
  const byId = new Map(prev.map((b) => [b.id, b]));
  const fresh = [];
  for (const b of head) {
    if (byId.has(b.id)) byId.set(b.id, { ...byId.get(b.id), ...b });
    else fresh.push(b);
  }
  const updated = prev.map((b) => byId.get(b.id) || b);
  return [...fresh, ...updated];
}
