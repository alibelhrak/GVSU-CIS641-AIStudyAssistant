import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useData } from '../lib/store.jsx';
import { t } from '../lib/i18n.jsx';
import { daysUntil, relDay } from '../lib/dates.js';
import { Icon } from '../icons.jsx';
import { Face } from './NoteShare.jsx';
import { ReportDialog } from './Report.jsx';
import GroupMeetings from './GroupMeetings.jsx';

const COLORS = ['#2383e2', '#e8590c', '#2f9e44', '#9c36b5', '#d6336c', '#0c8599'];
const TYPES = ['Assignment', 'Exam', 'Quiz', 'Project', 'Reading'];
const todayIso = () => new Date().toLocaleDateString('en-CA');
const timeOf = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const dayOf = (iso) => new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

/** Study groups: the list, or one group (chat, deadlines, pages, members) */
export default function Groups() {
  const { id } = useParams();
  return id ? <GroupView id={id} key={id} /> : <GroupList />;
}

function GroupList() {
  const { notify } = useData();
  const navigate = useNavigate();
  const [groups, setGroups] = useState(null);
  const [form, setForm] = useState(null);   // null, or { name, description, color } while creating
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get('/groups').then(setGroups).catch((err) => { setGroups([]); notify(err.message); }); }, [notify]);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const g = await api.post('/groups', form);
      navigate(`/groups/${g.id}`);
    } catch (err) { notify(err.message); setBusy(false); }
  };

  return (
    <div className="groups">
      <div className="groups-top">
        <div className="groups-intro">
        <p className="muted">Work with classmates: shared deadlines, shared note pages you edit together live, and a group chat. Only people who already have an account can be added.</p>
        <p className="muted groups-rules">Be kind: to report a message, point at it and click the flag. <Link to="/guidelines">Community guidelines</Link></p>
        </div>
        {!form && <button className="btn primary" type="button" onClick={() => setForm({ name: '', description: '', color: COLORS[0] })}><Icon name="plus" size={16} /> New group</button>}
      </div>
      {form && (
        <form className="panel group-new" onSubmit={create}>
          <h3>New study group</h3>
          <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. CIS 641 project team" maxLength={60} required autoFocus /></label>
          <label>What is it for? (optional)<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Term project: sequence and class diagrams" maxLength={300} /></label>
          <div className="group-colors" role="radiogroup" aria-label="Color">
            {COLORS.map((c) => <button key={c} type="button" role="radio" aria-checked={form.color === c} className={form.color === c ? 'on' : ''} style={{ background: c }} onClick={() => setForm({ ...form, color: c })} aria-label={c} />)}
          </div>
          <div className="rec-actions">
            <button className="btn primary" type="submit" disabled={busy || !form.name.trim()}>Create group</button>
            <button className="btn" type="button" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </form>
      )}
      {groups === null ? <div className="chat-loading"><span className="thinking"><i /><i /><i /></span></div>
        : groups.length === 0 && !form ? (
          <div className="panel groups-empty">
            <span aria-hidden="true">👥</span>
            <b>No study groups yet</b>
            <p className="muted">Make a group for a project team or a study circle. Add classmates by their email, share deadlines and pages, and chat in one place.</p>
            <button className="btn primary" type="button" onClick={() => setForm({ name: '', description: '', color: COLORS[0] })}><Icon name="plus" size={16} /> New group</button>
          </div>
        ) : (
          <div className="group-grid">
            {groups.map((g) => (
              <Link key={g.id} to={`/groups/${g.id}`} className="panel group-card" style={{ '--g': g.color }}>
                <div className="group-card-head">
                  <span className="group-badge" aria-hidden="true"><Icon name="users" size={18} /></span>
                  <div><h3 data-no-translate>{g.name}</h3>{g.description && <p className="muted ellipsis" data-no-translate>{g.description}</p>}</div>
                </div>
                <div className="group-stats">
                  <span><b>{g.members}</b> {g.members === 1 ? t('member') : t('members')}</span>
                  <span><b>{g.openTasks}</b> {g.openTasks === 1 ? t('open deadline') : t('open deadlines')}</span>
                  <span><b>{g.pages}</b> {g.pages === 1 ? t('page') : t('pages')}</span>
                </div>
                {g.nextDue && <p className="note">Next: <span>{relDay(daysUntil(g.nextDue))}</span></p>}
                {g.lastMessage && <p className="group-last ellipsis"><Icon name="chat" size={13} /> <span data-no-translate>{g.lastMessage.text}</span></p>}
              </Link>
            ))}
          </div>
        )}
    </div>
  );
}

function GroupView({ id }) {
  const { courses, run, notify } = useData();
  const navigate = useNavigate();
  const [g, setG] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => api.get(`/groups/${id}`).then(setG).catch((err) => setError(err.message)), [id]);
  useEffect(() => { load(); const timer = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 20000); return () => clearInterval(timer); }, [load]);

  // ---- settings ----
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState('');   // 'delete' or 'leave'
  const rename = async (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try { setG({ ...g, ...(await api.patch(`/groups/${id}`, { name: f.get('name'), description: f.get('description') })) }); setEditing(false); } catch (err) { notify(err.message); }
  };
  const remove = async () => { try { await api.del(`/groups/${id}`); notify(t('Group deleted')); navigate('/groups'); } catch (err) { notify(err.message); } };
  const leave = async () => { try { await api.del(`/groups/${id}/members/me`); notify(t('You left the group')); navigate('/groups'); } catch (err) { notify(err.message); } };

  if (error) return <div className="panel"><p className="error-box">{error}</p><Link to="/groups">Back to study groups</Link></div>;
  if (!g) return <div className="chat-loading"><span className="thinking"><i /><i /><i /></span></div>;
  return (
    <div className="group-view" style={{ '--g': g.color }}>
      <div className="group-head panel">
        <Link to="/groups" className="btn ghost sm group-back"><Icon name="back" size={15} /> Study groups</Link>
        {editing ? (
          <form className="group-rename" onSubmit={rename}>
            <input name="name" defaultValue={g.name} maxLength={60} required autoFocus aria-label="Group name" />
            <input name="description" defaultValue={g.description} maxLength={300} placeholder="What is it for? (optional)" aria-label="Description" />
            <button className="btn sm primary" type="submit">Save</button>
            <button className="btn sm" type="button" onClick={() => setEditing(false)}>Cancel</button>
          </form>
        ) : (
          <div className="group-title">
            <span className="group-badge" aria-hidden="true"><Icon name="users" size={20} /></span>
            <div>
              <h2 data-no-translate>{g.name}</h2>
              {g.description && <p className="muted" data-no-translate>{g.description}</p>}
            </div>
            <div className="group-faces">{g.members.slice(0, 5).map((m) => <Face key={m.id} person={m} size={30} />)}</div>
          </div>
        )}
        {!editing && (
          <div className="group-actions">
            {confirm ? (
              <>
                <span className="note">{confirm === 'delete' ? t('Delete the group, its chat and deadlines? Shared pages stay with their owners.') : t('Leave this group?')}</span>
                <button className="btn sm danger" type="button" onClick={confirm === 'delete' ? remove : leave}>{confirm === 'delete' ? t('Delete group') : t('Leave')}</button>
                <button className="btn sm" type="button" onClick={() => setConfirm('')}>Cancel</button>
              </>
            ) : g.mine ? (
              <>
                <button className="btn sm ghost" type="button" onClick={() => setEditing(true)}><Icon name="pencil" size={14} /> Rename</button>
                <button className="btn sm ghost danger-text" type="button" onClick={() => setConfirm('delete')}><Icon name="trash" size={14} /> Delete group</button>
              </>
            ) : <button className="btn sm ghost danger-text" type="button" onClick={() => setConfirm('leave')}>Leave group</button>}
          </div>
        )}
      </div>

      <div className="group-cols">
        <GroupChat id={id} />
        <div className="group-side">
          <GroupMeetings g={g} notify={notify} />
          <Deadlines g={g} setG={setG} courses={courses} run={run} notify={notify} />
          <section className="panel">
            <h3 className="card-title"><Icon name="note" size={17} /> Shared pages</h3>
            {g.pages.length === 0 ? <p className="note">No pages yet. Open a page in Notes, click Share, and tick this group. Everyone in the group can edit it together, live.</p>
              : (
                <div className="group-pages">
                  {g.pages.map((p) => (
                    <Link key={p.id} to={`/notes/${p.id}`} className="group-page">
                      <span className="tree-icon">{p.icon || <Icon name="file" size={15} />}</span>
                      <span className="ellipsis" data-no-translate>{p.title || t('Untitled')}</span>
                      <span className="muted" data-no-translate>{p.mine ? t('You') : p.owner.split(' ')[0]}</span>
                    </Link>
                  ))}
                </div>
              )}
          </section>
          <Members g={g} setG={setG} notify={notify} />
        </div>
      </div>
    </div>
  );
}

/** The group chat: new messages appear every few seconds */
function GroupChat({ id }) {
  const [msgs, setMsgs] = useState(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [reporting, setReporting] = useState(null);
  const box = useRef(null);
  const last = useRef(null);
  const stick = useRef(true);

  const scroll = () => { const el = box.current; if (el && stick.current) el.scrollTop = el.scrollHeight; };
  useEffect(() => {
    let stop = false;
    const first = async () => {
      const list = await api.get(`/groups/${id}/messages`).catch(() => []);
      if (stop) return;
      setMsgs(list); last.current = list.at(-1)?.at || null; setTimeout(scroll, 0);
    };
    const poll = async () => {
      if (document.visibilityState !== 'visible') return;
      const q = last.current ? `?after=${encodeURIComponent(last.current)}` : '';
      const more = await api.get(`/groups/${id}/messages${q}`).catch(() => null);
      if (stop || !more?.length) return;
      setMsgs((m) => { const have = new Set((m || []).map((x) => x.id)); return [...(m || []), ...more.filter((x) => !have.has(x.id))]; });
      last.current = more.at(-1).at; setTimeout(scroll, 0);
    };
    first();
    const timer = setInterval(poll, 4000);
    return () => { stop = true; clearInterval(timer); };
  }, [id]);

  const send = async (e) => {
    e?.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const m = await api.post(`/groups/${id}/messages`, { text: body });
      setMsgs((list) => [...(list || []), m]); last.current = m.at; setText(''); stick.current = true; setTimeout(scroll, 0);
    } catch { /* stays in the box to try again */ } finally { setSending(false); }
  };
  const removeMsg = async (mid) => { try { await api.del(`/groups/${id}/messages/${mid}`); setMsgs((l) => l.filter((m) => m.id !== mid)); } catch { /* ignore */ } };

  let lastDay = '';
  return (
    <section className="panel group-chat">
      <h3 className="card-title"><Icon name="chat" size={17} /> Group chat</h3>
      <div className="gchat-list" ref={box} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }}>
        {msgs === null ? <div className="chat-loading"><span className="thinking"><i /><i /><i /></span></div>
          : msgs.length === 0 ? <p className="history-empty">No messages yet. Say hi to your group 👋</p>
            : msgs.map((m, i) => {
              const day = dayOf(m.at); const showDay = day !== lastDay; lastDay = day;
              const grouped = i > 0 && msgs[i - 1].user.id === m.user.id && !showDay && new Date(m.at) - new Date(msgs[i - 1].at) < 5 * 60000;
              return (
                <div key={m.id}>
                  {showDay && <p className="gchat-day">{day}</p>}
                  <div className={`gchat-msg ${m.me ? 'me' : ''} ${grouped ? 'grouped' : ''}`}>
                    {!m.me && !grouped && <Face person={m.user} size={28} />}
                    <div className="gchat-bubble-wrap">
                      {!m.me && !grouped && <span className="gchat-name" data-no-translate>{m.user.name}</span>}
                      <div className="gchat-bubble" data-no-translate>{m.text}</div>
                      <span className="gchat-time">{timeOf(m.at)}{m.me
                        ? <button type="button" onClick={() => removeMsg(m.id)} aria-label="Delete message" title="Delete"><Icon name="trash" size={11} /></button>
                        : <button type="button" onClick={() => setReporting(m)} aria-label="Report this message" title="Report"><Icon name="flag" size={11} /></button>}</span>
                    </div>
                  </div>
                </div>
              );
            })}
      </div>
      {reporting && <ReportDialog kind="message" id={reporting.id} name={`${reporting.user.name}: ${reporting.text.slice(0, 80)}`} onClose={() => setReporting(null)} />}
      <form className="gchat-compose" onSubmit={send}>
        <textarea rows={1} value={text} onChange={(e) => setText(e.target.value)} placeholder="Message your group…" maxLength={2000} aria-label="Message"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <button className="btn primary" type="submit" disabled={!text.trim() || sending} aria-label="Send"><Icon name="send" size={16} /></button>
      </form>
    </section>
  );
}

/** Shared deadlines: anyone in the group adds them; each member can copy one into their own tasks */
function Deadlines({ g, setG, courses, run, notify }) {
  const [form, setForm] = useState(null);
  const [copying, setCopying] = useState(null);   // deadline id choosing a course
  const add = async (e) => {
    e.preventDefault();
    try { const tk = await api.post(`/groups/${g.id}/tasks`, form); setG({ ...g, tasks: [...g.tasks, { ...tk, by: t('You') }].sort((a, b) => a.done - b.done || a.dueDate.localeCompare(b.dueDate)) }); setForm(null); } catch (err) { notify(err.message); }
  };
  const patch = async (tk, change) => {
    try { const up = await api.patch(`/groups/${g.id}/tasks/${tk.id}`, change); setG({ ...g, tasks: g.tasks.map((x) => (x.id === tk.id ? { ...x, ...up } : x)) }); } catch (err) { notify(err.message); }
  };
  const del = async (tk) => { try { await api.del(`/groups/${g.id}/tasks/${tk.id}`); setG({ ...g, tasks: g.tasks.filter((x) => x.id !== tk.id) }); } catch (err) { notify(err.message); } };
  const copy = async (tk, course) => {
    setCopying(null);
    await run(() => api.post('/tasks', { title: tk.title, type: tk.type, dueDate: tk.dueDate, course }), t('Added to your assignments'));
  };
  return (
    <section className="panel">
      <div className="card-title-row">
        <h3 className="card-title"><Icon name="calendar" size={17} /> Deadlines</h3>
        {!form && <button className="btn sm ghost" type="button" onClick={() => setForm({ title: '', type: 'Project', dueDate: todayIso() })}><Icon name="plus" size={14} /> Add</button>}
      </div>
      {form && (
        <form className="gtask-form" onSubmit={add}>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Sequence diagram draft" maxLength={200} required autoFocus aria-label="Title" />
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} aria-label="Type">{TYPES.map((x) => <option key={x} value={x}>{t(x)}</option>)}</select>
          <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} required aria-label="Due date" />
          <div className="rec-actions"><button className="btn sm primary" type="submit">Add deadline</button><button className="btn sm" type="button" onClick={() => setForm(null)}>Cancel</button></div>
        </form>
      )}
      {g.tasks.length === 0 && !form ? <p className="note">Add the team's deadlines here. Everyone sees them, and each person can copy one into their own assignments.</p> : (
        <div className="gtasks">
          {g.tasks.map((tk) => {
            const days = daysUntil(tk.dueDate);
            return (
              <div key={tk.id} className={`gtask ${tk.done ? 'done' : ''}`}>
                <input type="checkbox" checked={tk.done} onChange={() => patch(tk, { done: !tk.done })} aria-label={tk.done ? t('Mark as not done') : t('Mark as done')} />
                <div className="gtask-text">
                  <b data-no-translate>{tk.title}</b>
                  <span className="muted">{t(tk.type)} · <span className={!tk.done && days <= 2 ? 'soon' : ''}>{relDay(days)}</span>{tk.by && <> · <span data-no-translate>{tk.by}</span></>}</span>
                </div>
                <div className="gtask-actions pop-wrap">
                  {!tk.done && <button className="icon-btn" type="button" onClick={() => setCopying(copying === tk.id ? null : tk.id)} title="Add to my assignments" aria-label="Add to my assignments"><Icon name="download" size={15} /></button>}
                  <button className="icon-btn" type="button" onClick={() => del(tk)} title="Delete" aria-label="Delete deadline"><Icon name="trash" size={14} /></button>
                  {copying === tk.id && (
                    <div className="pop-menu gtask-copy">
                      <p className="code-menu-title">Add to my assignments, for</p>
                      {courses.length === 0 ? <p className="note">Add a course first.</p> : courses.map((c) => (
                        <button key={c.id} type="button" onClick={() => copy(tk, c.id)}><span className="dot" style={{ background: c.color }} /><span data-no-translate>{c.code}</span></button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Members({ g, setG, notify }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const add = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { setG({ ...g, ...(await api.post(`/groups/${g.id}/members`, { email: email.trim() })) }); setEmail(''); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const remove = async (m) => { try { setG({ ...g, ...(await api.del(`/groups/${g.id}/members/${m.id}`)) }); } catch (err) { notify(err.message); } };
  return (
    <section className="panel">
      <h3 className="card-title"><Icon name="users" size={17} /> Members <span className="muted">{g.members.length}</span></h3>
      <div className="gmembers">
        {g.members.map((m) => (
          <div key={m.id} className="share-row">
            <Face person={m} />
            <div className="share-who"><b data-no-translate>{m.name}{m.me ? ` (${t('you')})` : ''}</b><span className="muted" data-no-translate>{m.email}</span></div>
            {m.role === 'owner' ? <span className="role-chip">Owner</span> : g.mine && <button className="icon-btn" type="button" onClick={() => remove(m)} title="Remove from group" aria-label={`Remove ${m.name}`}><Icon name="close" size={14} /></button>}
          </div>
        ))}
      </div>
      <form className="gmember-add" onSubmit={add}>
        <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }} placeholder="Add by email" aria-label="Add a member by email" />
        <button className="btn sm" type="submit" disabled={busy || !email.trim()}>Add</button>
      </form>
      {error && <p className="error-box">{error}</p>}
      <p className="note">Only people with a StudyPilot account can be added. They get an email with a link to the group.</p>
    </section>
  );
}
