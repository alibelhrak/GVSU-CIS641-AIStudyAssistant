import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { t } from '../lib/i18n.jsx';
import { Icon } from '../icons.jsx';

const REASONS = [
  { id: 'harassment', label: 'Harassment or bullying' },
  { id: 'hate', label: 'Hate speech' },
  { id: 'sexual', label: 'Sexual content' },
  { id: 'violence', label: 'Violence or threats' },
  { id: 'spam', label: 'Spam or scam' },
  { id: 'privacy', label: 'Someone\'s private information' },
  { id: 'cheating', label: 'Cheating (sharing exam answers)' },
  { id: 'other', label: 'Something else' },
];

/**
 * Report a page or a group chat message to the app's moderator.
 * kind: 'page' (shared with me), 'public' (a page shared to the web, id = its public id) or 'message'.
 */
export function ReportDialog({ kind, id, name, onClose, onSent }) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const send = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api.post('/reports', { kind, id, reason, details: details.trim() });
      setSent(true); onSent?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="install-overlay" onClick={onClose} role="presentation">
      <div className="rem-card report-card" role="dialog" aria-modal="true" aria-labelledby="report-title" onClick={(e) => e.stopPropagation()}>
        <div className="rem-head">
          <span className="rem-bell report-badge"><Icon name="flag" size={19} /></span>
          <div>
            <h2 id="report-title">{kind === 'message' ? 'Report this message' : 'Report this page'}</h2>
            {name && <p className="muted ellipsis"><span data-no-translate>{name}</span></p>}
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
        </div>
        {sent ? (
          <div className="report-done">
            <p><b>Thank you. Your report was sent.</b></p>
            <p className="muted">We review every report, and remove content that breaks the community guidelines. The person you reported is not told who reported them.</p>
            <button className="btn primary" type="button" onClick={onClose}>Done</button>
          </div>
        ) : (
          <form onSubmit={send}>
            <p className="muted report-ask">What is wrong with it?</p>
            <div className="report-reasons" role="radiogroup" aria-label="Reason">
              {REASONS.map((r) => (
                <label key={r.id} className={`report-reason ${reason === r.id ? 'on' : ''}`}>
                  <input type="radio" name="reason" value={r.id} checked={reason === r.id} onChange={() => setReason(r.id)} />
                  <span>{r.label}</span>
                </label>
              ))}
            </div>
            <textarea className="report-details" rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)}
              placeholder={t('Anything else we should know? (optional)')} aria-label="Details" />
            {error && <p className="error-box">{error}</p>}
            <div className="report-actions">
              <Link to="/guidelines" target="_blank" className="muted report-rules">Community guidelines</Link>
              <button className="btn" type="button" onClick={onClose}>Cancel</button>
              <button className="btn danger" type="submit" disabled={!reason || busy}>{busy ? 'Sending…' : 'Send report'}</button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
