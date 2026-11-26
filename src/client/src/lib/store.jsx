import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { t } from './i18n.jsx';
import { todayIso, addDays, today0, iso } from './dates.js';

const DataContext = createContext(null);
export const useData = () => useContext(DataContext);

const EMPTY = { courses: [], tasks: [], sessions: [], logs: [], materials: [], recs: [] };

/** Loads everything the signed-in student owns and gives every page `run()` for changes. */
export function DataProvider({ children }) {
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const timer = useRef();

  // Short message at the bottom of the screen, with an optional button (like "Undo")
  const notify = useCallback((msg, action = null) => {
    setToast(msg ? { msg, action } : '');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(''), action ? 6000 : 2600);
  }, []);

  const reload = useCallback(async () => {
    const [courses, tasks, sessions, logs, materials] = await Promise.all(
      ['courses', 'tasks', 'sessions', 'logs', 'materials'].map((p) => api.get(`/${p}`)),
    );
    setData((d) => ({ ...d, courses, tasks, sessions, logs, materials }));
    setLoading(false);
    // Recommendations may wait on the LLM, so they arrive after the rest of the page
    try {
      const recs = await api.post(`/recommendations/generate?today=${todayIso()}`);
      setData((d) => ({ ...d, recs }));
    } catch (err) {
      notify(err.message);
    }
  }, [notify]);

  useEffect(() => { reload().catch((err) => { setLoading(false); notify(err.message); }); }, [reload, notify]);

  /** Take something back out of the Trash */
  const restore = useCallback(async (trashId) => {
    try {
      await api.post(`/trash/${trashId}/restore`);
      await reload();
      notify(t('Restored'));
      window.dispatchEvent(new Event('sa-restored'));   // pages with their own lists (Notes, Ask AI) reload them
    } catch (err) {
      notify(err.message);
    }
  }, [reload, notify]);

  /** Show "Moved to Trash" with an Undo button for a delete that returned a trash id */
  const trashed = useCallback((result, msg = 'Moved to Trash') => {
    notify(t(msg), result?.trashId ? { label: t('Undo'), run: () => restore(result.trashId) } : null);
  }, [notify, restore]);

  /** Save a change, reload the data, and show `success` (or the error) as a message. */
  const run = useCallback(async (fn, success) => {
    try {
      const result = await fn();
      await reload();
      if (result?.trashId) trashed(result);
      else if (success) notify(success);
      return result;
    } catch (err) {
      notify(err.message);
      return undefined;
    }
  }, [reload, notify, trashed]);

  const value = useMemo(() => {
    const courseById = new Map(data.courses.map((c) => [c.id, c]));
    const course = (id) => courseById.get(id) || { code: '?', name: 'Unknown', color: '#888', weeklyGoalHours: 0 };
    /** Hours studied for a course since a date: finished sessions plus logged hours. */
    const hoursSince = (courseId, from) =>
      data.sessions.filter((s) => s.course === courseId && s.done && s.date >= from).reduce((t, s) => t + s.hours, 0) +
      data.logs.filter((l) => l.course === courseId && l.date >= from).reduce((t, l) => t + l.hours, 0);
    const weekStart = iso(addDays(today0(), -6));   // "this week" = the last 7 days
    return { ...data, loading, course, hoursSince, weekStart, run, notify, reload, restore, trashed };
  }, [data, loading, run, notify, reload, restore, trashed]);

  return (
    <DataContext.Provider value={value}>
      {children}
      {toast && (
        <div className={`toast ${toast.action ? 'has-action' : ''}`} role="status">
          {toast.msg}
          {toast.action && <button type="button" className="toast-btn" onClick={() => { setToast(''); toast.action.run(); }}>{toast.action.label}</button>}
        </div>
      )}
    </DataContext.Provider>
  );
}