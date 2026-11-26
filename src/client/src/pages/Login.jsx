import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useTheme } from '../lib/theme.jsx';
import { Icon } from '../icons.jsx';
import '../landing.css';

export default function Login() {
  const { authenticate } = useAuth();
  const { resolved, setTheme } = useTheme();
  const { pathname, state } = useLocation();
  const navigate = useNavigate();
  const mode = pathname === '/signup' ? 'register' : 'login';   // /signup shows "Create account"
  const [form, setForm] = useState({ name: '', email: state?.email || '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const isDark = resolved === 'dark' || resolved === 'midnight';

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try { await authenticate(mode, form); } catch (err) { setError(err.message); setBusy(false); }
  };

  const switchMode = () => { setError(''); navigate(mode === 'login' ? '/signup' : '/login', { state: { email: form.email } }); };
  const exists = mode === 'register' && /already exists/i.test(error);

  return (
    <div className="login">
      <div className="blob b1" /><div className="blob b2" /><div className="blob b3" />
      <Link className="back-home" to="/"><Icon name="back" size={16} /> Home</Link>
      <button className="icon-btn login-theme" type="button" onClick={() => setTheme(isDark ? 'light' : 'dark')}
        aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}>
        <Icon name={isDark ? 'sun' : 'moon'} />
      </button>

      <form className="login-card" onSubmit={submit}>
        <img src="/logo.png" alt="Study Assistant" width={48} height={48} style={{ display: 'block' }} />
        <h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        <p className="muted">
          {mode === 'login'
            ? 'Sign in to see what to study next.'
            : 'Add your courses and deadlines, and the assistant will plan your study time.'}
        </p>

        <div className="login-fields" key={mode}>
          {mode === 'register' && (
            <label>Name<input type="text" value={form.name} onChange={set('name')} required autoComplete="name" placeholder="Your name" /></label>
          )}
          <label>Email<input type="email" value={form.email} onChange={set('email')} required autoComplete="email" placeholder="you@school.edu" /></label>
          <label>Password<input type="password" value={form.password} onChange={set('password')} required minLength={8}
            placeholder="At least 8 characters" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
        </div>

        {mode === 'login' && <Link className="linklike" to="/forgot-password" style={{ justifySelf: 'end', fontSize: '.85rem', marginTop: -6 }}>Forgot password?</Link>}
        {error && (exists ? (
          <div className="error-box" role="alert">
            <b>You already have an account with this email.</b>
            <span>
              <button className="linklike" type="button" onClick={switchMode}>Sign in instead</button>
              {' · '}
              <Link className="linklike" to="/forgot-password" state={{ email: form.email }}>Forgot your password?</Link>
            </span>
          </div>
        ) : <p className="error" role="alert">{error}</p>)}
        <button className="btn primary block" type="submit" disabled={busy}>
          {busy ? <span className="spinner" aria-label="Please wait" /> : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
        <p className="switch">
          {mode === 'login' ? 'New here?' : 'Already have an account?'}{' '}
          <button className="linklike" type="button" onClick={switchMode}>{mode === 'login' ? 'Create an account' : 'Sign in'}</button>
        </p>
      </form>
    </div>
  );
}