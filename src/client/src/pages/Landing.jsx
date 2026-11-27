import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../icons.jsx';
import '../landing.css';
import { THEMES, useTheme } from '../lib/theme.jsx';
import { InstallButton, PhoneSoonLink } from '../lib/install.jsx';
import { LanguageSelect, t } from '../lib/i18n.jsx';

/** Adds the class "in" to every [data-reveal] element when it scrolls into view. */
function useReveal() {
  useEffect(() => {
    const items = document.querySelectorAll('[data-reveal]');
    if (!('IntersectionObserver' in window)) { items.forEach((el) => el.classList.add('in')); return undefined; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    items.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

/** Types out each message, waits, then moves to the next one. */
function useTyping(english, speed = 32, pause = 2200) {
  const [messages] = useState(() => english.map((m) => t(m)));
  const [i, setI] = useState(0);
  const [text, setText] = useState('');
  useEffect(() => {
    const full = messages[i];
    if (text.length < full.length) {
      const t = setTimeout(() => setText(full.slice(0, text.length + 1)), speed);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => { setText(''); setI((i + 1) % messages.length); }, pause);
    return () => clearTimeout(t);
  }, [text, i, messages, speed, pause]);
  return text;
}

/** Moves through steps of an animation (each with its own length in ms), then starts again. */
function useLoop(durations) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setStep((s) => (s + 1) % durations.length), durations[step]);
    return () => clearTimeout(t);
  }, [step, durations]);
  return step;
}

/** Types its text once, letter by letter, when it appears */
function Typer({ text: english, speed = 22 }) {
  const text = t(english);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (n >= text.length) return undefined;
    const t = setTimeout(() => setN((v) => v + 1), speed);
    return () => clearTimeout(t);
  }, [n, text, speed]);
  return <>{text.slice(0, n)}{n < text.length && <span className="caret" />}</>;
}

const CHAT_STEPS = [700, 1900, 900, 650, 500, 500, 500, 2600, 3200];
const CHAT_CARDS = [
  { icon: 'check', title: 'Added exam', detail: 'Final exam · CIS 641 · due Sat, Dec 12 · 10 h' },
  { icon: 'calendar', title: 'Planned study session', detail: 'CIS 641 · Mon, Dec 7 · 19:00 · 2 h' },
  { icon: 'calendar', title: 'Planned study session', detail: 'CIS 641 · Wed, Dec 9 · 19:00 · 2 h' },
  { icon: 'calendar', title: 'Planned study session', detail: 'CIS 641 · Fri, Dec 11 · 19:00 · 2 h' },
];

/** The Ask AI chat, acted out: the student asks, the assistant adds things to the planner */
function ChatShowcase() {
  const step = useLoop(CHAT_STEPS);
  return (
    <div className="sc-window sc-chat" aria-hidden="true">
      <div className="pv-bar"><span className="pv-dot" /><span className="pv-dot" /><span className="pv-dot" /><span className="pv-url">Ask AI</span></div>
      <div className="sc-chat-body">
        {step >= 1 && (
          <div className="sc-user"><Typer key="u" text="Add my CIS 641 final on Dec 12 and plan three 2-hour sessions before it" speed={18} /></div>
        )}
        {step === 2 && <span className="thinking"><i /><i /><i /></span>}
        {step >= 3 && (
          <div className="sc-cards">
            {CHAT_CARDS.slice(0, Math.min(4, step - 2)).map((c, k) => (
              <div key={k} className="sc-card">
                <span className="sc-card-icon"><Icon name={c.icon} size={14} /></span>
                <span className="sc-card-text"><b>{c.title}</b><span>{c.detail}</span></span>
                <span className="sc-undo">Undo</span>
              </div>
            ))}
          </div>
        )}
        {step >= 7 && (
          <p className="sc-answer"><Typer text="Done! Your final is on Saturday, Dec 12, with three evening sessions before it. Want me to add one more this weekend?" speed={14} /></p>
        )}
      </div>
      <div className="sc-composer"><span>Ask anything, or attach your notes…</span><i><Icon name="send" size={13} /></i></div>
    </div>
  );
}

const NOTE_STEPS = [1400, 1900, 2300, 2600, 3400];

/** A notes page, acted out: the "/" menu, the AI writing, and the Notes AI panel editing the page */
function NotesShowcase() {
  const step = useLoop(NOTE_STEPS);
  return (
    <div className="sc-window sc-notes" aria-hidden="true">
      <div className="pv-bar"><span className="pv-dot" /><span className="pv-dot" /><span className="pv-dot" /><span className="pv-url">Notes · Sequence diagrams</span></div>
      <div className="sc-notes-body">
        <div className="sc-page">
          <div className="sc-cover" />
          <span className="sc-icon">🧠</span>
          <h4>Sequence diagrams</h4>
          <p className="sc-quote">Objects work together over time, one message after another.</p>
          <p className="sc-h">Key ideas</p>
          <ul><li><b>Lifeline:</b> one object over time</li><li><b>Message:</b> an arrow between objects</li></ul>
          {step === 1 && (
            <div className="sc-line">
              <span className="sc-slash">/</span>
              <div className="sc-menu">
                <p>✦ AI</p>
                <span className="on">❓ Practice quiz</span><span>🃏 Flashcards</span>
                <p>Basic blocks</p>
                <span>☑ To-do list</span><span>▦ Table</span>
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="sc-ai">
              <div className="sc-ai-out">
                <b>Practice quiz</b>
                <Typer text="1. What does a lifeline show?  2. What is an activation bar?  3. When is a message asynchronous?" speed={16} />
              </div>
              <div className="sc-ai-bar"><img src="/logo.png" alt="" width={14} height={14} /><span>AI is writing…</span></div>
            </div>
          )}
          {step >= 3 && (
            <div className="sc-new">
              <p className="sc-h">Practice quiz</p>
              <ol><li>What does a lifeline show?</li><li>What is an activation bar?</li><li>When is a message asynchronous?</li></ol>
            </div>
          )}
        </div>
        <div className={`sc-panel ${step === 4 ? 'open' : ''}`}>
          <div className="sc-panel-head"><img src="/logo.png" alt="" width={14} height={14} /> Notes AI</div>
          <div className="sc-user small">Fix the formatting everywhere</div>
          <div className="sc-steps"><span>✓ Edited "Key ideas"</span><span>✓ Edited the quote</span><span>✓ Added a summary</span></div>
          <div className="sc-changes"><b>Edited the page · 3 changes</b><span>Show changes</span><span>↶ Undo</span></div>
        </div>
      </div>
    </div>
  );
}

const CODE_STEPS = [1500, 1700, 900, 1100, 3600];
const STORE_URL = 'https://apps.microsoft.com/detail/9PJZX6KSS8TH';

/** A code block in a note, acted out: the AI suggests a line, Tab accepts it, Run shows the output */
function CodeShowcase() {
  const step = useLoop(CODE_STEPS);
  const k = (t) => <span className="tk-k">{t}</span>;
  const f = (t) => <span className="tk-f">{t}</span>;
  const n = (t) => <span className="tk-n">{t}</span>;
  const str = (t) => <span className="tk-s">{t}</span>;
  return (
    <div className="sc-window sc-code" aria-hidden="true">
      <div className="pv-bar"><span className="pv-dot" /><span className="pv-dot" /><span className="pv-dot" /><span className="pv-url">Notes · Algorithms practice</span></div>
      <div className="sc-code-body">
        <div className="sc-tree">
          <p>Folders</p>
          <span className="g">▾ 📁 Midterm prep</span>
          <span className="i">🧠 Sequence diagrams</span>
          <span className="i">📘 Exam 2 study guide</span>
          <p>Courses</p>
          <span className="g"><i style={{ background: '#2383e2' }} />CIS 641</span>
          <span className="i on">💻 Algorithms practice</span>
          <span className="g"><i style={{ background: '#2f9e6f' }} />STA 610</span>
          <span className="i">📊 Hypothesis tests</span>
        </div>
        <div className="sc-code-page">
          <h4>💻 Algorithms practice</h4>
          <div className="sc-block">
            <div className="sc-block-bar">
              <span className="sc-lang">Python ▾</span>
              <span className={`sc-run ${step === 3 ? 'press' : ''}`}>▷ Run</span>
            </div>
            <pre>
              {k('def')} {f('average')}(scores):{'\n'}
              {'    '}{k('return')} {f('sum')}(scores) / {f('len')}(scores){'\n'}
              {'\n'}
              grades = [{n('88')}, {n('72')}, {n('95')}, {n('61')}]{'\n'}
              {f('print')}({str('"average:"')}, average(grades)){'\n'}
              {step === 1 && <span className="tk-ghost">print("best:", max(grades))<em>Tab</em></span>}
              {step >= 2 && <span className={step === 2 ? 'tk-new' : ''}>{f('print')}({str('"best:"')}, {f('max')}(grades))</span>}
            </pre>
          </div>
          {step === 3 && <div className="sc-out run">Running…</div>}
          {step === 4 && <div className="sc-out"><Typer text={'average: 79.0\nbest: 95'} speed={30} /></div>}
        </div>
      </div>
    </div>
  );
}

const DB_STEPS = [1900, 1100, 1900, 2700, 2700];
const TAG = { gray: ['rgba(120,119,116,.16)', '#5b5953'], blue: ['rgba(11,110,153,.15)', '#0f4f73'], green: ['rgba(15,123,108,.16)', '#1c5e51'], orange: ['rgba(217,115,13,.18)', '#8a4b0c'], purple: ['rgba(105,64,165,.15)', '#4f3184'], red: ['rgba(224,62,62,.15)', '#9b2727'], yellow: ['rgba(223,171,1,.22)', '#7a5d00'] };
const Tg = ({ c, children }) => <span className="sc-tag" style={{ background: TAG[c][0], color: TAG[c][1] }}>{children}</span>;
const DB_ROWS = [
  ['Use case diagram', 'doing', 'Tue, Dec 1', ['CIS 641', 'blue']],
  ['Quiz 4: regression', 'todo', 'Sun, Nov 29', ['STA 610', 'purple']],
  ['Midterm', 'todo', 'Dec 9', ['CIS 678', 'orange']],
  ['Lab 5: image filters', 'doing', 'Dec 6', ['CIS 663', 'purple']],
  ['Read chapter 7', 'done', 'Wed, Nov 25', ['CIS 678', 'orange']],
];
// Two weeks, Sun Nov 22 to Sat Dec 5 (today is the 27th)
const CAL_DAYS = [[22], [23], [24], [25, 'Read chapter 7'], [26], [27], [28], [29, 'Quiz 4: regression'], [30], [1, 'Use case diagram'], [2], [3, 'Problem set 4'], [4], [5]];
const STATUS = { todo: ['Not started', 'gray'], doing: ['In progress', 'blue'], done: ['Done', 'green'] };

/** A database, acted out: a card dragged across the board, then the same rows as a table and a calendar */
function DatabaseShowcase() {
  const step = useLoop(DB_STEPS);
  const moved = step >= 2;
  const rows = DB_ROWS.map((r) => (r[0] === 'Quiz 4: regression' && moved ? [r[0], 'done', r[2], r[3]] : r));
  const view = step === 3 ? 'table' : step === 4 ? 'calendar' : 'board';
  const status = (k) => <span className="sc-status" style={{ background: TAG[STATUS[k][1]][0], color: TAG[STATUS[k][1]][1] }}><i />{t(STATUS[k][0])}</span>;
  return (
    <div className="sc-window sc-db" aria-hidden="true">
      <div className="pv-bar"><span className="pv-dot" /><span className="pv-dot" /><span className="pv-dot" /><span className="pv-url">Notes · Assignment tracker</span></div>
      <div className="sc-db-body">
        <h4>📚 {t('Assignment tracker')}</h4>
        <div className="sc-db-tabs">
          <span className={view === 'table' ? 'on' : ''}>▤ {t('Table')}</span>
          <span className={view === 'board' ? 'on' : ''}>▥ {t('Board')}</span>
          <span className={view === 'calendar' ? 'on' : ''}>▦ {t('Calendar')}</span>
          <b>+ {t('New')}</b>
        </div>
        {view === 'board' && (
          <div className="sc-cols">
            {['todo', 'doing', 'done'].map((k) => (
              <div key={k} className={`sc-col ${step === 1 && k === 'done' ? 'over' : ''}`}>
                <div className="sc-col-head">{status(k)}<span>{rows.filter((r) => r[1] === k).length}</span></div>
                {rows.filter((r) => r[1] === k).map((r) => (
                  <div key={r[0]} className={`sc-dcard ${r[0] === 'Quiz 4: regression' && step === 1 ? 'lift' : ''} ${r[0] === 'Quiz 4: regression' && step === 2 ? 'land' : ''}`}>
                    <b>{r[0]}</b>
                    <span className="sc-dmeta">{r[2]} <Tg c={r[3][1]}>{r[3][0]}</Tg></span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        {view === 'table' && (
          <div className="sc-dtable">
            <div className="sc-dtr head"><span>Aa {t('Name')}</span><span>◉ {t('Status')}</span><span>▦ {t('Due')}</span><span>▾ {t('Course')}</span></div>
            {rows.map((r) => (
              <div key={r[0]} className="sc-dtr"><span><b>{r[0]}</b></span><span>{status(r[1])}</span><span>{r[2]}</span><span><Tg c={r[3][1]}>{r[3][0]}</Tg></span></div>
            ))}
          </div>
        )}
        {view === 'calendar' && (
          <div className="sc-dcal">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <span key={d} className="wd">{d}</span>)}
            {CAL_DAYS.map(([label, item], i) => (
              <span key={i} className={`d ${i === 5 ? 'today' : ''} ${i >= 9 ? 'next' : ''}`}><em>{label}</em>{item && <i>{item}</i>}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const TOGETHER_STEPS = [1500, 2600, 2300, 2100, 2900];

/** Two classmates on one page: a live cursor typing, a comment thread, and the Inbox */
function TogetherShowcase() {
  const step = useLoop(TOGETHER_STEPS);
  return (
    <div className="sc-window sc-team" aria-hidden="true">
      <div className="pv-bar"><span className="pv-dot" /><span className="pv-dot" /><span className="pv-dot" /><span className="pv-url">Notes · Midterm study guide</span>
        <span className="sc-faces"><i style={{ background: '#d6336c' }}>A</i><i style={{ background: '#e03131' }}>S</i><i style={{ background: '#2f9e44' }}>O</i></span>
      </div>
      <div className="sc-team-body">
        <div className="sc-page">
          <span className="sc-icon solo">🧠</span>
          <h4>{t('Midterm study guide')}</h4>
          <p className="sc-h">{t('Gradient descent')}</p>
          <p>{t('Step against the gradient, one batch at a time.')}</p>
          <p className="sc-call">💡 <span>{t('Start the learning rate at 1e-3.')}{step >= 1 && <> <Typer text="Adam is a safe default." speed={45} /></>}<span className="sc-peer"><em>Sara</em></span></span></p>
          <p className="sc-h">{t('Bias vs. variance')}</p>
          <p><span className={`sc-mark ${step >= 2 ? 'on' : ''}`}>{t('Underfitting')}</span> {t('means high bias; overfitting means high variance.')}</p>
        </div>
        <div className={`sc-panel ${step >= 2 ? 'open' : ''}`}>
          <div className="sc-panel-head">💬 {t('Comments')}</div>
          <div className="sc-thread">
            <span className="q">{t('Underfitting')}</span>
            <p><i style={{ background: '#e03131' }}>S</i><span><b>Sara</b> {t('Add the learning-curve plot here?')}</span></p>
            {step >= 3 && <p className="reply"><i style={{ background: '#d6336c' }}>A</i><span><b>{t('You')}</b> {t('Yes! I’ll paste it tonight.')}</span></p>}
          </div>
        </div>
        {step === 4 && (
          <div className="sc-toast">
            <b>🔔 {t('Inbox')}</b>
            <span><i style={{ background: '#2f9e44' }}>O</i>{t('Omar suggested changes')} · <u>{t('Review')}</u></span>
            <span><i style={{ background: '#7048e8' }}>M</i>{t('Maya accepted your invitation')}</span>
          </div>
        )}
      </div>
    </div>
  );
}

const AI_LINES = [
  'Spend more time on CIS 678: your Midterm exam is in 3 days.',
  'You have studied 2 h, but this exam needs about 10 h.',
  'Suggested plan: 3 sessions this week, 8 h in total.',
];

/** A small, animated picture of the real app, drawn with HTML so it follows the theme. */
function AppPreview() {
  const typed = useTyping(AI_LINES);
  return (
    <div className="preview" data-reveal>
      <div className="pv-window">
        <div className="pv-bar">
          <span className="pv-dot" /><span className="pv-dot" /><span className="pv-dot" />
          <span className="pv-url">ai-study-assistant · Dashboard</span>
        </div>
        <div className="pv-body">
          <div className="pv-side">
            <div className="pv-ws"><span className="pv-avatar">A</span><b>Ali's Study Space</b></div>
            {['Dashboard', 'Courses', 'Assignments & Exams', 'Study Schedule', 'Materials', 'Notes', 'Ask AI'].map((t, k) => (
              <div key={t} className={`pv-nav ${k === 0 ? 'on' : ''}`}><span />{t}</div>
            ))}
            <p className="pv-label">My courses</p>
            {[['CIS 641', '#2383e2'], ['CIS 678', '#e0782e'], ['STA 610', '#2f9e6f']].map(([c, col]) => (
              <div key={c} className="pv-course"><i style={{ background: col }} />{c}</div>
            ))}
          </div>
          <div className="pv-main">
            <p className="pv-hello">🧭 Good afternoon, Ali</p>
            <div className="pv-grid">
              <div className="pv-card pv-ai">
                <div className="pv-head"><b>What to study next</b><span className="pv-tag">✦ AI</span></div>
                <p className="pv-typed">{typed}<span className="caret" /></p>
                <div className="pv-meter"><span /></div>
                <div className="pv-plan"><em>Wed · 2.75 h</em><em>Thu · 2.75 h</em><em>Fri · 2.5 h</em></div>
                <div className="pv-actions"><span className="pv-btn">Accept and add to schedule</span><span className="pv-ghost">Dismiss</span></div>
              </div>
              <div className="pv-card">
                <b>Study progress</b>
                {[['CIS 641', 58, '#2383e2'], ['CIS 678', 25, '#e0782e'], ['STA 610', 50, '#2f9e6f']].map(([c, w, col], k) => (
                  <div key={c} className="pv-prog">
                    <span>{c}</span>
                    <div><i style={{ width: `${w}%`, background: col, animationDelay: `${0.5 + k * 0.15}s` }} /></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="pv-float f1"><Icon name="check" size={16} /> 3 sessions added to your schedule</div>
      <div className="pv-float f2"><span className="pulse-dot" /> Midterm exam · in 3 days</div>
    </div>
  );
}

const FEATURES = [
  { icon: 'book', title: 'Courses with weekly goals', text: 'Add each course, with an optional goal of hours a week, and watch it fill up as you log time.' },
  { icon: 'check', title: 'Assignments & exams', text: 'Keep every deadline in one list with its type, priority and the hours it needs.' },
  { icon: 'calendar', title: 'Weekly study schedule', text: 'Plan study sessions on a calendar, see deadlines on the same week, and tick sessions off.' },
  { icon: 'note', title: 'Notes, like Notion', text: 'Pages and sub-pages with headings, to-dos, tables, covers and pictures. AI is built right into the page.', hot: true },
  { icon: 'chat', title: 'Ask AI', text: 'A study coach that knows your deadlines and notes, reads your PDFs, and adds exams and sessions for you.', hot: true },
  { icon: 'spark', title: 'AI recommendations', text: 'Get told which course to focus on next, with a ready-made plan you can accept in one click.' },
  { icon: 'database', title: 'Databases', text: 'Track assignments or readings as a table, a board you drag cards across, a calendar or a gallery.', hot: true },
  { icon: 'users', title: 'Study groups', text: 'A group chat, shared deadlines and pages, and Zoom meetings. Classmates join when they accept your invitation.', hot: true },
  { icon: 'comment', title: 'Comments & suggested edits', text: 'Edit pages together live, talk about any sentence, and review suggestions before they change your page.' },
  { icon: 'play', title: 'Code that runs', text: 'Write Python, JavaScript, SQL or HTML in your notes and run it right there, with VS Code shortcuts and AI completions.' },
  { icon: 'folder', title: 'Folders and course groups', text: 'Pages sort themselves by course. Drag them into your own folders, like "Midterm prep".' },
  { icon: 'trash', title: 'Trash with Undo', text: 'Deleted something by mistake? Undo it at once, or restore it from the Trash for 30 days.' },
];

const STEPS = [
  { n: '1', who: 'Rules', title: 'Find the study gap', text: 'For every task due in the next 14 days.', code: 'gap = needed − studied − planned' },
  { n: '2', who: 'Rules', title: 'Rank and plan', text: 'By deadline, priority and task type. The top 3 get a plan.', code: 'sessions of up to 2 h' },
  { n: '3', who: 'LLM', title: 'Explain it', text: 'A language model writes a short, friendly message from those numbers.', code: 'any LLM · rule-based fallback' },
  { n: '4', who: 'You', title: 'Accept or dismiss', text: 'Accepting puts the sessions straight into your schedule.', code: 'one click' },
];

/** The four-square Windows logo (drawn, not an image) */
function WinLogo() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="win-logo">
      <rect x="0" y="0" width="7.4" height="7.4" fill="#f25022" /><rect x="8.6" y="0" width="7.4" height="7.4" fill="#7fba00" />
      <rect x="0" y="8.6" width="7.4" height="7.4" fill="#00a4ef" /><rect x="8.6" y="8.6" width="7.4" height="7.4" fill="#ffb900" />
    </svg>
  );
}

/** Top-bar links: show as many as fit (in order), never squeeze or cut one. Re-checks when the width or the words change. */
function useFitLinks() {
  const ref = useRef(null);
  useEffect(() => {
    const nav = ref.current;
    if (!nav) return undefined;
    let frame = 0;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const links = [...nav.children];
        links.forEach((a) => { a.hidden = false; });
        for (let i = links.length - 1; i >= 0 && nav.scrollWidth > nav.clientWidth + 1; i -= 1) links[i].hidden = true;
      });
    };
    const ro = new ResizeObserver(fit);
    ro.observe(nav.parentElement);
    const mo = new MutationObserver(fit);
    mo.observe(nav, { subtree: true, characterData: true, childList: true });
    fit();
    return () => { ro.disconnect(); mo.disconnect(); cancelAnimationFrame(frame); };
  }, []);
  return ref;
}

export default function Landing() {
  const linksRef = useFitLinks();
  useReveal();
  const { theme, setTheme, resolved } = useTheme();
  const [scrolled, setScrolled] = useState(false);
  const isDark = resolved === 'dark' || resolved === 'midnight';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="landing">
      <header className={`lp-nav ${scrolled ? 'scrolled' : ''}`}>
        <div className="lp-wrap lp-nav-in">
          <a className="lp-brand" href="#top"><img src="/logo.png" alt="" width={30} height={30} style={{ display: 'block' }} />Study Assistant</a>
          <nav className="lp-links" ref={linksRef}>
            <a href="#features">Features</a>
            <a href="#ask-ai">Ask AI</a>
            <a href="#notes">Notes</a>
            <a href="#databases">Databases</a>
            <a href="#together">Together</a>
            <a href="#code">Code</a>
            <a href="#how">How the AI works</a>
            <a href="#themes">Themes</a>
          </nav>
          <div className="lp-cta">
            <LanguageSelect />
            <button className="icon-btn" type="button" onClick={() => setTheme(isDark ? 'light' : 'dark')}
              aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}><Icon name={isDark ? 'sun' : 'moon'} /></button>
            <InstallButton />
            <Link className="btn ghost" to="/login">Sign in</Link>
            <Link className="btn primary" to="/signup">Get started</Link>
          </div>
        </div>
      </header>

      <section className="hero lp-wrap" id="top">
        <div className="hero-glow" aria-hidden="true" />
        <a className="eyebrow new-pill" href="#databases" data-reveal><b>New</b><span>Databases, live pages and study groups</span><Icon name="arrow" size={13} /></a>
        <h1 data-reveal>Know exactly<br /><span className="grad">what to study next.</span></h1>
        <p className="hero-sub" data-reveal>
          Courses, deadlines, study sessions, notes and an AI study coach in one place. The assistant looks at what is due
          and how much you have studied, then builds you a plan.
        </p>
        <div className="hero-cta" data-reveal>
          <Link className="btn primary lg" to="/signup">Get started, it's free <Icon name="arrow" size={16} /></Link>
          <Link className="btn lg" to="/login">Sign in</Link>
        </div>
        <div className="hero-where" data-reveal>
          <Link to="/signup" title="Use it in your browser: create a free account"><Icon name="monitor" size={15} /> Web</Link>
          <PhoneSoonLink />
          <a href={STORE_URL} target="_blank" rel="noopener noreferrer"><WinLogo /> Microsoft Store</a>
          <button type="button" className="where-link" title="Choose your language"
            onClick={(e) => { e.stopPropagation(); window.scrollTo({ top: 0, behavior: 'smooth' }); setTimeout(() => document.querySelector('.lp-cta .lang-menu .lang-btn')?.click(), 250); }}>
            <Icon name="globe" size={15} /> 6 languages
          </button>
        </div>
        <AppPreview />
      </section>

      <section className="lp-section lp-wrap" id="features">
        <div className="lp-head" data-reveal>
          <span className="eyebrow">Everything in one place</span>
          <h2>Stop juggling five apps.</h2>
          <p className="muted">Due dates in the LMS, study time in a planner, notes in a folder, hours studied nowhere. Not anymore.</p>
        </div>
        <div className="features">
          {FEATURES.map((f, k) => (
            <article key={f.title} className={`feature ${f.hot ? 'hot' : ''}`} data-reveal style={{ transitionDelay: `${(k % 3) * 0.08}s` }}>
              <span className="f-icon"><Icon name={f.icon} size={20} /></span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-section lp-wrap showcase" id="ask-ai">
        <div className="sc-text" data-reveal>
          <span className="eyebrow"><Icon name="chat" size={14} /> Ask AI</span>
          <h2>A study coach that does the work for you.</h2>
          <p className="muted">It knows your courses, deadlines, hours and notes, so its answers are about your semester, not anyone's.</p>
          <ul className="sc-list">
            <li><Icon name="check" size={16} /><span><b>Adds things for you.</b> "Add my final on Dec 12 and plan three sessions": done, each with an Undo button.</span></li>
            <li><Icon name="file" size={16} /><span><b>Reads your files.</b> Drop in a syllabus PDF or a screenshot and ask about it.</span></li>
            <li><Icon name="mic" size={16} /><span><b>Talk to it.</b> Dictate a question, or use Voice mode to hear the answers.</span></li>
            <li><Icon name="history" size={16} /><span><b>Remembers.</b> Every chat is saved, with tables, code and quizzes when you need them.</span></li>
          </ul>
        </div>
        <div data-reveal style={{ transitionDelay: '.1s' }}><ChatShowcase /></div>
      </section>

      <section className="lp-section lp-wrap showcase flip" id="notes">
        <div className="sc-text" data-reveal>
          <span className="eyebrow"><Icon name="note" size={14} /> Notes</span>
          <h2>Notes like Notion, with AI inside.</h2>
          <p className="muted">Write lecture notes and study guides in a clean editor, then let the AI turn them into quizzes, flashcards and summaries.</p>
          <ul className="sc-list">
            <li><Icon name="plus" size={16} /><span><b>Type /</b> for headings, to-dos, tables, code, quotes and pictures. Pages can hold sub-pages.</span></li>
            <li><Icon name="image" size={16} /><span><b>Make it yours</b> with an emoji, a gradient cover or your own photo.</span></li>
            <li><Icon name="spark" size={16} /><span><b>Select text</b> to improve, shorten, explain or translate it, or press Ctrl+J to ask for anything.</span></li>
            <li><Icon name="undo" size={16} /><span><b>Notes AI</b> chats beside your page and edits it for you, step by step, with one-click Undo.</span></li>
            <li><Icon name="folder" size={16} /><span><b>Stay organized:</b> pages group by course, and you can drag them into your own folders.</span></li>
          </ul>
        </div>
        <div data-reveal style={{ transitionDelay: '.1s' }}><NotesShowcase /></div>
      </section>

      <section className="lp-section lp-wrap showcase" id="databases">
        <div className="sc-text" data-reveal>
          <span className="eyebrow"><Icon name="database" size={14} /> Databases</span>
          <h2>One list of assignments. Four ways to see it.</h2>
          <p className="muted">Keep assignments, readings or exam topics in a database, then look at them the way you need today.</p>
          <ul className="sc-list">
            <li><Icon name="check" size={16} /><span><b>Board:</b> drag a card from Not started to Done.</span></li>
            <li><Icon name="calendar" size={16} /><span><b>Calendar:</b> every deadline on its day; drag it to move it.</span></li>
            <li><Icon name="text" size={16} /><span><b>Table:</b> status, due date, course, priority, grade, people. Filter and sort each view.</span></li>
            <li><Icon name="note" size={16} /><span><b>Every row is a page,</b> so your notes for an assignment live right inside it.</span></li>
            <li><Icon name="spark" size={16} /><span><b>Start in one click</b> from the Assignment tracker, Reading list or Exam prep template.</span></li>
          </ul>
        </div>
        <div data-reveal style={{ transitionDelay: '.1s' }}><DatabaseShowcase /></div>
      </section>

      <section className="lp-section lp-wrap showcase flip" id="together">
        <div className="sc-text" data-reveal>
          <span className="eyebrow"><Icon name="users" size={14} /> Study together</span>
          <h2>Your study group, on the same page.</h2>
          <p className="muted">Share a page and work on it with classmates at the same time, then keep the whole team on track.</p>
          <ul className="sc-list">
            <li><Icon name="users" size={16} /><span><b>Edit live.</b> See each classmate's cursor and changes as they type.</span></li>
            <li><Icon name="comment" size={16} /><span><b>Comment on any words,</b> and reply in threads until it is resolved.</span></li>
            <li><Icon name="pencil" size={16} /><span><b>Suggested edits:</b> classmates who can only view propose changes; you accept or reject them.</span></li>
            <li><Icon name="video" size={16} /><span><b>Study groups</b> with a chat, shared deadlines and Zoom meetings that land in everyone's calendar.</span></li>
            <li><Icon name="bell" size={16} /><span><b>One Inbox</b> for mentions, comments, suggestions and invitations.</span></li>
          </ul>
        </div>
        <div data-reveal style={{ transitionDelay: '.1s' }}><TogetherShowcase /></div>
      </section>

      <section className="lp-section lp-wrap showcase" id="code">
        <div className="sc-text" data-reveal>
          <span className="eyebrow"><Icon name="play" size={14} /> Code in your notes</span>
          <h2>Write code in your notes. Run it right there.</h2>
          <p className="muted">Made for programming classes: keep the lecture, the code and its output on the same page.</p>
          <ul className="sc-list">
            <li><Icon name="play" size={16} /><span><b>Run Python, JavaScript, SQL and HTML.</b> The output appears under the code. Press Ctrl+Enter to run.</span></li>
            <li><Icon name="keyboard" size={16} /><span><b>Feels like VS Code:</b> Tab to indent, Ctrl+/ to comment, Alt+↑↓ to move lines, auto-closing brackets.</span></li>
            <li><Icon name="spark" size={16} /><span><b>AI finishes your line.</b> A grey suggestion appears as you type; press Tab to keep it.</span></li>
            <li><Icon name="palette" size={16} /><span><b>45 languages, 16 color themes,</b> from GitHub and Dracula to Monokai and Nord.</span></li>
            <li><Icon name="shield" size={16} /><span><b>Safe by design:</b> code runs in your own browser, never on our server, and an endless loop is stopped for you.</span></li>
          </ul>
        </div>
        <div data-reveal style={{ transitionDelay: '.1s' }}><CodeShowcase /></div>
      </section>

      <section className="lp-section lp-wrap" id="how">
        <div className="lp-head" data-reveal>
          <span className="eyebrow">How the AI decides</span>
          <h2>Rules do the math. The AI does the talking.</h2>
          <p className="muted">Hours and dates always come from clear rules, so the assistant can never invent numbers in your schedule.</p>
        </div>
        <ol className="steps">
          {STEPS.map((s, k) => (
            <li key={s.n} className={`step who-${s.who.toLowerCase()}`} data-reveal style={{ transitionDelay: `${k * 0.1}s` }}>
              <div className="step-top"><span className="step-n">{s.n}</span><span className="step-who">{s.who}</span></div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
              <code>{s.code}</code>
            </li>
          ))}
        </ol>
        <div className="stats" data-reveal>
          <div><b>14 days</b><span>look-ahead for deadlines</span></div>
          <div><b>Top 3</b><span>priorities at a time</span></div>
          <div><b>≤ 2 h</b><span>per planned session</span></div>
          <div><b>0</b><span>numbers made up by the AI</span></div>
        </div>
      </section>

      <section className="lp-section lp-wrap" id="themes">
        <div className="themes-band" data-reveal>
          <div>
            <span className="eyebrow">Make it yours</span>
            <h2>Five themes. Try one now.</h2>
            <p className="muted">Light, dark, warm paper or deep midnight, plus five accent colors inside the app.</p>
          </div>
          <div className="theme-try">
            {THEMES.map((t) => (
              <button key={t.id} type="button" className={`try ${theme === t.id ? 'on' : ''}`} onClick={() => setTheme(t.id)}>
                {t.id === 'system'
                  ? <span className="tile-preview split"><span /><span /></span>
                  : <span className="tile-preview" style={{ background: t.bg }}>
                      <span className="tp-side" style={{ background: t.side }} />
                      <span className="tp-line" style={{ background: t.fg }} />
                      <span className="tp-line short" style={{ background: t.fg }} />
                    </span>}
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section lp-wrap">
        <div className="final" data-reveal>
          <h2>Your next study session is one click away.</h2>
          <p>Create an account, add your courses and deadlines, invite your study group, and let the assistant plan the week.</p>
          <div className="hero-cta">
            <Link className="btn primary lg" to="/signup">Create your free account <Icon name="arrow" size={16} /></Link>
            <a className="btn lg" href={STORE_URL} target="_blank" rel="noopener noreferrer"><WinLogo /> Get it for Windows</a>
          </div>
        </div>
      </section>

      <footer className="lp-foot lp-wrap">
        <span><b>AI Study Assistant</b> · CIS 641 term project by Ali Belhrak · Grand Valley State University</span>
        <span className="lp-foot-links">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/guidelines">Community guidelines</Link>
          <a href={STORE_URL} target="_blank" rel="noopener noreferrer"><WinLogo /> Microsoft Store</a>
          <a href="https://github.com/alibelhrak/GVSU-CIS641-AIStudyAssistant" target="_blank" rel="noopener noreferrer">
            <Icon name="github" size={16} /> Source on GitHub
          </a>
        </span>
      </footer>
    </div>
  );
}