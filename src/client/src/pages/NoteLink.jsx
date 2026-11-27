import { useEffect, useRef, useState } from 'react';
import { useExtension } from '@blocknote/react';
import { LinkToolbarExtension } from '@blocknote/core/extensions';
import { t } from '../lib/i18n.jsx';
import { Icon } from '../icons.jsx';

const SAFE = /^(https?:|mailto:|tel:)/i;
/** "github.com/x" → "https://github.com/x"; anything that isn't a web, email or phone link is refused */
export function cleanUrl(raw) {
  let url = String(raw || '').trim();
  if (!url) return '';
  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(url)) url = `mailto:${url}`;
  else if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) url = `https://${url}`;
  return SAFE.test(url) ? url : '';
}
/** How a link is shown: "github.com/alibelhrak/CelloSyncra" */
function pretty(url) {
  try {
    const u = new URL(url);
    if (u.protocol === 'mailto:' || u.protocol === 'tel:') return url.replace(/^(mailto|tel):/, '');
    return `${u.hostname.replace(/^www\./, '')}${u.pathname === '/' ? '' : u.pathname}${u.search}`;
  } catch { return url; }
}

/**
 * The toolbar on a link in Notes (replaces BlockNote's): the address with Open, Copy, Edit and Remove,
 * and an edit form with the address and the text shown.
 */
export default function NoteLinkToolbar({ url, text, range, setToolbarOpen, setToolbarPositionFrozen }) {
  const { editLink, deleteLink } = useExtension(LinkToolbarExtension);
  const [editing, setEditing] = useState(false);
  const [href, setHref] = useState(url);
  const [label, setLabel] = useState(text);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const first = useRef(null);
  useEffect(() => { setHref(url); setLabel(text); setError(''); }, [url, text]);
  useEffect(() => { if (editing) setTimeout(() => first.current?.select(), 0); }, [editing]);

  const startEdit = () => { setEditing(true); setToolbarPositionFrozen?.(true); };
  const stopEdit = () => { setEditing(false); setError(''); setHref(url); setLabel(text); setToolbarPositionFrozen?.(false); };
  const close = () => { setToolbarOpen?.(false); setToolbarPositionFrozen?.(false); };
  const save = (e) => {
    e.preventDefault();
    const clean = cleanUrl(href);
    if (!clean) { setError(t('Enter a web address (https://…), an email or a phone number.')); return; }
    editLink(clean, label.trim() || pretty(clean), range.from);
    setEditing(false); close();
  };
  const remove = () => { deleteLink(range.from); setEditing(false); close(); };
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* the address is selectable */ }
  };

  if (editing) {
    return (
      <form className="nl-card nl-edit" onSubmit={save} onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopEdit(); } }}>
        <label className="nl-field">
          <span>Link</span>
          <div className="nl-input"><Icon name="link" size={14} /><input ref={first} value={href} onChange={(e) => { setHref(e.target.value); setError(''); }} placeholder="https://…" aria-label="Link address" spellCheck={false} data-no-translate /></div>
        </label>
        <label className="nl-field">
          <span>Text</span>
          <div className="nl-input"><Icon name="text" size={14} /><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('Text to show')} aria-label="Link text" data-no-translate /></div>
        </label>
        {error && <p className="nl-error">{error}</p>}
        <div className="nl-actions">
          <button type="button" className="nl-btn danger" onClick={remove}><Icon name="unlink" size={14} /> Remove link</button>
          <span className="nl-gap" />
          <button type="button" className="nl-btn" onClick={stopEdit}>Cancel</button>
          <button type="submit" className="nl-btn primary">Save</button>
        </div>
      </form>
    );
  }

  return (
    <div className="nl-card nl-bar">
      <a className="nl-url" href={url} target="_blank" rel="noopener noreferrer" title={url} data-no-translate>
        <Icon name={/^mailto:/i.test(url) ? 'mail' : 'globe'} size={14} /><span>{pretty(url)}</span>
      </a>
      <span className="nl-sep" />
      <button type="button" className="nl-icon" onClick={copy} title={copied ? t('Copied') : t('Copy link')} aria-label="Copy link"><Icon name={copied ? 'tick' : 'copy'} size={15} /></button>
      <a className="nl-icon" href={url} target="_blank" rel="noopener noreferrer" title={t('Open link')} aria-label="Open link"><Icon name="external" size={15} /></a>
      <button type="button" className="nl-icon" onClick={startEdit} title={t('Edit link')} aria-label="Edit link"><Icon name="pencil" size={15} /></button>
      <button type="button" className="nl-icon danger" onClick={remove} title={t('Remove link')} aria-label="Remove link"><Icon name="unlink" size={15} /></button>
    </div>
  );
}
