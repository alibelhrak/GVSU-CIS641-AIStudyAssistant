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
  { icon: 'play', title: 'Code that runs', text: 'Write Python, JavaScript, SQL or HTML in your notes and run it right there, with VS Code shortcuts and AI completions.', hot: true },
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
        <a className="eyebrow new-pill" href="#code" data-reveal><b>New</b><span>Run Python, SQL and JavaScript in your notes</span><Icon name="arrow" size={13} /></a>
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
          <p>Create an account, add your courses and deadlines, write your notes, and let the assistant plan the week.</p>
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