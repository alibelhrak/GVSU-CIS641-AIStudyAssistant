import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../icons.jsx';
import '../landing.css';
import { THEMES, useTheme } from '../lib/theme.jsx';
import { InstallButton } from '../lib/install.jsx';

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
function useTyping(messages, speed = 32, pause = 2200) {
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
            {['Dashboard', 'Courses', 'Assignments & Exams', 'Study Schedule', 'Materials'].map((t, k) => (
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
  { icon: 'book', title: 'Courses with weekly goals', text: 'Add each course with how many hours a week you want to study it. Every course gets its own color.' },
  { icon: 'check', title: 'Assignments & exams', text: 'Keep every deadline in one list with its type, priority and the hours it needs.' },
  { icon: 'calendar', title: 'Weekly study schedule', text: 'Plan study sessions on a calendar, see deadlines on the same week, and tick sessions off.' },
  { icon: 'clip', title: 'Course materials', text: 'Drop in PDFs, slides and notes, or save links, all filed under the right course.' },
  { icon: 'chart', title: 'Progress you can see', text: 'Log study time and watch each course fill up against its weekly goal.' },
  { icon: 'spark', title: 'AI recommendations', text: 'Get told which course to focus on next, with a ready-made plan you can accept in one click.', hot: true },
];

const STEPS = [
  { n: '1', who: 'Rules', title: 'Find the study gap', text: 'For every task due in the next 14 days.', code: 'gap = needed − studied − planned' },
  { n: '2', who: 'Rules', title: 'Rank and plan', text: 'By deadline, priority and task type. The top 3 get a plan.', code: 'sessions of up to 2 h' },
  { n: '3', who: 'LLM', title: 'Explain it', text: 'A language model writes a short, friendly message from those numbers.', code: 'Llama 3.2 · rule-based fallback' },
  { n: '4', who: 'You', title: 'Accept or dismiss', text: 'Accepting puts the sessions straight into your schedule.', code: 'one click' },
];

export default function Landing() {
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
          <nav className="lp-links">
            <a href="#features">Features</a>
            <a href="#how">How the AI works</a>
            <a href="#themes">Themes</a>
          </nav>
          <div className="lp-cta">
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
        <span className="eyebrow" data-reveal><Icon name="spark" size={14} /> An AI study planner for students</span>
        <h1 data-reveal>Know exactly<br /><span className="grad">what to study next.</span></h1>
        <p className="hero-sub" data-reveal>
          Courses, deadlines, study sessions and materials in one place. The assistant looks at what is due and how much
          you have studied, then builds you a plan.
        </p>
        <div className="hero-cta" data-reveal>
          <Link className="btn primary lg" to="/signup">Get started, it's free <Icon name="arrow" size={16} /></Link>
          <Link className="btn lg" to="/login">Sign in</Link>
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
          <p>Create an account, add your courses and deadlines, and let the assistant plan the week.</p>
          <Link className="btn primary lg" to="/signup">Create your free account <Icon name="arrow" size={16} /></Link>
        </div>
      </section>

      <footer className="lp-foot lp-wrap">
        <span><b>AI Study Assistant</b> · CIS 641 term project by Ali Belhrak · Grand Valley State University</span>
        <a href="https://github.com/alibelhrak/GVSU-CIS641-AIStudyAssistant" target="_blank" rel="noopener noreferrer">
          <Icon name="github" size={16} /> Source on GitHub
        </a>
      </footer>
    </div>
  );
}