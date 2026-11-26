import { useState } from 'react';
import { api } from '../lib/api.js';
import { useData } from '../lib/store.jsx';
import { daysUntil, fmtH, relDay } from '../lib/dates.js';
import { Icon } from '../icons.jsx';

const BLANK = { code: '', name: '', weeklyGoalHours: '5', color: '#2b4fd8' };
// An empty box (or 0) means "no weekly goal"
const goalOf = (v) => { const n = Number(v); return v === '' || v === null || !Number.isFinite(n) || n <= 0 ? null : Math.min(168, n); };

/** The weekly goal on a course card: shows it, and lets the student change it or set it to none */
function GoalEditor({ course }) {
  const { run } = useData();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const save = async (goal) => {
    setEditing(false);
    if (goal === (course.weeklyGoalHours ?? null)) return;
    await run(() => api.patch(`/courses/${course.id}`, { weeklyGoalHours: goal }), goal ? 'Weekly goal saved' : 'Weekly goal removed');
  };
  if (!editing) {
    return (
      <button type="button" className="goal-chip" onClick={() => { setValue(course.weeklyGoalHours ? String(course.weeklyGoalHours) : ''); setEditing(true); }} title="Change the weekly goal">
        <Icon name="target" size={14} />
        {course.weeklyGoalHours ? <span>{`Goal: ${fmtH(course.weeklyGoalHours)} h a week`}</span> : <span>No weekly goal</span>}
        <Icon name="pencil" size={12} />
      </button>
    );
  }
  return (
    <form className="goal-edit" onSubmit={(e) => { e.preventDefault(); save(goalOf(value)); }}>
      <input type="number" min="0" max="168" step="0.5" value={value} onChange={(e) => setValue(e.target.value)} placeholder="None" aria-label="Weekly study goal (hours)" autoFocus
        onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }} />
      <span className="note">h / week</span>
      <button className="btn sm primary" type="submit">Save</button>
      <button className="btn sm" type="button" onClick={() => save(null)}>None</button>
    </form>
  );
}

/** Edit a saved course right on its card: code, name, weekly goal (or none) and color */
function CourseEditor({ course, onDone }) {
  const { run } = useData();
  const [f, setF] = useState({
    code: course.code, name: course.name, color: course.color || '#2b4fd8',
    weeklyGoalHours: course.weeklyGoalHours ? String(course.weeklyGoalHours) : '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    const ok = await run(() => api.patch(`/courses/${course.id}`, {
      code: f.code.trim(), name: f.name.trim(), color: f.color, weeklyGoalHours: goalOf(f.weeklyGoalHours),
    }), 'Course saved');
    setBusy(false);
    if (ok) onDone();
  };
  return (
    <form className="course-edit" onSubmit={save} onKeyDown={(e) => { if (e.key === 'Escape') onDone(); }}>
      <label>Course code<input type="text" value={f.code} onChange={set('code')} required maxLength={30} autoFocus /></label>
      <label>Course name<input type="text" value={f.name} onChange={set('name')} required maxLength={120} /></label>
      <div className="course-edit-row">
        <label>Weekly study goal (hrs, optional)
          <span className="goal-input">
            <input type="number" min="0" max="168" step="0.5" placeholder="None" value={f.weeklyGoalHours} onChange={set('weeklyGoalHours')} />
            {f.weeklyGoalHours !== '' && <button type="button" className="goal-clear" onClick={() => setF({ ...f, weeklyGoalHours: '' })} title="No weekly goal" aria-label="No weekly goal"><Icon name="close" size={13} /></button>}
          </span>
        </label>
        <label className="course-edit-color">Color<input type="color" value={f.color} onChange={set('color')} /></label>
      </div>
      <div className="rec-actions">
        <button className="btn sm primary" type="submit" disabled={busy || !f.code.trim() || !f.name.trim()}>{busy ? 'Saving…' : 'Save changes'}</button>
        <button className="btn sm" type="button" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

export default function Courses() {
  const { courses, tasks, materials, hoursSince, weekStart, run } = useData();
  const [form, setForm] = useState(BLANK);
  const [confirming, setConfirming] = useState(null);   // id of the course waiting for "Remove?"
  const [editing, setEditing] = useState(null);         // id of the course being edited
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const ok = await run(() => api.post('/courses', { ...form, weeklyGoalHours: goalOf(form.weeklyGoalHours) }), 'Course added');
    if (ok) setForm(BLANK);
  };

  return (
    <div className="view">
      <div className="panel">
        <div className="panel-head"><h2>Add a course</h2></div>
        <form className="inline" onSubmit={submit}>
          <label>Course code<input type="text" placeholder="e.g. CIS 162" value={form.code} onChange={set('code')} required /></label>
          <label>Course name<input type="text" placeholder="e.g. Computer Science I" value={form.name} onChange={set('name')} required /></label>
          <label>Weekly study goal (hrs, optional)
            <span className="goal-input">
              <input type="number" min="0" max="168" step="0.5" placeholder="None" value={form.weeklyGoalHours} onChange={set('weeklyGoalHours')} />
              {form.weeklyGoalHours !== '' && <button type="button" className="goal-clear" onClick={() => setForm({ ...form, weeklyGoalHours: '' })} title="No weekly goal" aria-label="No weekly goal"><Icon name="close" size={13} /></button>}
            </span>
          </label>
          <label>Color<input type="color" value={form.color} onChange={set('color')} /></label>
          <button className="btn primary" type="submit">Add course</button>
        </form>
      </div>

      <div className="courses">
        {courses.length === 0 && <p className="empty">No courses yet. Add your first course above.</p>}
        {courses.map((c) => {
          const open = tasks.filter((t) => t.course === c.id && !t.done);
          const next = open[0];   // tasks come sorted by due date
          return (
            <div className={`course ${editing === c.id ? 'editing' : ''}`} key={c.id} style={{ '--c': c.color }}>
              <div><div className="mono muted" data-no-translate>{c.code}</div><h3 data-no-translate>{c.name}</h3></div>
              {editing === c.id ? <CourseEditor course={c} onDone={() => setEditing(null)} /> : (<>
              <div className="stats">
                <div><b>{open.length}</b>open tasks</div>
                <div><b>{fmtH(hoursSince(c.id, weekStart))}h</b>this week</div>
                <div><b>{materials.filter((m) => m.course === c.id).length}</b>materials</div>
              </div>
              <GoalEditor course={c} />
              <div className="note">{next ? <>{'Next:'} <span data-no-translate>{next.title}</span> · {relDay(daysUntil(next.dueDate))}</> : 'No upcoming work'}</div>
              {confirming === c.id ? (
                <div className="rec-actions">
                  <span className="note">Move this course and its tasks, sessions and files to the Trash? You can restore it for 30 days.</span>
                  <button className="btn sm danger" type="button" onClick={() => run(() => api.del(`/courses/${c.id}`), 'Course removed')}>Remove</button>
                  <button className="btn sm" type="button" onClick={() => setConfirming(null)}>Keep</button>
                </div>
              ) : (
                <div className="course-btns">
                  <button className="btn ghost sm" type="button" onClick={() => { setConfirming(null); setEditing(c.id); }}><Icon name="pencil" size={14} /> Edit course</button>
                  <button className="btn ghost sm" type="button" onClick={() => setConfirming(c.id)}>Remove course</button>
                </div>
              )}
              </>)}
            </div>
          );
        })}
      </div>
    </div>
  );
}