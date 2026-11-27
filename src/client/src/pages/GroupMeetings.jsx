import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { t } from '../lib/i18n.jsx';
import { Icon } from '../icons.jsx';

const DURATIONS = [15, 30, 45, 60, 90, 120, 180];
const pad = (n) => String(n).padStart(2, '0');
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const nextHalfHour = () => { const d = new Date(Date.now() + 30 * 60_000); d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0); return d; };

function whenLabel(m) {
  if (m.status === 'live') return t('Live now');
  const d = new Date(m.start);
  const lang = document.documentElement.lang || 'en';
  const today = new Date(); const tomorrow = new Date(Date.now() + 86400_000);
  const time = d.toLocaleTimeString(lang, { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `${t('Today')} · ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `${t('Tomorrow')} · ${time}`;
  return d.toLocaleString(lang, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** Opens a new tab right away (so the browser doesn't block it), then sends it to the address once it is known */
async function openWhenReady(getUrl) {
  const w = window.open('about:blank', '_blank');
  try {
    const url = await getUrl();
    if (w) { w.opener = null; w.location.href = url; } else window.location.href = url;
  } catch (err) {
    w?.close();
    throw err;
  }
}

/** Video meetings of a study group: start or schedule a Zoom meeting, or add a Teams / Meet / Zoom link */
export default function GroupMeetings({ g, notify }) {
  const [meetings, setMeetings] = useState(null);
  const [zoom, setZoom] = useState(null);          // { enabled, linked, email }
  const [form, setForm] = useState(null);          // the schedule form
  const [busy, setBusy] = useState(false);
  const [askLink, setAskLink] = useState(false);   // "link your Zoom account" prompt

  const load = useCallback(() => api.get(`/groups/${g.id}/meetings`).then(setMeetings).catch(() => setMeetings([])), [g.id]);
  useEffect(() => {
    load();
    api.get('/zoom/status').then(setZoom).catch(() => setZoom({ enabled: false, linked: false }));
    const timer = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 30000);
    return () => clearInterval(timer);
  }, [load]);

  const linkZoom = async () => {
    try { const { url } = await api.post('/zoom/link', { back: `/groups/${g.id}` }); window.location.href = url; } catch (err) { notify(err.message); }
  };
  const failed = (err) => {
    if (err.data?.zoom === 'not_linked') { setZoom((z) => ({ ...z, linked: false })); setAskLink(true); } else notify(err.message);
  };

  // Start a Zoom meeting now, and open it as the host
  const startNow = async () => {
    if (!zoom?.linked) { setAskLink(true); return; }
    setBusy(true);
    try {
      await openWhenReady(async () => {
        const m = await api.post(`/groups/${g.id}/meetings`, { topic: `${g.name}` });
        setMeetings((list) => [...(list || []), m]);
        notify(t('Meeting started. Your group was told by email.'));
        return (await api.get(`/groups/${g.id}/meetings/${m.id}/start`)).url;
      });
    } catch (err) { failed(err); } finally { setBusy(false); }
  };

  const openForm = () => {
    const d = nextHalfHour();
    setForm({ topic: '', date: localDate(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}`, duration: 60, how: zoom?.enabled ? 'zoom' : 'link', link: '' });
  };
  const schedule = async (e) => {
    e.preventDefault();
    if (form.how === 'zoom' && !zoom?.linked) { setAskLink(true); return; }
    setBusy(true);
    try {
      const start = new Date(`${form.date}T${form.time}`).toISOString();
      const m = await api.post(`/groups/${g.id}/meetings`, { topic: form.topic.trim() || g.name, start, duration: form.duration, ...(form.how === 'link' ? { link: form.link.trim() } : {}) });
      setMeetings((list) => [...(list || []), m].sort((a, b) => new Date(a.start) - new Date(b.start)));
      setForm(null);
      notify(t('Meeting scheduled. Your group was told by email.'));
    } catch (err) { failed(err); } finally { setBusy(false); }
  };

  const join = (m) => {
    if (m.mine && m.provider === 'zoom') openWhenReady(async () => (await api.get(`/groups/${g.id}/meetings/${m.id}/start`)).url).catch(failed);
    else window.open(m.joinUrl, '_blank', 'noopener');
  };
  const copy = async (m) => {
    try { await navigator.clipboard.writeText(m.joinUrl); notify(t('Link copied')); } catch { /* the Join button still works */ }
  };
  const cancel = async (m) => {
    try { await api.del(`/groups/${g.id}/meetings/${m.id}`); setMeetings((list) => list.filter((x) => x.id !== m.id)); } catch (err) { notify(err.message); }
  };

  const zoomOn = zoom?.enabled;
  return (
    <section className="panel meet-panel">
      <div className="card-title-row">
        <h3 className="card-title"><Icon name="video" size={17} /> Meetings</h3>
        {!form && (
          <div className="meet-top-actions">
            {zoomOn && <button className="btn sm primary" type="button" onClick={startNow} disabled={busy}><Icon name="video" size={14} /> Start Zoom</button>}
            <button className="btn sm ghost" type="button" onClick={openForm}><Icon name="calendar" size={14} /> Schedule</button>
          </div>
        )}
      </div>

      {askLink && (
        <div className="meet-link-zoom">
          <span className="zoom-mark" aria-hidden="true"><Icon name="video" size={16} /></span>
          <div>
            <b>Link your Zoom account</b>
            <p className="note">Only the person who starts a meeting needs Zoom linked. Everyone else joins with the link.</p>
            <div className="rec-actions">
              <button className="btn sm primary" type="button" onClick={linkZoom}>Link Zoom</button>
              <button className="btn sm" type="button" onClick={() => { setAskLink(false); openForm(); setForm((f) => ({ ...f, how: 'link' })); }}>Paste a link instead</button>
              <button className="btn sm ghost" type="button" onClick={() => setAskLink(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {form && (
        <form className="meet-form" onSubmit={schedule}>
          <input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} placeholder={t('What is it about? (optional)')} maxLength={120} aria-label="Topic" autoFocus />
          <div className="meet-when">
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required aria-label="Date" />
            <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} required aria-label="Time" />
            <select value={form.duration} onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })} aria-label="Length">
              {DURATIONS.map((d) => <option key={d} value={d}>{d < 60 ? `${d} min` : `${d / 60} h`}</option>)}
            </select>
          </div>
          <div className="meet-how" role="radiogroup" aria-label="Where">
            {zoomOn && (
              <label className={form.how === 'zoom' ? 'on' : ''}>
                <input type="radio" name="how" checked={form.how === 'zoom'} onChange={() => setForm({ ...form, how: 'zoom' })} />
                <span><b>New Zoom meeting</b><small className="muted" title={zoom?.email || undefined}>{zoom?.linked ? t('From your Zoom account') : t('You will be asked to link Zoom')}</small></span>
              </label>
            )}
            <label className={form.how === 'link' ? 'on' : ''}>
              <input type="radio" name="how" checked={form.how === 'link'} onChange={() => setForm({ ...form, how: 'link' })} />
              <span><b>Paste a link</b><small className="muted">Zoom, Microsoft Teams, Google Meet …</small></span>
            </label>
          </div>
          {form.how === 'link' && (
            <input type="url" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="https://…" required aria-label="Meeting link" data-no-translate />
          )}
          <div className="rec-actions">
            <button className="btn sm primary" type="submit" disabled={busy}>{busy ? t('Saving…') : t('Schedule meeting')}</button>
            <button className="btn sm" type="button" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </form>
      )}

      {meetings === null ? null : meetings.length === 0 && !form && !askLink ? (
        <p className="note">{zoomOn ? t('Start a Zoom call with your group right now, or schedule one. Everyone gets an email with the link.') : t('Schedule a meeting with a Zoom, Teams or Google Meet link. Everyone gets an email with the link.')}</p>
      ) : (
        <div className="meets">
          {meetings.map((m) => (
            <div key={m.id} className={`meet ${m.status}`}>
              <span className={`meet-icon ${m.provider}`} aria-hidden="true"><Icon name={m.provider === 'zoom' ? 'video' : 'link'} size={15} /></span>
              <div className="meet-text">
                <b data-no-translate>{m.topic}</b>
                <span className="muted">
                  <span className={m.status === 'live' ? 'meet-live' : ''}>{whenLabel(m)}</span>
                  {' · '}{m.duration < 60 ? `${m.duration} min` : `${Math.round(m.duration / 6) / 10} h`}
                  {m.by && <> · <span data-no-translate>{m.mine ? t('You') : m.by.split(' ')[0]}</span></>}
                </span>
              </div>
              <div className="meet-actions">
                {m.status !== 'ended' && (
                  <button className={`btn sm ${m.status === 'live' ? 'primary' : ''}`} type="button" onClick={() => join(m)}>
                    {m.mine && m.provider === 'zoom' ? t('Start') : t('Join')}
                  </button>
                )}
                <button className="icon-btn" type="button" onClick={() => copy(m)} title="Copy link" aria-label="Copy link"><Icon name="copy" size={14} /></button>
                {(m.mine || g.mine) && <button className="icon-btn" type="button" onClick={() => cancel(m)} title="Cancel meeting" aria-label="Cancel meeting"><Icon name="trash" size={14} /></button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
