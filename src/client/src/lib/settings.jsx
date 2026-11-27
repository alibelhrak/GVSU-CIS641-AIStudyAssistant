import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { api } from './api.js';
import { useAuth } from './auth.jsx';
import { ACCENTS, FONTS, SIZES, THEMES, loadFont, useTheme } from './theme.jsx';
import { LANGS, getLang, locale, setLang, t } from './i18n.jsx';
import { Icon } from '../icons.jsx';
import { DeleteAccount } from '../pages/Privacy.jsx';
import { CODE_THEMES } from './shiki.js';
import { AvatarPicker } from './avatar.jsx';

const SECTIONS = [
  { id: 'account', label: 'Account', icon: 'user' },
  { id: 'appearance', label: 'Appearance', icon: 'palette' },
  { id: 'region', label: 'Language & region', icon: 'globe' },
  { id: 'notifications', label: 'Notifications', icon: 'bell' },
  { id: 'data', label: 'Data & privacy', icon: 'shield' },
  { id: 'about', label: 'About', icon: 'info' },
];
const START_PAGES = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'chat', label: 'Ask AI' },
  { id: 'notes', label: 'Notes' },
  { id: 'schedule', label: 'Study Schedule' },
  { id: 'tasks', label: 'Assignments & Exams' },
];
const STORE_URL = 'https://apps.microsoft.com/detail/9PJZX6KSS8TH';
const REPO_URL = 'https://github.com/alibelhrak/GVSU-CIS641-AIStudyAssistant';
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const MOD = isMac ? '⌘' : 'Ctrl';

/** One labeled row: text on the left, control on the right */
function Row({ title, desc, children, stack = false }) {
  return (
    <div className={`set-row ${stack ? 'stack' : ''}`}>
      <div className="set-row-text"><b>{title}</b>{desc && <span>{desc}</span>}</div>
      <div className="set-row-control">{children}</div>
    </div>
  );
}
const Toggle = ({ on, onChange, label }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)}><span /></button>
);
function Segmented({ options, value, onChange, label }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} className={value === o.id ? 'on' : ''} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}
/** A short status line that disappears by itself */
function useFlash() {
  const [msg, setMsg] = useState(null);
  const timer = useRef();
  const flash = (text, kind = 'ok') => { setMsg({ text, kind }); clearTimeout(timer.current); timer.current = setTimeout(() => setMsg(null), 4000); };
  useEffect(() => () => clearTimeout(timer.current), []);
  const view = msg && <p className={`set-flash ${msg.kind}`} role="status">{msg.text}</p>;
  return [flash, view];
}

// ---------------- Account ----------------
function NameRow() {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user.name);
  const [flash, view] = useFlash();
  const save = async () => {
    const clean = name.replace(/\s+/g, ' ').trim();
    if (!clean || clean === user.name) { setName(user.name); return; }
    try { const r = await api.patch('/auth/me', { name: clean }); setUser(r.user); flash('Saved'); } catch (err) { flash(err.message, 'err'); setName(user.name); }
  };
  return (
    <Row title="Name" desc="Shown in the app and in your emails.">
      <input className="set-input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setName(user.name); }} data-no-translate />
      {view}
    </Row>
  );
}

function EmailRow() {
  const { user, setUser } = useAuth();
  const [step, setStep] = useState('idle');   // idle -> form -> code
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, view] = useFlash();
  const start = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await api.post('/auth/email/start', { email, password }); setStep('code'); setCode(''); flash('We sent a code to your new email.'); } catch (err) { flash(err.message, 'err'); } finally { setBusy(false); }
  };
  const confirm = async (e) => {
    e.preventDefault(); setBusy(true);
    try { const r = await api.post('/auth/email/confirm', { code }); setUser(r.user); setStep('idle'); setPassword(''); flash('Your email was changed.'); } catch (err) { flash(err.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <Row title="Email" desc={<span data-no-translate>{user.email}</span>} stack={step !== 'idle'}>
      {step === 'idle' && <button type="button" className="btn" onClick={() => setStep('form')}>Change email</button>}
      {step === 'form' && (
        <form className="set-form" onSubmit={start}>
          <label>New email<input className="set-input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
          <label>Your password<input className="set-input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
          <div className="set-actions">
            <button className="btn primary" type="submit" disabled={busy}>Send code</button>
            <button className="btn ghost" type="button" onClick={() => setStep('idle')}>Cancel</button>
          </div>
        </form>
      )}
      {step === 'code' && (
        <form className="set-form" onSubmit={confirm}>
          <label>Code sent to <span data-no-translate>{email}</span>
            <input className="set-input set-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" autoFocus />
          </label>
          <div className="set-actions">
            <button className="btn primary" type="submit" disabled={busy || code.length !== 6}>Confirm</button>
            <button className="btn ghost" type="button" onClick={() => setStep('form')}>Back</button>
          </div>
        </form>
      )}
      {view}
    </Row>
  );
}

function PasswordRow() {
  const { signIn } = useAuth();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ current: '', next: '', again: '' });
  const [busy, setBusy] = useState(false);
  const [flash, view] = useFlash();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault();
    if (f.next !== f.again) { flash('The new passwords do not match', 'err'); return; }
    setBusy(true);
    try { signIn(await api.post('/auth/password', { current: f.current, next: f.next })); setOpen(false); setF({ current: '', next: '', again: '' }); flash('Password changed. Other devices were signed out.'); } catch (err) { flash(err.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <Row title="Password" desc="Changing it signs you out on your other devices." stack={open}>
      {!open ? <button type="button" className="btn" onClick={() => setOpen(true)}>Change password</button> : (
        <form className="set-form" onSubmit={save}>
          <label>Current password<input className="set-input" type="password" required value={f.current} onChange={set('current')} autoComplete="current-password" /></label>
          <label>New password<input className="set-input" type="password" required minLength={8} value={f.next} onChange={set('next')} autoComplete="new-password" placeholder="At least 8 characters" /></label>
          <label>Confirm new password<input className="set-input" type="password" required minLength={8} value={f.again} onChange={set('again')} autoComplete="new-password" /></label>
          <div className="set-actions">
            <button className="btn primary" type="submit" disabled={busy}>Save password</button>
            <button className="btn ghost" type="button" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
      {view}
    </Row>
  );
}

function SessionsRow() {
  const { signIn, signOut } = useAuth();
  const [sure, setSure] = useState(false);
  const [flash, view] = useFlash();
  const all = async () => {
    try { signIn(await api.post('/auth/logout-all')); setSure(false); flash('Signed out of all other devices.'); } catch (err) { flash(err.message, 'err'); }
  };
  return (
    <>
      <Row title="Devices" desc="Lost a phone or used a shared computer? Sign out everywhere except here.">
        {!sure ? <button type="button" className="btn" onClick={() => setSure(true)}>Sign out of other devices</button> : (
          <div className="set-actions">
            <button type="button" className="btn primary" onClick={all}>Yes, sign them out</button>
            <button type="button" className="btn ghost" onClick={() => setSure(false)}>Cancel</button>
          </div>
        )}
        {view}
      </Row>
      <Row title="Sign out" desc="Sign out on this device.">
        <button type="button" className="btn" onClick={signOut}><Icon name="logout" size={15} /> Sign out</button>
      </Row>
    </>
  );
}

function Account() {
  const { user } = useAuth();
  const [flash, flashView] = useFlash();
  return (
    <>
      <div className="set-profile">
        <AvatarPicker flash={flash} />
        <div><b data-no-translate>{user.name}</b><span data-no-translate>{user.email}</span></div>
      </div>
      {flashView}
      <h3 className="set-h">Profile</h3>
      <NameRow />
      <EmailRow />
      <h3 className="set-h">Security</h3>
      <PasswordRow />
      <SessionsRow />
      <h3 className="set-h danger">Delete account</h3>
      <div className="set-danger"><DeleteAccount /></div>
    </>
  );
}

// ---------------- Appearance ----------------
export function ThemeTiles() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="theme-grid">
      {THEMES.map((th) => (
        <button key={th.id} type="button" className={`theme-tile ${theme === th.id ? 'on' : ''}`} onClick={() => setTheme(th.id)} aria-pressed={theme === th.id}>
          {th.id === 'system' ? <span className="tile-preview split"><span /><span /></span> : (
            <span className="tile-preview" style={{ background: th.bg }}>
              <span className="tp-side" style={{ background: th.side }} />
              <span className="tp-line" style={{ background: th.fg }} />
              <span className="tp-line short" style={{ background: th.fg }} />
            </span>
          )}
          <span>{th.label}</span>
        </button>
      ))}
    </div>
  );
}

function Appearance() {
  const { accent, setAccent, prefs, setPref } = useTheme();
  useEffect(() => { FONTS.forEach((f) => loadFont(f.id)); }, []);   // show each font in its own style
  return (
    <>
      <h3 className="set-h">Theme</h3>
      <ThemeTiles />
      <Row title="Accent color" desc="Buttons, links and highlights.">
        <div className="accent-row">
          {ACCENTS.map((a) => (
            <button key={a.id} type="button" className={`accent-dot ${accent === a.id ? 'on' : ''}`} style={{ '--dot': a.color }}
              onClick={() => setAccent(a.id)} aria-label={a.label} aria-pressed={accent === a.id} />
          ))}
        </div>
      </Row>
      <h3 className="set-h">Font</h3>
      <div className="font-grid">
        {FONTS.map((f) => (
          <button key={f.id} type="button" className={`font-card ${prefs.font === f.id ? 'on' : ''}`} onClick={() => setPref('font', f.id)} aria-pressed={prefs.font === f.id}>
            <span className="font-ag" style={{ fontFamily: f.family }} data-no-translate>Ag</span>
            <span>{f.label}</span>
          </button>
        ))}
      </div>
      <Row title="Text size" desc="Makes all text in the app bigger or smaller." stack>
        <Segmented label="Text size" options={SIZES} value={prefs.size} onChange={(v) => setPref('size', v)} />
      </Row>
      <p className="set-preview">The quick brown fox studies for the midterm.</p>
      <Row title="Code theme" desc="Colors of code blocks in your notes.">
        <select className="set-input" value={prefs.codeTheme} onChange={(e) => setPref('codeTheme', e.target.value)} aria-label="Code theme">
          {CODE_THEMES.map((th) => <option key={th.id} value={th.id}>{th.id === 'auto' ? t(th.label) : th.label}</option>)}
        </select>
      </Row>
      <Row title="AI code suggestions" desc="While you write code in a note, the AI suggests the rest in grey. Press Tab to accept.">
        <Toggle label="AI code suggestions" on={prefs.codeAI !== 'off'} onChange={(on) => setPref('codeAI', on ? 'on' : 'off')} />
      </Row>
      <Row title="Reduce motion" desc="Turns off animations and moving effects.">
        <Toggle label="Reduce motion" on={prefs.motion === 'reduce'} onChange={(on) => setPref('motion', on ? 'reduce' : 'system')} />
      </Row>
    </>
  );
}

// ---------------- Language & region ----------------
function localName(code) {
  try { return new Intl.DisplayNames([locale()], { type: 'language' }).of(code); } catch { return ''; }
}
function Region() {
  const { prefs, setPref } = useTheme();
  const current = getLang();
  const [busy, setBusy] = useState('');
  const [tz, setTz] = useState('');
  const [flash, view] = useFlash();
  const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const zones = useMemo(() => { try { return Intl.supportedValuesOf('timeZone'); } catch { return [device]; } }, [device]);
  useEffect(() => { api.get('/reminders/settings').then((r) => setTz(r.reminders?.timezone || '')).catch(() => {}); }, []);
  const saveTz = async (value) => {
    setTz(value);
    try { await api.put('/reminders/settings', { timezone: value }); flash('Saved'); } catch (err) { flash(err.message, 'err'); }
  };
  return (
    <>
      <h3 className="set-h">Language</h3>
      <div className="lang-grid" data-no-translate>
        {LANGS.map((l) => (
          <button key={l.code} type="button" className={`lang-card ${l.code === current ? 'on' : ''}`} disabled={Boolean(busy)}
            onClick={async () => { if (l.code === current) return; setBusy(l.code); await setLang(l.code); }} aria-pressed={l.code === current}>
            <b lang={l.code} dir={l.dir || 'ltr'}>{l.native}</b>
            <span>{localName(l.code)}</span>
            {busy === l.code ? <span className="lang-spin" /> : l.code === current && <Icon name="tick" size={16} className="lang-tick" />}
          </button>
        ))}
      </div>
      <h3 className="set-h">Region</h3>
      <Row title="Time zone" desc="Used for your reminders and due times." stack>
        <div className="set-actions">
          <select className="set-input" value={tz} onChange={(e) => saveTz(e.target.value)} aria-label="Time zone" data-no-translate>
            {tz && !zones.includes(tz) && <option value={tz}>{tz}</option>}
            {zones.map((z) => <option key={z} value={z}>{z.replaceAll('_', ' ')}</option>)}
          </select>
          {tz !== device && <button type="button" className="btn ghost" onClick={() => saveTz(device)}>Use this device's time zone</button>}
        </div>
        {view}
      </Row>
      <Row title="First day of the week" desc="For the Study Schedule.">
        <Segmented label="First day of the week" options={[{ id: 'mon', label: 'Monday' }, { id: 'sun', label: 'Sunday' }]} value={prefs.weekStart} onChange={(v) => setPref('weekStart', v)} />
      </Row>
      <Row title="Open the app on" desc="The page you see first.">
        <select className="set-input" value={prefs.startPage} onChange={(e) => setPref('startPage', e.target.value)} aria-label="Open the app on">
          {START_PAGES.map((p) => <option key={p.id} value={p.id}>{t(p.label)}</option>)}
        </select>
      </Row>
    </>
  );
}

// ---------------- Notifications ----------------
function Notifications({ onOpenReminders }) {
  return (
    <>
      <div className="set-callout">
        <span className="set-callout-icon"><Icon name="bell" size={20} /></span>
        <div>
          <b>Study reminders</b>
          <p>A morning plan, deadline alerts, a nudge before each session and a weekly report, by email or as notifications on this device.</p>
        </div>
      </div>
      <button type="button" className="btn primary" onClick={onOpenReminders}>Open reminder settings</button>
    </>
  );
}

// ---------------- Data & privacy ----------------
function DataPrivacy({ onClose }) {
  const [busy, setBusy] = useState(false);
  const [flash, view] = useFlash();
  const exportAll = async () => {
    setBusy(true);
    try { await api.download('/auth/me/export', `studypilot-export-${new Date().toISOString().slice(0, 10)}.json`); flash('Your data was downloaded.'); } catch (err) { flash(err.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <>
      <Row title="Export your data" desc="Download your courses, deadlines, sessions, study hours, notes and chats as one JSON file.">
        <button type="button" className="btn" onClick={exportAll} disabled={busy}><Icon name="download" size={15} /> {busy ? 'Preparing…' : 'Export'}</button>
        {view}
      </Row>
      <Row title="Privacy policy" desc="What the app stores, who handles it, and how to delete it.">
        <Link className="btn" to="/privacy" onClick={onClose}>Read</Link>
      </Row>
      <Row title="Terms of Service" desc="The agreement for using StudyPilot: your content, the rules, AI answers and what happens when they are broken.">
        <Link className="btn" to="/terms" onClick={onClose}>Read</Link>
      </Row>
      <Row title="Community guidelines" desc="The rules for shared pages, public links and study group chats, and how to report something.">
        <Link className="btn" to="/guidelines" onClick={onClose}>Read</Link>
      </Row>
      <div className="set-note">
        <Icon name="shield" size={16} />
        <p>No ads, no tracking, and nothing is sold. AI features send only what is needed to answer you.</p>
      </div>
    </>
  );
}

// ---------------- About ----------------
const CODE_KEYS = [
  [['Tab'], 'Accept the AI suggestion (or indent)'],
  [[MOD, '→'], 'Accept the next word of the suggestion'],
  [['Alt', '\\'], 'Ask the AI for a suggestion now'],
  [['Shift', 'Tab'], 'Outdent'],
  [[MOD, '/'], 'Comment or uncomment lines'],
  [['Alt', '↑ ↓'], 'Move lines up or down'],
  [['Shift', 'Alt', '↑ ↓'], 'Copy lines up or down'],
  [[MOD, 'Shift', 'K'], 'Delete the line'],
  [[MOD, 'Enter'], 'Run the code (Python, JavaScript, SQL, HTML), or a new line below'],
  [['Shift', 'Enter'], 'Leave the code block'],
  [[MOD, 'A'], 'Select all the code in the block'],
];

function About() {
  const keys = [
    [[MOD, ','], 'Open Settings'],
    [[MOD, '\\'], 'Hide or show the sidebar'],
    [[MOD, 'J'], 'Notes AI on a note'],
    [['/'], 'Insert a block in a note'],
    [['Enter'], 'Send a message in Ask AI'],
    [['Shift', 'Enter'], 'New line in a message'],
    [['Esc'], 'Close a window or menu'],
  ];
  return (
    <>
      <div className="set-about">
        <img src="/logo.png" alt="" width={56} height={56} />
        <div>
          <b data-no-translate>StudyPilot</b>
          <span>AI study planner · version 1.0</span>
          <span>Made by Ali Belhrak for CIS 641 at Grand Valley State University.</span>
        </div>
      </div>
      <div className="set-links">
        <a className="btn" href={STORE_URL} target="_blank" rel="noopener noreferrer"><Icon name="download" size={15} /> Microsoft Store</a>
        <a className="btn" href={REPO_URL} target="_blank" rel="noopener noreferrer"><Icon name="github" size={15} /> Source on GitHub</a>
      </div>
      <h3 className="set-h">Keyboard shortcuts</h3>
      <div className="set-keys">
        {keys.map(([combo, what]) => (
          <div key={what} className="set-key">
            <span>{what}</span>
            <span className="set-kbd" data-no-translate>{combo.map((k) => <kbd key={k}>{k}</kbd>)}</span>
          </div>
        ))}
      </div>
      <h3 className="set-h">In code blocks (like VS Code)</h3>
      <div className="set-keys">
        {CODE_KEYS.map(([combo, what]) => (
          <div key={what} className="set-key">
            <span>{what}</span>
            <span className="set-kbd" data-no-translate>{combo.map((k) => <kbd key={k}>{k}</kbd>)}</span>
          </div>
        ))}
      </div>
    </>
  );
}

/** The Settings window. On phones it shows the list first, then one section with a back button. */
function Settings({ onClose, onOpenReminders, start = 'account' }) {
  const [section, setSection] = useState(start);
  const [mobileList, setMobileList] = useState(true);
  const body = useRef(null);
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    document.body.classList.add('no-scroll');
    return () => { document.removeEventListener('keydown', esc); document.body.classList.remove('no-scroll'); };
  }, [onClose]);
  const go = (id) => { setSection(id); setMobileList(false); body.current?.scrollTo({ top: 0 }); };
  const info = SECTIONS.find((s) => s.id === section);

  return (
    <div className="set-overlay" onClick={onClose} role="presentation">
      <div className={`set-card ${mobileList ? 'show-list' : 'show-section'}`} role="dialog" aria-modal="true" aria-labelledby="set-title" onClick={(e) => e.stopPropagation()}>
        <nav className="set-nav" aria-label="Settings sections">
          <div className="set-nav-head">
            <h2 id="set-title">Settings</h2>
            <button type="button" className="icon-btn set-close-m" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
          </div>
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" className={`set-nav-item ${section === s.id ? 'on' : ''}`} onClick={() => go(s.id)} aria-current={section === s.id ? 'page' : undefined}>
              <Icon name={s.icon} size={17} /><span>{s.label}</span><Icon name="chevron" size={14} className="set-nav-chev" />
            </button>
          ))}
        </nav>
        <section className="set-main" ref={body}>
          <header className="set-main-head">
            <button type="button" className="icon-btn set-back" onClick={() => setMobileList(true)} aria-label="Back"><Icon name="back" /></button>
            <h2>{info.label}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
          </header>
          <div className="set-body" key={section}>
            {section === 'account' && <Account />}
            {section === 'appearance' && <Appearance />}
            {section === 'region' && <Region />}
            {section === 'notifications' && <Notifications onOpenReminders={onOpenReminders} />}
            {section === 'data' && <DataPrivacy onClose={onClose} />}
            {section === 'about' && <About />}
          </div>
        </section>
      </div>
    </div>
  );
}

export function SettingsPanel(props) {
  return createPortal(<Settings {...props} />, document.body);
}
