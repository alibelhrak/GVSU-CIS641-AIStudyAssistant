import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import { DataProvider, useData } from './lib/store.jsx';
import { useTheme } from './lib/theme.jsx';
import { api } from './lib/api.js';
import { SettingsPanel } from './lib/settings.jsx';
import { daysUntil } from './lib/dates.js';
import { Icon } from './icons.jsx';
import { InstallButton } from './lib/install.jsx';
import { RemindersPanel } from './lib/reminders.jsx';
import { getLang, chosenHere, setLang, t } from './lib/i18n.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import VerifyEmail from './pages/VerifyEmail.jsx';
import Privacy from './pages/Privacy.jsx';
import Guidelines from './pages/Guidelines.jsx';
import Terms from './pages/Terms.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Courses from './pages/Courses.jsx';
import Tasks from './pages/Tasks.jsx';
import Schedule from './pages/Schedule.jsx';
import Materials from './pages/Materials.jsx';
import Chat from './pages/Chat.jsx';
import { TrashPanel } from './lib/trash.jsx';
import { Avatar } from './lib/avatar.jsx';
import QuickFind from './pages/QuickFind.jsx';
import Inbox, { useInboxCount } from './pages/Inbox.jsx';
import { useResizable } from './lib/resize.jsx';

// The notes editor is big, so it loads only when Notes is opened
const Notes = lazy(() => import('./pages/Notes.jsx'));
const Groups = lazy(() => import('./pages/Groups.jsx'));
const PublicNote = lazy(() => import('./pages/PublicNote.jsx'));

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

/** Every page: address, sidebar label, icon, and the big header shown at the top */
const PAGES = [
  { to: '/', label: 'Dashboard', icon: 'home', emoji: '🧭', element: <Dashboard />,
    title: (u) => <>{greeting()}{', '}<span data-no-translate>{u.name.split(' ')[0]}</span></>,
    sub: 'Here is what to study next, how your week is going, and what is due soon.' },
  { to: '/courses', label: 'Courses', icon: 'book', emoji: '📚', element: <Courses />,
    title: () => 'Courses', sub: 'Each course has a weekly study goal. See its tasks, hours and materials at a glance.' },
  { to: '/tasks', label: 'Assignments & Exams', icon: 'check', emoji: '📝', element: <Tasks />,
    title: () => 'Assignments & Exams', sub: 'Add each deadline and how many hours it needs. The assistant plans around them.' },
  { to: '/schedule', label: 'Study Schedule', icon: 'calendar', emoji: '🗓️', element: <Schedule />,
    title: () => 'Study Schedule', sub: 'Plan your study sessions for the week and tick them off when you finish.' },
  { to: '/materials', label: 'Materials', icon: 'clip', emoji: '📎', element: <Materials />,
    title: () => 'Materials', sub: 'Keep the files and links for every course in one place.' },
  { to: '/notes', label: 'Notes', icon: 'note', emoji: '🗒️', bare: true, element: <Notes />, path: '/notes/:id?',
    title: () => 'Notes', sub: '' },
  { to: '/groups', label: 'Study groups', icon: 'users', emoji: '👥', element: <Groups />, path: '/groups/:id?',
    title: () => 'Study groups', sub: 'Plan with classmates: shared deadlines, pages you edit together and a group chat.' },
  { to: '/chat', label: 'Ask AI', icon: 'chat', emoji: '✨', logo: true, element: <Chat />,
    title: () => 'Ask AI', sub: 'Chat with an AI study coach that knows your courses, deadlines and study hours.' },
];

const SIDE_KEY = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘\\' : 'Ctrl+\\';
const FIND_KEY = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl+K';
const readHidden = () => { try { return localStorage.getItem('sa-sidebar') === 'hidden'; } catch { return false; } };

function Sidebar({ onNavigate, onSettings, onTrash, onHide, onLeave, onFind, onInbox, inboxCount }) {
  const { user } = useAuth();
  const { courses, tasks, recs } = useData();
  const dueSoon = tasks.filter((t) => !t.done && daysUntil(t.dueDate) >= 0 && daysUntil(t.dueDate) <= 7).length;
  const badge = { '/': recs.length, '/tasks': dueSoon };

  return (
    <aside className="sidebar" onMouseLeave={onLeave}>
      <div className="side-top">
        <button type="button" className="workspace" onClick={() => { onNavigate(); onSettings('account'); }} title="Account settings">
          <Avatar user={user} />
          <div className="ws-text"><b>{user.name.split(' ')[0]}'s Study Space</b><span>{user.email}</span></div>
        </button>
        <button className="icon-btn only-mobile" type="button" onClick={onNavigate} aria-label="Close menu"><Icon name="close" /></button>
        <button className="icon-btn side-hide" type="button" onClick={onHide} aria-label="Hide sidebar" title={`Hide sidebar (${SIDE_KEY})`}><Icon name="hideSide" size={17} /></button>
      </div>

      <nav className="side-nav">
        <button type="button" className="side-link side-find" onClick={() => { onNavigate(); onFind(); }} title="Quick Find">
          <Icon name="search" />
          <span>Search</span>
          <kbd className="side-kbd">{FIND_KEY}</kbd>
        </button>
        <button type="button" className="side-link side-inbox" onClick={() => { onNavigate(); onInbox(); }} title="Inbox: shares, mentions, comments and suggestions">
          <Icon name="bell" />
          <span>Inbox</span>
          {inboxCount > 0 && <span className="count unread">{inboxCount > 99 ? '99+' : inboxCount}</span>}
        </button>
        {PAGES.map((p) => (
          <NavLink key={p.to} to={p.to} end={p.to === '/'} onClick={onNavigate}
            className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}>
            <Icon name={p.icon} />
            <span>{p.label}</span>
            {badge[p.to] > 0 && <span className="count">{badge[p.to]}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="side-section">
        <p className="side-label">My courses</p>
        {courses.length === 0 && <p className="side-empty">No courses yet</p>}
        {courses.map((c) => (
          <NavLink key={c.id} to="/courses" onClick={onNavigate} className="side-course">
            <span className="dot" style={{ background: c.color }} /><span className="ellipsis">{c.code} · {c.name}</span>
          </NavLink>
        ))}
      </div>

      <div className="side-bottom">
        <InstallButton variant="side" />
        <button className="side-link" type="button" onClick={() => { onNavigate(); onTrash(); }}>
          <Icon name="trash" /><span>Trash</span>
        </button>
        <button className="side-link" type="button" onClick={() => { onNavigate(); onSettings('account'); }}>
          <Icon name="settings" /><span>Settings</span><kbd className="side-kbd" data-no-translate>{/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘,' : 'Ctrl+,'}</kbd>
        </button>
      </div>
    </aside>
  );
}

/** The page for an address: exact match, or a section like /notes/123 */
const pageFor = (pathname) => PAGES.find((p) => p.to === pathname)
  || PAGES.find((p) => p.to !== '/' && pathname.startsWith(`${p.to}/`)) || PAGES[0];

function PageHeader() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const page = pageFor(pathname);
  if (page.bare) return null;            // Notes shows its own title
  return (
    <div className="page-head">
      {page.logo
        ? <img className="page-emoji" src="/logo.png" alt="" width={52} height={52} style={{ display: 'block' }} />
        : <span className="page-emoji" aria-hidden="true">{page.emoji}</span>}
      <h1>{page.title(user)}</h1>
      <p className="muted">{page.sub}</p>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="view" aria-label="Loading">
      <div className="skeleton" style={{ height: 120 }} />
      <div className="grid2"><div className="skeleton" style={{ height: 320 }} /><div className="skeleton" style={{ height: 320 }} /></div>
    </div>
  );
}

const START = { chat: '/chat', notes: '/notes', schedule: '/schedule', tasks: '/tasks' };

/** Keep theme, font and other preferences on the account, so they follow the student to every device */
function usePrefsSync() {
  const { user, setUser } = useAuth();
  const { theme, accent, prefs, applyPrefs } = useTheme();
  const ready = useRef(false);
  useEffect(() => {
    if (user.prefs && Object.keys(user.prefs).length) applyPrefs(user.prefs);
    ready.current = true;
  }, [user.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!ready.current) return undefined;
    const mine = { theme, accent, ...prefs };
    if (Object.entries(mine).every(([k, v]) => user.prefs?.[k] === v)) return undefined;
    const timer = setTimeout(() => { api.patch('/auth/me', { prefs: mine }).then((r) => setUser(r.user)).catch(() => {}); }, 700);
    return () => clearTimeout(timer);
  }, [theme, accent, prefs]); // eslint-disable-line react-hooks/exhaustive-deps
}

function Shell() {
  const { loading, notify } = useData();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const { prefs } = useTheme();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(null);     // null, or the section to open
  const [reminders, setReminders] = useState(false);
  const [trash, setTrash] = useState(false);
  const [find, setFind] = useState(false);   // Quick Find (Ctrl+K)
  const [inboxOpen, setInboxOpen] = useState(false);
  const [inboxCount, setInboxCount] = useInboxCount();
  // The sidebar's width can be dragged (remembered on this device)
  const side = useResizable('sa-side-w', { initial: 252, min: 200, max: 420 });
  // Desktop: the sidebar can be hidden (remembered on this device); while hidden it can "peek" on hover
  const [hidden, setHidden] = useState(readHidden);
  const [peek, setPeek] = useState(false);
  const hide = (value) => {
    setHidden(value); setPeek(false);
    try { localStorage.setItem('sa-sidebar', value ? 'hidden' : 'shown'); } catch { /* private mode */ }
  };
  useEffect(() => { window.scrollTo({ top: 0 }); }, [pathname]);
  usePrefsSync();
  // Open on the page chosen in Settings (only when the app starts on the home address)
  useEffect(() => { if (pathname === '/' && !search && START[prefs.startPage]) navigate(START[prefs.startPage], { replace: true }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Coming back from Zoom (?zoom=linked|failed), or a link that opens a Settings section (?settings=apps)
  useEffect(() => {
    const q = new URLSearchParams(search);
    const zoom = q.get('zoom'); const section = q.get('settings');
    if (!zoom && !section) return;
    if (zoom) notify(zoom === 'linked' ? t('Zoom is linked. You can start meetings from your study groups.') : t('Zoom was not linked. Try again.'));
    if (section) setSettings(section);
    q.delete('zoom'); q.delete('settings');
    navigate({ pathname, search: q.toString() ? `?${q}` : '' }, { replace: true });
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps
  // Ctrl+, (or Cmd+,) opens Settings, like in most desktop apps
  useEffect(() => {
    const key = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === ',') { e.preventDefault(); setSettings((s) => (s ? null : 'account')); }
      // Quick Find: Ctrl+K (Cmd+K), or Ctrl+P. Inside a note's text, Ctrl+K stays "add a link", like in Notion.
      const k = e.key.toLowerCase();
      if ((k === 'k' && !e.target.closest?.('[contenteditable="true"]')) || (k === 'p' && !e.shiftKey)) { e.preventDefault(); setFind((f) => !f); }
      // Ctrl+\ hides or shows the sidebar, like in Notion
      if (e.key === '\\') { e.preventDefault(); setHidden((h) => { try { localStorage.setItem('sa-sidebar', h ? 'shown' : 'hidden'); } catch { /* ignore */ } return !h; }); setPeek(false); }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);

  return (
    <div className={`app ${open ? 'menu-open' : ''} ${hidden ? 'side-hidden' : ''} ${hidden && peek ? 'peek' : ''}`} style={{ '--side-w': `${side.width}px` }}>
      <Sidebar onNavigate={() => setOpen(false)} onSettings={setSettings} onTrash={() => setTrash(true)} onHide={() => hide(true)} onLeave={() => setPeek(false)} onFind={() => setFind(true)} onInbox={() => setInboxOpen(true)} inboxCount={inboxCount} />
      {!hidden && <div className={`side-resize ${side.dragging ? 'on' : ''}`} {...side.handleProps} aria-label="Resize the sidebar" />}
      {hidden && (
        <>
          <div className="side-edge" onMouseEnter={() => setPeek(true)} aria-hidden="true" />
          <button type="button" className="icon-btn side-open" onClick={() => hide(false)} onMouseEnter={() => setPeek(true)}
            aria-label="Show sidebar" title={`Show sidebar (${SIDE_KEY})`}><Icon name="sidebar" size={18} /></button>
        </>
      )}
      {settings && <SettingsPanel start={settings} onClose={() => setSettings(null)} onOpenReminders={() => { setSettings(null); setReminders(true); }} />}
      {reminders && <RemindersPanel onClose={() => setReminders(false)} />}
      {trash && <TrashPanel onClose={() => setTrash(false)} />}
      {find && <QuickFind pages={PAGES} onClose={() => setFind(false)} />}
      {inboxOpen && <Inbox onClose={() => setInboxOpen(false)} onRead={(d) => setInboxCount((n) => (d === 0 ? 0 : Math.max(0, n + d)))} />}
      <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />
      <div className="content">
        <div className="topbar">
          <button className="icon-btn" type="button" onClick={() => setOpen(true)} aria-label="Open menu"><Icon name="menu" /></button>
          <span className="topbar-title">Study Assistant</span>
        </div>
        {/* key: a new page animates in when the section changes (not when moving between notes) */}
        <main className={`page page-${pathname.split('/')[1] || 'home'} ${pageFor(pathname).bare ? 'page-wide' : ''}`} key={pathname.split('/')[1] || 'home'}>
          <PageHeader />
          {loading ? <Skeleton /> : (
            <Suspense fallback={<Skeleton />}>
              <Routes>
                {PAGES.map((p) => <Route key={p.to} path={p.path || p.to} element={p.element} />)}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          )}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const { user, ready } = useAuth();
  const { pathname } = useLocation();
  // Keep the language the same on every device: the account remembers it
  useEffect(() => {
    if (!user) return;
    if (!chosenHere() && user.language && user.language !== getLang()) setLang(user.language, { save: false });
    else if (user.language !== getLang()) setLang(getLang(), { reload: false });
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ready) return null;
  // The privacy policy (and account deletion) works signed in or out, outside the app's sidebar
  if (pathname === '/privacy') return <Privacy />;
  if (pathname === '/guidelines') return <Guidelines />;
  if (pathname === '/terms') return <Terms />;
  // A page shared to the web: readable by anyone, signed in or not
  if (pathname.startsWith('/p/')) return <Suspense fallback={null}><Routes><Route path="/p/:id" element={<PublicNote />} /></Routes></Suspense>;
  // Signed out: welcome page, sign in and sign up
  if (!user) {
    return (
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ForgotPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }
  return <DataProvider key={user.id}><Shell /></DataProvider>;
}