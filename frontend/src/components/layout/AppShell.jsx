import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutGrid, Boxes, LogOut, Zap, Sun, Moon, Search, Bell, Rocket, FileText, LifeBuoy, Loader2, FolderGit2, Play, Layers } from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../lib/cn';
const navItems = [
  { to: '/dashboard', label: 'Projects', icon: LayoutGrid },
  { to: '/builds', label: 'Builds', icon: Boxes },
  { to: '/architect', label: 'Architect', icon: Layers },
];

export function AppShell({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isBuildDetail = location.pathname.match(/^\/builds\/[a-f0-9-]+$/i);

  const [theme, setTheme] = useState(
    localStorage.getItem('theme') || 'dark'
  );
  const [search, setSearch] = useState('');
  const searchRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const [searchResults, setSearchResults] = useState({ projects: [], builds: [] });
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (search.length >= 2) {
        setIsSearching(true);
        try {
          const res = await api.get(`/api/search?q=${encodeURIComponent(search)}`);
          setSearchResults(res.data);
          setShowDropdown(true);
        } catch (err) {
          console.error('Search failed', err);
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchResults({ projects: [], builds: [] });
        setShowDropdown(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [search]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex">
      {/* ===== Sidebar ===== */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col bg-surface-2/30 border-r border-border sticky top-0 h-screen">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-6 h-14 border-b border-border/50 shrink-0">
          <div className="flex-1">
            <div className="text-xl font-black tracking-tight text-text leading-none">Inhouse-Bitrise</div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-brand-400 mt-0.5">CI/CD Platform</div>
          </div>
        </div>

        <nav className="flex-1 p-3 flex flex-col gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-3 px-3 py-2 rounded-[var(--radius-md)] text-sm font-medium transition-colors',
                  isActive
                    ? 'text-text bg-surface-2'
                    : 'text-text-muted hover:text-text hover:bg-surface-2/60'
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="activeNav"
                      className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-gradient-to-b from-brand-400 to-info shadow-[0_0_12px_rgba(124,58,237,0.7)]"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                  <item.icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto px-3 pt-4 border-t border-border space-y-1 pb-3">
          <a
            href="#"
            target="_blank"
            rel="noreferrer"
            className="group flex items-center gap-3 py-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted hover:bg-surface-2 hover:text-text transition-all rounded-[var(--radius-md)]"
          >
            <FileText className="w-[18px] h-[18px] group-hover:translate-x-1 transition-transform" />
            <span className="group-hover:translate-x-1 transition-transform">Docs</span>
          </a>
          <a
            href="#"
            target="_blank"
            rel="noreferrer"
            className="group flex items-center gap-3 py-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted hover:bg-surface-2 hover:text-text transition-all rounded-[var(--radius-md)]"
          >
            <LifeBuoy className="w-[18px] h-[18px] group-hover:translate-x-1 transition-transform" />
            <span className="group-hover:translate-x-1 transition-transform">Support</span>
          </a>

          <div className="flex items-center gap-2.5 px-2 py-2 mt-2 rounded-[var(--radius-md)] bg-surface-2/40 border border-border hover:border-brand-500/30 transition-colors">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-xs font-bold shadow-[0_2px_10px_-2px_rgba(124,58,237,0.5)]">
              {user?.name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-text truncate leading-tight">{user?.name || 'User'}</div>
              <div className="font-mono text-[10px] text-text-faint truncate">{user?.email}</div>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-md text-text-faint hover:text-danger hover:bg-danger/10 transition-colors"
              aria-label="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ===== Main area with top bar ===== */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* ── Top bar ── */}
        {!isBuildDetail && (
          <header className="sticky top-0 z-30 h-14 bg-surface-2/30 backdrop-blur-md border-b border-border/50 flex items-center justify-end gap-2 px-4 sm:px-6">
          {/* Search */}
          <div ref={searchRef} className="relative flex-1 max-w-xs mr-auto">
            {isSearching ? (
              <Loader2 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-500 animate-spin pointer-events-none" />
            ) : (
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-faint pointer-events-none" />
            )}
            <input
              value={search}
              onFocus={() => {
                if (search.length >= 2) setShowDropdown(true);
              }}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects, builds…"
              className="w-full bg-surface-2 border border-border rounded-full py-2 pl-9 pr-4 text-sm text-text placeholder:text-text-faint focus:outline-none focus:border-brand-500/60 focus:ring-1 focus:ring-brand-500/30 transition-all"
            />
            
            {/* Search Dropdown */}
            <AnimatePresence>
              {showDropdown && (searchResults.projects?.length > 0 || searchResults.builds?.length > 0) && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 5, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-[calc(100%+8px)] left-0 w-full md:w-[400px] bg-surface border border-border rounded-[var(--radius-lg)] shadow-xl overflow-hidden z-50 flex flex-col max-h-[70vh]"
                >
                  <div className="overflow-y-auto p-2">
                    {searchResults.projects?.length > 0 && (
                      <div className="mb-3">
                        <div className="px-3 py-1.5 text-[10px] font-bold tracking-wider uppercase text-text-faint">Projects</div>
                        <div className="flex flex-col gap-1">
                          {searchResults.projects.map(p => (
                            <button
                              key={p.id}
                              onClick={() => {
                                setShowDropdown(false);
                                setSearch('');
                                navigate(`/projects/${p.id}`);
                              }}
                              className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-surface-2 text-left group transition-colors"
                            >
                              <div className="w-7 h-7 rounded bg-brand-500/10 flex items-center justify-center text-brand-500 shrink-0">
                                <FolderGit2 className="w-3.5 h-3.5" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium text-text truncate group-hover:text-brand-400 transition-colors">{p.name}</div>
                                {p.description && <div className="text-[10px] text-text-muted truncate">{p.description}</div>}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {searchResults.builds?.length > 0 && (
                      <div>
                        <div className="px-3 py-1.5 text-[10px] font-bold tracking-wider uppercase text-text-faint">Recent Builds</div>
                        <div className="flex flex-col gap-1">
                          {searchResults.builds.map(b => (
                            <button
                              key={b.id}
                              onClick={() => {
                                setShowDropdown(false);
                                setSearch('');
                                navigate(`/builds/${b.id}`);
                              }}
                              className="flex items-center justify-between gap-3 px-3 py-2 rounded-md hover:bg-surface-2 text-left group transition-colors"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-7 h-7 rounded bg-surface-3 flex items-center justify-center text-text-muted shrink-0 group-hover:text-text transition-colors">
                                  <Play className="w-3.5 h-3.5" />
                                </div>
                                <div className="min-w-0">
                                  <div className="text-sm font-medium text-text truncate group-hover:text-brand-400 transition-colors">#{b.build_number} · {b.project_name}</div>
                                  <div className="text-[10px] text-text-muted truncate">{b.workflow_name || 'Manual'} ({b.branch})</div>
                                </div>
                              </div>
                              <div className={`w-2 h-2 rounded-full shrink-0 ${
                                b.status === 'success' ? 'bg-success' :
                                b.status === 'failed' ? 'bg-danger' :
                                b.status === 'running' ? 'bg-brand-500 animate-pulse' :
                                'bg-text-faint'
                              }`} />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Bell */}
          <button
            onClick={() => navigate('/builds')}
            className="grid place-items-center w-9 h-9 rounded-full text-text-muted hover:text-brand-400 hover:bg-surface-2 transition-colors"
            aria-label="Activity"
          >
            <Bell className="w-5 h-5" />
          </button>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="grid place-items-center w-9 h-9 rounded-full text-text-muted hover:text-brand-400 hover:bg-surface-2 transition-colors"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

        </header>
        )}

        {/* ── Page content ── */}
        <main className="flex-1 flex flex-col">
          {children}
        </main>
      </div>
    </div>
  );
}

export default AppShell;
