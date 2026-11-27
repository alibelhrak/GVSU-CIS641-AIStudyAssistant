import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTheme } from '../lib/theme.jsx';
import { t } from '../lib/i18n.jsx';
import { Icon } from '../icons.jsx';
import { ReadOnlyPage } from './Notes.jsx';
import { ReportDialog } from './Report.jsx';

/** A page someone shared to the web: anyone with the link can read it (no account needed) */
export default function PublicNote() {
  const { id } = useParams();
  const { resolved } = useTheme();
  const [note, setNote] = useState(null);
  const [reporting, setReporting] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    fetch(`/api/public/notes/${encodeURIComponent(id)}`)
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Not found'); return d; })
      .then((d) => { setNote(d); document.title = `${d.title || t('Untitled')} · StudyPilot`; })
      .catch((err) => setError(err.message));
  }, [id]);
  const dark = resolved === 'dark' || resolved === 'midnight';
  return (
    <div className="public-note">
      <header className="public-top">
        <Link to="/" className="public-brand"><img src="/logo.png" alt="" width={26} height={26} /> StudyPilot</Link>
        {note && <span className="muted public-by">{t('Shared by')} <b data-no-translate>{note.owner}</b> · {t('Read only')}</span>}
        {note && <button className="btn sm ghost public-report" type="button" onClick={() => setReporting(true)} title="Report this page"><Icon name="flag" size={14} /> <span>Report</span></button>}
        <Link to="/signup" className="btn sm primary">Make your own notes</Link>
      </header>
      {reporting && <ReportDialog kind="public" id={id} name={`${note?.icon || ''} ${note?.title || t('Untitled')}`.trim()} onClose={() => setReporting(false)} />}
      <main className="notes-scroll public-scroll">
        {error ? (
          <div className="public-missing">
            <span aria-hidden="true">🔒</span>
            <h1>This page is not shared</h1>
            <p className="muted">The link may be wrong, or the owner turned sharing off.</p>
            <Link to="/" className="btn"><Icon name="back" size={15} /> Go to StudyPilot</Link>
          </div>
        ) : note ? <ReadOnlyPage note={note} dark={dark} />
          : <div className="chat-loading"><span className="thinking"><i /><i /><i /></span></div>}
        {note && <p className="public-foot muted">Shared by a StudyPilot user. StudyPilot does not check pages before they are shared. <Link to="/guidelines">Community guidelines</Link> · <button type="button" className="linklike" onClick={() => setReporting(true)}>Report this page</button></p>}
      </main>
    </div>
  );
}
