/**
 * Reminders: which reminders to get (morning summary, deadlines, study sessions, weekly progress),
 * and where (email, and push notifications on this phone or computer).
 * Push needs the service worker (the online/installed app); on iPhone, the app must be added to the Home Screen first.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from './api.js';
import { useData } from './store.jsx';
import { useAuth } from './auth.jsx';
import { Icon } from '../icons.jsx';
import { locale } from './i18n.jsx';

const TYPES = [
  { key: 'daily', title: 'Morning summary', text: 'Your top priorities, what is due today and tomorrow, and today\'s study sessions.', icon: '☀️' },
  { key: 'deadlines', title: 'Deadline alerts', text: 'The morning before something is due, and on the day itself.', icon: '⏰' },
  { key: 'sessions', title: 'Study session alerts', text: 'A reminder 15 to 30 minutes before a planned study session.', icon: '📚' },
  { key: 'weekly', title: 'Weekly progress', text: 'Sunday evening: hours studied against each goal, and the week ahead.', icon: '📈' },
];

const hourLabel = (h) => new Date(2000, 0, 1, h).toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' });
const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

function keyBytes(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function swRegistration() {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 3000))]);
  return reg || null;
}

function deviceName() {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'Device';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return `${os}${br ? ` · ${br}` : ''}`;
}

function Switch({ on, onChange, label, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled}
      className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)}><span /></button>
  );
}

/** Shown above everything (the sidebar on phones moves, which would carry the window with it) */
export function RemindersPanel(props) {
  return createPortal(<Reminders {...props} />, document.body);
}

function Reminders({ onClose }) {
  const { notify } = useData();
  const { user } = useAuth();
  const [s, setS] = useState(null);
  const [here, setHere] = useState(false);          // this device gets push notifications
  const [busy, setBusy] = useState('');
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    api.get('/reminders/settings').then((data) => {
      setS(data);
      if (tz && data.reminders.timezone !== tz) api.put('/reminders/settings', { timezone: tz }).then(setS).catch(() => {});
    }).catch((err) => notify(err.message));
    swRegistration().then((reg) => reg?.pushManager?.getSubscription()).then((sub) => setHere(Boolean(sub))).catch(() => {});
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (patch) => {
    setS((v) => ({ ...v, reminders: { ...v.reminders, ...patch } }));
    try { setS(await api.put('/reminders/settings', { ...patch, timezone: tz })); } catch (err) { notify(err.message); }
  };

  const pushHere = async () => {
    setBusy('push');
    try {
      if (isIos() && !standalone()) throw new Error('On iPhone, first add the app to your Home Screen (Share → Add to Home Screen), then open it from there and turn this on.');
      if (!('Notification' in window) || !('PushManager' in window)) throw new Error('This browser cannot show notifications. Try Chrome, Edge, or the installed app.');
      const reg = await swRegistration();
      if (!reg) throw new Error('Notifications work in the online app (not on this test server). Open the live site or the installed app.');
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') throw new Error('Notifications are blocked. Allow them for this site in your browser or phone settings, then try again.');
      const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(s.publicKey) });
      const out = await api.post('/reminders/devices', { subscription: sub.toJSON(), device: deviceName() });
      setHere(true);
      setS((v) => ({ ...v, devices: out.devices }));
      if (!s.reminders.push) await save({ push: true });
      notify('Notifications are on for this device');
    } catch (err) {
      notify(err.message);
    } finally { setBusy(''); }
  };

  const pushOff = async () => {
    setBusy('push');
    try {
      const reg = await swRegistration();
      const sub = await reg?.pushManager?.getSubscription();
      if (sub) { await api.del('/reminders/devices', { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); }
      setHere(false);
      notify('Notifications are off for this device');
    } catch (err) { notify(err.message); } finally { setBusy(''); }
  };

  const test = async () => {
    setBusy('test');
    try {
      const out = await api.post('/reminders/test', {});
      notify(out.email || out.push ? `Test sent${out.email ? ' by email' : ''}${out.email && out.push ? ' and' : ''}${out.push ? ` to ${out.push} device${out.push > 1 ? 's' : ''}` : ''}` : 'Nothing to send to: turn on email or notifications first');
    } catch (err) { notify(err.message); } finally { setBusy(''); }
  };

  const any = s && TYPES.some((t) => s.reminders[t.key]);
  return (
    <div className="install-overlay" onClick={onClose} role="presentation">
      <div className="rem-card" role="dialog" aria-modal="true" aria-labelledby="rem-title" onClick={(e) => e.stopPropagation()}>
        <div className="rem-head">
          <span className="rem-bell"><Icon name="bell" size={20} /></span>
          <div><h2 id="rem-title">Reminders</h2><p className="muted">Never miss a deadline or a study session.</p></div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
        </div>
        {!s ? <div className="chat-loading"><span className="thinking"><i /><i /><i /></span></div> : (
          <>
            <div className="rem-list">
              {TYPES.map((t, k) => (
                <div key={t.key} className="rem-row" style={{ animationDelay: `${k * 0.05}s` }}>
                  <span className="rem-emoji">{t.icon}</span>
                  <span className="rem-text"><b>{t.title}</b><span>{t.text}</span>
                    {t.key === 'daily' && s.reminders.daily && (
                      <label className="rem-time">at <select value={s.reminders.hour} onChange={(e) => save({ hour: Number(e.target.value) })}>
                        {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
                      </select></label>
                    )}
                  </span>
                  <Switch on={s.reminders[t.key]} label={t.title} onChange={(v) => save({ [t.key]: v })} />
                </div>
              ))}
            </div>

            <p className="rem-sub">Send them to</p>
            <div className="rem-list">
              <div className="rem-row">
                <span className="rem-emoji">✉️</span>
                <span className="rem-text"><b>Email</b><span>{s.mailReady ? user?.email : 'Email is not set up on the server yet.'}</span></span>
                <Switch on={s.reminders.email && s.mailReady} disabled={!s.mailReady} label="Email" onChange={(v) => save({ email: v })} />
              </div>
              <div className="rem-row">
                <span className="rem-emoji">🔔</span>
                <span className="rem-text"><b>Notifications on this device</b>
                  <span>{!s.pushReady ? 'Push notifications are not set up on the server yet.'
                    : here ? `On for this device${s.devices > 1 ? ` (and ${s.devices - 1} other${s.devices > 2 ? 's' : ''})` : ''}.`
                      : isIos() && !standalone() ? 'On iPhone, add the app to your Home Screen first.' : 'Pop-up reminders on this phone or computer.'}</span>
                </span>
                {here
                  ? <button className="btn sm" type="button" onClick={pushOff} disabled={busy === 'push'}>Turn off</button>
                  : <button className="btn sm primary" type="button" onClick={pushHere} disabled={!s.pushReady || busy === 'push'}>{busy === 'push' ? '…' : 'Turn on'}</button>}
              </div>
            </div>

            <div className="rem-foot">
              <span className="muted">Times use your time zone: {s.reminders.timezone || tz}</span>
              <button className="btn sm" type="button" onClick={test} disabled={busy === 'test' || !any && !here}>{busy === 'test' ? 'Sending…' : 'Send me a test'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
