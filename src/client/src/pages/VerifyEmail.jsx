import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { Icon } from '../icons.jsx';
import { LanguageSelect } from '../lib/i18n.jsx';
import '../landing.css';

const LEN = 6;

/** The sign-up in progress: from the page that sent us here, or saved for this tab (after a refresh) */
function pendingSignup(state) {
  if (state?.email && state?.ticket) return state;
  try { return JSON.parse(sessionStorage.getItem('sa-verify') || 'null'); } catch { return null; }
}

/** Step 2 of sign-up: enter the 6-digit code sent to the email */
export default function VerifyEmail() {
  const { verifyEmail } = useAuth();
  const { state } = useLocation();
  const navigate = useNavigate();
  const pending = pendingSignup(state);
  const [digits, setDigits] = useState(Array(LEN).fill(''));
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(state?.wait ?? 60);
  const [restart, setRestart] = useState(!pending);
  const boxes = useRef([]);

  // Count down until a new code may be sent
  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  useEffect(() => { boxes.current[0]?.focus(); }, []);

  const submit = async (code) => {
    if (busy || code.length !== LEN) return;
    setBusy(true); setError(''); setInfo('');
    try {
      await verifyEmail(pending.email, pending.ticket, code);
      try { sessionStorage.removeItem('sa-verify'); } catch { /* ignore */ }
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
      if (err.data?.restart) setRestart(true);
      setDigits(Array(LEN).fill(''));
      setBusy(false);
      requestAnimationFrame(() => boxes.current[0]?.focus());
    }
  };

  // Typing, deleting and pasting across the six boxes
  const put = (i, text) => {
    const clean = text.replace(/\D/g, '');
    if (!clean) return;
    const next = [...digits];
    for (let k = 0; k < clean.length && i + k < LEN; k += 1) next[i + k] = clean[k];
    setDigits(next);
    const at = Math.min(i + clean.length, LEN - 1);
    boxes.current[at]?.focus();
    if (next.every(Boolean)) submit(next.join(''));
  };
  const onKey = (i) => (e) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const next = [...digits];
      if (next[i]) next[i] = '';
      else if (i > 0) { next[i - 1] = ''; boxes.current[i - 1]?.focus(); }
      setDigits(next);
    } else if (e.key === 'ArrowLeft' && i > 0) boxes.current[i - 1]?.focus();
    else if (e.key === 'ArrowRight' && i < LEN - 1) boxes.current[i + 1]?.focus();
    else if (e.key === 'Enter') submit(digits.join(''));
  };

  const resend = async () => {
    setError(''); setInfo('');
    try {
      const r = await api.post('/auth/resend-code', { email: pending.email, ticket: pending.ticket });
      setWait(r.wait || 60);
      setInfo('A new code is on its way. Check your inbox and spam folder.');
      setDigits(Array(LEN).fill(''));
      boxes.current[0]?.focus();
    } catch (err) {
      setError(err.message);
      if (err.data?.wait) setWait(err.data.wait);
      if (err.data?.restart) setRestart(true);
    }
  };

  return (
    <div className="login">
      <div className="blob b1" /><div className="blob b2" /><div className="blob b3" />
      <Link className="back-home" to="/"><Icon name="back" size={16} /> Home</Link>
      <div className="login-lang"><LanguageSelect /></div>

      <form className="login-card verify-card" onSubmit={(e) => { e.preventDefault(); submit(digits.join('')); }}>
        <div className="verify-icon"><Icon name="mail" size={26} /></div>
        <h1>Check your email</h1>
        {pending ? (
          <div className="verify-to">
            <p className="muted">We sent a 6-digit code to:</p>
            <b className="verify-email" data-no-translate>{pending.email}</b>
            <p className="muted">Enter it to finish creating your account.</p>
          </div>
        ) : <p className="muted">This page needs a sign-up in progress.</p>}

        {!restart && (
          <div className={`otp ${error ? 'shake' : ''}`} dir="ltr" role="group" aria-label="Verification code">
            {digits.map((d, i) => (
              <input key={i} ref={(el) => { boxes.current[i] = el; }} value={d} inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'}
                maxLength={i === 0 ? LEN : 1} aria-label={`Digit ${i + 1}`} disabled={busy} className={d ? 'filled' : ''}
                onChange={(e) => put(i, e.target.value.slice(-LEN))}
                onPaste={(e) => { e.preventDefault(); put(i, e.clipboardData.getData('text')); }}
                onKeyDown={onKey(i)} onFocus={(e) => e.target.select()} />
            ))}
          </div>
        )}

        {error && <p className="error" role="alert">{error}</p>}
        {info && !error && <p className="verify-info" role="status">{info}</p>}

        {restart ? (
          <Link className="btn primary block" to="/signup" state={{ email: pending?.email }}>Start again</Link>
        ) : (
          <>
            <button className="btn primary block" type="submit" disabled={busy || digits.some((d) => !d)}>
              {busy ? <span className="spinner" aria-label="Please wait" /> : 'Verify email'}
            </button>
            <p className="switch">
              {"Didn't get it?"}{' '}
              {wait > 0
                ? <span className="verify-wait">{`Send a new code in ${wait} s`}</span>
                : <button className="linklike" type="button" onClick={resend}>Send a new code</button>}
            </p>
          </>
        )}
        <p className="switch verify-alt">
          Wrong email? <Link className="linklike" to="/signup" state={{ email: pending?.email }}>Sign up again</Link>
        </p>
      </form>
    </div>
  );
}
