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
  return (
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
    </div>
  );
}

/** The "Download app" button. `variant` is 'nav' (welcome page) or 'side' (sidebar). */
export function InstallButton({ variant = 'nav' }) {
  const { installed, prompt } = useInstall();
  const [help, setHelp] = useState(false);
  if (installed) return null;
  const click = async () => { if (!(await prompt())) setHelp(true); };
  return (
    <>
      {variant === 'side' ? (
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
