import { useEffect, useRef, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import { DataProvider, useData } from './lib/store.jsx';
import { ACCENTS, THEMES, useTheme } from './lib/theme.jsx';
import { daysUntil } from './lib/dates.js';
import { Icon } from './icons.jsx';
import { InstallButton } from './lib/install.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Courses from './pages/Courses.jsx';
import Tasks from './pages/Tasks.jsx';
import Schedule from './pages/Schedule.jsx';
import Materials from './pages/Materials.jsx';
import Chat from './pages/Chat.jsx';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

/** Every page: address, sidebar label, icon, and the big header shown at the top */
const PAGES = [
  { to: '/', label: 'Dashboard', icon: 'home', emoji: '🧭', element: <Dashboard />,
    title: (u) => `${greeting()}, ${u.name.split(' ')[0]}`,
    sub: 'Here is what to study next, how your week is going, and what is due soon.' },
  { to: '/courses', label: 'Courses', icon: 'book', emoji: '📚', element: <Courses />,
    title: () => 'Courses', sub: 'Each course has a weekly study goal. See its tasks, hours and materials at a glance.' },
  { to: '/tasks', label: 'Assignments & Exams', icon: 'check', emoji: '📝', element: <Tasks />,
    title: () => 'Assignments & Exams', sub: 'Add each deadline and how many hours it needs. The assistant plans around them.' },
  { to: '/schedule', label: 'Study Schedule', icon: 'calendar', emoji: '🗓️', element: <Schedule />,
    title: () => 'Study Schedule', sub: 'Plan your study sessions for the week and tick them off when you finish.' },
  { to: '/materials', label: 'Materials', icon: 'clip', emoji: '📎', element: <Materials />,
    title: () => 'Materials', sub: 'Keep the files and links for every course in one place.' },
  { to: '/chat', label: 'Ask AI', icon: 'chat', emoji: '✨', logo: true, element: <Chat />,
    title: () => 'Ask AI', sub: 'Chat with an AI study coach that knows your courses, deadlines and study hours.' },
];

/** Popover with theme tiles and accent colors */
function ThemeMenu({ onClose }) {
  const { theme, accent, setTheme, setAccent } = useTheme();
  const ref = useRef();
  useEffect(() => {
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [onClose]);

  return (
    <div className="theme-menu" ref={ref} role="dialog" aria-label="Appearance">
      <p className="menu-label">Theme</p>
      <div className="theme-grid">
        {THEMES.map((t) => (
          <button key={t.id} type="button" className={`theme-tile ${theme === t.id ? 'on' : ''}`}
            onClick={() => setTheme(t.id)} aria-pressed={theme === t.id}>
            {t.id === 'system' ? (
              <span className="tile-preview split"><span /><span /></span>
            ) : (
              <span className="tile-preview" style={{ background: t.bg }}>
                <span className="tp-side" style={{ background: t.side }} />
                <span className="tp-line" style={{ background: t.fg }} />
                <span className="tp-line short" style={{ background: t.fg }} />
              </span>
            )}
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      <p className="menu-label">Accent</p>
      <div className="accent-row">
        {ACCENTS.map((a) => (
          <button key={a.id} type="button" className={`accent-dot ${accent === a.id ? 'on' : ''}`}
            style={{ '--dot': a.color }} onClick={() => setAccent(a.id)} aria-label={a.label} aria-pressed={accent === a.id} />
        ))}
      </div>
    </div>
  );
}

function Sidebar({ onNavigate }) {
  const { user, signOut } = useAuth();
  const { courses, tasks, recs } = useData();
  const [menu, setMenu] = useState(false);
  const dueSoon = tasks.filter((t) => !t.done && daysUntil(t.dueDate) >= 0 && daysUntil(t.dueDate) <= 7).length;
  const badge = { '/': recs.length, '/tasks': dueSoon };

  return (
    <aside className="sidebar">
      <div className="side-top">
        <div className="workspace">
          <span className="avatar">{user.name.trim()[0]?.toUpperCase() || '?'}</span>
          <div className="ws-text"><b>{user.name.split(' ')[0]}'s Study Space</b><span>{user.email}</span></div>
        </div>
        <button className="icon-btn only-mobile" type="button" onClick={onNavigate} aria-label="Close menu"><Icon name="close" /></button>
      </div>

      <nav className="side-nav">
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
        {menu && <ThemeMenu onClose={() => setMenu(false)} />}
        <InstallButton variant="side" />
        <button className="side-link" type="button" onClick={() => setMenu((m) => !m)} aria-expanded={menu}>
          <Icon name="palette" /><span>Appearance</span>
        </button>
        <button className="side-link" type="button" onClick={signOut}><Icon name="logout" /><span>Sign out</span></button>
      </div>
    </aside>
  );
}

function PageHeader() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const page = PAGES.find((p) => p.to === pathname) || PAGES[0];
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

function Shell() {
  const { loading } = useData();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [pathname]);

  return (
    <div className={`app ${open ? 'menu-open' : ''}`}>
      <Sidebar onNavigate={() => setOpen(false)} />
      <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />
      <div className="content">
        <div className="topbar">
          <button className="icon-btn" type="button" onClick={() => setOpen(true)} aria-label="Open menu"><Icon name="menu" /></button>
          <span className="topbar-title">Study Assistant</span>
        </div>
        {/* key: a new page animates in every time the address changes */}
        <main className="page" key={pathname}>
          <PageHeader />
          {loading ? <Skeleton /> : (
            <Routes>
              {PAGES.map((p) => <Route key={p.to} path={p.to} element={p.element} />)}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          )}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const { user, ready } = useAuth();
  if (!ready) return null;
  // Signed out: welcome page, sign in and sign up
  if (!user) {
    return (
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ForgotPassword />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }
  return <DataProvider key={user.id}><Shell /></DataProvider>;
}