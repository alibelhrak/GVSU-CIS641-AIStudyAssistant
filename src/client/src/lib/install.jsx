import { createPortal } from 'react-dom';
/**
 * "Download app": installs the website as an app on the computer or phone.
 *
 * Chrome and Edge (Windows, Mac, Chromebook, Android) fire a `beforeinstallprompt` event when the
 * app can be installed; we keep it and show the browser's own Install window when the button is
 * clicked. Safari, Firefox and iPhone have no such event, so the button shows short instructions.
 */
import { useEffect, useState } from 'react';
import { Icon } from '../icons.jsx';

let saved = null;                 // the browser's install prompt, kept for later
let justInstalled = false;
const listeners = new Set();
const changed = () => listeners.forEach((fn) => fn());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); saved = e; changed(); });
  window.addEventListener('appinstalled', () => { saved = null; justInstalled = true; changed(); });
}

const isStandalone = () => typeof window !== 'undefined'
  && (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true);

/** Which instructions to show when there is no one-click install */
function platform() {
  const ua = navigator.userAgent;
  const iPad = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/.test(ua) || iPad) return 'ios';
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Edg\//.test(ua)) return 'edge';
  if (/Chrome\//.test(ua)) return /Android/.test(ua) ? 'android' : 'chrome';
  if (/Safari\//.test(ua) && /Macintosh/.test(ua)) return 'mac-safari';
  return 'other';
}

const STEPS = {
  ios: ['Open this site in Safari.', 'Tap the Share button (the square with an arrow).', 'Tap "Add to Home Screen", then "Add".'],
  'mac-safari': ['In the menu bar, click File.', 'Click "Add to Dock…", then "Add".', 'Open Study Assistant from the Dock or Launchpad.'],
  edge: ['Click the ⋯ menu at the top right of Edge.', 'Choose Apps → "Install this site as an app".', 'Click Install. Tick "Pin to taskbar" if you like.'],
  chrome: ['Click the ⋮ menu at the top right of Chrome.', 'Choose "Cast, save, and share" → "Install page as app…".', 'Click Install.'],
  android: ['Tap the ⋮ menu at the top right of Chrome.', 'Tap "Install app" (or "Add to Home screen").', 'Tap Install.'],
  firefox: ['Firefox cannot install web apps.', 'Open this site in Chrome or Edge.', 'Click "Download app" again there.'],
  other: ['Open this site in Chrome or Edge.', 'Click "Download app" again there.'],
};

export function useInstall() {
  const [, render] = useState(0);
  useEffect(() => {
    const fn = () => render((n) => n + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);
  return {
    installed: isStandalone() || justInstalled,
    oneClick: Boolean(saved),
    /** Shows the browser's Install window. Returns false when the browser has none. */
    async prompt() {
      if (!saved) return false;
      const event = saved;
      saved = null;
      event.prompt();
      await event.userChoice.catch(() => null);
      changed();
      return true;
    },
  };
}

function InstallHelp({ onClose }) {
  const kind = platform();
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  // on document.body, so it stays centered even inside animated sections
  return createPortal(
    <div className="install-overlay" onClick={onClose} role="presentation">
      <div className="install-card" role="dialog" aria-modal="true" aria-labelledby="install-title" onClick={(e) => e.stopPropagation()}>
        <img src="/logo.png" alt="" width={56} height={56} />
        <h2 id="install-title">Get the Study Assistant app</h2>
        <p className="muted">It opens in its own window, with an icon on your {kind === 'ios' || kind === 'android' ? 'home screen' : 'taskbar or Dock'}.</p>
        <ol className="install-steps">
          {STEPS[kind].map((s) => <li key={s}>{s}</li>)}
        </ol>
        <button className="btn primary block" type="button" onClick={onClose} autoFocus>Got it</button>
      </div>
    </div>,
    document.body,
  );
}

/** The "Download app" button. `variant` is 'nav' (welcome page), 'side' (sidebar) or 'inline' (a text link with `children`). */
export function InstallButton({ variant = 'nav', children }) {
  const { installed, prompt } = useInstall();
  const [help, setHelp] = useState(false);
  if (installed) return variant === 'inline' ? <span className="where-on">{children}</span> : null;
  const click = async () => { if (!(await prompt())) setHelp(true); };
  return (
    <>
      {variant === 'inline' ? (
        <button className="where-link" type="button" onClick={click} title="Install Study Assistant on this device">{children}</button>
      ) : variant === 'side' ? (
        <button className="side-link" type="button" onClick={click}><Icon name="download" /><span>Download app</span></button>
      ) : (
        <button className="btn install-btn" type="button" onClick={click} title="Install Study Assistant on this device">
          <Icon name="download" size={16} /><span>Download app</span>
        </button>
      )}
      {help && <InstallHelp onClose={() => setHelp(false)} />}
    </>
  );
}

/** Saving the app on each kind of device, shown while the phone apps are not in the stores yet */
const SAVE_GUIDES = [
  { id: 'ios', icon: 'monitor', title: 'iPhone and iPad', steps: ['Open this site in Safari.', 'Tap the Share button (the square with an arrow).', 'Tap "Add to Home Screen", then "Add".'] },
  { id: 'android', icon: 'monitor', title: 'Android', steps: ['Open this site in Chrome.', 'Tap the ⋮ menu at the top right.', 'Tap "Install app" (or "Add to Home screen"), then Install.'] },
  { id: 'pc', icon: 'monitor', title: 'Windows, Mac and Chromebook', steps: ['Open this site in Chrome or Edge.', 'Click "Download app" at the top of this page (or the install icon in the address bar).', 'Click Install. On Windows you can also get it from the Microsoft Store.'] },
];
const guideFor = () => { const k = platform(); return k === 'ios' || k === 'mac-safari' ? (k === 'ios' ? 'ios' : 'pc') : k === 'android' ? 'android' : 'pc'; };

function PhoneSoon({ onClose }) {
  const { installed, oneClick, prompt } = useInstall();
  const [tab, setTab] = useState(guideFor);
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  const guide = SAVE_GUIDES.find((g) => g.id === tab);
  return createPortal(
    <div className="install-overlay" onClick={onClose} role="presentation">
      <div className="install-card soon-card" role="dialog" aria-modal="true" aria-labelledby="soon-title" onClick={(e) => e.stopPropagation()}>
        <div className="soon-head">
          <img src="/logo.png" alt="" width={48} height={48} />
          <span className="soon-badge">Coming soon</span>
        </div>
        <h2 id="soon-title">Phone apps are on the way</h2>
        <p className="muted">The App Store and Google Play versions are coming soon. Until then, save the app to your phone or computer: it opens full screen with its own icon, just like an installed app, and updates by itself.</p>
        <div className="soon-tabs" role="tablist" aria-label="Your device">
          {SAVE_GUIDES.map((g) => (
            <button key={g.id} type="button" role="tab" aria-selected={tab === g.id} className={tab === g.id ? 'on' : ''} onClick={() => setTab(g.id)}>{g.title}</button>
          ))}
        </div>
        <ol className="install-steps" key={tab}>
          {guide.steps.map((s) => <li key={s}>{s}</li>)}
        </ol>
        {installed ? <p className="soon-done"><Icon name="check" size={15} /> The app is already saved on this device.</p> : oneClick && (
          <button className="btn primary block" type="button" onClick={async () => { await prompt(); onClose(); }}><Icon name="download" size={16} /> Install on this device now</button>
        )}
        <button className={`btn block ${oneClick && !installed ? '' : 'primary'}`} type="button" onClick={onClose} autoFocus>Got it</button>
      </div>
    </div>,
    document.body,
  );
}

/** "Phone app · Coming soon" on the welcome page: opens how to save the app for now */
export function PhoneSoonLink() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="where-link" type="button" onClick={() => setOpen(true)} title="Phone apps are coming soon. See how to save the app now.">
        <Icon name="download" size={15} /> Phone app <span className="soon-chip">Coming soon</span>
      </button>
      {open && <PhoneSoon onClose={() => setOpen(false)} />}
    </>
  );
}
